# Implementation Spec: Godaddy Ecommerce Manager - Phase 3

**Contract**: `./contract.md`
**Estimated Effort**: L

## Technical Approach

Phase 3 solves the catalog-gap workflow that the interview surfaced: existing products often have incomplete option matrices, and filling those gaps manually is exactly the kind of tedious, error-prone work this tool should remove. The implementation should stay constrained to existing products. It is not full authoring yet; it is completion of an already imported product.

The clean model for this is a product-level option schema plus a deterministic matrix generator. The option schema names each editable dimension and its allowed values; the generator computes the cartesian product, compares it with the existing variant set, and returns the missing combinations. Existing variants remain untouched unless the operator explicitly chooses to generate the missing rows.

SKU handling must follow the consistency rule established in the contract. Existing SKUs are preserved exactly. Only newly generated variants receive generated SKUs. The generator should first try to infer the sibling SKU pattern from existing variants; if that inference is unreliable, it should fall back to a simple generated SKU format that is stable and readable. This phase should not introduce hidden SKU rewrites of old rows.

## Feedback Strategy

**Inner-loop command**: `node --import tsx --test test/model/variant-completion.test.ts test/model/sku-inference.test.ts`

**Playground**: Scoped model tests first, then the localhost app for preview/apply flows.

**Why this approach**: The core logic is pure combination and inference code, so tight model tests should drive most of the work before the UI wiring begins.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/model/variant-matrix.ts` | Computes desired option combinations and identifies missing variants for a product. |
| `src/model/sku-inference.ts` | Infers new-variant SKU patterns from sibling variants and falls back when inference is weak. |
| `test/model/variant-completion.test.ts` | Covers option schema handling and missing-combination generation. |
| `test/model/sku-inference.test.ts` | Covers pattern inference, ambiguity, and fallback SKU generation. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/model/types.ts` | Add product-level option schema fields needed to define allowed values explicitly. |
| `src/store.ts` | Support replacing one product after generated variants are applied. |
| `src/server/app.ts` | Add endpoints to preview and apply missing-variant generation. |
| `web/app.js` | Add option-schema editing, missing-combination preview, and apply action. |
| `src/model/sku.ts` | Reuse existing sanitization/default-format helpers for fallback generation. |

### Deleted Files

_None._

## Implementation Details

### Product Option Schema and Matrix Generation

**Pattern to follow**: `src/model/types.ts`, `src/model/sku.ts`

**Overview**: Add explicit product-level option metadata so the app can tell the difference between “existing variants” and “desired variant space.”

```ts
export interface ProductOptionSchema {
  option1Name: string;
  option1Values: string[];
  option2Name?: string;
  option2Values?: string[];
}

export interface MissingVariantPlan {
  existingKeys: string[];
  missing: Array<{
    option1Value: string;
    option2Value: string;
  }>;
}

export function planMissingVariants(product: Product): MissingVariantPlan;
export function generateMissingVariants(product: Product): Product;
```

**Key decisions**:

- The product owns the allowed option sets; they are not guessed fresh on every render.
- Existing variants seed the initial schema on import, but the operator can edit the allowed values explicitly.
- Matrix generation is deterministic and side-effect free until the operator chooses to apply it.

**Implementation steps**:

1. Extend `Product` with an optional `optionSchema` field.
2. On CSV import, derive an initial schema from existing variant rows.
3. Implement `planMissingVariants(product)` to compute the missing cartesian-product combinations.
4. Implement `generateMissingVariants(product)` to create new variant records only for the missing combinations.

**Feedback loop**:

- **Playground**: Create `test/model/variant-completion.test.ts` with one product that is missing a known combination before implementation.
- **Experiment**: Test one-dimension and two-dimension products, plus an empty option value edge case.
- **Check command**: `node --import tsx --test test/model/variant-completion.test.ts`

### SKU Inference for New Variants

**Pattern to follow**: `src/model/sku.ts`

**Overview**: Infer the SKU style of sibling variants so newly generated combinations fit existing catalog conventions whenever possible.

```ts
export interface InferredSkuStrategy {
  kind: 'inferred' | 'fallback';
  generate(option1Value: string, option2Value: string): string;
}

export function inferSkuStrategy(product: Product): InferredSkuStrategy;
export function assignGeneratedVariantSkus(product: Product): Product;
```

**Key decisions**:

- Existing SKUs are never rewritten in this phase.
- Inference should be pragmatic, not magical: if the pattern cannot be recognized confidently, fall back to a stable generated format.
- Fallback should reuse the existing sanitized family/name/option token logic from `src/model/sku.ts` to avoid two incompatible generation systems.

**Implementation steps**:

1. Inspect sibling variants and detect whether option values map consistently into SKU tokens.
2. If a pattern exists, construct an inference strategy that fills only the missing combinations.
3. If not, use the default generated SKU format for new variants only.
4. Ensure collision handling appends a numeric suffix rather than overwriting existing identity.

**Feedback loop**:

- **Playground**: Create `test/model/sku-inference.test.ts` with one clean-pattern product and one messy-pattern product first.
- **Experiment**: Verify a product with consistent size/color tokens uses inferred SKUs; verify inconsistent legacy SKUs fall back gracefully.
- **Check command**: `node --import tsx --test test/model/sku-inference.test.ts`

