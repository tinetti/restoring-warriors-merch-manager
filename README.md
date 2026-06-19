# Godaddy Ecommerce Manager

Local product-management tool for a Godaddy merch store.

It replaces the painful parts of the Godaddy admin UI with a small local web app and CLI that can:

- import Godaddy product CSV exports
- edit products and variants locally
- regenerate readable SKUs
- validate common catalog issues before export
- rewrite product descriptions with an AI provider
- export a Godaddy-compatible CSV and organized image files

## Requirements

- Node.js 24+
- npm 11+

## Install

```bash
npm install
```

## Just commands

If you use [`just`](https://github.com/casey/just), the repository includes a `justfile` with the most common workflows:

```bash
just          # list recipes
just dev
just check
just server
```

## Run the app

Start the local server:

```bash
npx tsx src/index.ts server --port 8080
```

Open:

```text
http://127.0.0.1:8080
```

If `godaddy-products-export.csv` exists at the project root, the server will preload products from it.

## CLI usage

### Parse a Godaddy CSV into JSON

```bash
npx tsx src/index.ts parse \
  --input godaddy-products-export.csv \
  --output products.json
```

### Export JSON back to Godaddy CSV

```bash
npx tsx src/index.ts export \
  --input products.json \
  --output godaddy-export.csv
```

Optional export flags:

- `--images-dir <path>`: source directory for product images
- `--output-dir <path>`: destination directory for organized export images

## Web app features

- product list with search and family filtering
- product editing
- inline variant editing
- image upload
- SKU regeneration
- pre-export validation
- CSV import/export
- AI description rewrite

## AI configuration

AI rewrite is optional.

Set an API key before starting the server:

```bash
export GODADDY_AI_API_KEY=your-key-here
```

Optional settings:

```bash
export GODADDY_AI_MODEL=gpt-4o-mini
export GODADDY_AI_BASE_URL=https://api.openai.com/v1
```

Then run:

```bash
npx tsx src/index.ts server --port 8080
```

## Validation and quality checks

Run the full test suite:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

## Project structure

```text
src/
  ai/          AI provider and rewrite flow
  csv/         Godaddy CSV reader/writer
  model/       types, SKU generation, image handling
  server/      HTTP API
  validator/   pre-export validation
web/           vanilla frontend
test/          automated tests
testdata/      sample Godaddy CSV fixture
```

## Notes

- This implementation is TypeScript/Node-based.
- Images are copied into `godaddy-import/` during export.
- The sample fixture is stored at `testdata/godaddy-products-export.csv`.
