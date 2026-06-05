# Course Memory Tool
### An AI-powered knowledge management system for online courses

---

## Overview

Course Memory Tool is a personal productivity system that automatically processes course materials — lecture slides, assignments, and reading materials — and transforms them into structured, searchable summaries. Built for students who want to retain and revisit what they've learned, even years after course completion.

The tool connects to a Google Drive course folder, monitors it for new content, generates AI-powered summaries using the Gemini API, and presents everything through a clean web interface with full-text search and a skill-based navigation map.

---

## Live Demo

> Deployed as a Google Apps Script Web App.
> Access via shared URL — https://script.google.com/macros/s/AKfycbwf5NNQZaBpmyAwrhOO6-5XDHYH19ZhZaFHDLAcR7joSr--WHJVTjb3dhQR37tAab2O/exec
---

## Problem Statement

Online courses generate large volumes of content — recorded lectures, slide decks, assignment briefs, and supplementary readings. Without a structured system, this knowledge becomes inaccessible over time. Students struggle to:

- Recall specific concepts or skills learned
- Connect topics across sessions
- Revisit assignments and understand what was asked
- Search across all course materials from a single interface

Course Memory Tool solves this by creating a living, AI-generated knowledge base that preserves the learning journey — not just the content.

---

## Key Features

- **Automated Summarisation** — Lecture slides, assignments, and reading materials are summarised using Google Gemini API with structured prompts designed for long-term knowledge retention
- **Skill Extraction** — Skills are automatically extracted from summaries via keyword matching and mapped across all sessions, reflecting the course's spiral learning structure
- **Unified Search** — Full-text search across all content types, with results prioritised by relevance (lectures → assignments → reading materials)
- **Skill Map** — Interactive dashboard showing all skills taught in the course, each linking to every session and assignment where that skill appears
- **Chronological Navigation** — Browse lectures session by session with previous/next navigation and skill tag filtering
- **Automated Sync** — Time-driven triggers scan the course Drive folder every Tuesday and Friday, processing new files automatically in the background
- **Batch Processing** — Smart batching respects Google Apps Script's execution limits while ensuring all content is eventually processed
- **Google Drive Integration** — Summaries link directly back to original files in Drive for full reference

---

## Architecture

```
Google Drive (Course Folder)
        │
        ▼
DriveConnector.gs ──── Scans folders, detects new files, matches sessions
        │
        ▼
Summariser.gs ───────── Extracts text, builds prompts, calls Gemini API
        │
        ▼
Storage.gs ──────────── Stores summaries in Script Properties (chunked JSON)
        │
        ▼
WebApp.gs + Index.html ─ Serves interactive web interface
```

### Folder Mapping

| Drive Folder | Content | Used For |
|---|---|---|
| `Lectures` | MP4 session recordings | Lecture summaries |
| `Slides` | PDF presentation files | Lecture summaries (primary text source) |
| `Activity` | Assignment templates (by skill subfolder) | Assignment overviews |
| `Reading Material` | PDFs, articles (by skill subfolder) | Reading summaries |

---

## Tech Stack

| Component | Technology |
|---|---|
| Backend & Automation | Google Apps Script |
| AI Summarisation | Google Gemini API (`gemini-3-flash-preview`) |
| File Storage | Google Drive |
| Data Storage | Apps Script Properties Service (chunked) |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Deployment | Google Apps Script Web App |
| Scheduling | Apps Script Time-driven Triggers |

---

## AI & Prompt Engineering

The summarisation pipeline uses carefully structured prompts designed to produce summaries useful for long-term knowledge retention. Each lecture summary is structured around a **four-layer skill model**:

1. **What it is** — definition and description
2. **Why it exists** — purpose and motivation
3. **The underlying concept** — theory and principles
4. **How to apply it** — practical application as taught

Prompts also handle:
- **Conditional Q&A inclusion** — student-instructor exchanges are included only when they introduce new concepts or correct misconceptions, not when they are procedural or repetitive
- **Assignment detection** — the system identifies when an instructor shifts into explaining an assignment and extracts that segment automatically
- **Skill tag generation** — each summary ends with a structured `SKILLS:` line parsed to build the skill map

---

## System Design Decisions

