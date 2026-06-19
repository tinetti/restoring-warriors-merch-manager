# Implementation Spec: Godaddy Ecommerce Manager - Phase 5

**Contract**: `./contract.md`
**Estimated Effort**: L

## Technical Approach

Phase 5 expands the tool from safe maintenance into faster and broader catalog work. It has two related capabilities: bulk editing across many products/variants, and constrained authoring of net-new products. These belong together because both features require the app to operate on higher-level catalog intent rather than one row at a time.

The right implementation is not an open-ended rules engine. Keep it explicit and narrow. Bulk editing should cover the repetitive operations the operator is most likely to perform: set price, set status, set family, apply an option-schema template, and patch shared text fields across a filtered selection. Net-new authoring should begin from templates or a guided form, not an empty unconstrained object editor.

This phase should continue to use the same localhost app, project-file persistence, and export-safety validation. New products must enter the same canonical model as imported ones, and bulk operations must remain previewable before application. Otherwise Phase 5 would reintroduce the same hidden mutation risks earlier phases removed.

## Feedback Strategy

**Inner-loop command**: `node --import tsx --test test/model/bulk-edit.test.ts test/model/product-authoring.test.ts`

**Playground**: Scoped model/server tests first, then the local app for preview/apply flows.

**Why this approach**: Bulk mutation and authoring both benefit from deterministic previewable transformations that are easiest to validate in tests before polishing the UI.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/model/bulk-edit.ts` | Applies previewable batch operations to filtered product/variant selections. |
| `src/model/product-authoring.ts` | Creates new products from guided inputs or templates using the canonical model. |
| `test/model/bulk-edit.test.ts` | Covers bulk mutation preview/apply semantics and edge cases. |
| `test/model/product-authoring.test.ts` | Covers new-product creation and validation integration. |
| `test/server/catalog-authoring.test.ts` | Covers bulk-edit and authoring endpoints over HTTP. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/model/types.ts` | Add any minimal template or authoring helper types required by the new flows. |
| `src/server/app.ts` | Add bulk-edit preview/apply endpoints and net-new product creation endpoints. |
| `src/store.ts` | Support batch replacement and insertion of products safely. |
| `web/app.js` | Add selection, bulk-edit, and product-authoring UI flows. |
| `src/validator/validator.ts` | Reuse export safety rules for newly authored products and bulk-mutated results. |

### Deleted Files

_None._

## Implementation Details

### Bulk Edit Engine

**Pattern to follow**: `src/validator/validator.ts`, `src/store.ts`

**Overview**: Implement a small, explicit batch-operation engine that previews changes before applying them.

```ts
export interface BulkSelection {
  productIds: string[];
  variantIds?: string[];
}

export type BulkOperation =
  | { kind: 'set-product-price'; value: number }
  | { kind: 'set-variant-price'; value: number }
  | { kind: 'set-status'; value: string }
  | { kind: 'set-family'; value: ProductFamily }
  | { kind: 'replace-description-fragment'; find: string; replace: string };

export interface BulkEditPreview {
  changedProducts: number;
  changedVariants: number;
  validationReport: ValidationReport;
}

export function previewBulkEdit(products: Product[], selection: BulkSelection, operation: BulkOperation): BulkEditPreview;
export function applyBulkEdit(products: Product[], selection: BulkSelection, operation: BulkOperation): Product[];
```

**Key decisions**:

- Operations are enumerated, not user-scripted. This keeps the feature powerful enough without becoming a mini programming language.
- Preview and apply are separate functions/endpoints.
- Validation runs on the preview result so the operator sees whether the batch change would make export unsafe.

**Implementation steps**:

1. Implement a selection model for products and optional variants.
2. Add a narrow set of bulk operations that map to real catalog-maintenance pain.
3. Return preview counts plus validation results before apply.
4. Apply the mutation only after explicit confirmation.

**Feedback loop**:

- **Playground**: Create `test/model/bulk-edit.test.ts` with one product-selection preview and one variant-selection preview before implementation.
- **Experiment**: Preview and apply a status change across multiple products, then a price change across variants.
- **Check command**: `node --import tsx --test test/model/bulk-edit.test.ts`

### Guided Product Authoring

**Pattern to follow**: `src/model/variant-matrix.ts`, `src/model/types.ts`

**Overview**: Create new products from a guided form or template so authored catalog items enter the same canonical shape as imported ones.

```ts
export interface NewProductInput {
  name: string;
  family: ProductFamily;
  shortcode: string;
  status: string;
  description: string;
  basePrice: number | null;
  optionSchema?: ProductOptionSchema;
}

export function createProduct(input: NewProductInput): Product;
```

**Key decisions**:

- Start from a guided form/template rather than a free-form raw JSON editor.
- New product IDs can be generated locally, but must remain stable once created.
- If an option schema is provided during authoring, the same Phase 3 missing-combination generator should be able to populate variants.

**Implementation steps**:

1. Create a `createProduct` helper that returns a valid canonical `Product`.
2. Add validation for missing required authoring inputs before insertion into the store.
3. Reuse Phase 3 schema/matrix logic when the operator wants to seed variants immediately.
4. Insert the new product into the store and return it through the API.

**Feedback loop**:

- **Playground**: Create `test/model/product-authoring.test.ts` before implementation.
- **Experiment**: Author a product with no variants, then author one with an option schema and generate its initial matrix.
- **Check command**: `node --import tsx --test test/model/product-authoring.test.ts`