### Preview/Apply Workflow in the Local App

**Pattern to follow**: `src/server/app.ts`, `web/app.js`

**Overview**: The operator needs to see the missing combinations before they are added. Preview first, apply second.

```ts
// POST /api/products/:id/variant-plan
// Response: MissingVariantPlan

// POST /api/products/:id/generate-missing-variants
// Response: { created: number, product: Product }
```

**Key decisions**:

- Preview and apply are separate endpoints. Generation should not happen implicitly while editing schema values.
- The UI should show the list of missing combinations before create, not just a count.
- If fallback SKUs will be used, say so in the preview result so the operator is not surprised.

**Implementation steps**:

1. Add server endpoints for previewing and applying missing variants.
2. Add an option-schema editor to the product panel in `web/app.js`.
3. Render missing combinations in a preview list or dialog.
4. Apply generated variants, then refresh the editor from the updated product payload.

**Feedback loop**:

- **Playground**: Start the dev server and load a product with an incomplete option matrix.
- **Experiment**: Define `Color=[Red,Green,Blue]`, `Size=[S,M,L]` on a product missing two combinations; verify preview count and created variants match.
- **Check command**: `node --import tsx --test test/model/variant-completion.test.ts test/model/sku-inference.test.ts && npm run dev`

## Data Model

### State Shape

```ts
export interface ProductOptionSchema {
  option1Name: string;
  option1Values: string[];
  option2Name?: string;
  option2Values?: string[];
}

export interface Product {
  // existing fields...
  optionSchema?: ProductOptionSchema;
}
```

This schema belongs on the product because missing-combination generation is defined at the product level, not the variant level.

## API Design

### New Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/products/:id/variant-plan` | Return the product's current missing-combination plan. |
| `POST` | `/api/products/:id/generate-missing-variants` | Create and persist missing variants for that product. |

### Request/Response Examples

```ts
// POST /api/products/prod-1/variant-plan
{
  "optionSchema": {
    "option1Name": "Color",
    "option1Values": ["Red", "Green", "Blue"],
    "option2Name": "Size",
    "option2Values": ["S", "M", "L"]
  }
}

// Response
{
  "existingKeys": ["Red|S", "Red|M", "Blue|S"],
  "missing": [
    { "option1Value": "Green", "option2Value": "S" },
    { "option1Value": "Green", "option2Value": "M" }
  ],
  "skuMode": "inferred"
}
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/model/variant-completion.test.ts` | Missing-combination detection and generation for one- and two-dimension products. |
| `test/model/sku-inference.test.ts` | SKU strategy inference, collision handling, fallback formatting. |

**Key test cases**:

- Existing product missing one combination gets exactly one new variant.
- One-dimension products do not invent a second dimension.
- Existing SKUs remain unchanged after generation.
- Inferred SKU strategy works when sibling SKUs clearly encode option values.
- Fallback strategy activates when legacy SKUs are inconsistent.
- Generated SKUs avoid collisions with existing ones.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `test/server/app.test.ts` | Preview/apply endpoints integrated with the existing app server. |

**Key scenarios**:

- Preview missing combinations for an imported product.
- Apply missing combinations and verify new variants appear in the returned product.
- Export after generation still passes validation.

### Manual Testing

- [ ] Open a product with missing combinations in the local app.
- [ ] Edit the allowed option values and preview the missing matrix.
- [ ] Apply generation and verify only the missing variants are created.
- [ ] Confirm existing SKUs are unchanged.
- [ ] Confirm newly created variants receive inferred or fallback SKUs as expected.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Option schema has duplicate values | Normalize/dedupe values before planning and show a warning if needed. |
| Existing variants conflict with schema labels | Show preview with unresolved combinations; do not silently delete or rewrite existing rows. |
| SKU inference is ambiguous | Use fallback generation and report that mode in the preview/apply response. |
| Matrix explosion | Guard against unreasonable combination counts and require explicit confirmation or reject over a threshold. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Matrix planner | Combination explosion | Operator enters very large option value sets | The UI becomes slow and accidental bulk creation occurs | Cap preview size and require explicit confirmation beyond a threshold |
| SKU inference | False pattern detection | Legacy SKUs look similar but do not truly encode options | New SKUs mimic the wrong pattern | Keep inference conservative and fall back early |
| Generator | Duplicate logical variants | Existing variants differ only by casing/spacing in option values | New rows duplicate real catalog states | Normalize comparison keys before planning |
| UI preview | Hidden fallback mode | Operator assumes inferred SKUs but fallback was used | Surprise SKU results | Surface `skuMode` clearly in preview and result messages |

## Validation Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Scoped Phase 3 tests
node --import tsx --test test/model/variant-completion.test.ts test/model/sku-inference.test.ts

# Full test suite
npm test

# Run the local app
npm run dev
```

## Rollout Considerations

- This phase changes editing power materially, so keep preview/apply separate to avoid accidental bulk mutation.
- Do not add automatic background generation. The operator should remain in control of when missing variants are created.
- If matrix generation thresholds are added, make them configurable in code only if a real need appears.

## Open Items

- [ ] Decide the exact threshold at which the app should warn or refuse a large generated matrix.
- [ ] Decide whether the preview should show full proposed SKUs inline or only after apply.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
