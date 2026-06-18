# Implementation Spec: Godaddy Ecommerce Manager - Phase 3

**Contract**: ./docs/ideation/godaddy-ecommerce-manager/contract.html
**Date**: 2026-06-17
**Estimated Effort**: M

**Prerequisites**: Phase 1 (Data Layer & CSV I/O), Phase 2 (Web App UI)

## Technical Approach

Phase 3 adds two interconnected features: (1) auto-generated SKU logic from variant attributes, and (2) image file management for Godaddy import. Both features touch the data model (new fields/methods), the CSV writer (new columns), and the web UI (SKU display and image management UI).

**Key technical decisions:**

- **SKU format**: Replace Godaddy's cryptic SKUs (e.g., `"N-JSS-NM-T---BG-LTTR-BLCK-SMLL"`) with readable, consistent SKUs derived from product name + variant attributes. Format: `{FAMILY}-{PRODUCT-SHORT}-{COLOR}-{SIZE}` (configurable).
- **SKU generation is opt-in per product**: Users see the current Godaddy SKU and can click "Regenerate" to apply the auto-generated format. Preserves existing SKUs for products that already have good ones.
- **Image directory structure**: Godaddy's importer expects images in a specific subdirectory layout. We'll create a `godaddy-import/` output directory alongside the exported CSV, with images organized by product ID. The exact structure is inferred from the export and configurable.
- **Images are referenced by filename** in the CSV — the tool manages the copy operation to the import directory.

## Feedback Strategy

**Inner-loop command**: `go test ./internal/model/... -v -run TestSKU`

**Playground**: Run the CLI export with a test product set, inspect the generated SKUs and image directory. Also test in the web UI by editing variants and seeing SKUs regenerate.

**Why this approach**: SKU generation is pure logic — unit tests give instant feedback. Image directory structure is verified by inspecting the output.

## File Changes

### New Files

| File Path                                                    | Purpose                                    |
| ------------------------------------------------------------ | ------------------------------------------ |
| `internal/model/sku.go`                                      | SKU generation logic from variant attributes |
| `internal/model/sku_test.go`                                 | Tests for SKU generation                   |
| `internal/model/image_handler.go`                            | Image copy/organization for Godaddy import |
| `internal/model/image_handler_test.go`                       | Tests for image handling                   |
| `web/components/image-uploader.js`                           | Image upload/drag-drop component           |
| `internal/server/image_handler.go`                           | Image upload HTTP endpoint                 |

### Modified Files

| File Path                          | Changes                                    |
| ---------------------------------- | ------------------------------------------ |
| `internal/model/product.go`        | Add `SKU` field to Variant; add `RegenerateSKUs()` method to Product |
| `internal/csv/writer.go`           | Add SKU column (already exists, but now auto-populated) |
| `internal/server/handlers.go`      | Add `POST /api/products/:id/regenerate-sku` endpoint |
| `cmd/godaddy-manager/main.go`      | Add `--output-dir` flag for image export   |
| `web/app.js`                       | Add route for image management view        |
| `web/styles.css`                   | Add styles for SKU display and image grid  |

### Deleted Files

_None._

## Implementation Details

### SKU Generation (`internal/model/sku.go`)

**Overview**: Converts variant attributes into readable, consistent SKUs based on a configurable template.

```go
package model

// SKUConfig defines how SKUs are generated.
type SKUConfig struct {
    Template string          // e.g., "{Family}-{Product}-{Color}-{Size}"
    Separator string          // Default: "-"
    MaxLength int             // Default: 50 characters
    Abbreviations map[string]string // "Small" → "SM", "Black" → "BLK"
}

// DefaultSKUConfig returns a sensible default configuration.
func DefaultSKUConfig() *SKUConfig

// GenerateSKU builds a SKU from a Product and Variant using the config.
func (c *SKUConfig) GenerateSKU(product *Product, variant *Variant) string

// RegenerateAllSKUs updates all variants' SKUs on a product.
func (p *Product) RegenerateAllSKUs(config *SKUConfig)
```

**SKU Template variables:**

| Variable       | Source                        | Example              |
| -------------- | ----------------------------- | -------------------- |
| `{Family}`     | Product's ProductFamily       | INJES, RESTO, SNAPB  |
| `{Product}`    | Product name (sanitized)      | INJES-TEE, WR-HOODIE |
| `{Color}`      | Option1Value (if Color)       | BLACK, WHITE, NAVY   |
| `{Size}`       | Option2Value (if Size)        | S, M, L, XL          |
| `{Style}`      | Option1Value (if Style)       | BROOKLYN, CLASSIC    |

**Sanitization rules:**

- Convert to UPPERCASE.
- Replace spaces, special chars with the separator.
- Collapse multiple separators.
- Trim to `MaxLength`.

