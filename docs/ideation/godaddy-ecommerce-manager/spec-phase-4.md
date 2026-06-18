# Implementation Spec: Godaddy Ecommerce Manager - Phase 4

**Contract**: ./docs/ideation/godaddy-ecommerce-manager/contract.html
**Date**: 2026-06-17
**Estimated Effort**: M

**Prerequisites**: Phase 1 (Data Layer), Phase 2 (Web App UI), Phase 3 (Variant/SKU & Images)

## Technical Approach

Phase 4 adds AI-assisted product descriptions (per-product "AI rewrite" button), price management utilities, pre-export validation, and product family grouping polish. The AI feature is the only non-trivial new backend logic — it calls an external LLM API to rewrite product descriptions. Everything else is UI polish and validation.

**Key technical decisions:**

- **AI integration is optional/configurable**: The app works fine without an AI API key. The "AI Rewrite" button is disabled and shows "Configure AI API key in settings" if no key is set. This means the AI feature doesn't block shipping the rest of the phase.
- **Provider-agnostic API wrapper**: Start with OpenAI-compatible API (OpenAI, Anthropic, etc.) via a single `ChatCompletion`-style interface. Easy to add more providers later.
- **Pre-export validation**: A simple validation step before CSV export that checks for common issues (missing SKUs, negative prices, empty descriptions, unclosed HTML tags).
- **Price presets**: Quick-select buttons for common price points based on product type ($25 t-shirt, $42 hoodie, $22 snapback) as shown in the interview.

## Feedback Strategy

**Inner-loop command**: `go test ./internal/ai/... -v`

**Playground**: Test-driven AI logic with mock responses. For the UI, interact in the browser at `localhost:8080`.

**Why this approach**: AI prompt engineering benefits from quick test iterations. The UI feedback is the standard browser refresh loop.

## File Changes

### New Files

| File Path                                                | Purpose                                    |
| -------------------------------------------------------- | ------------------------------------------ |
| `internal/ai/provider.go`                                | LLM API interface and OpenAI-compatible provider |
| `internal/ai/provider_test.go`                           | Tests with mocked API responses            |
| `internal/ai/rewrite.go`                                 | Description rewrite logic and prompt building |
| `internal/ai/rewrite_test.go`                            | Tests for prompt construction              |
| `internal/validator/validator.go`                        | Pre-export validation rules                |
| `internal/validator/validator_test.go`                   | Tests for validation rules                 |
| `web/components/ai-rewrite.js`                           | AI rewrite button and UI in product edit   |
| `web/components/price-presets.js`                        | Quick price selection UI                   |
| `web/components/validation-bar.js`                       | Pre-export validation status bar           |
| `web/styles.css`                                         | New styles for AI button, price presets    |

### Modified Files

| File Path                          | Changes                                    |
| ---------------------------------- | ------------------------------------------ |
| `internal/model/product.go`        | Add `AIDescription` field to Product (stores AI-generated draft) |
| `internal/server/handlers.go`      | Add AI rewrite endpoint, validation endpoint |
| `cmd/godaddy-manager/main.go`      | Add `--ai-api-key` flag                    |
| `internal/csv/writer.go`           | Write `AIDescription` if populated (optional) |

### Deleted Files

_None._

## Implementation Details

### AI Provider Interface (`internal/ai/provider.go`)

**Overview**: Abstraction over LLM API calls. Start with OpenAI-compatible API.

```go
package ai

// Provider is the interface for LLM API providers.
type Provider interface {
    // Chat sends a prompt and returns the model's response.
    Chat(ctx context.Context, messages []Message) (string, error)
}

// Message represents a chat message.
type Message struct {
    Role    string // "system", "user", "assistant"
    Content string
}

// OpenAIProvider implements Provider for OpenAI-compatible APIs.
type OpenAIProvider struct {
    APIKey string
    BaseURL string  // Default: "https://api.openai.com/v1"
    Model  string  // Default: "gpt-4o-mini" (cheap, fast, good enough for descriptions)
}

func (p *OpenAIProvider) Chat(ctx context.Context, messages []Message) (string, error)
```

**Key decisions:**

