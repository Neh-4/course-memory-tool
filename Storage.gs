// ============================================================
// Storage.gs — Course Memory Tool
// Saves and retrieves all summaries using PropertiesService.
// Data is stored as JSON strings in Script Properties.
// ============================================================


// ── Lecture Summaries ─────────────────────────────────────────

function saveLectureSummary(summaryObj) {
  const all = getAllLectureSummaries();
  // Replace if already exists, otherwise append
  const idx = all.findIndex(s => s.id === summaryObj.id);
  if (idx >= 0) {
    all[idx] = summaryObj;
  } else {
    all.push(summaryObj);
  }
  // Sort by phase then session
  all.sort((a, b) => a.phase !== b.phase ? a.phase - b.phase : a.sessionNum - b.sessionNum);
  setProperty(CONFIG.STORAGE_KEY_LECTURES, all);
}

function getAllLectureSummaries() {
  return getProperty(CONFIG.STORAGE_KEY_LECTURES) || [];
}

function getLectureSummaryById(id) {
  return getAllLectureSummaries().find(s => s.id === id) || null;
}


// ── Assignment Summaries ──────────────────────────────────────

function saveAssignmentSummary(assignmentObj) {
  const all = getAllAssignmentSummaries();
  const idx = all.findIndex(a => a.id === assignmentObj.id);
  if (idx >= 0) {
    all[idx] = assignmentObj;
  } else {
    all.push(assignmentObj);
  }
  // Sort chronologically
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  setProperty(CONFIG.STORAGE_KEY_ASSIGNMENTS, all);
}

function getAllAssignmentSummaries() {
  return getProperty(CONFIG.STORAGE_KEY_ASSIGNMENTS) || [];
}


// ── Reading Material Summaries ────────────────────────────────

function saveReadingMaterialSummary(readingObj) {
  const all = getAllReadingMaterialSummaries();
  const idx = all.findIndex(r => r.id === readingObj.id);
  if (idx >= 0) {
    all[idx] = readingObj;
  } else {
    all.push(readingObj);
  }
  // Sort chronologically
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  setProperty(CONFIG.STORAGE_KEY_READING_MATERIAL, all);
}

function getAllReadingMaterialSummaries() {
  return getProperty(CONFIG.STORAGE_KEY_READING_MATERIAL) || [];
}


// ── Skill Map ─────────────────────────────────────────────────

// Returns a map of skill → array of lectures/assignments that cover it
function buildSkillMap() {
  const lectures    = getAllLectureSummaries();
  const assignments = getAllAssignmentSummaries();
  const skillMap    = {};

  for (const lecture of lectures) {
    for (const skill of (lecture.skills || [])) {
      const key = skill.toLowerCase();
      if (!skillMap[key]) skillMap[key] = { skill: skill, lectures: [], assignments: [] };
      skillMap[key].lectures.push({ id: lecture.id, label: lecture.label });
    }
  }

  for (const assignment of assignments) {
    if (assignment.skill) {
      const key = assignment.skill.toLowerCase();
      if (!skillMap[key]) skillMap[key] = { skill: assignment.skill, lectures: [], assignments: [] };
      skillMap[key].assignments.push({ id: assignment.id, name: assignment.name });
    }
  }

  return skillMap;
}


// ── Search ────────────────────────────────────────────────────

// Unified search across all content types
// Returns results prioritised: lectures first, assignments second, reading materials last
function search(query) {
  if (!query || query.trim() === "") return { lectures: [], assignments: [], readingMaterials: [] };

  const q = query.toLowerCase();

  const lectures = getAllLectureSummaries().filter(s =>
    s.label.toLowerCase().includes(q) ||
    s.summary.toLowerCase().includes(q) ||
    (s.skills || []).some(sk => sk.toLowerCase().includes(q))
  );

  const assignments = getAllAssignmentSummaries().filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    (a.skill || "").toLowerCase().includes(q)
  );

  const readingMaterials = getAllReadingMaterialSummaries().filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.summary.toLowerCase().includes(q) ||
    (r.skill || "").toLowerCase().includes(q)
  );

  return { lectures, assignments, readingMaterials };
}


// ── Course Stats ──────────────────────────────────────────────

function getCourseStats() {
  return {
    totalLectures:        getAllLectureSummaries().length,
    totalAssignments:     getAllAssignmentSummaries().length,
    totalReadingMaterials: getAllReadingMaterialSummaries().length,
    lastUpdated:          getProperty("LAST_UPDATED") || "Never"
  };
}

function updateLastUpdated() {
  PropertiesService.getScriptProperties()
    .setProperty("LAST_UPDATED", new Date().toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric"
    }));
}


// ── Property Helpers ──────────────────────────────────────────

// Apps Script PropertiesService has a 9KB per-property limit.
// For large datasets we chunk across multiple properties.

const CHUNK_SIZE = 8000; // characters per chunk, safely under 9KB limit

function setProperty(key, data) {
  const props  = PropertiesService.getScriptProperties();
  const json   = JSON.stringify(data);
  const chunks = chunkString(json, CHUNK_SIZE);

  // Save number of chunks
  props.setProperty(key + "_CHUNKS", String(chunks.length));

  // Save each chunk
  chunks.forEach((chunk, i) => props.setProperty(`${key}_${i}`, chunk));
}

function getProperty(key) {
  const props      = PropertiesService.getScriptProperties();
  const numChunks  = parseInt(props.getProperty(key + "_CHUNKS") || "0");
  if (numChunks === 0) return null;

  let json = "";
  for (let i = 0; i < numChunks; i++) {
    json += props.getProperty(`${key}_${i}`) || "";
  }

  try {
    return JSON.parse(json);
  } catch (e) {
    Logger.log("Failed to parse stored data for key: " + key);
    return null;
  }
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
