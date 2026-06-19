# Implementation Spec: Godaddy Ecommerce Manager - Phase 1

**Contract**: `./contract.md`
**Estimated Effort**: M

## Technical Approach

Phase 1 establishes the canonical catalog model and the file formats that every later phase depends on. The existing repository already has a workable TypeScript/Node shape for CSV parsing, HTTP serving, and validation, so this phase should extend those patterns rather than restart the architecture. The critical design move is to keep Godaddy's CSV as an interchange format, not the app's working model.

The implementation should introduce an explicit project-document format for save/load between sessions. That document will wrap the in-memory catalog in versioned JSON so the operator can safely pause work and resume it later without staying in one browser session. CSV import converts vendor rows into the internal model; project save/load preserves that model; CSV export converts it back only at the boundary.

Validation must also split into two classes: blocking structural errors and non-blocking warnings. Because the contract is correctness-first, export cannot remain a best-effort action that merely reports issues. The server must be able to determine whether the current catalog is safe to export, and the validation layer must make that decision deterministically.

## Feedback Strategy

**Inner-loop command**: `node --import tsx --test test/csv/reader.test.ts test/csv/writer.test.ts test/project-file/persistence.test.ts test/validator/export-safety.test.ts test/workflows/roundtrip.test.ts`

**Playground**: Test suite plus the existing CLI entry points in `src/index.ts`.

**Why this approach**: Most Phase 1 work is deterministic transformation logic, so scoped tests are the fastest and most reliable loop.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/project-file/types.ts` | Defines the versioned local project-document format used for save/load between sessions. |
| `src/project-file/serializer.ts` | Serializes and parses project documents without leaking transport or UI concerns into the model layer. |
| `test/project-file/persistence.test.ts` | Verifies project documents round-trip cleanly and reject malformed payloads. |
| `test/validator/export-safety.test.ts` | Verifies blocking-vs-warning validation behavior for export safety decisions. |
| `test/workflows/roundtrip.test.ts` | End-to-end fixture test for CSV import → model edit → CSV export → re-import invariants. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/model/types.ts` | Tighten the canonical catalog shape and ensure it is safe for both project-file persistence and later UI phases. |
| `src/csv/reader.ts` | Make import mapping explicit and loss-aware for fields that must survive round-trip export. |
| `src/csv/writer.ts` | Preserve contract-critical invariants when exporting back to Godaddy CSV. |
| `src/validator/validator.ts` | Split issues into blocking export errors vs non-blocking warnings/information. |
| `src/index.ts` | Add project-file oriented CLI helpers or smoke commands as needed for local verification. |
| `test/helpers/sample-product.ts` | Expand fixture coverage for project-file and validation tests. |

### Deleted Files

_None._

## Implementation Details

### Project Document Format

**Pattern to follow**: `src/model/types.ts`

**Overview**: Introduce a versioned JSON wrapper around the catalog so the app can persist a working project between sessions without pretending the Godaddy CSV is the native editing format.

```ts
export interface ProjectDocument {
  schemaVersion: 1;
  source: {
    kind: 'godaddy-csv' | 'project-file';
    importedAt: string;
    originalFileName?: string;
  };
  products: Product[];
}

export function serializeProjectDocument(document: ProjectDocument): string;
export function parseProjectDocument(content: string): ProjectDocument;
```

**Key decisions**:

- The project document is versioned from day one. This avoids silent compatibility breakage later.
- The document stores only catalog state and provenance metadata; it does not store UI-only state.
- Parsing is strict. Unknown top-level shapes or invalid schema versions should fail fast.

**Implementation steps**:

1. Add `ProjectDocument` types in `src/project-file/types.ts`.
2. Implement serializer/parser helpers in `src/project-file/serializer.ts`.
3. Validate parsed payloads narrowly enough to reject malformed product arrays or missing required fields.
4. Keep file I/O outside this module so the serializer remains reusable by CLI and HTTP layers.

**Feedback loop**:

- **Playground**: Create `test/project-file/persistence.test.ts` with a smoke round-trip and one malformed-input failure case before implementation.
- **Experiment**: Test a valid document, an unknown `schemaVersion`, and a document missing `products`.
- **Check command**: `node --import tsx --test test/project-file/persistence.test.ts`

### CSV Import/Export Invariants

**Pattern to follow**: `src/csv/reader.ts`, `src/csv/writer.ts`

**Overview**: Tighten the CSV boundary so the fields named in the contract survive re-export exactly where required: product/variant relationships, prices, option values, and pre-existing SKUs.

```ts
export interface RoundTripInvariantResult {
  missingParents: string[];
  orphanVariants: string[];
  duplicateSkus: string[];
}

export function parseGodaddyCsv(content: string): Product[];
export function serializeGodaddyCsv(products: Product[]): string;
```

**Key decisions**:

- Parent/child linkage remains keyed by Godaddy's identifiers, not UI-generated ordering.
- Existing variant SKUs are treated as opaque identity fields in Phase 1; no normalization or cleanup pass is allowed here.
- Import should preserve enough raw values that export does not unintentionally rewrite semantically important fields.

**Implementation steps**:

1. Review the current parser against the real fixture in `testdata/godaddy-products-export.csv`.
2. Add tests for invariants that matter more than byte-for-byte equality: parent linkage, option columns, prices, and SKU preservation.
3. Ensure export always writes stable row ordering so follow-on tests and diffs stay readable.
4. Keep any unavoidable lossy transformations explicit and documented in the test names.

**Feedback loop**:

