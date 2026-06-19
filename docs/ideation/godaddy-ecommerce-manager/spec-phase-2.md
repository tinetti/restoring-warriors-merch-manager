# Implementation Spec: Godaddy Ecommerce Manager - Phase 2

**Contract**: `./contract.md`
**Estimated Effort**: M

## Technical Approach

Phase 2 turns the Phase 1 model into the operator's day-to-day editing surface. The app remains a localhost web application served by the existing Node HTTP server. The current `src/server/app.ts` and `web/app.js` already prove the basic shape works, so this phase should harden that flow instead of introducing a framework or a hosted architecture.

The product boundary for this phase is deliberately narrow: edit an existing catalog safely. That means importing a CSV or project file, browsing products, editing existing product and variant fields, saving a project file, running validation, and exporting only when the catalog is safe. It does not yet mean full authoring of net-new products or automated variant completion. Those come later.

Because the browser is running locally, the cleanest project-file persistence flow is download/upload of the versioned project document rather than trying to browse arbitrary local paths from the backend. The server should expose project-document endpoints, and the frontend should make save/load obvious and explicit. The UI should also make export safety visible so the operator never mistakes a warning-heavy draft for a ready-to-import catalog.

## Feedback Strategy

**Inner-loop command**: `node --import tsx --test test/server/app.test.ts test/server/project-file-api.test.ts`

**Playground**: Dev server via `npm run dev` plus the browser at `http://127.0.0.1:8080`.

**Why this approach**: This phase mixes API and UI work, so fast server tests plus a live localhost UI give the tightest loop.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `test/server/project-file-api.test.ts` | Covers save/load project endpoints and export blocking behavior. |
| `test/server/export-guard.test.ts` | Verifies export refuses blocked catalogs and returns validation context. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/server/app.ts` | Add project-file save/load endpoints and enforce validation before export. |
| `src/store.ts` | Support replacing full project state cleanly while preserving deep-copy safety. |
| `web/index.html` | Add explicit project save/load controls and clearer validation/export affordances. |
| `web/app.js` | Implement project-file actions, export blocking UX, and a cleaner existing-catalog edit flow. |
| `src/index.ts` | Wire any new app options or server startup defaults needed by the revised UI flow. |

### Deleted Files

_None._

## Implementation Details

### Project File API

**Pattern to follow**: `src/server/app.ts` import/export handlers

**Overview**: Expose the Phase 1 project-document format over HTTP so the local browser can download and load saved work between sessions.

```ts
// POST /api/project/load
// multipart/form-data: file=<project.json>

// POST /api/project/download
// response: application/json attachment

interface LoadProjectResponse {
  imported: number;
}

interface DownloadProjectResponse {
  // JSON attachment body
}
```

**Key decisions**:

- Project save is a download, not a hidden server-side write. The operator should control where local files go.
- Project load mirrors CSV import: upload one file, replace the in-memory catalog, re-render the UI.
- Endpoints should reuse the Phase 1 serializer/parser rather than re-encode project state inline in the server layer.

**Implementation steps**:

1. Add `POST /api/project/load` that parses an uploaded project document and replaces store contents.
2. Add `POST /api/project/download` that returns the current project document as a downloadable JSON attachment.
3. Add `POST /api/products/export` guard behavior: run validation and reject export when `canExport === false`.
4. Return structured JSON errors so the UI can show the real reason export is blocked.

**Feedback loop**:

- **Playground**: Create `test/server/project-file-api.test.ts` before adding endpoints.
- **Experiment**: Load a valid project file, try an unsupported project version, and attempt export with a blocked validation state.
- **Check command**: `node --import tsx --test test/server/project-file-api.test.ts test/server/export-guard.test.ts`

### Existing-Catalog Editing UI

**Pattern to follow**: `web/app.js`

**Overview**: Refine the existing single-page UI so it becomes a trustworthy editor for already-imported products and variants instead of a loose demo surface.

```js
async function handleLoadProject(file) {}
async function handleSaveProject() {}
async function handleExport() {}
function renderValidationSummary(report) {}
```

**Key decisions**:

- Keep the UI in vanilla JS. The app is still small enough that a framework would slow implementation without improving the core workflow.
- Preserve explicit save actions for product edits. Hidden autosave makes error recovery harder in a correctness-first tool.
- Keep editing scoped to existing products and variants in this phase. Do not add net-new product creation yet.

**Implementation steps**:

1. Add project-file save/load controls near the existing CSV import/export controls.
2. Show export status in the UI: ready, blocked by errors, or warning-only.
3. Preserve the product list + editor structure, but tighten field handling so updates are predictable and resilient.
4. Refresh editor state after save/load/import actions to avoid stale data in the DOM.

**Feedback loop**:

- **Playground**: Start the dev server with `npm run dev` before modifying the UI.
- **Experiment**: Import CSV, edit a product name and variant price, save a project file, reload it, then export. Also test the blocked-export case.
- **Check command**: `node --import tsx --test test/server/app.test.ts && npm run dev`

### Export Guard and Validation UX

**Pattern to follow**: `src/validator/validator.ts`, `web/app.js` validation dialog

**Overview**: Export must become an intentional gated action. The operator needs clear reasons when export is blocked and a readable summary when only warnings remain.

```ts
interface ValidationReport {
  issues: ValidationIssue[];
  canExport: boolean;
}

