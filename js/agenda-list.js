import { localContent, roleKind, sourceLanguage, translateSessionLanguage } from "./translations.js";
import { explainMatch, highlightRanges } from "./search.js";
import { el, formatIsoDate } from "./utils.js";
import { streamStyle } from "./data-model.js";

export function renderList(container, sessions, options) {
  if (options.ranked) {
    const list = el("div", { class: "session-list" });
    for (const session of sessions) list.append(createSessionCard(session, { ...options, showDate: true }));
    container.append(list);
    return;
  }
  const groups = new Map();
  const undated = [];
  for (const session of sessions) {
    if (!session.date) {
      undated.push(session);
      continue;
    }
    if (!groups.has(session.date)) groups.set(session.date, []);
    groups.get(session.date).push(session);
  }

  for (const date of [...groups.keys()].sort()) {
    container.append(renderGroup(date, groups.get(date), options));
  }
  if (undated.length) container.append(renderGroup("", undated, options));
}

function renderGroup(date, sessions, options) {
  const { language, t } = options;
  const section = el("section", { class: "day-block" });
  const heading = date
    ? formatIsoDate(date, language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : t("timeUnavailable");
  section.append(el("h2", { class: "day-heading", text: heading }));
  const list = el("div", { class: "session-list" });
  for (const session of sessions) list.append(createSessionCard(session, options));
  section.append(list);
  return section;
}

export function createSessionCard(session, options) {
  const { language, t, selectedId, onSelect } = options;
  const saved = options.saved ?? options.savedIds?.includes(session.id);
  const title = localContent(session.title, language) || session.id;
  const selected = session.id === selectedId;
  const article = el("article", {
    class: `session-card${selected ? " is-selected" : ""}`,
    "data-session-id": session.id,
  });
  article.style.borderLeftColor = streamStyle(session.stream).colour;

  const time = el("div", { class: "card-time" });
  if (session.start && session.end) {
    time.append(el("p", { class: "card-hours", text: `${session.start}–${session.end}` }));
  } else {
    time.append(el("p", { class: "card-hours", text: t("timeUnavailable") }));
  }
  if (session.room) {
    time.append(el("p", { class: "card-room", text: session.room, lang: "en", translate: "yes" }));
  }
  if (options.showDate && session.date) {
    time.append(el("p", { class: "card-day", text: formatIsoDate(session.date, language, { weekday: "short", day: "numeric", month: "short" }) }));
  }

  const body = el("div", { class: "card-body" });
  const dateLabel = session.date
    ? formatIsoDate(session.date, language, { weekday: "long", day: "numeric", month: "long" })
    : "";
  const matchText = matchSummary(session, options);
  const button = el("button", {
    type: "button",
    class: "card-title",
    "data-session-id": session.id,
    "aria-label": [title, dateLabel, session.start && session.end ? `${session.start}–${session.end}` : "", session.room, session.stream, matchText].filter(Boolean).join(". "),
    onClick: () => onSelect(session.id),
  });
  const titleNode = el("span", { lang: sourceLanguage(session.language), translate: "yes" });
  fillHighlighted(titleNode, title, options.query || "");
  button.append(titleNode);
  if (selected) button.setAttribute("aria-current", "true");
  body.append(button);

  if (session.hostOrganisation) {
    body.append(el("p", { class: "card-host" },
      el("span", { class: "meta-label", text: t("hostOrganisation") }),
      document.createTextNode(" "),
      el("span", { text: session.hostOrganisation, lang: "en", translate: "yes" }),
    ));
  }

  const tags = el("ul", { class: "tags" });
  if (session.stream) tags.append(streamTag(session.stream));
  if (session.type) tags.append(sourceTag(session.type));
  for (const topic of session.specialTopics) tags.append(sourceTag(topic, "tag-special"));
  if (session.language) tags.append(tag(translateSessionLanguage(session.language, language), "tag-language"));
  if (saved) tags.append(tag(t("saved"), "tag-saved"));
  if (tags.childElementCount) body.append(tags);
  const notes = matchNotes(session, options);
  if (notes) body.append(notes);

  article.append(time, body);
  return article;
}

export function fillHighlighted(node, text, query) {
  const source = String(text || "");
  const ranges = highlightRanges(source, query || "");
  if (!ranges.length) {
    node.append(document.createTextNode(source));
    return;
  }
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) node.append(document.createTextNode(source.slice(cursor, start)));
    node.append(el("mark", { class: "search-hit", text: source.slice(start, end) }));
    cursor = end;
  }
  if (cursor < source.length) node.append(document.createTextNode(source.slice(cursor)));
}

