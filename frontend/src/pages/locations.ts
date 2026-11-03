import type { Locator } from "../api";

/** Short human label for where a passage sits: "p. 37", "Security!A4:C4", "¶ 3–5", "lines 2–9". */
export function locationLabel(page: number | null, locator: Locator | null): string {
  if (page) return `p. ${page}`;
  if (!locator) return "";
  if (locator.sheet) return `${locator.sheet}!${locator.range}`;
  if (locator.table) return `table ${locator.table}, row ${locator.row}`;
  if (locator.paragraphs) {
    const [a, b] = locator.paragraphs;
    return a === b ? `¶ ${a}` : `¶ ${a}–${b}`;
  }
  if (locator.lines) return `lines ${locator.lines[0]}–${locator.lines[1]}`;
  return "";
}
