import { CONFIG } from "./config.js";
import { fold, normalizeApostrophe, parseDate, parseTime, unique } from "./utils.js";

/**
 * Build one session per Session ID.
 * Repeated rows are presentations, agenda segments or people — not extra sessions.
 * A person with no presentation ID and no segment ID is a session-level role, not a timed presentation.
 */
export function buildProgramme(records, headerInfo) {
  const { map, translated } = headerInfo;
  const sessions = new Map();
  const issues = [];
  const presentationOwners = new Map();
  let fallbackCount = 0;

  const cell = (record, key) => String(record[map[key]] ?? "").trim();
  const variants = (record, key) => {
    const entry = { source: cell(record, key) };
    const headers = translated[key] || {};
    for (const [language, header] of Object.entries(headers)) {
      entry[language] = String(record[header] ?? "").trim();
    }
    return entry;
  };

  records.forEach((record, index) => {
    let id = cell(record, "sessionId");
    let idReliable = true;
    if (!id) {
      fallbackCount += 1;
      id = `missing-session-id-${fallbackCount}`;
      idReliable = false;
      issues.push({ code: "missing-session-id", sessionId: id, row: index + 2 });
    }

    let session = sessions.get(id);
    if (!session) {
      session = createSession(record, id, idReliable, cell, variants);
      sessions.set(id, session);
      validateSession(session, issues);
    } else if (coreSnapshot(record, cell, variants) !== session.coreSnapshot) {
      issues.push({ code: "contradictory-session", sessionId: id, row: index + 2 });
    }

    const person = readPerson(record, cell);
    const presentationId = cell(record, "presentationId");
    const segmentId = cell(record, "segmentId");

    if (presentationId) {
      const owner = presentationOwners.get(presentationId);
      if (owner && owner !== id) {
        issues.push({ code: "presentation-session-conflict", sessionId: id, presentationId, row: index + 2 });
      } else {
        presentationOwners.set(presentationId, id);
      }

      let presentation = session.presentations.get(presentationId);
      if (!presentation) {
        presentation = createPresentation(record, presentationId, cell, variants);
        session.presentations.set(presentationId, presentation);
      } else if (presentationConflict(presentation, record, cell, variants)) {
        issues.push({ code: "presentation-conflict", sessionId: id, presentationId, row: index + 2 });
      }
      if (person) addPerson(presentation.people, person);
      if (segmentId) presentation.segmentId = segmentId;
    }

    if (segmentId) {
      let segment = session.segments.get(segmentId);
      if (!segment) {
        segment = createSegment(record, segmentId, cell, variants);
        session.segments.set(segmentId, segment);
      }
      if (person) addPerson(segment.people, person);
      if (presentationId) segment.presentationId = presentationId;
    }

    if (person && !presentationId && !segmentId) {
      addPerson(session.people, person);
    }
  });

  const list = [...sessions.values()].map((session) => finaliseSession(session));
  list.sort(compareSessions);

  return {
    sessions: list,
    issues,
    missingFields: headerInfo.missing,
    unknownHeaders: headerInfo.unknown,
    hasHostOrganisation: Boolean(map.hostOrganisation),
    rowCount: records.length,
  };
}

function createSession(record, id, idReliable, cell, variants) {
  const start = parseTime(cell(record, "sessionStart"));
  const end = parseTime(cell(record, "sessionEnd"));
  const durationValue = Number(cell(record, "sessionDuration"));
  const session = {
    id,
    idReliable,
    number: cell(record, "sessionNumber"),
    title: variants(record, "sessionTitle"),
    description: variants(record, "sessionDescription"),
    type: cell(record, "sessionType"),
    format: cell(record, "sessionFormat"),
    formatNotes: cell(record, "sessionFormatNotes"),
    stream: normalizeApostrophe(cell(record, "stream")),
    subtopic: cell(record, "subtopic"),
    specialTopics: splitSpecialTopics(cell(record, "specialTopics")),
    language: cell(record, "sessionLanguage"),
    date: parseDate(cell(record, "date")),
    dateRaw: cell(record, "date"),
    start: start?.label || "",
    end: end?.label || "",
    startMinutes: start?.total ?? null,
    endMinutes: end?.total ?? null,
    duration: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null,
    room: cell(record, "room"),
    parallelBlock: cell(record, "parallelBlock"),
    timeZone: cell(record, "timeZone") || CONFIG.timeZone,
    hostOrganisation: cell(record, "hostOrganisation"),
    people: [],
    presentations: new Map(),
    segments: new Map(),
    agenda: [],
    searchText: "",
  };
  session.coreSnapshot = coreSnapshot(record, cell, variants);
  if (!session.duration && session.startMinutes != null && session.endMinutes != null && session.endMinutes > session.startMinutes) {
    session.duration = session.endMinutes - session.startMinutes;
  }
  return session;
}

