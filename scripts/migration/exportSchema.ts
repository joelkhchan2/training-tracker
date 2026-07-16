/**
 * Shared types for the raw xlsx export used by the seed-user migration.
 *
 * A "row" from any tab is just whatever SheetJS gives us when it keys
 * cells by the header row — so values are the plain JS types that come
 * back from cell parsing (string/number/boolean), or null for blanks.
 */
export type RawRow = Record<string, string | number | boolean | null>;

export type RawExport = {
  trainingLog: RawRow[];
  exercises: RawRow[];
  personalBests: RawRow[];
  settings: RawRow[];
  templates: RawRow[];
  goals: RawRow[];
  /** All sheet names present in the workbook, in file order. */
  sheetNames: string[];
};
