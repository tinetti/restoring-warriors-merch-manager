# Implementation Spec: Godaddy Ecommerce Manager - Phase 4

**Contract**: `./contract.md`
**Estimated Effort**: M

## Technical Approach

Phase 4 extends the safe catalog workflow to include the asset side of a Godaddy import. The core rule is the same as earlier phases: keep the operator in a localhost tool, and keep the external vendor format at the boundary. The app should manage image references in the internal model, then build a predictable export package on demand.

The current repository already has a basic `ImageHandler` and an export-time copy step. This phase should formalize that into a first-class packaging flow rather than a side effect hidden inside CSV export. The operator needs to know which images belong to which product, which are missing, and where the package was written.

Because browsers are poor at writing arbitrary local directories, the server should remain responsible for building the export bundle into a known output directory on disk. The UI should trigger the packaging flow and display the result path plus any missing-image warnings. The package format should remain simple: Godaddy CSV plus staged image files in a documented directory layout. If a real-world import test reveals an exact Godaddy naming rule, encode that rule in one place.

## Feedback Strategy

**Inner-loop command**: `node --import tsx --test test/model/image-handler.test.ts test/model/export-bundle.test.ts`

**Playground**: Scoped file-system tests plus the local app for image upload/package flows.

**Why this approach**: Packaging is mostly deterministic file I/O, so temp-directory tests are the fastest loop; the UI is mainly a thin trigger and status surface.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/model/export-bundle.ts` | Builds a complete export package result that includes CSV bytes, image staging, and warnings. |
| `test/model/export-bundle.test.ts` | Verifies package assembly, path layout, and missing-image handling. |
| `test/server/image-package.test.ts` | Covers image-related API and package responses over HTTP. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/model/image-handler.ts` | Expand from raw copy helper into a product-aware image staging utility with warnings. |
| `src/model/types.ts` | Add any minimal image metadata needed for package assembly, such as relative source path or ordering. |
| `src/server/app.ts` | Add package-oriented responses and image-management endpoints that surface warnings clearly. |
| `web/app.js` | Add image management affordances and export-package status display. |
| `src/index.ts` | Support configuring the output directory cleanly for package generation. |

### Deleted Files

_None._

## Implementation Details

### Export Bundle Builder

**Pattern to follow**: `src/csv/writer.ts`, `src/model/image-handler.ts`

**Overview**: Create one module that owns package assembly so CSV export and image staging do not drift apart.

```ts
export interface ExportBundleResult {
  outputDir: string;
  csvPath: string;
  imageFiles: string[];
  warnings: string[];
}

export async function buildExportBundle(products: Product[], options: {
  outputDir: string;
  imageSourceDir: string;
}): Promise<ExportBundleResult>;
```

**Key decisions**:

- Bundle assembly owns both CSV writing and image staging; callers should not coordinate those steps manually.
- Warnings are part of the result, not thrown exceptions, when packaging can proceed despite missing assets.
- Output layout must be deterministic so the operator can rerun packaging idempotently.

**Implementation steps**:

1. Add `src/model/export-bundle.ts` to orchestrate CSV generation plus image staging.
2. Write the CSV into the chosen output directory with a stable filename.
3. Collect image staging warnings for missing files or unsupported formats.
4. Return the full bundle result to the caller for UI/server display.

**Feedback loop**:

- **Playground**: Create `test/model/export-bundle.test.ts` with a temp source directory and one missing image reference before implementation.
- **Experiment**: Package a product with zero images, one image, and a missing-image reference.
- **Check command**: `node --import tsx --test test/model/export-bundle.test.ts`

### Image Staging and Registry Behavior

**Pattern to follow**: `src/model/image-handler.ts`

**Overview**: Turn image handling into a more explicit contract: each product owns ordered image references, and staging copies those references into the export package predictably.

```ts
export interface OrganizedImage {
  productId: string;
  sourcePath: string;
  destinationPath: string;
  destinationRelativePath: string;
  missing?: boolean;
}

export class ImageHandler {
  async organizeImages(products: Product[]): Promise<OrganizedImage[]>;
}
```

**Key decisions**:

- Image order matters because Godaddy imports often use primary/secondary ordering conventions.
- Missing image files should generate warnings, not crash the entire export package, unless the product has been marked as requiring them.
- The handler should stay ignorant of HTTP and UI concerns.

**Implementation steps**:

1. Extend `ImageHandler` to record missing-file cases instead of failing on the first one.
2. Preserve primary-image ordering when staging files.
3. Normalize destination filenames consistently to avoid collisions.
4. Keep copy behavior idempotent so reruns do not multiply files.

**Feedback loop**:

- **Playground**: Use `test/model/image-handler.test.ts` with temp directories.
- **Experiment**: Stage repeated runs with the same images, plus one missing file, and verify stable results.
- **Check command**: `node --import tsx --test test/model/image-handler.test.ts`

### Image Management and Package UX

