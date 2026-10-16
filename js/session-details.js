import { localContent, sourceLanguage, translateRole, translateSessionLanguage } from "./translations.js";
import { el, fold, formatIsoDate } from "./utils.js";
import { streamStyle } from "./data-model.js";
import { streamTag } from "./agenda-list.js";
import { canExport, downloadIcs, googleCalendarUrl } from "./calendar-export.js";

export function renderSessionDialog(dialog, session, options) {
  const { language, t, saved, onToggleSave, pageUrl } = options;
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
  header.append(el("h2", { id: "dialog-title", lang, translate: "yes", text: title }));
  dialog.append(header);

  const body = el("div", { class: "dialog-body" });
  body.append(whenLine(session, language));
  if (session.hostOrganisation) {
    body.append(el("p", { class: "host-line" },
      el("span", { class: "meta-label", text: t("hostOrganisation") }),
      document.createTextNode(" "),
      el("span", { text: session.hostOrganisation, lang: "en", translate: "yes" }),
    ));
  }
  const tags = detailTags(session, language, t);
  if (tags.childElementCount) body.append(tags);
  if (session.formatNotes) body.append(el("p", { class: "hint", lang: "en", translate: "yes", text: session.formatNotes }));
  body.append(actionRow(session, { t, saved, onToggleSave, pageUrl }));

  const description = localContent(session.description, language);
  if (description) {
    body.append(el("h3", { text: t("description") }));
    for (const paragraph of description.split(/\n+/)) {
      if (paragraph.trim()) body.append(el("p", { lang, translate: "yes", text: paragraph.trim() }));
    }
  }

  const presentations = session.agenda.filter((item) => item.kind === "presentation");
  const other = session.agenda.filter((item) => item.kind !== "presentation");
  if (presentations.length) body.append(el("h3", { text: t("presentations") }), agendaList(presentations, language, lang));
  if (session.people.length) body.append(el("h3", { text: t("sessionRoles") }), personList(session.people, language));
  if (other.length) body.append(el("h3", { text: t("otherAgenda") }), agendaList(other, language, lang));
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

function personList(people, language) {
  return el("ul", { class: "people" }, ...people.map((person) => personItem(person, language)));
}

function personItem(person, language) {
  const affiliation = formatAffiliation(person);
  return el("li", { class: "person" },
    el("span", { class: "person-name notranslate", text: person.name, translate: "no" }),
    person.role ? el("span", { class: "person-role", text: translateRole(person.role, language) }) : null,
    affiliation ? el("span", { class: "person-aff", text: affiliation, lang: "en", translate: "yes" }) : null,
  );
}

function agendaList(items, language, contentLang) {
  const list = el("ol", { class: "agenda" });
  for (const item of items) {
    const title = localContent(item.title, language);
    list.append(el("li", { class: "agenda-item-row" },
      item.start && item.end ? el("p", { class: "agenda-time", text: `${item.start}–${item.end}` }) : null,
      item.type && fold(item.type) !== fold(title) ? el("p", { class: "agenda-type", text: item.type, lang: "en", translate: "yes" }) : null,
      title ? el("p", { class: "agenda-title", text: title, lang: contentLang, translate: "yes" }) : null,
      item.people?.length ? personList(item.people, language) : null,
    ));
  }
  return list;
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
