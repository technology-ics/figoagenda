import { localContent, roleKind, roleLabel, sourceLanguage, translateSessionLanguage } from "./translations.js";
import { el, fold, formatIsoDate } from "./utils.js";
import { streamTag, fillHighlighted } from "./agenda-list.js";
import { canExport, downloadIcs, googleCalendarUrl } from "./calendar-export.js";

export function renderSessionDialog(dialog, session, options) {
  const { language, t, saved, onToggleSave, pageUrl, query = "" } = options;
  const title = localContent(session.title, language) || session.id;
  const lang = sourceLanguage(session.language);
  dialog.replaceChildren();

  const header = el("div", { class: "dialog-header" });
  header.append(el("button", {
    type: "button",
    class: "dialog-close text-button",
    text: t("close"),
    "aria-label": t("closeSession"),
    onClick: () => dialog.close(),
  }));
  const heading = el("h2", { id: "dialog-title", lang, translate: "yes" });
  fillHighlighted(heading, title, query);
  header.append(heading);
  dialog.append(header);

  const body = el("div", { class: "dialog-body" });
  body.append(whenLine(session, language));
  if (session.hostOrganisation) {
    const host = el("p", { class: "host-line" }, el("span", { class: "meta-label", text: t("hostOrganisation") }), document.createTextNode(" "));
    const hostName = el("span", { lang: "en", translate: "yes" });
    fillHighlighted(hostName, session.hostOrganisation, query);
    host.append(hostName);
    body.append(host);
  }
  const tags = detailTags(session, language, t);
  if (tags.childElementCount) body.append(tags);
  body.append(actionRow(session, { t, saved, onToggleSave, pageUrl }));
  body.append(leadershipBlock(session, t, query));

  const description = localContent(session.description, language);
  if (description) {
    body.append(el("h3", { text: t("description") }));
    for (const paragraph of description.split(/\n+/)) {
      const text = paragraph.trim();
      if (!text) continue;
      const copy = el("p", { lang, translate: "yes" });
      fillHighlighted(copy, text, query);
      body.append(copy);
    }
  }

  body.append(programmeBlock(session, language, lang, t, query));
  if (session.formatNotes) body.append(el("p", { class: "hint", lang: "en", translate: "yes", text: session.formatNotes }));
  dialog.append(body);
}

export function sessionPageUrl(sessionId) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  url.hash = "";
  return url.toString();
}

