/** Shared helpers. Spreadsheet text is never interpreted as HTML. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ");
}

export function normalizeApostrophe(value) {
  return String(value ?? "").replace(/[’‘]/g, "'").trim();
}

export function parseTime(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes, label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, total: hours * 60 + minutes };
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Parse a programme date into YYYY-MM-DD. Returns "" when the value is blank or not understood. */
export function parseDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validIso(match[1], match[2], match[3]);

  match = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) return "";
    return validIso(match[3], month, match[1]);
  }

  match = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    // Day/month is the default. Swap only when the first number cannot be a day.
    if (first > 12) return validIso(match[3], second, first);
    return validIso(match[3], second, first);
  }

  return "";
}

function validIso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function formatIsoDate(iso, locale, options) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(date);
}

export function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function compareText(a, b, locale) {
  return String(a).localeCompare(String(b), locale, { sensitivity: "base", numeric: true });
}

export function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing or a full store should not block the programme. */
  }
}

export function slug(value) {
  return fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}
