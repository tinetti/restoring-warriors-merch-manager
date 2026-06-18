# Implementation Spec: Godaddy Ecommerce Manager - Phase 2

**Contract**: ./docs/ideation/godaddy-ecommerce-manager/contract.html
**Date**: 2026-06-17
**Estimated Effort**: L

**Prerequisite**: Phase 1 — Data Layer & CSV I/O must be complete.

## Technical Approach

Phase 2 builds the local web application — a single-page app served by the Go backend on localhost. The user browses products, views/edit variants, and exports a corrected CSV. The frontend is vanilla HTML/CSS/JS (no framework), communicated with the Go backend via JSON over HTTP.

**Key technical decisions:**

- **Vanilla HTML/CSS/JS**: No React, no Vue. The app is simple enough that a framework adds unnecessary complexity and build steps. A single `index.html` with inline or module-scoped JS.
- **Go backend as API server**: Serves the static frontend, provides REST endpoints for CRUD on products, and the CSV import/export endpoints from Phase 1.
- **Single-page navigation**: Hash-based routing (`#/products`, `#/products/:id`, `#/products/:id/edit`) — no server-side routing needed.
- **In-memory state**: The frontend holds product data in memory. Changes are tracked and synced to the backend on save/export.

**Architecture:**

```
Browser (localhost:8080)
  └── index.html + app.js + styles.css (served by Go static handler)
  └── API calls → Go backend (JSON endpoints)

Go Backend
  ├── Static file server (frontend)
  ├── GET  /api/products        — list all products
  ├── GET  /api/products/:id    — get single product
  ├── PUT  /api/products/:id    — update product
  ├── POST /api/products/:id/import-csv  — load a Godaddy CSV
  ├── POST /api/products/export-csv      — export to Godaddy CSV
  └── GET  /health              — health check
```

**Backend package additions:**

```
internal/server/           # HTTP server with API handlers
internal/server/middleware/ # Auth (future), logging
```

## Feedback Strategy

**Inner-loop command**: `open http://localhost:8080` and interact with the browser

**Playground**: Go dev server (`go run cmd/godaddy-manager/main.go server`) serving the frontend. Make a change, refresh the browser.

**Why this approach**: The frontend is a SPA — the fastest feedback is seeing the actual rendered UI. API layer changes are verified with `curl` or the browser devtools.

## File Changes

### New Files

| File Path                                           | Purpose                                    |
| --------------------------------------------------- | ------------------------------------------ |
| `internal/server/server.go`                         | Go HTTP server setup, routes, handlers     |
| `internal/server/handlers.go`                       | API endpoint handlers (list, get, update)  |
| `internal/server/csv_handler.go`                    | CSV import/export HTTP handlers            |
| `web/index.html`                                    | Main SPA HTML page                         |
| `web/app.js`                                        | SPA application logic (routing, state)     |
| `web/styles.css`                                    | App styles (CSS variables, layout)         |
| `web/components/product-list.js`                    | Product list view component                |
| `web/components/product-detail.js`                  | Product detail/edit view component         |
| `web/components/variant-row.js`                     | Variant row editor inline component        |
| `web/utils/api.js`                                  | Fetch wrapper for API calls                |
| `web/utils/format.js`                               | Helpers (price formatting, SKU display)    |

### Modified Files

| File Path                          | Changes                                    |
| ---------------------------------- | ------------------------------------------ |
| `cmd/godaddy-manager/main.go`      | Add `server` subcommand; wire up HTTP server |
| `internal/model/product.go`        | Add JSON struct tags for API serialization |

### Deleted Files

_None._

## Implementation Details

### HTTP Server (`internal/server/server.go`)

**Overview**: Sets up a Go HTTP server that serves the static frontend and exposes JSON API endpoints.

```go
package server

type Server struct {
    port int
    store *model.ProductStore  // In-memory product store (shared with CSV layer)
}

func New(port int, store *model.ProductStore) *Server
func (s *Server) Start() error
func (s *Server) RegisterRoutes(mux *http.ServeMux)
```

**Key decisions:**

- Default port 8080, configurable via `--port` flag.
- Static files served from `web/` directory relative to the binary's working directory.
- CORS not needed (same origin), but add basic headers (`Content-Type: application/json`).

**Implementation steps:**

1. Create `New()` constructor accepting port and product store.
2. Set up `http.ServeMux` with routes.
3. Register static file handler for `web/` directory.
4. Register API routes under `/api/`.
5. Add `server` subcommand to CLI that calls `server.Start()`.

### API Handlers (`internal/server/handlers.go`)

**Overview**: JSON API endpoints for product CRUD.

