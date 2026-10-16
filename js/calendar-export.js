import { CONFIG } from "./config.js";

/**
 * Convert a Montréal wall-clock time to a UTC Date.
 * The visitor's own time zone is not used. DST is resolved for the session date.
 */
export function zonedWallTimeToUtc(isoDate, time, timeZone = CONFIG.timeZone) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  let utc = Date.UTC(year, month - 1, day, hours, minutes, 0);

  for (let pass = 0; pass < 3; pass += 1) {
    const offset = timeZoneOffset(utc, timeZone);
    const next = Date.UTC(year, month - 1, day, hours, minutes, 0) - offset;
    if (next === utc) break;
    utc = next;
  }

  return new Date(utc);
}

export function timeZoneOffset(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return asUtc - utcMs;
}

export function canExport(session) {
  return Boolean(session.date && session.start && session.end && session.startMinutes != null && session.endMinutes > session.startMinutes);
}

export function googleCalendarUrl(session, pageUrl) {
  const start = zonedWallTimeToUtc(session.date, session.start, session.timeZone || CONFIG.timeZone);
  const end = zonedWallTimeToUtc(session.date, session.end, session.timeZone || CONFIG.timeZone);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const details = [session.description?.source, pageUrl].filter(Boolean).join("\n\n").slice(0, 1800);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: session.title?.source || "FIGO session",
    dates: `${stamp(start)}/${stamp(end)}`,
    ctz: CONFIG.timeZone,
  });
  if (session.room) params.set("location", session.room);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(session, pageUrl) {
  const zone = session.timeZone || CONFIG.timeZone;
  const stamp = toIcsUtc(new Date());
  const start = session.start.replace(":", "") + "00";
  const end = session.end.replace(":", "") + "00";
  const date = session.date.replace(/-/g, "");
  const description = [session.description?.source, pageUrl ? `Link: ${pageUrl}` : ""].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FIGO Montreal 2027//Scientific Programme//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:America/Montreal",
    "X-LIC-LOCATION:America/Montreal",
    "BEGIN:DAYLIGHT",
    "DTSTART:20070311T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:20071104T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${session.id}@figo-montreal-2027`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${zone}:${date}T${start}`,
    `DTEND;TZID=${zone}:${date}T${end}`,
    `SUMMARY:${escapeIcs(session.title?.source || "FIGO session")}`,
  ];
  if (session.room) lines.push(`LOCATION:${escapeIcs(session.room)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  if (pageUrl) lines.push(`URL:${escapeIcs(pageUrl)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function downloadIcs(session, pageUrl) {
  const file = new Blob([buildIcs(session, pageUrl)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(file);
  link.href = url;
  link.download = `${session.id || "session"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\r\n|\n|\r/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldIcsLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  let result = "";
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    if (size + charSize > 75) {
      result += "\r\n ";
      size = 1;
    }
    result += char;
    size += charSize;
  }
  return result;
}
