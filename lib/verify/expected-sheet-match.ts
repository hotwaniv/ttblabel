import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import {
  ROW_MATCH_CLOSE_CANDIDATE_GAP,
  ROW_MATCH_JUDGE_BAND_HIGH,
  ROW_MATCH_MAX_CANDIDATES,
  ROW_MATCH_MIN_SCORE,
} from "./constants";
import {
  normalizeId,
  type ExpectedRow,
  type ExpectedRowLookup,
} from "./expected-sheet";
import { similarityRatio } from "./fuzzy-match";
import { getVerificationModel } from "./provider";
import type { ApplicationFields } from "./types";

const MATCH_FIELDS: (keyof ApplicationFields)[] = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "beverageType",
];

const rowJudgeSchema = z.object({
  matchedColaId: z.string().nullable(),
  matchedTtbId: z.string().nullable(),
  reasoning: z.string(),
});

function scoreRowMatch(
  extracted: ApplicationFields,
  row: ExpectedRow
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const field of MATCH_FIELDS) {
    const fromLabel = extracted[field]?.trim() ?? "";
    const fromSheet = row.fields[field]?.trim() ?? "";

    if (!fromLabel && !fromSheet) {
      continue;
    }

    totalWeight += 1;

    if (!fromLabel || !fromSheet) {
      continue;
    }

    weightedSum += similarityRatio(fromLabel, fromSheet);
  }

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}

export function matchRowByFilename(
  filename: string,
  lookup: ExpectedRowLookup
): ExpectedRow | null {
  const normalizedFilename = normalizeId(filename);

  if (!normalizedFilename) {
    return null;
  }

  for (const [id, row] of lookup.byColaId) {
    if (id.length >= 4 && normalizedFilename.includes(id)) {
      return row;
    }
  }

  for (const [id, row] of lookup.byTtbId) {
    if (id.length >= 4 && normalizedFilename.includes(id)) {
      return row;
    }
  }

  return null;
}

export function matchRowByFuzzy(
  extracted: ApplicationFields,
  rows: ExpectedRow[]
): { row: ExpectedRow; score: number }[] {
  const scored = rows
    .map((row) => ({ row, score: scoreRowMatch(extracted, row) }))
    .filter((item) => item.score >= ROW_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, ROW_MATCH_MAX_CANDIDATES);
}

export async function judgeRowMatch(
  extracted: ApplicationFields,
  candidates: { row: ExpectedRow; score: number }[]
): Promise<ExpectedRow | null> {
  if (candidates.length === 0) {
    return null;
  }

  const model = getVerificationModel();
  const candidateSummary = candidates.map((item, index) => ({
    index,
    colaId: item.row.colaId,
    ttbId: item.row.ttbId,
    score: item.score,
    fields: item.row.fields,
  }));

  const { object } = await generateObject({
    model,
    schema: rowJudgeSchema,
    prompt: `You are matching a label image to the correct row from a TTB application spreadsheet.

Extracted label fields (from vision prefill):
${JSON.stringify(extracted, null, 2)}

Candidate spreadsheet rows (sorted by fuzzy score):
${JSON.stringify(candidateSummary, null, 2)}

Pick the row that best matches this label. Return matchedColaId and matchedTtbId from that row, or both null if none match well enough.
Prefer the highest-scoring candidate when evidence is weak but plausible.`,
  });

  if (!object.matchedColaId && !object.matchedTtbId) {
    return null;
  }

  const matched = candidates.find(
    (item) =>
      (object.matchedColaId &&
        item.row.colaId === object.matchedColaId) ||
      (object.matchedTtbId && item.row.ttbId === object.matchedTtbId)
  );

  return matched?.row ?? candidates[0]?.row ?? null;
}

function matchedIdLabel(row: ExpectedRow): string {
  return row.ttbId || row.colaId;
}

export async function resolveExpectedFields(
  filename: string,
  lookup: ExpectedRowLookup,
  rows: ExpectedRow[],
  extracted: ApplicationFields
): Promise<{ fields: ApplicationFields; matchedId: string } | null> {
  const filenameMatch = matchRowByFilename(filename, lookup);

  if (filenameMatch) {
    return {
      fields: filenameMatch.fields,
      matchedId: matchedIdLabel(filenameMatch),
    };
  }

  const candidates = matchRowByFuzzy(extracted, rows);

  if (candidates.length === 0) {
    return null;
  }

  const top = candidates[0];
  const second = candidates[1];
  const needsJudge =
    top.score < ROW_MATCH_JUDGE_BAND_HIGH ||
    (second !== undefined &&
      top.score - second.score < ROW_MATCH_CLOSE_CANDIDATE_GAP);

  if (!needsJudge) {
    return {
      fields: top.row.fields,
      matchedId: matchedIdLabel(top.row),
    };
  }

  const judged = await judgeRowMatch(extracted, candidates);

  if (!judged) {
    return null;
  }

  return {
    fields: judged.fields,
    matchedId: matchedIdLabel(judged),
  };
}
