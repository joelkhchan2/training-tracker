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
  /**
   * The Training Log tab has NO usable header row (row 0 is broken/blank in
   * the real export), so it can't be keyed by header like the other tabs.
   * This is the same sheet parsed positionally instead: each inner array is
   * one data row, 0-indexed by column, with row 0 (the broken header)
   * dropped. See scripts/migration mapping doc for the column index → field
   * mapping (idx 0 = Date, idx 2 = Entry Type, idx 3 = Exercise, etc).
   */
  trainingLogMatrix: (string | number | null)[][];
  exercises: RawRow[];
  personalBests: RawRow[];
  settings: RawRow[];
  templates: RawRow[];
  goals: RawRow[];
  /** All sheet names present in the workbook, in file order. */
  sheetNames: string[];
};
