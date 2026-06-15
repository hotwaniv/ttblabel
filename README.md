# TTB Label Verifier

Prototype tool for comparing alcohol beverage label artwork against COLA application fields. Upload a label image (or a ZIP of many labels), enter the expected application values, and Claude Vision extracts each statement from the label and scores it field-by-field — including the mandatory TTB government warning.

Built for TTB examiners and compliance teams who need a fast first pass before formal review. This is **not** an official TTB determination.

## Setup

```bash
bun install
cp .env.example .env.local
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Database and auth variables are already configured in `.env.example` — copy them as-is if setting up a fresh environment.

Start the dev server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000), register or sign in, and use the verification form.

### Docker (single command)

Ensure `.env.local` contains at least `AUTH_SECRET` and `ANTHROPIC_API_KEY` (see `.env.example`). Postgres credentials are provisioned by Compose.

```bash
docker compose up --build
```

The app container runs database migrations on startup, then serves on [http://localhost:3000](http://localhost:3000).

## Architecture

| Layer | Technology |
|-------|------------|
| Framework | Next.js App Router (React Server Components + Route Handlers) |
| Vision extraction | Claude `claude-sonnet-4-6` via `@ai-sdk/anthropic` |
| Structured output | Zod schemas (`generateObject`) |
| Image preprocessing | `sharp` — resize, normalize format, enforce size limits before API call |
| Text comparison | `fastest-levenshtein` — server-side fuzzy matching after model extraction |
| Auth | NextAuth v5 (JWT sessions, Postgres) |
| Streaming | Server-Sent Events (cosmetic field-by-field after extraction) |

### Request flow

1. Optional: `POST /api/prefill` extracts application fields from a label image to auto-fill the form.
2. Client sends multipart form data (image + application fields) to `POST /api/verify` with `stream=1` (single) or JSON mode (batch).
3. Images are validated and optionally resized with `sharp`.
4. Claude Vision extracts verbatim label text for each field and assigns an initial status.
5. Server-side rules refine results field-by-field; each field is streamed to the client via SSE.
6. Overall result is computed (`PASS` / `FAIL` / `REVIEW`). On `FAIL`, a TTB-style rejection draft is generated.
7. JSON export on complete. No image bytes are stored.

## Verification modes

### Single image

Upload one label image (JPEG, PNG, or WebP, max 10 MB). Use **Pre-fill fields from label** to auto-populate application values from the image, then verify. Results stream field-by-field in the right panel via SSE (cosmetic streaming after vision extraction completes).

### ZIP batch

Upload a ZIP archive containing up to **300** label images. The same application fields apply to every image in the batch. Processing runs **5 concurrent** verifications at a time to balance throughput and API rate limits. Progress and per-image results are shown in the UI; the full batch can be exported as JSON when complete.

## Fields verified

| Field | Source |
|-------|--------|
| Brand Name | User input |
| Class / Type | User input |
| Alcohol Content | User input |
| Net Contents | User input |
| Producer / Bottler | User input |
| Beverage Type | User input |
| Government Warning | Hardcoded server-side (27 CFR § 5.37 / § 4.39 / § 7.26) — never accepted from client |

## Field verification rules

### Government warning (strict)

The full two-part Surgeon General statement must appear on the label:

> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

- **Missing either part** → `fail`
- Minor typography differences (line breaks, punctuation spacing, ALL CAPS) are acceptable → may still `pass`
- Paraphrased or abbreviated text → `fail`

The expected text is hardcoded in `lib/verify/government-warning.ts` and injected server-side; client input is ignored.

### Alcohol content (ABV tolerance)

Extracted and expected values are normalized to a numeric ABV percentage (handles `% alc/vol`, `ALC./VOL.`, proof conversion where applicable).

- Exact match or within **±0.5% ABV** → `pass`
- Within **±1.0% ABV** → `warn`
- Beyond ±1.0% ABV or unparseable → `fail` or `review`

### Fuzzy text matching

After Claude extraction, text fields (brand name, class/type, producer, beverage type) are compared with `fastest-levenshtein`:

- Similarity ≥ **90%** → `pass`
- Similarity **75–89%** → `warn`
- Similarity **< 75%** → `fail`

Case, extra whitespace, and common abbreviations are normalized before comparison.

### Net contents

Equivalent volumes in different units (e.g. 750 mL ≈ 25.4 fl oz) match, but differing units from the application are flagged `warn`.

### Legibility

Partially legible, ambiguous, or low-confidence extractions → `review` regardless of similarity score.

## Result statuses

Each field receives one of five statuses:

| Status | Meaning |
|--------|---------|
| **pass** | Extracted text clearly matches the expected value (formatting and case differences allowed). |
| **warn** | Likely matches but has minor discrepancies — alternate abbreviation, equivalent unit, placement concern, or borderline similarity. |
| **fail** | Clear mismatch, missing government warning part, or ABV outside tolerance. |
| **absent** | Field text not found anywhere on the label. |
| **review** | Partially legible, ambiguous, or requires human judgment. Model confidence is low. |

### Overall result

| Overall | Rule |
|---------|------|
| **PASS** | All fields are `pass`. |
| **FAIL** | Any field is `fail`. A TTB-style rejection draft is generated. |
| **REVIEW** | No failures, but at least one field is `warn`, `absent`, or `review`. |

## Export

Results export as **JSON only** — field statuses, extracted text, expected values, confidence scores, explanations, overall result, and rejection draft (if any).

- No label images are included in exports.
- No image data is persisted on the server after verification completes.
- Batch exports include a per-filename result array.

## Known limitations

- **Vision model dependency** — extraction quality depends on image resolution, lighting, curvature, and decorative typefaces. Small or embossed text may be misread.
- **Not legally binding** — outputs are a compliance aid, not an official TTB label approval or rejection.
- **Single application per batch** — batch mode applies the same expected values to every image in the ZIP; mixed-SKU archives need separate runs.
- **API cost and latency** — each label requires a Claude Vision API call (~5–15 s per image). A 300-image batch can take several minutes even with concurrency.
- **English labels only** — prompts and rules assume English-language TTB labels.
- **No COLA database lookup** — the tool compares against user-entered values, not TTB registry records.
- **Chat template remnants** — the repo retains unused chat/artifact code from the upstream Next.js template; only the verify routes and UI are active product surface.

## Production deployment

`ANTHROPIC_API_KEY` requires **outbound HTTPS access to `api.anthropic.com`**. Government network environments must allowlist this endpoint before deployment.

Run database migrations before first deploy:

```bash
bun run db:migrate
```

## Project structure

TTB verification–relevant files:

```
app/
├── (auth)/                    # Login, register, NextAuth routes
├── (chat)/page.tsx            # Main verify UI (single + batch tabs)
└── api/
    ├── prefill/route.ts       # POST — auto-fill form from label image
    └── verify/
        ├── route.ts           # POST — single image (JSON or SSE stream)
        ├── batch/route.ts     # POST — ZIP batch verification
        └── schema.ts          # Multipart form validation (Zod)

