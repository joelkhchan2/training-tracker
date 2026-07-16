// xlsx (SheetJS) is a CJS module whose named exports are attached at
// runtime, not statically, so Node's ESM interop can't detect them via
// `import * as XLSX`. A default import (which maps to module.exports) is
// required here.
import XLSX from "xlsx";
import type { RawExport, RawRow } from "./exportSchema.ts";

/**
 * Known tabs in the source spreadsheet, mapped to their key in RawExport.
 * Sheet name matching is case-insensitive and trims whitespace so small
 * naming drift in the export doesn't break the loader.
 */
const KNOWN_TABS: { key: keyof Omit<RawExport, "sheetNames">; sheetName: string }[] = [
  { key: "trainingLog", sheetName: "Training Log" },
  { key: "exercises", sheetName: "Exercises_Master" },
  { key: "personalBests", sheetName: "Personal Bests" },
  { key: "settings", sheetName: "Settings" },
  { key: "templates", sheetName: "Templates" },
  { key: "goals", sheetName: "Goals" },
];

function normalizeSheetName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Loads a workbook exported from the user's training tracker spreadsheet
 * and returns each known tab as an array of row-objects keyed by header.
 *
 * Missing tabs return an empty array rather than throwing, since not every
 * export is guaranteed to contain every tab (e.g. a user with no Goals tab).
 */
export function loadExport(xlsxPath: string): RawExport {
  const workbook = XLSX.readFile(xlsxPath, { cellDates: true });

  const sheetNames = workbook.SheetNames;
  const sheetsByNormalizedName = new Map<string, string>();
  for (const name of sheetNames) {
    sheetsByNormalizedName.set(normalizeSheetName(name), name);
  }

  const result: RawExport = {
    trainingLog: [],
    exercises: [],
    personalBests: [],
    settings: [],
    templates: [],
    goals: [],
    sheetNames,
  };

  for (const { key, sheetName } of KNOWN_TABS) {
    const actualName = sheetsByNormalizedName.get(normalizeSheetName(sheetName));
    if (!actualName) {
      // Known tab not present in this export — leave as [].
      continue;
    }

    const worksheet = workbook.Sheets[actualName];
    const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, {
      defval: null,
      raw: false,
    });

    result[key] = rows;
  }

  return result;
}