**Pattern to follow**: `web/app.js`, `src/server/app.ts`

**Overview**: The local app should let the operator attach/manage images on a product and then trigger a full export package, not just a CSV download.

```ts
// POST /api/products/:id/images
// POST /api/export/package

interface ExportPackageResponse {
  outputDir: string;
  csvPath: string;
  imageFiles: string[];
  warnings: string[];
}
```

**Key decisions**:

- Keep image management inside the product editor rather than inventing a separate asset module.
- Export packaging should return file-system locations and warnings so the operator knows what was produced.
- The UI should distinguish “package built with warnings” from “package failed.”

**Implementation steps**:

1. Preserve or improve the current image upload flow in `web/app.js`.
2. Add an export-package action that invokes the bundle builder server-side.
3. Show warnings for missing images or skipped files in a dialog or status area.
4. Keep existing validation behavior in front of packaging so unsafe catalogs still cannot export.

**Feedback loop**:

- **Playground**: Start the app with a temp image source directory and a known output directory.
- **Experiment**: Upload one image, mark it primary, package export, then inspect the output directory and warning list.
- **Check command**: `node --import tsx --test test/server/image-package.test.ts && npm run dev`

## Data Model

### State Shape

```ts
export interface ImageRef {
  fileName: string;
  altText: string;
  isPrimary: boolean;
  sortOrder?: number;
}
```

Only add metadata that is required for deterministic packaging or UI ordering.

## API Design

### New Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/export/package` | Build the CSV + image export package in the configured output directory. |

### Modified Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/products/:id/images` | Return enough metadata for the UI to refresh image state and warnings. |
| `POST` | `/api/products/export` | Optionally become a thin wrapper over package assembly, or remain CSV-only if both flows are intentionally preserved. |

### Request/Response Examples

```ts
// POST /api/export/package
{}

// Response
{
  "outputDir": "/Users/tinetti/Projects/restoring-warriors-merch-manager/godaddy-import",
  "csvPath": "/Users/tinetti/Projects/restoring-warriors-merch-manager/godaddy-import/godaddy-export.csv",
  "imageFiles": [
    "prod-1-1.jpg",
    "prod-1-2.jpg"
  ],
  "warnings": []
}
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/model/image-handler.test.ts` | Ordered copy behavior, overwrite/idempotence, missing-file handling. |
| `test/model/export-bundle.test.ts` | End-to-end bundle assembly and warning reporting. |

**Key test cases**:

- Packaging creates CSV plus staged images in the expected directory.
- Missing image files yield warnings but do not necessarily abort packaging.
- Re-running packaging overwrites or reuses destination files cleanly.
- Primary image ordering is preserved.
- Unsupported file formats are skipped or warned consistently.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `test/server/image-package.test.ts` | Upload + package flow via the local app server. |

**Key scenarios**:

- Upload one or more images to a product and build a package successfully.
- Build a package when an image reference is missing and verify warnings are returned.
- Attempt package export with a validation-blocked catalog and verify the guard still holds.

### Manual Testing

- [ ] Upload multiple images for a product and mark one primary.
- [ ] Build an export package and inspect the output directory on disk.
- [ ] Remove or rename one source image and verify packaging returns a warning.
- [ ] Rebuild the package twice and confirm the layout remains stable.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Source image file missing | Record a warning in the bundle result; continue packaging other assets. |
| Output directory cannot be created | Return a hard error and do not claim package success. |
| Unsupported image format | Skip and warn; do not attempt lossy conversion in this phase. |
| Package export requested while validation is blocked | Return the same blocked export structure used in earlier phases. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Bundle builder | Partial package output | CSV writes but image staging fails midway | Operator imports incomplete package unknowingly | Return warnings/errors plus explicit output paths; keep staging deterministic |
| Image registry | Stale references | User moves/deletes a local image after upload | Export package is incomplete | Surface missing-image warnings at package time |
| Output layout | File collision | Two products normalize to clashing image filenames | One image overwrites another | Prefix filenames with product identity and sequence |
| UI package status | False success signal | Server packages with warnings but UI only shows success | Operator misses incomplete asset state | Show warnings prominently and separately from success state |

## Validation Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Scoped Phase 4 tests
node --import tsx --test test/model/image-handler.test.ts test/model/export-bundle.test.ts test/server/image-package.test.ts

# Full test suite
npm test

# Run the local app
npm run dev
```

## Rollout Considerations

- Preserve the simple local-folder mental model; do not add cloud storage or remote asset sync.
- Keep CSV-only export available if packaging needs to be phased in incrementally.
- If real-world Godaddy imports reveal a stricter asset naming/layout rule, centralize that change in `export-bundle.ts` rather than scattering it across UI/server code.

## Open Items

- [ ] Confirm the exact Godaddy image-packaging expectations with a real import test if they differ from the current flat staged-file approach.
- [ ] Decide whether packaging should optionally emit a zip archive later, or stay as a plain local directory.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
