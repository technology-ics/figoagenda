import { localContent, translateSessionLanguage } from "./translations.js";
import { el, formatIsoDate } from "./utils.js";
import { streamStyle } from "./data-model.js";

export function renderList(container, sessions, options) {
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
  section.append(el("h2", { text: heading }));
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
  const article = el("article", { class: `session-card${selected ? " is-selected" : ""}`, "data-session-id": session.id });
  const style = streamStyle(session.stream);
  article.style.borderLeftColor = style.colour;

  const time = el("div", { class: "card-time" });
  if (session.start && session.end) {
    time.append(el("p", { class: "card-hours", text: `${session.start}–${session.end}` }));
  } else {
    time.append(el("p", { class: "card-hours", text: t("timeUnavailable") }));
  }
  if (session.room) time.append(el("p", { class: "card-room", text: session.room }));
  if (options.showDate && session.date) {
    time.append(el("p", { class: "card-day", text: formatIsoDate(session.date, language, { weekday: "short", day: "numeric", month: "short" }) }));
  }

  const body = el("div", { class: "card-body" });
  const button = el("button", {
    type: "button",
    class: "card-title",
    "data-session-id": session.id,
    "aria-label": [title, session.start && session.end ? `${session.start}–${session.end}` : "", session.room, session.stream].filter(Boolean).join(". "),
    onClick: () => onSelect(session.id),
  });
  button.append(el("span", { text: title }));
  if (selected) button.setAttribute("aria-current", "true");
  body.append(button);

  if (session.hostOrganisation) {
    body.append(el("p", { class: "card-host" }, el("span", { class: "meta-label", text: t("hostOrganisation") }), document.createTextNode(` ${session.hostOrganisation}`)));
  }

  const tags = el("ul", { class: "tags" });
  if (session.stream) tags.append(streamTag(session.stream));
  if (session.type) tags.append(tag(session.type));
  if (session.language) tags.append(tag(translateSessionLanguage(session.language, language)));
  for (const topic of session.specialTopics) tags.append(tag(topic, "tag-special"));
  if (saved) tags.append(tag(t("saved"), "tag-saved"));
  if (tags.childElementCount) body.append(tags);

  article.append(time, body);
  return article;
}

export function streamTag(stream) {
  const style = streamStyle(stream);
  const item = el("li", { class: "tag tag-stream", text: `${style.code} · ${stream}` });
  item.style.backgroundColor = style.colour;
  return item;
}

function tag(text, className = "") {
  return el("li", { class: `tag ${className}`.trim(), text });
}