**Example output:**

| Input                                      | Generated SKU                    |
| ------------------------------------------ | -------------------------------- |
| "In Jesus Name" T-Shirt, Black, Small      | `INJES-INJES-TEE-BLACK-S`        |
| "Restoring Warriors" Hoodie, Navy, Medium  | `RESTO-WR-HOODIE-NAVY-M`         |
| "Snapback" Hat, Brooklyn                   | `SNAPB-SNAP-HAT-BROOKLYN`        |

**Key decisions:**

- Template-driven — not hardcoded. The user can customize if they want a different format later.
- SKU generation is a separate function from the data model — it can be called from CLI, API, or tests independently.
- Default template: `{Family}-{Product}-{Color}{Size}` (skip Size for products with only one variant dimension).

**Implementation steps:**

1. Define `SKUConfig` struct with template, separator, max length, abbreviations map.
2. Implement `GenerateSKU()` — parse template, substitute variables, sanitize.
3. Implement `RegenerateAllSKUs()` — iterate product's variants, call `GenerateSKU` for each.
4. Add `SKU` field to `model.Variant` struct.
5. Write unit tests with sample products and expected SKUs.

**Feedback loop:**

- **Playground**: `go test ./internal/model/... -v -run TestSKU`
- **Experiment**: Test SKU generation for all 3 product families, test with 1 and 2 variant dimensions, test edge cases (long names, special chars).
- **Check command**: `go test ./internal/model/... -v -run TestSKU -count=1`

### SKU Regenerate Endpoint (`internal/server/handlers.go`)

**Overview**: HTTP endpoint to trigger SKU regeneration for a product.

```
POST /api/products/:id/regenerate-sku
Response: { "skus_regenerated": N }
```

**Implementation steps:**

1. Parse `:id` from URL.
2. Load product from store.
3. Call `product.RegenerateAllSKUs(config)`.
4. Save product back to store.
5. Return count of variants whose SKUs were updated.

### Image Handler (`internal/model/image_handler.go`)

**Overview**: Manages copying and organizing image files into the directory structure Godaddy's importer expects.

```go
package model

// ImageHandler manages image file operations for Godaddy import.
type ImageHandler struct {
    SourceDir string // Where images are stored (user-managed)
    OutputDir string // Where images are copied for import
}

// NewImageHandler creates a handler for the given source and output directories.
func NewImageHandler(sourceDir, outputDir string) *ImageHandler

// OrganizeImages copies product images to the output directory
// in the structure Godaddy's importer expects.
func (h *ImageHandler) OrganizeImages(products []Product) error

// ListProductImages returns the image files associated with a product.
func (h *ImageHandler) ListProductImages(productID string) []ImageFileInfo

// ImportImage copies a single image file and returns the destination path.
func (h *ImageHandler) ImportImage(productID string, sourcePath string) (destPath string, err error)
```

**Image directory structure (inferred, needs verification):**

Godaddy's CSV importer expects images in a directory alongside the CSV file. The exact structure is typically:

```
godaddy-import/
├── products/
│   ├── PROD-001/
│   │   ├── main.jpg
│   │   ├── angle-1.jpg
│   │   └── detail.jpg
│   ├── PROD-002/
│   │   └── main.jpg
└── export.csv
```

**Alternative structure** (flat with prefixed filenames):

```
godaddy-import/
├── PROD-001-main.jpg
├── PROD-001-angle-1.jpg
├── PROD-002-main.jpg
└── export.csv
```

**Key decisions:**

- The structure is **configurable** — the tool needs a way to let the user specify which layout Godaddy expects. Start with the flat naming convention (simpler, more common for CSV-based importers).
- Image filenames follow `{ProductID}-{sequence}.{ext}` format.
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Images are **copied** (not moved) — the source remains untouched.
- If the output directory already exists, existing files are **overwritten** (idempotent).

**Implementation steps:**

1. Define `ImageHandler` with source and output directory paths.
2. Implement `OrganizeImages()` — scan product Images references, copy each to output dir with the naming convention.
3. Implement `ImportImage()` — single file copy with naming.
4. Implement `ListProductImages()` — scan source directory, match to product's image references.
5. Handle errors: source file doesn't exist (log warning, skip), destination directory can't be created (return error), unsupported format (log warning, skip).
6. Write tests with temp directories.

### Image Upload Endpoint (`internal/server/image_handler.go`)

**Overview**: HTTP endpoint for uploading images from the web UI.

```
POST /api/products/:id/images
Content-Type: multipart/form-data
Body: files[] (one or more image files)
Response: { "uploaded": ["filename1.jpg", "filename2.jpg"] }
```

**Implementation steps:**

1. Accept multipart form with `files[]` field.
2. Validate each file (extension, size ≤ 10MB).
3. Copy to source image directory via `ImageHandler.ImportImage()`.
4. Update the product's `Images` slice with the new references.
5. Return list of uploaded filenames.