- **Playground**: Create `test/workflows/roundtrip.test.ts` using the real fixture before changing reader/writer logic.
- **Experiment**: Import the fixture, modify one product name, re-export, then re-import and assert parent linkage, prices, and SKUs remain correct.
- **Check command**: `node --import tsx --test test/csv/reader.test.ts test/csv/writer.test.ts test/workflows/roundtrip.test.ts`

### Export Safety Validation

**Pattern to follow**: `src/validator/validator.ts`

**Overview**: Reframe validation as an export-safety gate, not just a lint pass. The validator must answer whether export is allowed and why.

```ts
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
  blocksExport: boolean;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  canExport: boolean;
}

export function validateProducts(products: Product[]): ValidationReport;
```

**Key decisions**:

- `blocksExport` must be explicit on each issue. Inferring it from severity later is brittle.
- Duplicate SKUs, broken parent/child references, and incomplete required option data are blocking.
- Empty descriptions or suspicious but still importable data remain warnings unless real imports prove otherwise.

**Implementation steps**:

1. Convert validator output from a flat list to a report with `canExport`.
2. Add blocking rules for structural failures named in the contract.
3. Keep warnings for softer data-quality issues instead of over-blocking the operator.
4. Update existing tests to assert both issue content and export eligibility.

**Feedback loop**:

- **Playground**: Create `test/validator/export-safety.test.ts` with one exportable catalog and one blocked catalog before modifying the validator.
- **Experiment**: Test duplicate SKU, missing option value, negative price, and empty description cases separately.
- **Check command**: `node --import tsx --test test/validator/validator.test.ts test/validator/export-safety.test.ts`

## Data Model

### State Shape

```ts
export interface Product {
  id: string;
  parentId: string;
  name: string;
  type: string;
  shortcode: string;
  status: string;
  description: string;
  weight: number | null;
  weightUnit: string;
  available: boolean;
  price: number | null;
  salePrice: number | null;
  family: ProductFamily;
  variants: Variant[];
  images: ImageRef[];
  aiDescription: string | null;
}

export interface ProjectDocument {
  schemaVersion: 1;
  source: {
    kind: 'godaddy-csv' | 'project-file';
    importedAt: string;
    originalFileName?: string;
  };
  products: Product[];
}
```

Phase 1 should not add speculative fields for later features unless they are required for persistence or export safety.

## API Design

_No new HTTP endpoints are required in this phase._ The project-file and export-safety behavior should be exposed first through modules and tests, then surfaced over HTTP in Phase 2.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/csv/reader.test.ts` | Real-fixture parsing, parent/variant linkage, field preservation. |
| `test/csv/writer.test.ts` | Export row shape, stable ordering, preservation of required fields. |
| `test/project-file/persistence.test.ts` | Project-document serialization, parsing, and schema validation. |
| `test/validator/validator.test.ts` | Existing warnings/errors plus export eligibility semantics. |
| `test/validator/export-safety.test.ts` | Structural blockers for unsafe export scenarios. |

**Key test cases**:

- Real fixture imports into the expected number of products and variants.
- Existing SKUs survive a parse/export/re-parse cycle unchanged.
- Duplicate SKUs block export.
- Missing required option data blocks export.
- Empty descriptions warn but do not automatically block export.
- Project documents reject malformed JSON or unsupported schema versions.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `test/workflows/roundtrip.test.ts` | Representative catalog import → edit → export → re-import workflow. |

**Key scenarios**:

- Happy path with an existing catalog edit.
- Export blocked when a structural validation error is introduced.
- Project document persists edits and reloads them without field drift.

### Manual Testing

- [ ] Run the round-trip workflow test against the real fixture.
- [ ] Use the CLI to parse the fixture and inspect the resulting JSON/project document.
- [ ] Intentionally create a duplicate SKU in a test payload and verify export is rejected.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Malformed CSV input | Return a parse error with enough context to identify the bad import; do not produce partial persisted state. |
| Unsupported project-file version | Reject the load with a clear schema-version error. |
| Duplicate or structurally invalid variant data | Report blocking validation issues and set `canExport` to `false`. |
| Missing non-critical content such as descriptions | Report warnings without blocking save/load or export. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| CSV bridge | Silent field drift | Import/export remaps an important field incorrectly | The operator trusts an export that changed live catalog meaning | Pin invariants in round-trip tests rather than relying on ad hoc inspection |
| Project document | Schema drift | Future fields are added without versioning | Older saved files become unreadable or misread | Version the document immediately and fail fast on unknown versions |
| Validator | Over-blocking | Warning-like conditions are treated as hard failures | The operator cannot export valid work | Separate `blocksExport` from message severity |
| Validator | Under-blocking | Structural errors are treated as warnings | Bad data reaches Godaddy | Add blocking tests for every contract-critical invariant |

## Validation Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Scoped Phase 1 tests
node --import tsx --test test/csv/reader.test.ts test/csv/writer.test.ts test/project-file/persistence.test.ts test/validator/export-safety.test.ts test/workflows/roundtrip.test.ts

# Full test suite
npm test

# Build
npm run build
```

## Rollout Considerations

- No feature flag is needed; this is foundational behavior behind existing local workflows.
- Preserve backward compatibility with the current CSV commands in `src/index.ts`.
- If project-file format changes later, introduce a new `schemaVersion` instead of mutating the meaning of version 1.

## Open Items

- [ ] Decide whether project documents should record the original CSV path or only the original filename for provenance.
- [ ] Confirm whether any Godaddy columns outside the current fixture must be preserved verbatim in future imports.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