| Method | Path                     | Handler                | Description                    |
| ------ | ------------------------ | ---------------------- | ------------------------------ |
| `GET`  | `/api/products`          | `HandleListProducts`   | Return all products as JSON    |
| `GET`  | `/api/products/:id`      | `HandleGetProduct`     | Return a single product        |
| `PUT`  | `/api/products/:id`      | `HandleUpdateProduct`  | Update a product and variants  |
| `POST` | `/api/products/import`   | `HandleImportCSV`      | Upload and parse a CSV file    |
| `POST` | `/api/products/export`   | `HandleExportCSV`      | Download a CSV file            |

**Key decisions:**

- `PUT /api/products/:id` accepts the full product object (not a patch). Simpler to implement, avoids partial-update complexity.
- Import endpoint accepts `multipart/form-data` for file upload.
- Export endpoint returns `Content-Type: text/csv` with `Content-Disposition: attachment`.
- All errors return JSON: `{"error": "message"}` with appropriate HTTP status code.

**Implementation steps:**

1. Implement `HandleListProducts` — returns `[]model.Product` as JSON.
2. Implement `HandleGetProduct` — finds product by ID, returns 404 if not found.
3. Implement `HandleUpdateProduct` — deserializes JSON into `model.Product`, validates, saves.
4. Implement `HandleImportCSV` — reads uploaded file, calls `csv.ReadGodaddyCSV`, stores products.
5. Implement `HandleExportCSV` — calls `csv.WriteGodaddyCSV`, returns file as response.
6. Add error handling wrapper for consistent JSON error responses.

### Frontend: SPA Shell (`web/index.html`)

**Overview**: Single HTML page with a header nav and a main content area that changes based on hash routing.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Godaddy Ecommerce Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Godaddy Manager</h1>
    <nav>
      <a href="#/products">Products</a>
      <a href="#/import">Import CSV</a>
    </nav>
  </header>
  <main id="app"></main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

### Frontend: App Logic (`web/app.js`)

**Overview**: Hash-based router that renders the appropriate view component into `#app`.

```javascript
// Routing
const routes = {
  '/products': renderProductList,
  '/products/:id': renderProductDetail,
  '/products/:id/edit': renderProductEdit,
  '/import': renderImportView,
};

window.addEventListener('hashchange', handleRouting);
handleRouting(); // Initial route
```

**Key decisions:**

- Hash routing (`#/...`) avoids server-side routing complexity.
- Each view component is a function that returns a DOM element (no framework — manual DOM manipulation).
- State is shared: when a product is updated, the product list view re-renders from the shared data.

**Implementation steps:**

1. Build hash router — parse `window.location.hash`, match to route, extract params.
2. Create `renderProductList()` — fetches `/api/products`, renders table of products.
3. Create `renderProductDetail()` — fetches `/api/products/:id`, shows product info.
4. Create `renderProductEdit()` — fetches product, renders editable form.
5. Create `renderImportView()` — file upload form, calls `/api/products/import`.
6. Wire up navigation links.

### Frontend: Product List View (`web/components/product-list.js`)

**Overview**: Table of all products showing name, family, variant count, status. Clickable rows to view/edit.

```javascript
function renderProductList(products) {
  const table = document.createElement('table');
  // Columns: Name, Family, Variants, Status, Actions (Edit)
  // Each row has a link to #/products/:id/edit
}
```

**Key decisions:**

- Filter by family (dropdown: All, INJES, RESTO, SNAPB).
- Search bar to filter by product name.
- Click a row → navigate to edit view.

### Frontend: Product Edit View (`web/components/product-detail.js`)

**Overview**: Editable form for a single product. Shows product fields and a sub-table for variants.

```
┌─────────────────────────────────────┐
│ Product: In Jesus Name T-Shirt      │
│ Family: [INJES ▼]   Status: [ACTIVE▼]│
│ Price: [ $25.00 ]                   │
│ Description: [ multiline textarea ]  │
│                                     │
│ ── Variants ────────────────────────│
│ SKU │ Color  │ Size  │ Price  │ Delete│
│ ────┼────────┼───────┼────────┼───────│
│     │ Black  │ Small │ $25.00 │  [X]  │
│     │ Black  │ Med   │ $25.00 │  [X]  │
│     │ White  │ Small │ $25.00 │  [X]  │
│ ────┴────────┴───────┴────────┴───────│
│ [+ Add Variant]       [Save Product]  │
└─────────────────────────────────────┘
```

**Key decisions:**

- Variants are rendered inline as a table with editable cells.
- "Save Product" calls `PUT /api/products/:id` with the full updated product object.
- Changes are NOT auto-saved — user explicitly clicks Save. Prevents accidental data loss.
- "Add Variant" adds an empty variant row inline. "Delete" removes a variant row.

**Implementation steps:**