| Decision | Rationale |
|---|---|
| Google Apps Script over Flask/Streamlit | Free forever, no hosting required, native Drive integration, shareable via URL |
| Gemini API over OpenAI | Free tier available, Google-native, same ecosystem as Drive and Apps Script |
| Script Properties for storage | No database required, fully free, sufficient for course-scale data |
| Chunked storage | Apps Script Properties has a 9KB per-key limit — data is automatically split and reassembled |
| Skill subfolders as skill tags | Instructor-organised folder structure used directly as skill labels — more reliable than NLP extraction |
| Batch processing | Apps Script has a 6-minute execution limit — batch size controls prevent timeouts |
| Slides as primary lecture source | Video files exceed Apps Script memory limits and are access-restricted — slides provide structured content |
| Tuesday/Friday sync schedule | Aligned with weekend class schedule — Friday catches mid-week uploads, Tuesday catches post-weekend uploads |

---

## Project Structure

```
Course Memory Tool (Apps Script Project)
├── Code.gs            # Entry point, triggers, test utilities
├── Config.gs          # Central configuration — folders, API keys, settings
├── DriveConnector.gs  # Drive scanning, file detection, session matching
├── Summariser.gs      # Gemini API calls, text extraction, prompt builders
├── Storage.gs         # Data persistence, search, skill map builder
├── WebApp.gs          # Server-side web app handlers
└── Index.html         # Frontend — dashboard, search, navigation, detail views
```

---

## Setup Guide

### Prerequisites
- Google account with access to the course Drive folder
- Gemini API key from [aistudio.google.com](https://aistudio.google.com)

### Steps

1. **Create Apps Script project** at [script.google.com](https://script.google.com)
2. **Create files** — `Code.gs`, `Config.gs`, `DriveConnector.gs`, `Summariser.gs`, `Storage.gs`, `WebApp.gs`, `Index.html`
3. **Enable Drive API** — Services → Drive API → Add
4. **Configure** `Config.gs` with your Drive folder ID, subfolder names, and Gemini API key
5. **Run `setupTriggers()`** once to activate Tuesday/Friday automation
6. **Deploy as Web App** — Deploy → New Deployment → Web App → Execute as Me → Anyone
7. **Run `testDriveConnection()`** and **`testGeminiConnection()`** to verify setup
8. **Click Sync Now** in the web app to process initial content

---

## Usage

| Action | How |
|---|---|
| Process new content | Click **Sync Now** in sidebar, or wait for Tuesday/Friday auto-scan |
| Browse lectures | Click **Lectures** in sidebar — chronological list with skill tags |
| View lecture detail | Click any lecture — full summary, skill tags, assignment overview, prev/next nav |
| Browse assignments | Click **Assignments** — chronological list, click for instruction summary |
| Browse reading materials | Click **Reading** — chronological list, click for summary and Drive link |
| Search everything | Type in the search bar — results show lectures first, then assignments, then readings |
| Filter search | Use All / Lectures / Assignments / Reading filter buttons |
| Explore a skill | Click any skill bubble on dashboard or skill tag on a lecture page |

---

## Known Limitations & Future Work

| Limitation | Status | Planned Fix |
|---|---|---|
| Video summarisation limited by size | Blocked by Drive download restrictions and Apps Script memory limits | Resolve with instructor to enable transcript exports or Zoom `.vtt` files |
| Gemini free tier rate limits | Managed via batch processing and request throttling | Monitor usage; upgrade API tier if needed |
| Apps Script 6-minute execution limit | Managed via configurable batch size | Current batch size handles content within limits |
| Storage limits | Script Properties has a 500KB total limit | Migrate to Google Sheets or Drive JSON file if content grows large |

---

## Skills Demonstrated

- **LLM Application Development** — end-to-end AI-powered application built on Gemini API
- **API Integration** — Gemini API, Google Drive API v3, Apps Script Services
- **System Design** — architectural decisions balancing cost, performance, and constraints
- **Automation** — time-driven triggers, batch processing, error handling, retry logic
- **Full-Stack Development** — backend logic, data persistence, and frontend interface
- **Product Thinking** — requirements gathering, iterative design, user-centered decisions

---

## Author

Built by Neha Pandey as a personal productivity tool for a creating a memory of course taken in liue of pencil-paper note making.

---

*This project is part of an ongoing effort to apply AI engineering skills to real personal productivity challenges.*
