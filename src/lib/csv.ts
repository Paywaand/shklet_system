// CSV serialisation for the bookkeeping exports.
//
// Three things here are not optional if the file is going to open cleanly in
// Excel with Kurdish/Arabic text in it:
//
//   1. A UTF-8 BOM. Without it Excel on Windows decodes the file as the legacy
//      ANSI codepage and every Kurdish/Arabic description turns into mojibake.
//   2. CRLF line endings, per RFC 4180 — Excel treats a bare LF inside a quoted
//      field inconsistently across versions.
//   3. Formula neutralisation. A description that starts with = + - or @ is
//      interpreted by Excel as a formula, which is both a corrupted cell and a
//      genuine injection vector (CSV injection) since descriptions are free
//      text typed by staff.

export const CSV_BOM = "﻿";

// Values that are already numbers are written bare so Excel parses them as
// numeric — quoting an amount makes Excel treat it as text and it will not sum.
export type CsvValue = string | number | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value == null) return "";
  if (typeof value === "number") {
    // Exact by construction: every money figure in this system is an integer
    // number of IQD, so there is no rounding to apply or lose here.
    return Number.isFinite(value) ? String(value) : "";
  }

  let text = value;
  // Neutralise leading characters Excel would read as a formula. The apostrophe
  // is consumed by Excel on display, so the cell still reads as the original
  // text rather than as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [
    headers.map((h) => escapeCell(h)).join(","),
    ...rows.map((row) => row.map((cell) => escapeCell(cell)).join(",")),
  ];
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

// Content-Disposition with both the plain and RFC 5987 filename, so a branch
// name with non-ASCII characters still downloads under a sensible name.
export function csvResponse(csv: string, filename: string): Response {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
