import { fold } from "./utils.js";

/** Accent-insensitive, case-insensitive search across the prepared session text. */
export function matchesQuery(session, query) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => session.searchText.includes(token));
}
