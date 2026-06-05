// ============================================================
// Summariser.gs — Course Memory Tool
// Sends files to Gemini API and returns structured summaries.
// Uses chunked upload for large video files.
// ============================================================


// ── Lecture Summariser ────────────────────────────────────────

function summariseLecture(session) {
  Logger.log(`Summarising: Phase ${session.phase} Session ${session.sessionNum}`);

  const label = `Phase ${session.phase} Session ${session.sessionNum}`;

  // Attempt video upload — skip gracefully if it fails
  let videoFileUri = null;
  if (session.lecture) {
    try {
      videoFileUri = uploadLargeFileTOGemini(session.lecture.file);
    } catch(e) {
      Logger.log(`Video upload skipped for ${label}: ${e.message}`);
    }
  }

  // Extract slide text — primary content source if video unavailable
  let slideText = "";
  if (session.slide) {
    try {
      slideText = extractTextFromFile(session.slide.file);
    } catch(e) {
      Logger.log(`Slide extraction failed for ${label}: ${e.message}`);
    }
  }

  // Skip session entirely if neither video nor slides are available
  if (!videoFileUri && !slideText) {
    throw new Error("No content available for summarisation — video and slides both inaccessible");
  }

  // Build prompt and call Gemini
  const prompt     = buildLecturePrompt(label, slideText, !!videoFileUri);
  const rawSummary = callGemini(prompt, videoFileUri);

  const summaryObj = {
    id:            `phase${session.phase}_session${session.sessionNum}`,
    label:         label,
    phase:         session.phase,
    sessionNum:    session.sessionNum,
    date:          new Date().toISOString().split("T")[0],
    lectureFileId: session.lecture ? session.lecture.id  : null,
    slideFileId:   session.slide   ? session.slide.id    : null,
    slideUrl:      session.slide   ? session.slide.url   : null,
    summary:       rawSummary,
    skills:        extractSkillTags(rawSummary),
    hasAssignment: false
  };

  saveLectureSummary(summaryObj);
  Logger.log(`Saved lecture summary: ${label}`);
}


// ── Assignment Summariser ─────────────────────────────────────

function summariseAssignment(file) {
  Logger.log(`Summarising assignment: ${file.name} [Skill: ${file.skillName}]`);

  const fileText = extractTextFromFile(file.file);
  const prompt   = buildAssignmentPrompt(file.name, file.skillName, fileText);
  const raw      = callGemini(prompt, null);

  const assignmentObj = {
    id:      "assign_" + file.id,
    name:    file.name,
    skill:   file.skillName,
    fileId:  file.id,
    fileUrl: file.url,
    date:    new Date().toISOString().split("T")[0],
    summary: raw
  };

  saveAssignmentSummary(assignmentObj);
  Logger.log(`Saved assignment summary: ${file.name}`);
}


// ── Reading Material Summariser ───────────────────────────────

function summariseReadingMaterial(file) {
  Logger.log(`Summarising reading material: ${file.name} [Skill: ${file.skillName}]`);

  const fileText = extractTextFromFile(file.file);
  const prompt   = buildReadingMaterialPrompt(file.name, file.skillName, fileText);
  const raw      = callGemini(prompt, null);

  const readingObj = {
    id:      "read_" + file.id,
    name:    file.name,
    skill:   file.skillName,
    fileId:  file.id,
    fileUrl: file.url,
    date:    new Date().toISOString().split("T")[0],
    summary: raw
  };

  saveReadingMaterialSummary(readingObj);
  Logger.log(`Saved reading material summary: ${file.name}`);
}


// ── Chunked Video Upload ──────────────────────────────────────

const CHUNK_BYTES = 20 * 1024 * 1024; // 20MB chunks