1. Build the product edit form with inputs for each field.
2. Build the variant sub-table with inline editing.
3. Handle "Add Variant" — append a blank row to the variant table.
4. Handle "Delete" — remove the variant row from the DOM and the data model.
5. Handle "Save Product" — collect form data, send PUT request, redirect to product list on success.
6. Handle "Save failed" — show error message in UI.

### Frontend: API Client (`web/utils/api.js`)

**Overview**: Thin wrapper around `fetch` for API calls.

```javascript
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPut(path, data) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Unknown error');
  }
  return res.json();
}

async function apiPostMultipart(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(path, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.blob(); // CSV download
}
```

**Key decisions:**

- No auth yet (localhost only, single user).
- Errors thrown as `Error` objects with message strings — the UI catches and displays them.

## Data Model

No database changes. The in-memory `[]model.Product` is shared between the CSV layer and the API handlers. The frontend maintains its own copy of the data in JavaScript.

## API Design

| Method | Path                       | Request Body       | Response              |
| ------ | -------------------------- | ------------------ | --------------------- |
| `GET`  | `/api/products`            | —                  | `Product[]`           |
| `GET`  | `/api/products/:id`        | —                  | `Product`             |
| `PUT`  | `/api/products/:id`        | `Product` (full)   | `{ "success": true }` |
| `POST` | `/api/products/import`     | `multipart/form-data` | `{ "imported": N }` |
| `POST` | `/api/products/export`     | —                  | `text/csv` (download) |

## Testing Requirements

### Unit Tests

| Test File                     | Coverage                    |
| ----------------------------- | --------------------------- |
| `internal/server/handlers_test.go` | Each endpoint: happy path, error cases |
| `internal/server/server_test.go`   | Routes registered, static files served |

**Key test cases:**

- `GET /api/products` returns 200 with product list
- `GET /api/products/nonexistent` returns 404
- `PUT /api/products/:id` updates a product and returns 200
- `PUT /api/products/:id` with invalid JSON returns 400
- `POST /api/products/import` accepts a CSV file and returns import count
- `POST /api/products/export` returns a CSV blob with correct headers
- Static file server returns `index.html` for `/`

### Manual Testing

- [ ] `go run cmd/godaddy-manager/main.go server --port 8080` — starts server
- [ ] Open `http://localhost:8080` — see product list
- [ ] Import a CSV file — products appear in the list
- [ ] Edit a product name — click Save — changes persist after reload
- [ ] Add a variant inline — click Save — variant appears in exported CSV
- [ ] Export CSV — download file opens correctly in a text editor

## Error Handling

| Error Scenario              | Handling Strategy                                      |
| --------------------------- | ------------------------------------------------------ |
| Product not found           | Return 404, UI shows "Product not found" message       |
| Invalid JSON in PUT request | Return 400, UI shows validation error                  |
| CSV parse error on import   | Return 400 with parse details, UI shows error          |
| File upload too large       | Return 413, UI shows "File too large" message          |
| Server crash                | Go's default panic handler (development); add recover middleware |

## Failure Modes

| Component       | Failure Mode              | Trigger                        | Impact                     | Mitigation                          |
| --------------- | ------------------------- | ------------------------------ | -------------------------- | ----------------------------------- |
| API Handler     | Concurrent PUT requests   | User clicks Save multiple times | Last-write-wins data loss  | Disable Save button after click     |
| Frontend        | Stale data after PUT      | Another tab updated same data  | Overwrites external change | No multi-user support; document     |
| Frontend        | Large product list (>100) | Many products loaded at once   | Slow render, memory usage  | Virtual scrolling (stretch goal)    |
| Frontend        | Variant edit data loss    | Browser crash before Save     | Unsaved changes lost       | Warn on page unload with unsaved    |
| Go Server       | Port already in use       | Another process on 8080        | Server fails to start      | Check `listen` error, show message  |
| CSV Export      | Very long descriptions    | Description exceeds CSV field  | Truncated or malformed CSV | CSV writer handles quoting/escaping |

## Validation Commands

```bash
# Start server
go run cmd/godaddy-manager/main.go server --port 8080

# Test API directly
curl -s http://localhost:8080/api/products | python3 -m json.tool
curl -s -X POST http://localhost:8080/api/products/export -o test-output.csv

# Run all tests
go test ./...
```

## Rollout Considerations

- No deployment — runs on localhost only.
- The `web/` directory is served as static files. If the backend binary is built with `go embed`, the web files are embedded (preferred for the single-binary requirement).

```go
//go:embed web
var webFS embed.FS
```

## Open Items

- [ ] CSS framework or hand-rolled styles? (Recommend hand-rolled for simplicity — 1 page SPA)
- [ ] Should the import endpoint auto-parse and populate products, or just validate and show a preview first?
- [ ] Keyboard shortcuts for power users (e.g., Ctrl+S to save, Escape to cancel)?

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
