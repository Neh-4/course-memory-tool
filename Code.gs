// ============================================================
// Code.gs — Course Memory Tool
// Main entry point. Sets up time-driven triggers.
// Run setupTriggers() once manually to activate automation.
// ============================================================


// ── Trigger Setup ─────────────────────────────────────────────
// Run this function ONCE manually from the Apps Script editor.
// It creates Tuesday and Friday scan triggers automatically.

function setupTriggers() {
  // Remove any existing triggers first to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Tuesday scan at 2:00 AM
  ScriptApp.newTrigger("scanForNewContent")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(2)
    .create();

  // Friday scan at 2:00 AM
  ScriptApp.newTrigger("scanForNewContent")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(2)
    .create();

  Logger.log("✓ Triggers set: Tuesday and Friday at 2:00 AM");
}


// ── Manual Test Utilities ─────────────────────────────────────
// Run these from the editor to test individual parts

// Test Drive connection — confirms folders are found
function testDriveConnection() {
  const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  Logger.log("Root folder: " + root.getName());

  Object.entries(CONFIG.FOLDERS).forEach(([key, name]) => {
    const iter   = root.getFoldersByName(name);
    const found  = iter.hasNext();
    Logger.log(`${key} (${name}): ${found ? "✓ Found" : "✗ Not found"}`);
  });
}

// Test Gemini API — sends a simple prompt to verify key works
function testGeminiConnection() {
  try {
    const res = UrlFetchApp.fetch(
      `${CONFIG.GEMINI_ENDPOINT}${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
      {
        method:      "POST",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: "Say hello in one sentence." }] }],
          generationConfig: { maxOutputTokens: 50 }
        })
      }
    );
    const data = JSON.parse(res.getContentText());
    Logger.log("Gemini response: " + data.candidates[0].content.parts[0].text);
    Logger.log("✓ Gemini API connected successfully");
  } catch (e) {
    Logger.log("✗ Gemini connection failed: " + e.message);
  }
}
function testSlideAccess() {
  const root        = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const slideFolder = root.getFoldersByName(CONFIG.FOLDERS.SLIDES).next();
  const files       = slideFolder.getFiles();

  if (files.hasNext()) {
    const file = files.next();
    Logger.log("Testing slide: " + file.getName());
    try {
      const text = extractTextFromFile(file);
      Logger.log("✓ Text extracted: " + text.substring(0, 200));
    } catch(e) {
      Logger.log("✗ Failed: " + e.message);
    }
  }
}

// Test full scan manually — same as the Tuesday/Friday trigger
function testFullScan() {
  scanForNewContent();
  updateLastUpdated();
}
function testBlobUpload() {
  const root      = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const lecFolder = root.getFoldersByName(CONFIG.FOLDERS.LECTURES).next();
  const files     = lecFolder.getFiles();

  if (files.hasNext()) {
    const file = files.next();
    Logger.log("Getting blob: " + file.getName());
    try {
      const blob = file.getBlob();
      Logger.log("✓ Blob size: " + blob.getBytes().length + " bytes");
    } catch(e) {
      Logger.log("✗ Blob failed: " + e.message);
    }
  }
}

// Clear all stored summaries — use with caution
function clearAllData() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  Logger.log("✓ All data cleared");
}
function testFileAccess() {
  const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  
  Object.entries(CONFIG.FOLDERS).forEach(([key, name]) => {
    const folder = root.getFoldersByName(name);
    if (!folder.hasNext()) { Logger.log(key + ": folder not found"); return; }
    
    const files = folder.next().getFiles();
    let count = 0;
    while (files.hasNext()) {
      const file = files.next();
      try {
        file.getBlob(); // test if downloadable
        Logger.log(`✓ ${key}: ${file.getName()}`);
      } catch(e) {
        Logger.log(`✗ ${key}: ${file.getName()} — NOT downloadable`);
      }
      count++;
      if (count >= 2) break; // just test first 2 per folder
    }
  });
}

// Test chunked upload on a single lecture file
function testSingleLecture() {
  const root       = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const lecFolder  = root.getFoldersByName(CONFIG.FOLDERS.LECTURES).next();
  const files      = lecFolder.getFiles();

  if (files.hasNext()) {
    const file = files.next();
    Logger.log("Testing: " + file.getName() + " (" + Math.round(file.getSize()/1024/1024) + "MB)");
    try {
      const uri = uploadLargeFileTOGemini(file);
      Logger.log("✓ Upload successful: " + uri);
    } catch (e) {
      Logger.log("✗ Upload failed: " + e.message);
    }
  } else {
    Logger.log("No files found in Lectures folder");
  }
}
