/**
 * CSV mínimo y robusto (RFC 4180): comillas, comas o saltos dentro de
 * campos, BOM de Excel y separador "," o ";" (Excel en español usa ";").
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/** Filas → objetos usando la primera fila como encabezado (normalizado). */
export function csvToObjects(text: string) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { headers: [], records: [] as { line: number; values: Record<string, string> }[] };
  const headers = header.map(normalizeHeader);
  return {
    headers,
    records: rows.map((r, i) => ({
      line: i + 2, // línea en el archivo (1 = encabezado)
      values: Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? "").trim()])),
    })),
  };
}

export const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const escape = (v: unknown) => {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Objetos → CSV con BOM (Excel abre bien los acentos). */
export function toCsv(rows: Record<string, unknown>[], headers?: string[]) {
  const cols = headers ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
