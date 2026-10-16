import { matchesQuery } from "./search.js";

export function createFilterState() {
  return {
    streams: new Set(),
    subtopics: new Set(),
    types: new Set(),
    specials: new Set(),
    rooms: new Set(),
    languages: new Set(),
  };
}

export function activeFilterCount(filters) {
  return Object.values(filters).reduce((total, group) => total + group.size, 0);
}

export function clearFilters(filters) {
  for (const group of Object.values(filters)) group.clear();
}

/** A session must match every active group. Within a group, any selected value is enough. */
export function sessionMatches(session, { query, filters, date }) {
  if (date && date !== "all" && session.date !== date) return false;
  if (!matchesQuery(session, query)) return false;
  if (filters.streams.size && !filters.streams.has(session.stream)) return false;
  if (filters.subtopics.size && !filters.subtopics.has(session.subtopic)) return false;
  if (filters.types.size && !filters.types.has(session.type)) return false;
  if (filters.rooms.size && !filters.rooms.has(session.room)) return false;
  if (filters.languages.size && !filters.languages.has(session.language)) return false;
  if (filters.specials.size && !session.specialTopics.some((topic) => filters.specials.has(topic))) return false;
  return true;
}

export function collectFilterOptions(sessions, locale) {
  const sort = (values) => [...values].sort((a, b) => a.localeCompare(b, locale, { sensitivity: "base", numeric: true }));
  return {
    subtopics: sort(new Set(sessions.map((session) => session.subtopic).filter(Boolean))),
    types: sort(new Set(sessions.map((session) => session.type).filter(Boolean))),
    rooms: sort(new Set(sessions.map((session) => session.room).filter(Boolean))),
    languages: sort(new Set(sessions.map((session) => session.language).filter(Boolean))),
    specials: sort(new Set(sessions.flatMap((session) => session.specialTopics))),
  };
}