function whenLine(session, language) {
  const line = el("p", { class: "when-line" });
  const parts = [];
  if (session.date) {
    parts.push(el("span", {
      text: formatIsoDate(session.date, language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    }));
  }
  if (session.start && session.end) parts.push(el("span", { text: `${session.start}–${session.end}` }));
  if (session.room) parts.push(el("span", { text: session.room, lang: "en", translate: "yes" }));
  parts.forEach((part, index) => {
    if (index) line.append(document.createTextNode(" · "));
    line.append(part);
  });
  return line;
}

function detailTags(session, language, t) {
  const tags = el("ul", { class: "tags detail-tags" });
  if (session.stream) tags.append(streamTag(session.stream));
  for (const topic of session.specialTopics) tags.append(el("li", { class: "tag tag-special", text: topic, lang: "en", translate: "yes" }));
  if (session.type) tags.append(el("li", { class: "tag", text: session.type, lang: "en", translate: "yes" }));
  if (session.format) tags.append(el("li", { class: "tag", text: session.format, lang: "en", translate: "yes" }));
  if (session.subtopic) tags.append(el("li", { class: "tag tag-subtopic", text: session.subtopic, lang: "en", translate: "yes" }));
  if (session.language) tags.append(el("li", { class: "tag tag-language", text: translateSessionLanguage(session.language, language) }));
  if (session.duration) tags.append(el("li", { class: "tag", text: formatDuration(session.duration, t) }));
  return tags;
}

function actionRow(session, { t, saved, onToggleSave, pageUrl }) {
  const row = el("div", { class: "dialog-actions" });
  row.append(el("button", {
    type: "button",
    class: saved ? "secondary-button" : "primary-button",
    text: saved ? t("removeAgenda") : t("addAgenda"),
    onClick: () => onToggleSave(session.id),
  }));

  if (canExport(session)) {
    const menu = el("details", { class: "calendar-menu" });
    const summary = el("summary", { class: "secondary-button", text: t("addCalendar") });
    const choices = el("div", { class: "calendar-choices" });
    choices.append(el("a", {
      href: googleCalendarUrl(session, pageUrl),
      target: "_blank",
      rel: "noopener noreferrer",
      text: t("googleCalendar"),
    }));
    choices.append(el("button", {
      type: "button",
      text: t("downloadIcs"),
      onClick: () => downloadIcs(session, pageUrl),
    }));
    menu.append(summary, choices);
    row.append(menu);
  } else {
    row.append(el("p", { class: "hint", text: t("noTimeForCalendar") }));
  }

  row.append(el("button", {
    type: "button",
    class: "text-button",
    text: t("copyLink"),
    onClick: (event) => copyLink(pageUrl, event.currentTarget, t),
  }));
  return row;
}

async function copyLink(pageUrl, button, t) {
  try {
    await navigator.clipboard.writeText(pageUrl);
    const original = button.textContent;
    button.textContent = t("linkCopied");
    window.setTimeout(() => {
      button.textContent = original;
    }, 2000);
  } catch {
    const field = el("input", { class: "link-fallback", readonly: "readonly", value: pageUrl, "aria-label": t("copyLink") });
    button.after(field);
    field.focus();
    field.select();
  }
}

function leadershipBlock(session, t, query) {
  const { chairs, moderators } = collectLeadership(session);
  if (!chairs.length && !moderators.length) return document.createDocumentFragment();
  const section = el("section", { class: `leadership${chairs.length && moderators.length ? " has-both" : ""}` });
  if (chairs.length) section.append(leaderGroup(chairs, t("roleChair"), t("roleChairs"), query));
  if (moderators.length) section.append(leaderGroup(moderators, t("roleModerator"), t("roleModerators"), query));
  return section;
}

function leaderGroup(people, singular, plural, query) {
  const group = el("div", { class: "leader-group" });
  group.append(el("h3", { text: people.length > 1 ? plural : singular }));
  const list = el("ul", { class: "leaders" });
  for (const person of people) {
    const item = el("li", { class: "leader" });
    const name = el("span", { class: "person-name", translate: "no" });
    fillHighlighted(name, person.name, query);
    item.append(name);
    const affiliation = formatAffiliation(person);
    if (affiliation) item.append(el("span", { class: "person-aff", text: affiliation, lang: "en", translate: "yes" }));
    list.append(item);
  }
  group.append(list);
  return group;
}

function collectLeadership(session) {
  const chairs = [];
  const moderators = [];
  const seen = new Set();
  const add = (person) => {
    const kind = roleKind(person.role);
    if (kind !== "chair" && kind !== "moderator") return;
    const key = `${kind}|${fold(person.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    (kind === "chair" ? chairs : moderators).push(person);
  };
  for (const person of session.people || []) add(person);
  for (const item of session.agenda || []) {
    for (const person of item.people || []) add(person);
  }
  return { chairs, moderators };
}

function programmeBlock(session, language, contentLang, t, query) {
  const fragment = document.createDocumentFragment();
  const timed = [];
  const untimed = [];
  for (const item of session.agenda || []) {
    if (item.startMinutes == null && !item.start) untimed.push(item);
    else timed.push(item);
  }
  timed.sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0) || (a.order ?? 999) - (b.order ?? 999));
  if (timed.length) fragment.append(el("h3", { text: t("runningOrder") }), activityList(timed, language, contentLang, query, true));
  if (untimed.length) fragment.append(el("h3", { text: t("untimedHeading") }), activityList(untimed, language, contentLang, query, false));
  return fragment;
}

function activityList(items, language, contentLang, query, showTime) {
  const list = el("ol", { class: "agenda" });
  for (const item of items) {
    const title = localContent(item.title, language);
    const titleNode = el("p", { class: "agenda-title", lang: contentLang, translate: "yes" });
    if (title) fillHighlighted(titleNode, title, query);
    const row = el("li", { class: "agenda-item-row" },
      showTime && item.start && item.end ? el("p", { class: "agenda-time", text: `${item.start}–${item.end}` }) : null,
      item.type && fold(item.type) !== fold(title) ? el("p", { class: "agenda-type", text: item.type, lang: "en", translate: "yes" }) : null,
      title ? titleNode : null,
      item.people?.length ? activityPeople(item.people, language, query) : null,
    );
    list.append(row);
  }
  return list;
}

function activityPeople(people, language, query) {
  const groups = new Map();
  for (const person of people) {
    const key = fold(person.role) || "participant";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(person);
  }
  const wrap = el("div", { class: "activity-people" });
  for (const list of groups.values()) {
    const line = el("p", { class: "agenda-person" });
    const label = roleLabel(list[0].role, list.length, language);
    if (label) line.append(el("span", { class: "person-role", text: `${label}:` }), document.createTextNode(" "));
    list.forEach((person, index) => {
      if (index) line.append(document.createTextNode(", "));
      const name = el("span", { class: "person-name", translate: "no" });
      fillHighlighted(name, person.name, query);
      line.append(name);
      const affiliation = formatAffiliation(person);
      if (affiliation) line.append(document.createTextNode(" "), el("span", { class: "person-aff", text: affiliation, lang: "en", translate: "yes" }));
    });
    wrap.append(line);
  }
  return wrap;
}

function formatAffiliation(person) {
  if (person.affiliation && person.country && !fold(person.affiliation).includes(fold(person.country))) {
    return `${person.affiliation} · ${person.country}`;
  }
  return person.affiliation || person.country || "";
}

function formatDuration(minutes, t) {
  if (minutes < 60) return t("minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("hours", { hours, minutes: rest }) : t("hoursOnly", { hours });
}
