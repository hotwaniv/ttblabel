import "server-only";

import { generateObject } from "ai";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getVerificationModel } from "./provider";
import { createLogger } from "./logger";
import type { ApplicationFields } from "./types";

const log = createLogger("expected-sheet");

export type ExpectedRow = {
  colaId: string;
  ttbId: string;
  fields: ApplicationFields;
};

const TARGET_FIELDS = [
  "colaId",
  "ttbId",
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "beverageType",
] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

const columnMappingSchema = z.object({
  headerRowIndex: z
    .number()
    .int()
    .min(0)
    .describe("0-based index of the row containing column headers"),
  columns: z.object({
    colaId: z
      .string()
      .nullable()
      .describe("Exact header text for the COLA ID column"),
    ttbId: z
      .string()
      .nullable()
      .describe("Exact header text for the TTB ID column"),
    brandName: z
      .string()
      .nullable()
      .describe("Exact header text for the brand name column"),
    classType: z
      .string()
      .nullable()
      .describe("Exact header text for the class/type column"),
    alcoholContent: z
      .string()
      .nullable()
      .describe("Exact header text for alcohol content / ABV"),
    netContents: z
      .string()
      .nullable()
      .describe("Exact header text for net contents / volume"),
    producerName: z
      .string()
      .nullable()
      .describe("Exact header text for producer / bottler / name & address"),
    beverageType: z
      .string()
      .nullable()
      .describe("Exact header text for product / beverage type"),
  }),
  reasoning: z.string(),
});

type ColumnMapping = z.infer<typeof columnMappingSchema>;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return String(Math.trunc(value));
    }

    return String(value);
  }

  return String(value).trim();
}

function readSheetMatrix(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Spreadsheet has no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (matrix.length === 0) {
    throw new Error("Spreadsheet has no data rows");
  }

  return matrix;
}

function findColumnIndex(
  headerRow: unknown[],
  headerText: string | null | undefined
): number {
  if (!headerText?.trim()) {
    return -1;
  }

  const target = normalizeHeader(headerText);

  for (let index = 0; index < headerRow.length; index++) {
    const header = normalizeHeader(cellToString(headerRow[index]));

    if (header === target) {
      return index;
    }
  }

  for (let index = 0; index < headerRow.length; index++) {
    const header = normalizeHeader(cellToString(headerRow[index]));

    if (!header) {
      continue;
    }

    if (header.includes(target) || target.includes(header)) {
      return index;
    }
  }

  return -1;
}

async function inferColumnMapping(matrix: unknown[][]): Promise<ColumnMapping> {
  const sampleRowCount = Math.min(matrix.length, 12);
  const sample = matrix.slice(0, sampleRowCount);

  const model = getVerificationModel();
  const { object } = await generateObject({
    model,
    schema: columnMappingSchema,
    prompt: `You are parsing a TTB COLA application spreadsheet used to supply expected label values for batch verification.

Identify:
1. headerRowIndex — the 0-based row index that contains column headers (may NOT be row 0 if there are title/instruction rows above).
2. columns — for each target field, the EXACT header cell text from that header row. Use null if the column is absent.

Target fields (ignore government_warning, origin, permit_number, grape_varietals, and other metadata columns we do not use):
- colaId — COLA application ID (e.g. TTB-2026-000001, COLA-123)
- ttbId — TTB numeric/alternate ID
- brandName — brand name as approved
- classType — class/type statement (e.g. India Pale Ale, Kentucky Straight Bourbon Whisky)
- alcoholContent — ABV / alcohol content (percent or proof)
- netContents — net contents / volume (mL, fl oz, etc.)
- producerName — producer, bottler, or name & address block (columns like name_address, producer, bottler)
- beverageType — product type / category (product_type, beverage type, spirits/wine/beer)

Common header variants: brand_name, Brand Name, class_type, alcohol_content, net_contents, name_address, product_type.

Return exact header strings as they appear in the sheet so we can locate column indices.

Spreadsheet preview (each row is an array of cell values):
${JSON.stringify(sample, null, 2)}`,
  });

  return object;
}

function resolveColumnIndices(
  headerRow: unknown[],
  mapping: ColumnMapping["columns"]
): Record<TargetField, number> {
  const indices = {} as Record<TargetField, number>;

  for (const field of TARGET_FIELDS) {
    indices[field] = findColumnIndex(headerRow, mapping[field]);
  }

  return indices;
}

function getCell(row: unknown[], index: number): string {
  if (index < 0) {
    return "";
  }

  return cellToString(row[index]);
}

function validateMapping(indices: Record<TargetField, number>): void {
  const hasIdColumn = indices.colaId >= 0 || indices.ttbId >= 0;
  const hasBrand = indices.brandName >= 0;

  if (!hasIdColumn) {
    throw new Error(
      "Spreadsheet must include a COLA ID or TTB ID column (cola_id / ttb_id or equivalent)"
    );
  }

  if (!hasBrand) {
    throw new Error(
      "Spreadsheet must include a brand name column (brand_name or equivalent)"
    );
  }
}

function rowToExpected(
  row: unknown[],
  indices: Record<TargetField, number>
): ExpectedRow | null {
  const colaId = getCell(row, indices.colaId);
  const ttbId = getCell(row, indices.ttbId);

  if (!colaId && !ttbId) {
    return null;
  }

  return {
    colaId,
    ttbId,
    fields: {
      brandName: getCell(row, indices.brandName),
      classType: getCell(row, indices.classType),
      alcoholContent: getCell(row, indices.alcoholContent),
      netContents: getCell(row, indices.netContents),
      producerName: getCell(row, indices.producerName),
      beverageType: getCell(row, indices.beverageType),
    },
  };
}

export async function parseExpectedSheetRows(
  buffer: Buffer
): Promise<ExpectedRow[]> {
  const matrix = readSheetMatrix(buffer);
  const mapping = await inferColumnMapping(matrix);

  log.debug("column mapping inferred", {
    headerRowIndex: mapping.headerRowIndex,
    columns: mapping.columns,
    reasoning: mapping.reasoning,
  });

  if (mapping.headerRowIndex >= matrix.length) {
    throw new Error("Could not locate a header row in the spreadsheet");
  }

  const headerRow = matrix[mapping.headerRowIndex];
  const indices = resolveColumnIndices(headerRow, mapping.columns);
  validateMapping(indices);

  const expectedRows: ExpectedRow[] = [];

  for (let rowIndex = mapping.headerRowIndex + 1; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex];

    if (!row || row.every((cell) => !cellToString(cell))) {
      continue;
    }

    const expected = rowToExpected(row, indices);

    if (expected) {
      expectedRows.push(expected);
    }
  }

  if (expectedRows.length === 0) {
    throw new Error(
      "No usable rows found — every data row is missing both cola_id and ttb_id"
    );
  }

  return expectedRows;
}

export type ExpectedRowLookup = {
  byColaId: Map<string, ExpectedRow>;
  byTtbId: Map<string, ExpectedRow>;
};

export function buildRowLookup(rows: ExpectedRow[]): ExpectedRowLookup {
  const byColaId = new Map<string, ExpectedRow>();
  const byTtbId = new Map<string, ExpectedRow>();

  for (const row of rows) {
    if (row.colaId) {
      byColaId.set(normalizeId(row.colaId), row);
    }

    if (row.ttbId) {
      byTtbId.set(normalizeId(row.ttbId), row);
    }
  }

  return { byColaId, byTtbId };
}