- `gpt-4o-mini` as default model — cheap ($0.15/1M tokens), fast, produces clean text. Upgradable to `gpt-4o` later if quality is a concern.
- `BaseURL` is configurable — allows using any OpenAI-compatible endpoint (OpenRouter, local Ollama, etc.).
- API key loaded from `--ai-api-key` CLI flag or `GODADDY_AI_API_KEY` environment variable. No key = AI feature disabled.
- Timeout: 30 seconds per request. Show a loading state in the UI during the request.

**Implementation steps:**

1. Define `Provider` interface and `Message` struct.
2. Implement `OpenAIProvider` with HTTP POST to `/chat/completions`.
3. Read API key from flag or env var. Return error if neither is set.
4. Handle API errors (rate limit, invalid key, model not found) — map to user-friendly messages.
5. Write tests with `httptest.NewServer` returning mock JSON.

### Description Rewrite Logic (`internal/ai/rewrite.go`)

**Overview**: Builds the prompt and orchestrates the rewrite flow.

```go
package ai

// RewriteDescription sends the product description to the AI model
// and returns an improved version.
func RewriteDescription(ctx context.Context, provider Provider, product *model.Product) (string, error)
```

**System prompt** (hardcoded):

```
You are a professional ecommerce copywriter. You write product descriptions
that are compelling, accurate, and optimized for conversion.

Rules:
- Keep it between 2-4 short paragraphs
- Write in an engaging, warm tone appropriate for faith-based merchandise
- Include the key product details (material, fit, design) naturally in the text
- Avoid markdown formatting — plain text only
- Do NOT use phrases like "This product features" or "Introducing"
- Write as if you're explaining the product to a friend
```

**User prompt** (built dynamically):

```
Rewrite this product description for a Godaddy ecommerce store:

Product Name: {product.Name}
Product Type: {product.Type}
Variant Attributes: {color}, {size} (if applicable)
Original Description: {product.Description}

Important context:
- This is faith-based merchandise with a religious/spiritual theme
- Target audience: Christians who want to wear their faith
- Keep the religious message intact but make the description more engaging
```

**Key decisions:**

- System prompt is hardcoded — not a config. The tone and rules are specific to this use case.
- User prompt includes variant attributes if the rewrite is called from a variant context.
- The AI response replaces `product.Description` in the editor — it's not auto-saved. User reviews and accepts/rejects.
- Cost estimate: ~100 tokens per request at $0.15/1M input tokens ≈ $0.000015 per rewrite. Negligible cost even with many attempts.

**Implementation steps:**

1. Implement `RewriteDescription()` — build messages, call `provider.Chat()`, return response.
2. HTML entity decode the original description before sending to AI (the original has `&amp;`, `&lt;`, etc. from the CSV).
3. HTML entity encode the response before storing (to match CSV format).
4. Handle errors: API key missing → return specific error "AI not configured", timeout → "Request timed out", API error → return raw error.
5. Write tests with mocked provider.

**Feedback loop:**

- **Playground**: `go test ./internal/ai/... -v -run TestRewrite`
- **Experiment**: Test the prompt with real product descriptions from the Godaddy export. Verify the AI output is on-brand (faith-based, warm tone).
- **Check command**: `go test ./internal/ai/... -v -count=1`

### AI Rewrite Endpoint (`internal/server/handlers.go`)

```
POST /api/products/:id/rewrite-description
Body: {} (empty — uses product data)
Response: { "rewritten": "New description text" }
```

**Implementation steps:**

1. Parse `:id` from URL.
2. Load product from store.
3. Call `ai.RewriteDescription(ctx, provider, product)`.
4. Return the rewritten description.

**Error handling:**

| Error               | HTTP Status | Response                      |
| ------------------- | ----------- | ----------------------------- |
| AI not configured   | 400         | `{ "error": "AI not configured. Set GODADDY_AI_API_KEY env var or --ai-api-key flag." }` |
| API error           | 502         | `{ "error": "AI service error: <details>" }` |
| Product not found   | 404         | `{ "error": "Product not found" }` |

### Frontend: AI Rewrite Button (`web/components/ai-rewrite.js`)

**Overview**: Button in the product edit view that triggers the AI rewrite.

