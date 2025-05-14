# PRD: Figma Screenshot-Embedding Plugin

## 1. Purpose & Scope  
**Purpose:** Build a Figma Desktop plugin that automates the process of taking a list of search terms (from a CSV), capturing browser screenshots, and embedding them—along with metadata—directly into a Figma file.  
**Scope:**  
- CSV ingestion & column selection  
- Headless-browser screenshot capture (mobile/desktop)  
- Image embedding in Figma canvas  
- Text annotations pulled from CSV  

## 2. Objectives & Success Metrics  
| Objective                                           | Metric                                         |
|-----------------------------------------------------|------------------------------------------------|
| Automate screenshot capture from CSV queries        | ≥ 95% of queries produce valid PNGs            |
| Seamless embedding in Figma                         | Images + text layers correctly placed 100%     |
| UX: Simple, error-resilient flow                    | < 3 reported plugin errors per 100 runs        |
| Performance: reasonable throughput                  | ≤ 5 s per screenshot on average                |

## 3. Non-Goals  
- OCR or image analysis  
- In-plugin browser UI beyond status/progress  
- Complex image transforms (cropping, masking)  

## 4. User Stories  
1. **As a designer**, I want to upload a CSV and pick a “search” column so that I can batch-generate screenshots.  
2. **As a plugin user**, I want to choose “mobile” vs. “desktop” mode so that my screenshots match real device layouts.  
3. **As a collaborator**, I want each screenshot paired with text from other CSV fields (e.g. date, note) so I can annotate designs in Figma at a glance.  

## 5. Functional Requirements  

### 5.1 CSV Import  
- **FR-1.1**: UI lets user select a local CSV file.  
- **FR-1.2**: Display header row; allow selecting one column as “query”.  
- **FR-1.3**: Validate CSV (must contain ≥ 1 row, chosen column nonempty).

### 5.2 Query Extraction  
- **FR-2.1**: Parse file via streaming to handle large CSVs.  
- **FR-2.2**: Normalize each query (trim whitespace, enforce safe filename characters).

### 5.3 Screenshot Capture  
- **FR-3.1**: Launch headless Chromium via Playwright.  
- **FR-3.2**: Support `mobile` (iPhone-13 emulation) and `desktop` (1920×1080).  
- **FR-3.3**: Wait for `networkidle` + configurable delay before capture.  
- **FR-3.4**: Retry up to 2× on network timeouts.

### 5.4 Figma Embedding  
- **FR-4.1**: Convert screenshot to Base64 → Figma Image API.  
- **FR-4.2**: Create a rectangle node, apply image fill, append to current page.  

### 5.5 Text Annotations  
- **FR-5.1**: For each screenshot, read additional CSV columns (e.g. date, note).  
- **FR-5.2**: Create a text node, load appropriate font, set `characters` to formatted metadata.  
- **FR-5.3**: Position text next to its screenshot (consistent X/Y gutter).

## 6. Non-Functional Requirements  
- **NFR-1**: Plugin must run entirely offline on user’s machine.  
- **NFR-2**: Memory usage capped at ~200 MB for 100 images.  
- **NFR-3**: UI should show progress bar + error log.  
- **NFR-4**: Code in TypeScript, bundled with Rollup for ES5 compatibility.  

## 7. Milestones & Timeline  
| Milestone                       | Target Date      |
|---------------------------------|------------------|
| 1. Project kickoff & scaffolding| May 20 2025      |
| 2. CSV UI + parser integration  | May 24 2025      |
| 3. Playwright screenshot module | May 28 2025      |
| 4. Figma embedding prototype    | June 2 2025      |
| 5. Text annotation + layout     | June 5 2025      |
| 6. End-to-end testing & polish  | June 10 2025     |
| 7. Documentation & release      | June 12 2025     |

## 8. Risks & Mitigations  
- **R1: Slow captures** → parallelize batches of 3 pages.  
- **R2: CSV parsing errors** → strict header validation + user feedback for malformed rows.  
- **R3: Figma API rate limits** → throttle image uploads to ≤ 5 requests/sec.