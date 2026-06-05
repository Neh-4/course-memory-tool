// ============================================================
// Config.gs — Course Memory Tool
// Central configuration file. Edit this for each new course.
// ============================================================

const CONFIG = {

  // ── Google Drive ──────────────────────────────────────────
  ROOT_FOLDER_ID: "1fI5bUvZGRx3U6ZKpK73GpfJDYOO25M1L",

  FOLDERS: {
    LECTURES:          "Lectures",
    SLIDES:            "Slides",
    ACTIVITY:          "Activity",
    READING_MATERIAL:  "Reading Material"
  },

  // Files to always ignore
  IGNORE_EXTENSIONS: [".gsheet", ".gform"],
  IGNORE_NAME_CONTAINS: ["attendance", "Attendance"],

  // ── Gemini API ────────────────────────────────────────────
  GEMINI_API_KEY: "PASTE_YOUR_GEMINI_API_KEY_HERE",
 GEMINI_MODEL: "gemini-3-flash-preview",  // free tier model
  GEMINI_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models/",

  // ── Summarisation Limits ──────────────────────────────────
  READING_MATERIAL_MAX_WORDS: 2000,

  // ── Automation ────────────────────────────────────────────
  // Scan runs every Tuesday and Friday via time-driven trigger
  // Trigger is set up separately in Triggers.gs
  SCAN_DAYS: ["Tuesday", "Friday"],

  // ── Batch Processing ──────────────────────────────────────
  // Max files per scan run — keeps execution under 6-minute limit
  // At 4.5s per file: 10 files ≈ 45s + overhead, safely under limit
  BATCH_SIZE: 5,

  // ── Storage ───────────────────────────────────────────────
  // We use PropertiesService to store processed file IDs
  // and ScriptProperties to store all summaries as JSON
  STORAGE_KEY_LECTURES:         "SUMMARIES_LECTURES",
  STORAGE_KEY_ASSIGNMENTS:      "SUMMARIES_ASSIGNMENTS",
  STORAGE_KEY_READING_MATERIAL: "SUMMARIES_READING_MATERIAL",
  STORAGE_KEY_PROCESSED_FILES:  "PROCESSED_FILE_IDS",