function uploadLargeFileTOGemini(file) {
  const fileName = file.getName();
  const fileSize = file.getSize();
  const mimeType = "video/mp4";

  Logger.log(`Starting chunked upload: ${fileName} (${Math.round(fileSize/1024/1024)}MB)`);

  // Step 1 — Initiate resumable upload session with Gemini
  const initRes = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${CONFIG.GEMINI_API_KEY}`,
    {
      method:  "POST",
      headers: {
        "Content-Type":                        "application/json",
        "X-Goog-Upload-Protocol":              "resumable",
        "X-Goog-Upload-Command":               "start",
        "X-Goog-Upload-Header-Content-Length": fileSize,
        "X-Goog-Upload-Header-Content-Type":   mimeType
      },
      payload: JSON.stringify({ file: { display_name: fileName } }),
      muteHttpExceptions: true
    }
  );

  if (initRes.getResponseCode() !== 200) {
    throw new Error("Failed to initiate upload: " + initRes.getContentText());
  }

  const uploadUrl = initRes.getHeaders()["x-goog-upload-url"];
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini");

  // Step 2 — Upload file in chunks via Drive API byte ranges
  const fileId      = file.getId();
  const accessToken = ScriptApp.getOAuthToken();
  let   offset      = 0;

  while (offset < fileSize) {
    const end       = Math.min(offset + CHUNK_BYTES, fileSize);
    const chunkSize = end - offset;
    const isLast    = end >= fileSize;

    Logger.log(`Uploading chunk: bytes ${offset}-${end-1} of ${fileSize}`);

    // Fetch this byte range from Drive
    const driveRes = UrlFetchApp.fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Range:         `bytes=${offset}-${end - 1}`
        },
        muteHttpExceptions: true
      }
    );

    if (driveRes.getResponseCode() !== 206 && driveRes.getResponseCode() !== 200) {
      throw new Error(`Drive chunk fetch failed at offset ${offset}: ${driveRes.getContentText()}`);
    }

    const chunkBlob = driveRes.getBlob().setContentType(mimeType);

    // Upload this chunk to Gemini
    const uploadRes = UrlFetchApp.fetch(uploadUrl, {
      method:  "POST",
      headers: {
        "Content-Length":        chunkSize,
        "X-Goog-Upload-Offset":  offset,
        "X-Goog-Upload-Command": isLast ? "upload, finalize" : "upload"
      },
      payload:            chunkBlob,
      muteHttpExceptions: true
    });

    const uploadCode = uploadRes.getResponseCode();

    if (isLast) {
      // Final chunk — expect 200 with file metadata
      if (uploadCode !== 200) {
        throw new Error("Final chunk upload failed: " + uploadRes.getContentText());
      }
      const uploadData = JSON.parse(uploadRes.getContentText());
      if (!uploadData.file || !uploadData.file.uri) {
        throw new Error("No file URI in final upload response");
      }

      // Step 3 — Wait for Gemini to process the file
      waitForGeminiFile(uploadData.file.name);
      Logger.log(`Upload complete. URI: ${uploadData.file.uri}`);
      return uploadData.file.uri;

    } else {
      // Intermediate chunk — expect 308 Resume Incomplete
      if (uploadCode !== 308) {
        throw new Error(`Unexpected response for chunk at offset ${offset}: ${uploadCode}`);
      }
    }

    offset = end;
    Utilities.sleep(500); // brief pause between chunks
  }

  throw new Error("Upload loop ended without finalising");
}

// Poll until Gemini has finished processing the uploaded file
function waitForGeminiFile(geminiFileName) {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    Utilities.sleep(5000);
    const res  = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${CONFIG.GEMINI_API_KEY}`,
      { muteHttpExceptions: true }
    );
    const data = JSON.parse(res.getContentText());
    Logger.log(`File processing state: ${data.state}`);
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("Gemini file processing failed");
  }
  throw new Error("Gemini file processing timed out after 100 seconds");
}


// ── Gemini API Call ───────────────────────────────────────────

