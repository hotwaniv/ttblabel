# TTB Label Verifier

Prototype tool for comparing alcohol beverage label artwork against COLA application fields. Upload a label image (or a ZIP of many labels), enter the expected application values, and Claude Vision extracts each statement from the label and scores it field-by-field — including the mandatory TTB government warning.

Built for TTB examiners and compliance teams who need a fast first pass before formal review. **This is not an official TTB determination.**

## Quick Demo
**Live Application**: [https://ttblabel-ten.vercel.app/](https://ttblabel-ten.vercel.app/)

**Demo Credentials** (no real data stored):
- Email: `Label-Scanner`
- Password: `Label-Scanner`

Or register your own account.

This is based on the requirements on this Link: https://github.com/treasurytakehome-rgb/instructions.git


## Test Samples
Test images and sample COLA data are available in the `/tests` folder:
- `/tests` — Individual label images for different test scenarios
- cola_test_data' Excel file with expected values and test cases

## Submission Notes for Treasury
- **Repo**: https://github.com/hotwaniv/ttblabel
- **Deployed URL**: https://ttblabel-ten.vercel.app/
- Demo credentials provided above
- All images processed in-memory only (no persistence)
- Meets <5s response target on good-quality single labels

## Known Limitations & Trade-offs
- UI can be significantly improved for even simpler use by.
- Accuracy of vision extraction depends on image quality (curved, low-light, or low-resolution labels may need multiple attempts).
- Large batches (hundreds of images) will be slower and more expensive — further optimization (caching, cheaper models, queuing) would be needed in production.
- Limited real-world testing done so far — more validation against actual TTB labels would strengthen confidence.

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