```
┌─────────────────────────────────────┐
│ Description:                        │
│ ┌─────────────────────────────────┐│
│ │ Your faith isn't just a part    ││
│ │ of your day...                  ││
│ │ [3 paragraphs of text...]       ││
│ └─────────────────────────────────┘│
│                                     │
│ ✨ AI Rewrite  (requires API key)  │
└─────────────────────────────────────┘
```

**Behavior:**

1. User clicks "AI Rewrite".
2. Button shows spinner, text changes to "Rewriting...".
3. API call is made to `POST /api/products/:id/rewrite-description`.
4. On success, the description textarea is replaced with the rewritten text.
5. User can click "Accept" (save) or "Discard" (revert to original).
6. On error, show error message and reset button.

**Implementation steps:**

1. Add a button below the description textarea.
2. On click, fetch `/api/products/:id/rewrite-description`.
3. Show loading state (spinner + "Rewriting..." text).
4. On success, replace textarea content, show Accept/Discard buttons.
5. Accept → save the product (calls existing save flow).
6. Discard → revert textarea to original content.
7. Handle AI-not-configured state: button disabled, tooltip shows "Set GODADDY_AI_API_KEY to enable".

### Price Presets (`web/components/price-presets.js`)

**Overview**: Quick-select buttons for common price points based on product type.

```
Price: $25.00  [T-Shirt $25] [Hoodie $42] [Snapback $22] [Custom ▸]
```

**Key decisions:**

- Price presets are contextual — they show the right preset buttons based on the product's type (detected from the product name or a new field).
- "Custom" button opens a small input for non-standard pricing.
- Not a validation rule — just a convenience UI. User can still type any price.

**Implementation steps:**

1. Detect product type from name keywords: "t-shirt" → $25, "hoodie" → $42, "snapback" → $22.
2. Render preset buttons in the price edit area.
3. Click a preset → updates the price input.
4. "Custom" shows an inline input for typing a custom price.

### Pre-Export Validation (`internal/validator/validator.go`)

**Overview**: Runs a set of checks on the product data before export. Returns a list of issues.

```go
package validator

// Issue represents a validation problem found in the product data.
type Issue struct {
    Severity string // "error", "warning", "info"
    Field    string // e.g., "Product.Description", "Variant[2].SKU"
    Message  string
}

// ValidateProducts runs all validation rules and returns issues.
func ValidateProducts(products []model.Product) []Issue
```

**Validation rules:**

| Rule                          | Severity  | Description                                    |
| ----------------------------- | --------- | ---------------------------------------------- |
| Empty product name            | warning   | Products should have a name for the store      |
| Empty description             | warning   | Products need a description for customers      |
| SKU collision (same SKU twice) | error     | Godaddy will reject or confuse duplicate SKUs  |
| Negative price                | error     | Price must be ≥ 0                              |
| Zero price                    | warning   | Free products may be unintentional              |
| Price > $500                  | info      | Unusually high price — verify                  |
| Missing SKU on variant        | warning   | Auto-gen recommended but not required           |
| HTML tags in description      | info      | Raw HTML tags may not render correctly         |
| Description > 5000 chars      | warning   | Very long descriptions may be truncated by Godaddy |

**Implementation steps:**

1. Implement each rule as a function `validateX(product *model.Product) []Issue`.
2. `ValidateProducts()` runs all rules and returns the combined list.
3. Add `POST /api/products/validate` endpoint that returns issues as JSON.

### Frontend: Validation Bar (`web/components/validation-bar.js`)

**Overview**: A bar that appears when the user navigates to the export view, showing validation results.

```
┌─────────────────────────────────────────────────┐
│ ⚠ 3 issues found before export                  │
│ ● 2 warnings (missing descriptions)             │
│ ● 1 error (SKU collision on "In Jesus Name Tee")│
│ [View Details] [Proceed Anyway] [Fix Issues]    │
└─────────────────────────────────────────────────┘
```

**Key decisions:**

- Validation runs automatically when the export view is opened.
- Errors block export (the "Export" button is disabled until errors are resolved).
- Warnings allow export with a confirmation.
- "View Details" shows a collapsible list of issues with suggestions.

**Implementation steps:**

1. Fetch `/api/products/validate` when the export view loads.
2. Display summary bar based on issue counts.
3. Disable export button if any errors exist.
4. "View Details" expands to show individual issues.
5. "Proceed Anyway" requires a confirmation modal for errors.

## Data Model Changes

