# Implementation Spec: Godaddy Ecommerce Manager - Phase 1

**Contract**: ./docs/ideation/godaddy-ecommerce-manager/contract.html
**Date**: 2026-06-17
**Estimated Effort**: M

## Technical Approach

Phase 1 builds the data layer and CSV I/O — the foundation for everything. The app uses a Go backend (single binary) serving a vanilla HTML/JS frontend on localhost. This phase focuses entirely on the data model, CSV parsing, and CSV writing, verified through tests and a CLI export command.

**Key technical decisions:**

- **Go for the backend**: Simple HTTP server + standard library file handling. No framework overhead. A single `main.go` with a clean package structure.
- **CSV format**: We must faithfully reproduce Godaddy's export format. The sample `godaddy-products-export.csv` is the source of truth for column order, field semantics, and edge cases (empty SKUs on parent rows, variant group IDs, option columns).
- **In-memory data model**: Products, variants, and their relationships live as Go structs. No database — everything is transient until exported.
- **CLI-first for Phase 1**: Before building the web UI, a CLI interface (`godaddy-manager csv parse`, `godaddy-manager csv export`) lets us validate the data layer independently.

**Package structure:**

```
cmd/godaddy-manager/      # CLI entry point
internal/csv/             # Godaddy CSV parsing and writing
internal/model/           # Product, variant, image data models
pkg/testutil/             # Test helpers
```

## Feedback Strategy

**Inner-loop command**: `go test ./internal/csv/...`

**Playground**: Test suite with a `testdata/godaddy-products-export.csv` fixture. Create tests against the real export file, then iterate on parser/writer correctness.

**Why this approach**: Data layer changes are deterministic — parse a CSV, write a CSV, diff the output. Tests are the fastest, most reliable feedback.

## File Changes

### New Files

| File Path                                    | Purpose                                    |
| -------------------------------------------- | ------------------------------------------ |
| `cmd/godaddy-manager/main.go`                | CLI entry point; subcommands for parse and export |
| `internal/model/product.go`                  | Product, Variant, ProductFamily types      |
| `internal/csv/reader.go`                     | Parse Godaddy's CSV export format into Go structs |
| `internal/csv/writer.go`                     | Write Go structs back to Godaddy-compatible CSV |
| `internal/csv/reader_test.go`                | Tests for CSV parsing against real export  |
| `internal/csv/writer_test.go`                | Tests for CSV round-trip (parse → write → parse) |
| `go.mod`                                     | Go module definition                       |
| `go.sum`                                     | Go dependency checksums                    |
| `testdata/godaddy-products-export.csv`       | Copy of the sample export for tests        |
| `.gitignore`                                 | Ignore `go.sum`, binaries, `.env`          |

### Modified Files

| File Path                    | Changes                      |
| ---------------------------- | ---------------------------- |
| `godaddy-products-export.csv` (root) | Kept as reference artifact; testdata copy used for tests |

### Deleted Files

_None — this is a new project._

## Implementation Details

### Data Model (`internal/model/product.go`)

**Overview**: Defines the core data structures representing Godaddy products, their variants, and associated metadata.

```go
package model

// Product represents a top-level product in Godaddy.
type Product struct {
    ID           string          // PRODUCT_ID from CSV
    Name         string          // NAME column
    Type         string          // TYPE (PHYSICAL)
    Shortcode    string          // SHORTCODE column
    Status       string          // STATUS (ACTIVE, DRAFT, etc.)
    Description  string          // DESCRIPTION (may contain HTML entities)
    Weight       float64         // WEIGHT
    WeightUnit   string          // UNIT OF WEIGHT (lbs, oz, etc.)
    Available    bool            // AVAILABLE (YES/NO)
    Price        float64         // PRICE
    SalePrice    *float64        // SALE PRICE (nil if not on sale)
    Family       ProductFamily   // Which brand family
    Variants     []Variant       // Child variants
    Images       []ImageRef      // Associated image files
}

// Variant represents a single variant (size/color combination) of a product.
type Variant struct {
    SKU              string    // Auto-generated or from Godaddy
    Option1Name      string    // e.g., "Color" or "Style"
    Option1Value     string    // e.g., "Black" or "Brooklyn"
    Option2Name      string    // e.g., "Size" (may be empty)
    Option2Value     string    // e.g., "Small" (may be empty)
    Price            float64   // Variant-specific price (nil = inherit from parent)
    SalePrice        *float64  // Variant-specific sale price
    Available        bool      // Per-variant availability
    Weight           float64   // Per-variant weight
    OnHand           int       // Inventory count (often wrong in Godaddy)
}

// ImageRef links an image file to a product or variant.
type ImageRef struct {
    FileName string // Local filename
    AltText  string // Alt text
    IsPrimary bool  // Whether this is the product's primary image
}

// ProductFamily identifies which brand group a product belongs to.
type ProductFamily string

const (
    FamilyInJesusName    ProductFamily = "INJES"
    FamilyRestoringWarriors ProductFamily = "RESTO"
    FamilySnapback           ProductFamily = "SNAPB"
)
```

