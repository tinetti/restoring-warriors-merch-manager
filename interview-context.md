# Godaddy Ecommerce Manager — Ideation Interview Context

**Date**: 2026-06-17
**Status**: In-progress interview (Phase 2 of ideation workflow)

## Project Overview

Building a local web app tool for the user's friend to manage Godaddy ecommerce products (t-shirts, hats, mugs) locally, then export/import them into Godaddy's platform via CSV. The friend's Godaddy store UI is "primitive and buggy" for managing SKUs, prices, variations, etc.

The user (developer) uses Codex (an AI coding tool). The friend also uses Codex — but the Codex role in the workflow is still undefined ("I'm not sure yet").

## Resolved Decisions

### Interface
Simple local web app (runs on localhost)

### Scale
Medium — 30-100 products with variants

### Tech Stack
Plain HTML/JS + lightweight backend (Go or Rust, single binary)

### Goals
- Handle variants and SKU rules cleanly
- AI-assisted product descriptions
- Save time and reduce errors

### Out of Scope
- No payment/checkout
- No order or inventory sync
- No Godaddy API integration (CSV-only bridge)

### Verification Criteria
- Import file parses correctly and products appear correctly on Godaddy
- Idempotent uploads (re-running doesn't create duplicates)

### Variant Handling
SKU auto-generation from variant attributes (current Godaddy SKU naming is cumbersome, e.g., "N-JSS-NM-T---BG-LTTR-BLCK-SMLL")

### Image Handling
Images stored in a local folder; tool manages folder structure and auto-copies to the correct layout for Godaddy import.

### AI Description Workflow
Per-product "AI rewrite" button in the product editor. No bulk operations for phase 1.

## CSV Structure (from godaddy-products-export.csv)

Key columns: SKU, TYPE, NAME, SHORTCODE, VARIANT GROUP ID, STATUS, PRICE, SALE PRICE, AVAILABLE, DESCRIPTION, WEIGHT, UNIT OF WEIGHT, PRODUCT ID, OPTION 1 NAME, OPTION 1 VALUE, OPTION 2 NAME, OPTION 2 VALUE

- Product-level rows: TYPE=PHYSICAL, description in DESCRIPTION column, empty SKU
- Variant rows: populated SKU, variant group ID matching parent, OPTION 1/2 for Color+Size or Style
- 3 product families: "In Jesus Name" (INJES prefix), "Restoring Warriors" (RESTO), "Snapback" (SNAPB)
- Pricing: T-shirts $25, hoodies $42, snapback hats $22
- Data quality: hoodies show 0 lbs weight (bug), some variants show ON HAND=30 only for one variant
- Product descriptions include HTML entities (e.g., &amp;)

## Answers to Open Questions

1. **AI description workflow**: Per-product "AI rewrite" button in the product editor. No bulk operations for now.
2. **Image file handling**: Images stored in a local folder; the tool manages the folder structure and copies images into the directory layout Godaddy's importer expects.
3. **Codex role**: Future consideration — not defined for phase 1.

## Evidence Gate Status

| Gate | Status | Notes |
|------|--------|-------|
| Problem Clarity | READY | Clear: friend's Godaddy UI is buggy for product management; CSV is the bridge |
| Goal Definition | READY | Variants/SKU, AI descriptions, time savings explicitly stated |
| Success Criteria | READY | AI description flow (per-product rewrite) and image handling (local folder + tool-managed copy) defined |
| Scope Boundaries | READY | Explicitly defined in/out of scope |
| Consistency | READY | No contradictions found |

## Artifacts Generated

- `godaddy-products-export.csv` — sample export from Godaddy (32KB, ~12 products, ~95 variant rows)
- This file (`interview-context.md`)

## Next Steps

1. ~~Ask remaining questions on AI description workflow and image handling~~ ✅
2. ~~Define Codex's role or set as future consideration~~ ✅ (set as future consideration)
3. All 5 gates READY — generate Mission Brief contract (contract-data.json → contract.html)
4. After contract approval, determine phasing and generate implementation specs