function callGemini(prompt, videoFileUri) {
  Utilities.sleep(4500); // respect 15 req/min free tier limit

  const parts = [];
  if (videoFileUri) {
    parts.push({ fileData: { mimeType: "video/mp4", fileUri: videoFileUri } });
  }
  parts.push({ text: prompt });

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature:     0.3,
      maxOutputTokens: 4096
    }
  };

  const res = UrlFetchApp.fetch(
    `${CONFIG.GEMINI_ENDPOINT}${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
    {
      method:             "POST",
      contentType:        "application/json",
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error(`Gemini API error ${code}: ${res.getContentText()}`);
  }

  const data = JSON.parse(res.getContentText());
  if (!data.candidates || !data.candidates[0]) {
    throw new Error("Gemini returned no candidates");
  }

  return data.candidates[0].content.parts[0].text;
}


// ── Text Extraction ───────────────────────────────────────────

function extractTextFromFile(file) {
  const mimeType = file.getMimeType();

  try {
    // Google Slides
    if (mimeType === "application/vnd.google-apps.presentation") {
      const res = UrlFetchApp.fetch(
        `https://docs.google.com/presentation/d/${file.getId()}/export/txt`,
        { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }
      );
      return res.getContentText();
    }

    // Google Docs
    if (mimeType === "application/vnd.google-apps.document") {
      const res = UrlFetchApp.fetch(
        `https://docs.google.com/document/d/${file.getId()}/export?format=txt`,
        { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }
      );
      return res.getContentText();
    }

    // PDF — copy as Google Doc via Drive API v3, extract text, delete temp
    if (mimeType === "application/pdf") {
      const copyRes = UrlFetchApp.fetch(
        `https://www.googleapis.com/drive/v3/files/${file.getId()}/copy`,
        {
          method:      "POST",
          contentType: "application/json",
          headers:     { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
          payload:     JSON.stringify({
            mimeType: "application/vnd.google-apps.document",
            name:     "temp_ocr"
          }),
          muteHttpExceptions: true
        }
      );
      const copyData = JSON.parse(copyRes.getContentText());
      const docId    = copyData.id;

      const textRes = UrlFetchApp.fetch(
        `https://docs.google.com/document/d/${docId}/export?format=txt`,
        { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }
      );
      const text = textRes.getContentText();

      // Clean up temp doc
      UrlFetchApp.fetch(
        `https://www.googleapis.com/drive/v3/files/${docId}`,
        {
          method:  "DELETE",
          headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        }
      );

      return text;
    }

    // Excel / XLS / XLSX
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("xls")) {
      return file.getBlob().getDataAsString("UTF-8");
    }

    // Plain text, CSV, DOCX fallback
    return file.getBlob().getDataAsString("UTF-8");

  } catch (e) {
    Logger.log("Text extraction failed for " + file.getName() + ": " + e.message);
    return "";
  }
}


// ── Prompt Builders ───────────────────────────────────────────

function buildLecturePrompt(label, slideText, hasVideo) {
  const source = hasVideo
    ? "Watch the video and use the slide content below to produce"
    : "Using the slide content below, produce";

  return `
You are summarising a recorded online class lecture for a student who wants to review it months or years later.

Lecture: ${label}
${slideText ? `\nSlide content:\n${slideText}\n` : ""}

${source} a structured summary following these rules:

1. FORMAT: Use headings and subheadings. Use paragraphs or bullet points depending on what suits each section best.

2. STRUCTURE: For each major topic or skill covered, organise content under four layers:
   - What it is
   - Why it exists / why it matters
   - The underlying concept
   - How to apply it (as taught in this session)

3. Q&A HANDLING: The session is interactive with student questions. Include a Q&A exchange ONLY if it introduces a new concept, corrects a misconception, or explains something from a fresh angle. Discard repetitive, procedural, or administrative exchanges.

4. ASSIGNMENT DETECTION: If the instructor explains an assignment or task, include a clearly marked section at the end titled "## Assignment Overview" with:
   - What students are asked to do
   - The skill being tested
   - The approach suggested by the instructor

5. SKILL TAGS: At the very end, on a new line, list all skills covered in this format:
   SKILLS: skill1, skill2, skill3

6. TONE: Write for a student revisiting this material after a long gap. Be clear, precise, and retain enough detail to be genuinely useful — but avoid padding.
`.trim();
}

function buildAssignmentPrompt(fileName, skillName, fileText) {
  return `
You are summarising an assignment brief for a student who wants to understand what was asked of them.

Assignment file: ${fileName}
Skill area: ${skillName || "Unknown"}
${fileText ? `\nFile content:\n${fileText}\n` : ""}

Produce a concise assignment overview with:
1. What students are asked to do
2. The skill or concept being tested
3. Any specific approach, format, or constraints mentioned
4. Key deliverables

Keep it clear and concise. No padding.
`.trim();
}

function buildReadingMaterialPrompt(fileName, skillName, fileText) {
  return `
You are summarising a supplementary reading material for a student.

File: ${fileName}
Skill area: ${skillName || "Unknown"}
${fileText ? `\nContent:\n${fileText}\n` : ""}

Produce a summary in bullet points or paragraphs as appropriate.
Maximum length: ${CONFIG.READING_MATERIAL_MAX_WORDS} words.
Focus on: key arguments, frameworks or models introduced, and practical takeaways.
Keep it minimal and useful.
`.trim();
}


// ── Skill Tag Extractor ───────────────────────────────────────

function extractSkillTags(summaryText) {
  const match = summaryText.match(/SKILLS:\s*(.+)/i);
  if (!match) return [];
  return match[1].split(",").map(s => s.trim()).filter(Boolean);
}
