import { fold } from "./utils.js";

export function searchTokens(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** Accent-insensitive, case-insensitive search across the prepared session text. */
export function matchesQuery(session, query) {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  return tokens.every((token) => session.searchText.includes(token));
}

/** Character ranges in the original text that correspond to the query tokens. */
export function highlightRanges(text, query) {
  const tokens = searchTokens(query);
  const source = String(text || "");
  if (!tokens.length || !source) return [];
  const map = [];
  let folded = "";
  for (let index = 0; index < source.length; index += 1) {
    const piece = fold(source[index]);
    for (let offset = 0; offset < piece.length; offset += 1) {
      folded += piece[offset];
      map.push(index);
    }
  }
  const ranges = [];
  for (const token of tokens) {
    let from = 0;
    while (from < folded.length) {
      const at = folded.indexOf(token, from);
      if (at === -1) break;
      ranges.push([map[at], map[at + token.length - 1] + 1]);
      from = at + Math.max(token.length, 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function excerptAround(text, query) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const ranges = highlightRanges(source, query);
  if (!ranges.length) return source.slice(0, 160);
  const start = Math.max(0, ranges[0][0] - 48);
  const end = Math.min(source.length, ranges[0][1] + 90);
  const slice = source.slice(start, end).trim();
  return `${start ? "…" : ""}${slice}${end < source.length ? "…" : ""}`;
}

function hasAll(text, tokens) {
  const folded = fold(text);
  return tokens.every((token) => folded.includes(token));
}

function hasPhrase(text, query) {
  const phrase = fold(query).trim();
  return Boolean(phrase) && fold(text).includes(phrase);
}

/**
 * Explain why a session matched, and rank it.
 * 1 exact title, 2 exact person, 3 presentation phrase, 4 partial title or person,
 * 5 host, 6 stream or special topic, 7 description.
 */
export function explainMatch(session, query) {
  const tokens = searchTokens(query);
  if (!tokens.length) return { rank: 0, hits: [] };
  const hits = [];
  const title = session.title?.source || "";
  const titleExact = fold(title) === fold(query).trim();
  if (hasAll(title, tokens)) hits.push({ kind: "title", exact: titleExact, text: title });

  const seenPeople = new Set();
  const addPerson = (person, activity) => {
    if (!person?.name) return;
    const blob = `${person.name} ${person.affiliation || ""} ${person.country || ""}`;
    if (!hasAll(blob, tokens)) return;
    const key = `${fold(person.name)}|${activity?.id || "session"}|${fold(person.role)}`;
    if (seenPeople.has(key)) return;
    seenPeople.add(key);
    hits.push({
      kind: "person",
      exact: hasPhrase(person.name, query),
      role: person.role || "",
      name: person.name,
      activityTitle: activity?.title?.source || "",
      activityStart: activity?.start || "",
      activityEnd: activity?.end || "",
    });
  };
  for (const person of session.people || []) addPerson(person, null);
  for (const item of session.agenda || []) {
    for (const person of item.people || []) addPerson(person, item);
  }

  const seenTitles = new Set();
  for (const item of session.agenda || []) {
    const itemTitle = item.title?.source || "";
    if (!itemTitle || !hasAll(itemTitle, tokens) || seenTitles.has(fold(itemTitle))) continue;
    seenTitles.add(fold(itemTitle));
    hits.push({
      kind: "activity",
      exact: hasPhrase(itemTitle, query),
      text: itemTitle,
      start: item.start || "",
      end: item.end || "",
      type: item.type || "",
    });
  }

  if (session.hostOrganisation && hasAll(session.hostOrganisation, tokens)) {
    hits.push({ kind: "host", text: session.hostOrganisation });
  }
  if (session.stream && hasAll(session.stream, tokens)) hits.push({ kind: "stream", text: session.stream });
  for (const topic of session.specialTopics || []) {
    if (hasAll(topic, tokens)) hits.push({ kind: "topic", text: topic });
  }
  const description = session.description?.source || "";
  if (description && hasAll(description, tokens)) {
    hits.push({ kind: "description", text: excerptAround(description, query) });
  }

  let rank = 8;
  if (hits.some((hit) => hit.kind === "title" && hit.exact)) rank = 1;
  else if (hits.some((hit) => hit.kind === "person" && hit.exact)) rank = 2;
  else if (hits.some((hit) => hit.kind === "activity" && hit.exact)) rank = 3;
  else if (hits.some((hit) => hit.kind === "title" || hit.kind === "person")) rank = 4;
  else if (hits.some((hit) => hit.kind === "host")) rank = 5;
  else if (hits.some((hit) => hit.kind === "stream" || hit.kind === "topic")) rank = 6;
  else if (hits.some((hit) => hit.kind === "description")) rank = 7;

  const people = hits.filter((hit) => hit.kind === "person").sort((a, b) => Number(b.exact) - Number(a.exact));
  const activities = hits.filter((hit) => hit.kind === "activity");
  const rest = hits.filter((hit) => ["host", "stream", "topic"].includes(hit.kind));
  const descriptionHits = hits.filter((hit) => hit.kind === "description");
  const shown = [...people, ...activities, ...rest];
  const display = (shown.length ? shown : descriptionHits).slice(0, 3);
  return { rank, hits: display };
}