interface ExportBlockedResponse {
  error: 'EXPORT_BLOCKED';
  report: ValidationReport;
}
```

**Key decisions**:

- The backend is the source of truth for export eligibility.
- The UI may prefetch validation status, but it must not guess whether export is allowed.
- Blocked export responses should include the same report structure the validation view uses so the UI does not fork logic.

**Implementation steps**:

1. Update the validation endpoint to return the richer Phase 1 report.
2. Make export re-run validation server-side even if the UI showed a clean state earlier.
3. When export is blocked, present a concise summary plus actionable issue lines.
4. Keep warnings visible but non-blocking.

**Feedback loop**:

- **Playground**: Add a failing server test where duplicate SKUs exist and export is attempted.
- **Experiment**: Compare warning-only vs error-bearing validation reports in the UI.
- **Check command**: `node --import tsx --test test/server/export-guard.test.ts`

## Data Model

_No new canonical model types are required in this phase._ Phase 2 should consume the Phase 1 `ProjectDocument` and `ValidationReport` shapes as-is.

## API Design

### New Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/project/load` | Upload and load a saved local project document. |
| `POST` | `/api/project/download` | Download the current in-memory project document. |

### Modified Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/products/validate` | Return `ValidationReport` instead of a bare issue list. |
| `POST` | `/api/products/export` | Reject export when validation reports blocking issues. |

### Request/Response Examples

```ts
// POST /api/project/load
// multipart/form-data
file=<godaddy-project.json>

// Response
{ "imported": 8 }

// POST /api/products/export
// Error response when blocked
{
  "error": "EXPORT_BLOCKED",
  "report": {
    "canExport": false,
    "issues": [
      {
        "severity": "error",
        "field": "variant:abc:sku",
        "message": "Duplicate SKU detected: DUPLICATE.",
        "blocksExport": true
      }
    ]
  }
}
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/server/project-file-api.test.ts` | Project save/load endpoint behavior and malformed-file handling. |
| `test/server/export-guard.test.ts` | Export blocking, warning-only export, response payload shape. |
| `test/server/app.test.ts` | Existing CRUD behavior still works after endpoint additions. |

**Key test cases**:

- Load valid project document replaces current store contents.
- Load rejects unsupported `schemaVersion`.
- Download returns JSON attachment with the expected document shape.
- Export returns CSV when `canExport` is true.
- Export returns a structured blocked response when validation fails.
- Existing product CRUD still works after the new flows are added.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `test/server/app.test.ts` | Localhost editing + save/load + export flow over real HTTP requests. |

**Key scenarios**:

- CSV import → edit → save project → load project → export.
- Validation error introduced in memory → export blocked.
- Warning-only catalog → export allowed.

### Manual Testing

- [ ] Start the app and import the real fixture CSV.
- [ ] Edit an existing product and variant, then download a project file.
- [ ] Reload the project file and verify the edits return.
- [ ] Introduce a duplicate SKU and verify export is blocked with a readable reason.
- [ ] Fix the duplicate SKU and verify export succeeds.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Project file is malformed JSON | Return 400 with a parse/shape error; keep the current catalog untouched. |
| Project file has unsupported schema version | Return 400 with a version-specific error. |
| Export attempted while blocked | Return a structured validation report and do not stream CSV bytes. |
| UI has stale selected product after reload | Re-resolve selection after refresh; if missing, clear editor state safely. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Project load | Destructive replacement | User loads the wrong file unintentionally | Current in-memory work disappears | Confirm load action in UI if unsaved changes exist |
| Editor UI | Stale DOM state | Product list refreshes after save/load while editor inputs still reflect old objects | User overwrites newer state | Re-render editor from fresh store data after every mutating action |
| Export guard | Frontend-only enforcement | UI thinks export is blocked but backend still allows it, or vice versa | Trust in the tool erodes | Keep backend as the final authority and reuse the same validation report structure |
| Project download | Hidden transport drift | Server hand-builds JSON differently from project serializer | Saved files load inconsistently later | Reuse the Phase 1 serializer/parser in both directions |

## Validation Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Scoped Phase 2 tests
node --import tsx --test test/server/app.test.ts test/server/project-file-api.test.ts test/server/export-guard.test.ts

# Full test suite
npm test

# Run the local app
npm run dev
```

## Rollout Considerations

- No feature flag is required; this phase formalizes the current localhost UI instead of changing deployment shape.
- Keep the UI forgiving for warning-only states, but never silent about them.
- If unsaved-change prompts are added, keep them local to the browser and do not entangle them with persistence logic.

## Open Items

- [ ] Decide whether the app should track a visible “dirty” indicator before project save/load flows are finalized.
- [ ] Decide whether project download filenames should include the original import name or just a timestamped default.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