function createPresentation(record, id, cell, variants) {
  const start = parseTime(cell(record, "presentationStart"));
  const end = parseTime(cell(record, "presentationEnd"));
  const orderText = cell(record, "presentationOrder");
  const order = orderText === "" ? null : Number(orderText);
  return {
    id,
    number: cell(record, "presentationNumber"),
    title: variants(record, "presentationTitle"),
    type: cell(record, "presentationType"),
    order: Number.isFinite(order) ? order : null,
    topic: cell(record, "presentationTopic"),
    length: cell(record, "presentationLength"),
    start: start?.label || "",
    end: end?.label || "",
    startMinutes: start?.total ?? null,
    segmentId: "",
    people: [],
    fingerprint: presentationFingerprint(record, cell, variants),
  };
}

function createSegment(record, id, cell, variants) {
  const start = parseTime(cell(record, "agendaStart"));
  const end = parseTime(cell(record, "agendaEnd"));
  const orderText = cell(record, "segmentNumber");
  const order = orderText === "" ? null : Number(orderText);
  const durationText = cell(record, "agendaDuration");
  const duration = durationText === "" ? null : Number(durationText);
  return {
    id,
    number: Number.isFinite(order) ? order : null,
    type: cell(record, "segmentType"),
    title: variants(record, "segmentTitle"),
    start: start?.label || "",
    end: end?.label || "",
    startMinutes: start?.total ?? null,
    duration: Number.isFinite(duration) ? duration : null,
    presentationId: "",
    people: [],
  };
}

function readPerson(record, cell) {
  const title = cell(record, "personalTitle");
  const firstName = cell(record, "firstName");
  const lastName = cell(record, "lastName");
  const role = cell(record, "role");
  if (!title && !firstName && !lastName) return null;
  return {
    title,
    firstName,
    lastName,
    name: [title, firstName, lastName].filter(Boolean).join(" "),
    role,
    affiliation: cell(record, "affiliation"),
    country: cell(record, "affiliationCountry"),
  };
}

function addPerson(list, person) {
  const key = [person.name, person.role, person.affiliation, person.country].join("|").toLowerCase();
  if (list.some((item) => item.key === key)) return;
  list.push({ ...person, key });
}

function splitSpecialTopics(value) {
  if (!value) return [];
  return unique(value.split(/[;|]/));
}

function coreSnapshot(record, cell, variants) {
  return JSON.stringify([
    variants(record, "sessionTitle").source,
    cell(record, "sessionType"),
    cell(record, "sessionFormat"),
    cell(record, "stream"),
    cell(record, "subtopic"),
    cell(record, "sessionLanguage"),
    cell(record, "date"),
    cell(record, "sessionStart"),
    cell(record, "sessionEnd"),
    cell(record, "room"),
    cell(record, "hostOrganisation"),
    variants(record, "sessionDescription").source,
    cell(record, "specialTopics"),
  ]);
}

function presentationFingerprint(record, cell, variants) {
  return JSON.stringify([
    variants(record, "presentationTitle").source,
    cell(record, "presentationStart"),
    cell(record, "presentationEnd"),
    cell(record, "presentationType"),
  ]);
}

function presentationConflict(presentation, record, cell, variants) {
  return presentation.fingerprint !== presentationFingerprint(record, cell, variants);
}

