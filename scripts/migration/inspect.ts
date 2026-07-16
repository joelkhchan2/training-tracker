/**
 * One-off inspection script for the seed-user migration.
 *
 * Loads scripts/migration/.data/export.xlsx and prints the REAL structure
 * of each known tab (found?, row count, column headers, sample rows) so
 * transforms can be written against actual column names instead of
 * guesses. Run with: npx tsx scripts/migration/inspect.ts
 */
import { loadExport } from "./loadExport.ts";
import type { RawExport, RawRow } from "./exportSchema.ts";

const XLSX_PATH = "scripts/migration/.data/export.xlsx";

function columnHeaders(rows: RawRow[]): string[] {
  if (rows.length === 0) return [];
  // Union of keys across the first few rows, in first-seen order, in case
  // some rows have sparse/blank trailing columns that others don't.
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function printTab(label: string, rows: RawRow[]): void {
  console.log(`\n=== ${label} ===`);
  console.log(`found: ${rows.length > 0 ? "yes" : "no rows (or tab missing)"}`);
  console.log(`row count: ${rows.length}`);
  const headers = columnHeaders(rows);
  console.log(`columns (${headers.length}): ${JSON.stringify(headers)}`);
  const samples = rows.slice(0, 2);
  console.log(`sample rows (${samples.length}):`);
  for (const sample of samples) {
    console.log(JSON.stringify(sample, null, 2));
  }
}

function main(): void {
  const data: RawExport = loadExport(XLSX_PATH);

  console.log("All sheet names in workbook:");
  console.log(JSON.stringify(data.sheetNames, null, 2));

  printTab("Training Log", data.trainingLog);
  printTab("Exercises_Master", data.exercises);
  printTab("Personal Bests", data.personalBests);
  printTab("Settings", data.settings);
  printTab("Templates", data.templates);
  printTab("Goals", data.goals);
}

main();
