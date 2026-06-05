// ============================================================
// DriveConnector.gs — Course Memory Tool
// Connects to Google Drive, scans folders, detects new files.
// Handles skill subfolders in Activity and Reading Material.
// Matches lectures to slides by session number.
// ============================================================


// ── Entry Point ───────────────────────────────────────────────
// Called by time-driven trigger every Tuesday and Friday.
// Also callable manually from Apps Script editor for testing.

function scanForNewContent() {
  Logger.log("── Starting Drive scan ──");

  const rootFolder  = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  Logger.log("Root folder: " + rootFolder.getName());

  const processedIds = getProcessedFileIds();

  const newFiles = {
    lectures:        getNewFiles(getSubFolder(rootFolder, CONFIG.FOLDERS.LECTURES), processedIds),
    slides:          getNewFiles(getSubFolder(rootFolder, CONFIG.FOLDERS.SLIDES), processedIds),
    activity:        getNewFilesFromSkillSubFolders(rootFolder, CONFIG.FOLDERS.ACTIVITY, processedIds),
    readingMaterial: getNewFilesFromSkillSubFolders(rootFolder, CONFIG.FOLDERS.READING_MATERIAL, processedIds)
  };

  Logger.log(`Lectures: ${newFiles.lectures.length} | Slides: ${newFiles.slides.length} | Activity: ${newFiles.activity.length} | Reading: ${newFiles.readingMaterial.length}`);

  // Detect any new unknown subfolders and log them
  scanUnknownSubFolders(rootFolder);

  // Hand off to summarisation pipeline in batches
  // Processes up to BATCH_SIZE files per run to stay within 6-min limit
  processBatch(newFiles, processedIds, CONFIG.BATCH_SIZE);

  Logger.log("── Scan complete ──");
}


// ── Folder Utilities ──────────────────────────────────────────

// Find a named subfolder inside a parent folder
function getSubFolder(parentFolder, folderName) {
  if (!parentFolder) return null;
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next() : null;
}

// Get new unprocessed files directly inside a folder
function getNewFiles(folder, processedIds) {
  if (!folder) return [];
  const newFiles = [];
  const files    = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (processedIds.has(file.getId())) continue;
    if (shouldIgnoreFile(file))         continue;
    newFiles.push(buildFileObject(file, null));
  }

  return newFiles;
}

// Get new files from skill-named subfolders (Activity, Reading Material)
// Returns files tagged with their skill subfolder name
function getNewFilesFromSkillSubFolders(rootFolder, parentFolderName, processedIds) {
  const parentFolder = getSubFolder(rootFolder, parentFolderName);
  if (!parentFolder) return [];

  const newFiles    = [];
  const subFolders  = parentFolder.getFolders();

  while (subFolders.hasNext()) {
    const skillFolder = subFolders.next();
    const skillName   = skillFolder.getName(); // folder name = skill name
    const files       = skillFolder.getFiles();

    while (files.hasNext()) {
      const file = files.next();
      if (processedIds.has(file.getId())) continue;
      if (shouldIgnoreFile(file))         continue;
      newFiles.push(buildFileObject(file, skillName));
    }
  }

  return newFiles;
}

// Detect and log any new top-level subfolders not in CONFIG.FOLDERS
function scanUnknownSubFolders(rootFolder) {
  const knownNames = new Set(Object.values(CONFIG.FOLDERS));
  const subFolders = rootFolder.getFolders();

  while (subFolders.hasNext()) {
    const folder = subFolders.next();
    if (!knownNames.has(folder.getName())) {
      Logger.log("Unknown subfolder detected (skipping): " + folder.getName());
    }
  }
}


// ── File Object Builder ───────────────────────────────────────

function buildFileObject(file, skillName) {
  return {
    id:        file.getId(),
    name:      file.getName(),
    mimeType:  file.getMimeType(),
    url:       file.getUrl(),
    skillName: skillName, // null for lectures/slides, skill name for activity/reading
    file:      file
  };
}


// ── File Filtering ────────────────────────────────────────────