**Key decisions:**

- `ProductFamily` is an enum type, not a string — prevents typos and makes future brand additions explicit.
- `Variant.SalePrice` and `Variant.Price` are separate from `Product` to support variant-level pricing (even though current data may not use it).
- `Weight` is `float64` to match CSV numeric format; `0.0` values are kept (the Godaddy bug where hoodies show 0 lbs is a data issue, not something we fix in parsing).

### CSV Reader (`internal/csv/reader.go`)

**Overview**: Parses Godaddy's export CSV into the in-memory model. Handles the parent/variant relationship via VARIANT GROUP ID matching.

```go
package csv

import "github.com/nicknisi/godaddy-ecommerce-manager/internal/model"

// ReadGodaddyCSV parses a Godaddy product export CSV file.
func ReadGodaddyCSV(path string) ([]model.Product, error)
```

**Implementation steps:**

1. Define CSV column index mapping from header row (columns may appear in any order).
2. Read all rows. Separate parent rows (TYPE=PHYSICAL, empty SKU) from variant rows (populated SKU, non-empty VARIANT GROUP ID).
3. Build a map of product ID → Product (from parent rows).
4. For each variant row, find its parent by matching VARIANT GROUP ID to PRODUCT_ID, append to parent's Variants slice.
5. Handle edge cases: products with no variants, variants with missing option columns, HTML entities in descriptions.
6. Set `Family` on each product by parsing the prefix from the name or shortcode.

**Key decisions:**

- Parent rows have empty SKU — this is the Godaddy convention. We detect parents by `SKU == ""` AND `TYPE == "PHYSICAL"`.
- Variant-to-parent linkage uses `VARIANT GROUP ID` matching `PRODUCT_ID` of the parent. This is the reliable join key.
- `OPTION 1 NAME` and `OPTION 1 VALUE` are used; `OPTION 2 NAME` and `OPTION 2 VALUE` may be populated for products with two variant dimensions (e.g., Color + Size). Some products may only have one variant dimension.
- HTML entities in descriptions (e.g., `&amp;`) are kept as-is — the CSV writer will handle re-encoding.

**Feedback loop:**

- **Playground**: Create `testdata/godaddy-products-export.csv` from the real export. Write `reader_test.go` with tests parsing it.
- **Experiment**: Test parsing all 3 product families (INJES, RESTO, SNAPB). Verify variant counts match expectations. Test with empty option columns.
- **Check command**: `go test ./internal/csv/... -v`

### CSV Writer (`internal/csv/writer.go`)

**Overview**: Writes the in-memory model back to a Godaddy-compatible CSV file. Must reproduce the same column order and format as the export.

```go
package csv

// WriteGodaddyCSV writes products to a Godaddy-importable CSV file.
func WriteGodaddyCSV(products []model.Product, path string) error
```

**Implementation steps:**

1. Define the header row in Godaddy's exact column order.
2. Write parent rows first (TYPE=PHYSICAL, no SKU, description in DESCRIPTION column, variant group ID = product ID).
3. For each variant, write a row with populated SKU, variant group ID matching parent's product ID, OPTION 1/2 columns.
4. Encode special characters (HTML entities in descriptions).
5. Write a trailing row or header to ensure Godaddy's importer recognizes the file.

**Key decisions:**

- Column order is critical — Godaddy's importer is positional. Match the export's exact order.
- Parent rows and variant rows share the same header — Godaddy uses the VARIANT GROUP ID column to link them, not a separate relationship structure.
- SKU format for auto-generation: see Phase 3 (not implemented here, but the writer must accept whatever SKU is in the model).

**Feedback loop:**

- **Playground**: Parse the real export → write to a new file → parse that file again → compare. Round-trip equality is the test.
- **Experiment**: Parse → modify a product name → export → manually verify the modified name appears in the CSV.
- **Check command**: `go test ./internal/csv/... -v -run TestRoundTrip`

### CLI (`cmd/godaddy-manager/main.go`)

**Overview**: Simple CLI with two subcommands for Phase 1: `parse` (read a CSV and dump JSON to stdout for debugging) and `export` (read JSON from stdin or file, write CSV to a path).

```
godaddy-manager parse --input products-export.csv --output debug.json
godaddy-manager export --input products.json --output new-export.csv
```

**Implementation steps:**