components/verify/
├── verify-form.tsx            # Two-panel single-image UI + pre-fill + SSE
├── batch-form.tsx             # ZIP upload + batch progress/results
├── verification-results.tsx   # Streaming field cards + rejection draft
├── status-badge.tsx           # pass / warn / fail / absent / review badges
└── user-nav.tsx               # Signed-in user + sign out

lib/verify/
├── types.ts                   # Zod schemas, VerificationResult types
├── government-warning.ts      # Hardcoded TTB Surgeon General statement
├── prompts.ts                 # Claude extraction + rejection letter prompts
├── provider.ts                # Anthropic client → claude-sonnet-4-6
├── prefill-label.ts           # Vision pre-fill for application fields
├── sse-client.ts              # Browser SSE parser for /api/verify
├── scoring.ts                 # PASS / FAIL / REVIEW aggregation
├── merge-results.ts           # Merge AI output with expected values
├── fuzzy-match.ts             # Levenshtein similarity helpers
├── image.ts                   # sharp resize/format normalization
├── verify-label.ts            # Full verification pipeline + stream callback
└── batch.ts                   # ZIP extraction + concurrent queue (limit 5)

Dockerfile                     # Production image (migrate on start)
docker-compose.yml             # App + Postgres single-command deploy
```

Legacy chat template code (`app/(chat)/api/chat/`, `components/chat/`, `lib/ai/`) remains in the repo but is not part of the TTB verification product.

## License

See [LICENSE](LICENSE).