function validateSession(session, issues) {
  if (!session.title.source) issues.push({ code: "missing-title", sessionId: session.id });
  if (!session.date) issues.push({ code: "invalid-date", sessionId: session.id, value: session.dateRaw });
  if (!session.start || session.startMinutes == null) issues.push({ code: "invalid-time", sessionId: session.id, field: "start" });
  if (!session.end || session.endMinutes == null) issues.push({ code: "invalid-time", sessionId: session.id, field: "end" });
  if (session.startMinutes != null && session.endMinutes != null && session.endMinutes <= session.startMinutes) {
    issues.push({ code: "end-before-start", sessionId: session.id });
  }
  if (!session.stream) issues.push({ code: "missing-stream", sessionId: session.id });
  if (!session.room) issues.push({ code: "missing-room", sessionId: session.id });
  if (!session.idReliable) issues.push({ code: "unreliable-id", sessionId: session.id });
}

function finaliseSession(session) {
  const used = new Set();
  const agenda = [];

  const segments = [...session.segments.values()].sort(compareTimed);
  for (const segment of segments) {
    const presentation = segment.presentationId ? session.presentations.get(segment.presentationId) : null;
    if (presentation) used.add(presentation.id);
    agenda.push({
      id: segment.id,
      kind: presentation ? "presentation" : "segment",
      type: presentation?.type || segment.type,
      title: presentation?.title?.source ? presentation.title : segment.title,
      start: presentation?.start || segment.start,
      end: presentation?.end || segment.end,
      startMinutes: presentation?.startMinutes ?? segment.startMinutes,
      order: presentation?.order ?? segment.number,
      topic: presentation?.topic || "",
      people: mergePeople(presentation?.people || [], segment.people),
    });
  }

  for (const presentation of session.presentations.values()) {
    if (used.has(presentation.id)) continue;
    agenda.push({
      id: presentation.id,
      kind: "presentation",
      type: presentation.type,
      title: presentation.title,
      start: presentation.start,
      end: presentation.end,
      startMinutes: presentation.startMinutes,
      order: presentation.order,
      topic: presentation.topic,
      people: presentation.people,
    });
  }

  agenda.sort(compareTimed);
  session.agenda = agenda;
  session.people.sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));

  const searchParts = [
    session.title.source,
    ...Object.values(session.title),
    session.description.source,
    session.type,
    session.format,
    session.stream,
    session.subtopic,
    session.language,
    session.room,
    session.hostOrganisation,
    ...session.specialTopics,
    ...session.people.map((person) => `${person.name} ${person.affiliation} ${person.country} ${person.role}`),
    ...agenda.map((item) => `${item.title?.source || ""} ${item.topic || ""} ${item.type} ${item.people.map((person) => `${person.name} ${person.affiliation}`).join(" ")}`),
  ];
  session.searchText = fold(searchParts.join(" "));

  delete session.presentations;
  delete session.segments;
  delete session.coreSnapshot;
  return session;
}

function mergePeople(primary, secondary) {
  const people = [];
  for (const person of [...primary, ...secondary]) addPerson(people, person);
  return people;
}

function roleRank(role) {
  const name = String(role || "").toLowerCase();
  if (name === "moderator") return 0;
  if (name === "panelist") return 1;
  if (name === "speaker") return 2;
  return 3;
}

function compareTimed(a, b) {
  const aTime = a.startMinutes ?? 24 * 60;
  const bTime = b.startMinutes ?? 24 * 60;
  if (aTime !== bTime) return aTime - bTime;
  return (a.order ?? a.number ?? 999) - (b.order ?? b.number ?? 999);
}

export function compareSessions(a, b) {
  if (a.date !== b.date) return (a.date || "9999").localeCompare(b.date || "9999");
  const aTime = a.startMinutes ?? 24 * 60;
  const bTime = b.startMinutes ?? 24 * 60;
  if (aTime !== bTime) return aTime - bTime;
  const roomCompare = roomRank(a.room) - roomRank(b.room);
  if (roomCompare) return roomCompare;
  return a.title.source.localeCompare(b.title.source);
}

function roomRank(room) {
  const index = CONFIG.roomOrder.indexOf(room);
  return index === -1 ? 1000 : index;
}

export function streamStyle(stream) {
  const name = normalizeApostrophe(stream);
  return CONFIG.streams[name] || { ...CONFIG.fallbackStream, code: name.slice(0, 3).toUpperCase() || "—" };
}

export function orderedStreamNames(sessions) {
  const present = new Set(sessions.map((session) => session.stream).filter(Boolean));
  const known = Object.keys(CONFIG.streams).filter((name) => present.has(name));
  const extra = [...present].filter((name) => !CONFIG.streams[name]).sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}