1. Initialize Go module (`go mod init github.com/nicknisi/godaddy-ecommerce-manager`).
2. Create CLI with `flag` or `spf13/cobra` (start with `flag` for simplicity, upgrade to cobra later if needed).
3. Implement `parse` subcommand: call `ReadGodaddyCSV`, marshal to JSON, write to file/stdout.
4. Implement `export` subcommand: read JSON from file, call `WriteGodaddyCSV`.
5. Add `--help` flag output.

**Key decisions:**

- Start with stdlib `flag` to minimize dependencies. Cobra is nicer but adds a dependency that isn't needed for Phase 1.
- JSON format for intermediate storage is a debugging convenience — not a formal format. The web app (Phase 2) will have its own data format.

**Feedback loop:**

- **Playground**: `go run cmd/godaddy-manager/main.go parse --input testdata/godaddy-products-export.csv` — should produce a JSON dump.
- **Experiment**: Parse the real export, modify a product in the JSON, write it back, and verify the CSV looks right.
- **Check command**: `go build ./cmd/godaddy-manager/ && ./godaddy-manager parse --help`

## Data Model

See `internal/model/product.go` above. The model is the single source of truth:

```
Product
├── ID, Name, Type, Shortcode, Status, Description, Weight, WeightUnit
├── Available, Price, SalePrice
├── Family (enum)
├── []Variant
│   ├── SKU, Option1Name/Value, Option2Name/Value
│   ├── Price, SalePrice, Available, Weight, OnHand
└── []ImageRef
    ├── FileName, AltText, IsPrimary
```

## Testing Requirements

### Unit Tests

| Test File                  | Coverage              |
| -------------------------- | --------------------- |
| `internal/csv/reader_test.go` | Parse parent rows, parse variant rows, handle empty options, handle HTML entities |
| `internal/csv/writer_test.go` | Write parent+variants, round-trip equality, column order preservation |
| `model/product_test.go`    | Family enum, variant attachment |

**Key test cases:**

- Parse the real `godaddy-products-export.csv` — verify all 12+ products parsed, correct variant counts
- Parse a CSV with a product that has no variants (edge case)
- Parse a CSV where OPTION 2 is empty (only 1 variant dimension)
- Round-trip: parse → write → parse — inner equality (ignore line endings)
- Writer preserves HTML entities in descriptions (`&amp;` → `&amp;`)
- Writer column order matches the expected Godaddy format

### Manual Testing

- [ ] `go run cmd/godaddy-manager/main.go parse --input testdata/godaddy-products-export.csv --output debug.json` — check JSON structure
- [ ] Parse real export, write CSV, manually inspect both CSVs side by side
- [ ] Verify parent rows have empty SKU and variant rows have populated SKUs

## Error Handling

| Error Scenario              | Handling Strategy                                      |
| --------------------------- | ------------------------------------------------------ |
| CSV file not found          | Return error with file path, exit CLI with message     |
| Malformed CSV (wrong column count) | Return parse error with line number, abort  |
| Variant references unknown parent | Log warning, skip variant, continue parsing    |
| Duplicate PRODUCT_ID        | Log warning, overwrite with latest (Godaddy convention) |
| Empty product name          | Allow (some Godaddy exports have blank names)          |

## Failure Modes

| Component    | Failure Mode              | Trigger                             | Impact                          | Mitigation                      |
| ------------ | ------------------------- | ----------------------------------- | ------------------------------- | ------------------------------- |
| CSV Reader   | Parent row missing SKU    | Godaddy exported with no PRODUCT_ID | Cannot link variants to parent  | Log warning, skip variants     |
| CSV Reader   | VARIANT GROUP ID mismatch | Godaddy data corruption             | Orphaned variants               | Log warning, keep as standalone |
| CSV Writer   | Column order wrong        | Headers defined in wrong order      | Godaddy import fails silently   | Pin header order to export file |
| CSV Writer   | Description truncation    | Long description with newlines      | Truncated product description   | CSV escaping handles newlines   |
| CLI          | Invalid JSON input        | Malformed intermediate JSON         | Export fails                    | Clear error message with path   |

## Validation Commands

```bash
# Run all tests
go test ./...

# Run just CSV tests
go test ./internal/csv/...

# Build the CLI
go build -o godaddy-manager ./cmd/godaddy-manager/

# Test parse subcommand
./godaddy-manager parse --input testdata/godaddy-products-export.csv --output /dev/null
```

## Rollout Considerations

- No feature flags needed — this is a CLI tool, no deployment.
- The `godaddy-products-export.csv` in `testdata/` is test data only — not committed if it contains sensitive info (it shouldn't, but verify).

## Open Items

- [ ] Confirm exact column order from the real Godaddy export (we have the sample, but verify edge columns like REGION, HANDLE, etc.)
- [ ] Decide: should the CLI accept JSON from stdin or only from files? (Files are simpler for Phase 1)

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
