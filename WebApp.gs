// ============================================================
// WebApp.gs — Course Memory Tool
// Server-side web app handler. Serves HTML and handles data
// requests from the frontend via google.script.run.
// ============================================================


// ── Web App Entry Point ───────────────────────────────────────

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle(CONFIG.COURSE_NAME + " — Course Memory")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ── Data Handlers (called from frontend) ─────────────────────

// Returns all data needed to render the dashboard
function getDashboardData() {
  return {
    courseName:   CONFIG.COURSE_NAME,
    courseStart:  CONFIG.COURSE_START,
    stats:        getCourseStats(),
    skillMap:     buildSkillMap()
  };
}

// Returns all lectures for the lecture list view
function getAllLectures() {
  return getAllLectureSummaries();
}

// Returns a single lecture by id
function getLecture(id) {
  const lectures = getAllLectureSummaries();
  const idx      = lectures.findIndex(l => l.id === id);
  const lecture  = lectures[idx] || null;

  if (!lecture) return null;

  return {
    ...lecture,
    prev: idx > 0                   ? { id: lectures[idx - 1].id, label: lectures[idx - 1].label } : null,
    next: idx < lectures.length - 1 ? { id: lectures[idx + 1].id, label: lectures[idx + 1].label } : null
  };
}

// Returns all assignments for the assignments list view
function getAllAssignments() {
  return getAllAssignmentSummaries();
}

// Returns a single assignment by id
function getAssignment(id) {
  return getAllAssignmentSummaries().find(a => a.id === id) || null;
}

// Returns all reading materials
function getAllReadingMaterials() {
  return getAllReadingMaterialSummaries();
}

// Returns a single reading material by id
function getReadingMaterial(id) {
  return getAllReadingMaterialSummaries().find(r => r.id === id) || null;
}

// Returns search results for a query
function searchContent(query) {
  return search(query);
}

// Returns all lectures and assignments for a given skill
function getSkillContent(skill) {
  const q         = skill.toLowerCase();
  const lectures  = getAllLectureSummaries().filter(l =>
    (l.skills || []).some(s => s.toLowerCase() === q)
  );
  const assignments = getAllAssignmentSummaries().filter(a =>
    (a.skill || "").toLowerCase() === q
  );
  return { skill, lectures, assignments };
}

// Manual trigger — run a scan immediately from the web app
function triggerManualScan() {
  try {
    scanForNewContent();
    updateLastUpdated();
    return { success: true, message: "Scan completed successfully." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