### Frontend: Image Management (`web/components/image-uploader.js`)

**Overview**: Image management UI within the product edit view.

```
┌─────────────────────────────────────┐
│ ── Product Images ─────────────────│
│  ┌──────┐  ┌──────┐  ┌──────┐     │
│  │ main │  │  2   │  │  3   │  [+]│
│  │ .jpg │  │ .jpg │  │ .jpg │     │
│  └──────┘  └──────┘  └──────┘     │
│                                     │
│ Primary: [● main.jpg] [○ 2.jpg]   │
│ Set as primary                    │
└─────────────────────────────────────┘
```

**Key decisions:**

- Images are managed within the product edit view, not a separate page.
- Drag-and-drop or file picker to upload.
- Thumbnail preview (client-side, using FileReader API).
- Click to set as primary image.
- Click [X] to remove from product (doesn't delete the file).

**Implementation steps:**

1. Build an image grid component with thumbnails.
2. Add a `[+]` button that opens a file picker.
3. On upload, send files to `/api/products/:id/images`.
4. On success, refresh the image grid.
5. Click a thumbnail to set it as primary.

## Data Model Changes

```go
// In internal/model/product.go, add:

type Variant struct {
    // ... existing fields ...
    SKU string // NEW: auto-generated SKU
}

func (p *Product) RegenerateAllSKUs(config *SKUConfig)
```

## Testing Requirements

### Unit Tests

| Test File                          | Coverage                          |
| ---------------------------------- | --------------------------------- |
| `internal/model/sku_test.go`       | All template variables, sanitization, abbreviations |
| `internal/model/image_handler_test.go` | Copy, overwrite, missing source, unsupported format |
| `internal/server/image_handler_test.go` | Upload endpoint happy path, invalid files |

**Key test cases:**

- SKU: template with all variables → correct SKU
- SKU: template with one variant dimension (no Size) → correct SKU
- SKU: product name with special characters → sanitized SKU
- SKU: SKU exceeds max length → truncated correctly
- SKU: abbreviation map applied correctly
- Image: copy file from source to output dir
- Image: overwrite existing file in output dir
- Image: source file doesn't exist → skip, log warning
- Image: unsupported file format → skip, log warning
- Image: output directory doesn't exist → create it

### Manual Testing

- [ ] Open product edit in web UI, click "Regenerate SKUs" — verify SKUs are readable and consistent
- [ ] Upload an image via the web UI — verify it appears in the image grid
- [ ] Export CSV — verify images are copied to the output directory
- [ ] Verify image directory structure matches Godaddy's expectations (need to confirm with friend)

## Error Handling

| Error Scenario              | Handling Strategy                                      |
| --------------------------- | ------------------------------------------------------ |
| SKU config has invalid template | Return 400, show template error in UI                |
| Image file too large        | Reject upload, show "Max 10MB per file" message        |
| Unsupported image format    | Log warning, skip file, continue processing            |
| Output directory can't be created | Return 500, show "Cannot create output directory"  |
| Source image file missing   | Log warning, skip file, include missing count in response |

## Failure Modes

| Component     | Failure Mode              | Trigger                      | Impact                      | Mitigation                         |
| ------------- | ------------------------- | ---------------------------- | --------------------------- | ---------------------------------- |
| SKU Generator | Template references unknown variable | `{UnknownVar}` in template | Empty SKU or panics         | Validate template at parse time    |
| SKU Generator | Two variants get same SKU | Similar attribute combos     | Godaddy import conflict     | Append numeric suffix if collision |
| Image Handler | Source image deleted before export | User moves file elsewhere | Skipped image, no alt text  | Log warning, continue              |
| Image Handler | Disk full during copy     | Insufficient disk space      | Partial image directory     | Check disk space before batch copy |
| Image Handler | Duplicate filenames in output | Multiple images named same | One overwrites the other    | Prefix with product ID (already)   |

## Validation Commands

```bash
# Test SKU generation
go test ./internal/model/... -v -run TestSKU

# Test image handling
go test ./internal/model/... -v -run TestImage

# Full test suite
go test ./...
```

## Rollout Considerations

- SKU regeneration is a destructive operation (replaces existing SKUs) — add confirmation in the UI.
- Image directory output path should be configurable via CLI flag (`--output-dir`) or default to `godaddy-import/` next to the CSV.

## Open Items

- [ ] **CRITICAL**: Confirm Godaddy's actual image directory structure from the friend or by testing. The flat vs. nested layout decision depends on this.
- [ ] Should there be a "preview" mode that shows what SKUs would be generated without actually changing them?
- [ ] Image compression/resizing? (Godaddy has size limits — should we auto-compress?)

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