function shouldIgnoreFile(file) {
  const name     = file.getName();
  const mimeType = file.getMimeType();

  // Ignore Google Sheets (attendance)
  if (mimeType === "application/vnd.google-apps.spreadsheet") return true;

  // Ignore by extension
  for (const ext of CONFIG.IGNORE_EXTENSIONS) {
    if (name.toLowerCase().endsWith(ext)) return true;
  }

  // Ignore by name keyword
  for (const keyword of CONFIG.IGNORE_NAME_CONTAINS) {
    if (name.toLowerCase().includes(keyword.toLowerCase())) return true;
  }

  return false;
}


// ── Processed File Tracking ───────────────────────────────────

function getProcessedFileIds() {
  const props = PropertiesService.getScriptProperties();
  const raw   = props.getProperty(CONFIG.STORAGE_KEY_PROCESSED_FILES);
  return raw ? new Set(JSON.parse(raw)) : new Set();
}

function markFileAsProcessed(fileId) {
  const props     = PropertiesService.getScriptProperties();
  const raw       = props.getProperty(CONFIG.STORAGE_KEY_PROCESSED_FILES);
  const processed = raw ? JSON.parse(raw) : [];

  if (!processed.includes(fileId)) {
    processed.push(fileId);
    props.setProperty(CONFIG.STORAGE_KEY_PROCESSED_FILES, JSON.stringify(processed));
  }
}


// ── Batch Processor ───────────────────────────────────────────

function processBatch(newFiles, processedIds, batchSize) {
  let processed = 0;

  const sessions = matchLecturesToSlides(newFiles.lectures, newFiles.slides);
  Logger.log(`Matched sessions: ${sessions.length}`);

  for (const session of sessions) {
    if (processed >= batchSize) { Logger.log("Batch limit reached — resume next run"); return; }
    try {
      summariseLecture(session);
      if (session.lecture) markFileAsProcessed(session.lecture.id);
      if (session.slide)   markFileAsProcessed(session.slide.id);
      processed++;
    } catch (e) {
      Logger.log("Error processing lecture session: " + e.message);
    }
  }

  for (const file of newFiles.activity) {
    if (processed >= batchSize) { Logger.log("Batch limit reached — resume next run"); return; }
    try {
      summariseAssignment(file);
      markFileAsProcessed(file.id);
      processed++;
    } catch (e) {
      Logger.log("Error processing activity file: " + e.message);
    }
  }

  for (const file of newFiles.readingMaterial) {
    if (processed >= batchSize) { Logger.log("Batch limit reached — resume next run"); return; }
    try {
      summariseReadingMaterial(file);
      markFileAsProcessed(file.id);
      processed++;
    } catch (e) {
      Logger.log("Error processing reading material: " + e.message);
    }
  }

  Logger.log(`Batch complete — processed ${processed} file(s) this run`);
}


// ── Session Matching ──────────────────────────────────────────

// Matches lecture files to slide files by session number
// Lecture pattern:  "Phase 1 Session 1", "Phase 2 Session 3"
// Slide pattern:    "2026_April_Cohort_Session-1", "2026_April_Cohort_Session-2"

function matchLecturesToSlides(lectures, slides) {
  const sessions = [];

  for (const lecture of lectures) {
    const sessionNum = extractSessionNumber(lecture.name);
    const matched    = slides.find(s => extractSessionNumber(s.name) === sessionNum);

    sessions.push({
      lecture:    lecture,
      slide:      matched || null,
      sessionNum: sessionNum,
      phase:      extractPhase(lecture.name)
    });
  }

  // Add slides with no matching lecture
  for (const slide of slides) {
    const sessionNum = extractSessionNumber(slide.name);
    const already    = sessions.find(s => s.sessionNum === sessionNum);
    if (!already) {
      sessions.push({ lecture: null, slide: slide, sessionNum: sessionNum, phase: null });
    }
  }

  return sessions;
}

// Extract session number from filename
// Handles: "Phase 1 Session 1", "Session-1", "Session_2", "session 3"
function extractSessionNumber(filename) {
  const match = filename.match(/session[-_\s]*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

// Extract phase number from lecture filename
// Handles: "Phase 1 Session 1", "Phase 2 Session 3"
function extractPhase(filename) {
  const match = filename.match(/phase[-_\s]*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}