```go
// In internal/model/product.go, add:

type Product struct {
    // ... existing fields ...
    AIDescription string // Optional: AI-generated description draft (not persisted to CSV)
}
```

Note: `AIDescription` is not written to CSV — it's a transient editing aid. If the user accepts the AI rewrite, the description is written to `Description` (which IS exported).

## API Design Additions

| Method | Path                              | Request Body | Response                        |
| ------ | --------------------------------- | ------------ | ------------------------------- |
| `POST` | `/api/products/:id/rewrite-desc`  | `{}`         | `{ "rewritten": "..." }`        |
| `POST` | `/api/products/validate`          | `{}`         | `{ "issues": [{severity, field, message}] }` |

## Testing Requirements

### Unit Tests

| Test File                       | Coverage                            |
| ------------------------------- | ----------------------------------- |
| `internal/ai/provider_test.go`  | HTTP request, mock response, error handling |
| `internal/ai/rewrite_test.go`   | Prompt construction, HTML entity handling |
| `internal/validator/validator_test.go` | All validation rules, no issues, mixed issues |

**Key test cases:**

- AI provider: successful response returns description
- AI provider: API key missing returns specific error
- AI provider: timeout returns context deadline exceeded
- Rewrite: prompt includes product name and description
- Rewrite: HTML entities are decoded before sending, encoded after receiving
- Validator: empty product name → warning
- Validator: duplicate SKU → error
- Validator: negative price → error
- Validator: 0 issues → empty result
- Validator: 50+ products → performance acceptable (<1s)

### Manual Testing

- [ ] Set `GODADDY_AI_API_KEY` env var, open product edit, click "AI Rewrite" — verify description is rewritten
- [ ] Without API key, click "AI Rewrite" — verify button is disabled with helpful message
- [ ] Accept an AI rewrite — verify the new description is saved and appears in export
- [ ] Discard an AI rewrite — verify original description is restored
- [ ] Export products with validation warnings — verify "Proceed Anyway" works
- [ ] Export products with validation errors — verify export is blocked

## Error Handling

| Error Scenario              | Handling Strategy                                      |
| --------------------------- | ------------------------------------------------------ |
| AI API key not set          | Disable AI button, show configuration hint             |
| AI API rate limited         | Show "Rate limited — try again in a moment" message    |
| AI API request fails        | Show error, keep original description                  |
| Validation has errors       | Block export, show issue list                          |
| Validation has warnings     | Allow export with confirmation                         |

## Failure Modes

| Component       | Failure Mode              | Trigger                    | Impact                     | Mitigation                         |
| --------------- | ------------------------- | -------------------------- | -------------------------- | ---------------------------------- |
| AI Provider     | API returns non-JSON      | Provider outage/breaking change | Parse error, request fails | Catch and show "AI service error"  |
| AI Provider     | Extremely long response   | AI goes off-track          | UI overflow, slow render   | Truncate to 5000 chars in UI       |
| AI Provider     | Stale pricing in prompt   | AI references old prices   | Misleading description     | Don't include price in prompt      |
| Validator       | Missed Godaddy validation | Godaddy rejects export     | User frustration           | Update rules based on real failures|
| Validator       | False positive on HTML    | Legitimate HTML in desc    | Unnecessary warning        | Only warn on raw/unmatched tags    |

## Validation Commands

```bash
# Test AI provider
go test ./internal/ai/... -v

# Test validator
go test ./internal/validator/... -v

# Full test suite
go test ./...
```

## Rollout Considerations

- AI feature requires an API key — document setup in README: `export GODADDY_AI_API_KEY=sk-...`
- Default model `gpt-4o-mini` is cheap and fast, but if quality is unsatisfactory, users can set `GODADDY_AI_MODEL=gpt-4o` or change `BaseURL` to a different provider.
- Consider adding a `--ai-temperature` flag for future control (0.7 default is fine).

## Open Items

- [ ] Which LLM provider to recommend? (OpenAI is the default, but alternatives like Anthropic Claude or open-source models via Ollama might be relevant)
- [ ] Should AI rewrite also suggest a new product name? (Currently only rewrites description)
- [ ] Rate limiting: should we limit AI calls to N per minute to control costs? (Probably not for a single-user tool, but worth considering)

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