function matchSummary(session, options) {
  if (!options.query?.trim() || !options.t) return "";
  return explainMatch(session, options.query).hits.map((hit) => describeHit(hit, options.t)).join(". ");
}

function matchNotes(session, options) {
  if (!options.query?.trim() || !options.t) return null;
  const { hits } = explainMatch(session, options.query);
  if (!hits.length) return null;
  const list = el("ul", { class: "match-notes" });
  for (const hit of hits) {
    const item = el("li");
    if (hit.kind === "person") {
      const kind = roleKind(hit.role);
      const label = kind === "chair" ? options.t("matchedChair")
        : kind === "moderator" ? options.t("matchedModerator")
        : kind === "panelist" ? options.t("matchedPanelist")
        : kind === "speaker" ? options.t("matchedSpeaker")
        : options.t("matchedPerson");
      item.append(el("span", { class: "match-label", text: `${label}: ` }));
      const name = el("span", { class: "match-detail", translate: "no" });
      fillHighlighted(name, hit.name, options.query);
      item.append(name);
      if (hit.activityTitle) {
        const detail = [hit.activityStart && hit.activityEnd ? `${hit.activityStart}–${hit.activityEnd}` : "", hit.activityTitle].filter(Boolean).join(" · ");
        item.append(el("span", { class: "match-detail", lang: sourceLanguage(session.language), translate: "yes", text: detail }));
      }
    } else {
    item.append(el("span", { class: "match-label", text: describeHit(hit, options.t) }));
    }
    if (hit.kind === "activity") {
      const detail = [hit.start && hit.end ? `${hit.start}–${hit.end}` : "", hit.text].filter(Boolean).join(" · ");
      const line = el("span", { class: "match-detail", lang: "en", translate: "yes" });
      fillHighlighted(line, detail, options.query);
      item.append(line);
    } else if (hit.kind === "description") {
      const line = el("span", { class: "match-detail", lang: "en", translate: "yes" });
      fillHighlighted(line, hit.text, options.query);
      item.append(line);
    }
    list.append(item);
  }
  return list;
}

function describeHit(hit, t) {
  if (hit.kind === "person") {
    const kind = roleKind(hit.role);
    const label = kind === "chair" ? t("matchedChair")
      : kind === "moderator" ? t("matchedModerator")
      : kind === "panelist" ? t("matchedPanelist")
      : kind === "speaker" ? t("matchedSpeaker")
      : t("matchedPerson");
    return `${label}: ${hit.name}`;
  }
  if (hit.kind === "activity") return t("matchedPresentation");
  if (hit.kind === "host") return `${t("matchedHost")}: ${hit.text}`;
  if (hit.kind === "stream") return `${t("matchedStream")}: ${hit.text}`;
  if (hit.kind === "topic") return `${t("matchedTopic")}: ${hit.text}`;
  if (hit.kind === "description") return t("matchedDescription");
  return "";
}

export function streamTag(stream) {
  const style = streamStyle(stream);
  const item = el("li", { class: "tag tag-stream" });
  item.style.backgroundColor = style.colour;
  item.append(
    el("span", { class: "tag-code", text: style.code, translate: "no" }),
    el("span", { text: stream, lang: "en", translate: "yes" }),
  );
  return item;
}

function sourceTag(text, className = "") {
  return el("li", { class: `tag ${className}`.trim(), text, lang: "en", translate: "yes" });
}

function tag(text, className = "") {
  return el("li", { class: `tag ${className}`.trim(), text });
}