### Bulk-Edit and Authoring UX

**Pattern to follow**: `web/app.js`, `src/server/app.ts`

**Overview**: Add selection and preview-driven workflows without blowing up the simplicity of the current app.

```ts
// POST /api/catalog/bulk-edit/preview
// POST /api/catalog/bulk-edit/apply
// POST /api/products
```

**Key decisions**:

- Reuse the existing product list as the selection surface rather than inventing a new screen.
- Show bulk-edit preview summaries before any destructive apply action.
- Keep new-product authoring as a modal/panel launched from the existing app shell.

**Implementation steps**:

1. Add selectable rows or checkboxes to the product list.
2. Add a bulk action panel with a limited set of operations.
3. Preview the operation and its validation outcome before apply.
4. Add a guided “New Product” flow that inserts into the catalog and opens the new editor view.

**Feedback loop**:

- **Playground**: Start the dev server and work with a fixture catalog containing multiple products.
- **Experiment**: Select three products, preview a price/status change, apply it, then create a new product and export-validate the result.
- **Check command**: `node --import tsx --test test/server/catalog-authoring.test.ts && npm run dev`

## Data Model

### State Shape

```ts
export interface NewProductInput {
  name: string;
  family: ProductFamily;
  shortcode: string;
  status: string;
  description: string;
  basePrice: number | null;
  optionSchema?: ProductOptionSchema;
}
```

Keep these as authoring-input shapes, not persistent UI-state blobs.

## API Design

### New Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/catalog/bulk-edit/preview` | Preview a bulk operation against a selection. |
| `POST` | `/api/catalog/bulk-edit/apply` | Apply a confirmed bulk operation. |
| `POST` | `/api/products` | Create a new product from guided input. |

### Request/Response Examples

```ts
// POST /api/catalog/bulk-edit/preview
{
  "selection": { "productIds": ["prod-1", "prod-2"] },
  "operation": { "kind": "set-status", "value": "ACTIVE" }
}

// Response
{
  "changedProducts": 2,
  "changedVariants": 0,
  "validationReport": {
    "canExport": true,
    "issues": []
  }
}

// POST /api/products
{
  "name": "Restoring Warriors Hoodie",
  "family": "RESTO",
  "shortcode": "RESTO",
  "status": "ACTIVE",
  "description": "",
  "basePrice": 42,
  "optionSchema": {
    "option1Name": "Color",
    "option1Values": ["Black", "Navy"],
    "option2Name": "Size",
    "option2Values": ["S", "M", "L"]
  }
}
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/model/bulk-edit.test.ts` | Selection matching, preview counts, validation-after-preview, apply semantics. |
| `test/model/product-authoring.test.ts` | New-product creation, required fields, schema seeding. |

**Key test cases**:

- Preview a bulk operation and verify affected counts before apply.
- Apply operation mutates only selected records.
- Validation preview shows when a bulk edit would make export unsafe.
- New product is created with stable generated identity and canonical defaults.
- New product with an option schema is compatible with Phase 3 variant generation.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `test/server/catalog-authoring.test.ts` | Bulk-edit preview/apply and product creation endpoints. |

**Key scenarios**:

- Preview and apply a bulk status or price change over HTTP.
- Create a new product and verify it appears in the catalog listing.
- Newly created products participate in validation/export like imported ones.

### Manual Testing

- [ ] Select multiple products in the UI and preview a bulk change.
- [ ] Apply the change and verify only selected products changed.
- [ ] Create a new product from the guided form.
- [ ] Optionally seed variants for the new product and validate the export.
- [ ] Save and reload a project file containing the new product and bulk edits.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Empty bulk selection | Return 400 with a specific “nothing selected” error. |
| Unsupported bulk operation | Reject at the API boundary; do not silently ignore. |
| New product missing required fields | Return validation errors and refuse insertion. |
| Bulk operation would create blocked export state | Allow preview, but require explicit operator confirmation before apply or optionally refuse apply depending on severity policy. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Bulk edit engine | Over-broad mutation | Selection logic is wrong or too coarse | Many products are changed unintentionally | Always preview counts and selected targets before apply |
| Bulk edit engine | Hidden export breakage | Batch change introduces duplicate SKUs or bad prices | Large invalid catalog state | Run validation on preview and surface it prominently |
| Product authoring | Invalid defaults | New products enter the model incomplete or inconsistent | Immediate export failures or broken editor state | Centralize creation in `createProduct` with validation |
| UI selection | Sticky stale selection | User changes filters and selection remains misleading | Wrong targets receive batch edits | Show explicit selected counts and clear selection on major context switches |

## Validation Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Scoped Phase 5 tests
node --import tsx --test test/model/bulk-edit.test.ts test/model/product-authoring.test.ts test/server/catalog-authoring.test.ts

# Full test suite
npm test

# Run the local app
npm run dev
```

## Rollout Considerations

- Keep operations narrow and explicit at first; resist turning bulk edit into a generic automation surface.
- Require previews before apply for any multi-record mutation.
- New product authoring should land only after earlier phases have stabilized the catalog model and validation flow.

## Open Items

- [ ] Decide whether blocked validation in bulk-edit preview should merely warn or hard-refuse apply for phase 1 of this feature.
- [ ] Decide whether new-product authoring should start from family-specific templates once enough real examples exist.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
