import { CONFIG, HEADER_ALIASES, TRANSLATION_SUFFIXES } from "./config.js";
import { normalizeHeader } from "./utils.js";

/**
 * RFC 4180 CSV parser. Keeps quoted commas, embedded line breaks and Unicode text.
 * Spreadsheet cells are returned as plain strings.
 */
export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (char !== "\r") {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length && rows[rows.length - 1].every((cell) => String(cell).trim() === "")) {
    rows.pop();
  }

  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((header) => String(header).trim());
  const records = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (cells.every((cell) => String(cell).trim() === "")) continue;
    const record = {};
    headers.forEach((header, cellIndex) => {
      if (!header) return;
      record[header] = cells[cellIndex] ?? "";
    });
    records.push(record);
  }

  return { headers, records };
}

export function mapHeaders(headers) {
  const available = headers.map((header) => ({ raw: header, key: normalizeHeader(header) }));
  const used = new Set();
  const map = {};

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = available.find((header) => aliases.includes(header.key) && !used.has(header.raw));
    if (found) {
      map[canonical] = found.raw;
      used.add(found.raw);
    }
  }

  const translated = {};
  for (const header of available) {
    if (used.has(header.raw)) continue;
    for (const [canonical, raw] of Object.entries(map)) {
      const base = normalizeHeader(raw);
      if (!header.key.startsWith(base)) continue;
      const suffix = header.key.slice(base.length).trim();
      for (const [language, suffixes] of Object.entries(TRANSLATION_SUFFIXES)) {
        if (suffixes.includes(suffix)) {
          translated[canonical] ??= {};
          translated[canonical][language] = header.raw;
          used.add(header.raw);
        }
      }
    }
  }

  return {
    map,
    translated,
    unknown: available.filter((header) => !used.has(header.raw)).map((header) => header.raw),
    missing: Object.keys(HEADER_ALIASES).filter((key) => !map[key]),
  };
}

export async function fetchProgrammeCsv(url = CONFIG.csvUrl) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.text();
}
