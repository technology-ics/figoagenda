import { localContent, translateRole, translateSessionLanguage } from "./translations.js";
import { el, fold, formatIsoDate } from "./utils.js";
import { streamStyle } from "./data-model.js";
import { canExport, downloadIcs, googleCalendarUrl } from "./calendar-export.js";

export function renderSessionDialog(dialog, session, options) {
  const { language, t, saved, onToggleSave, pageUrl } = options;
  const title = localContent(session.title, language) || session.id;
  const style = streamStyle(session.stream);
  dialog.replaceChildren();

  const header = el("div", { class: "dialog-header" });
  header.append(el("button", {
    type: "button",
    class: "dialog-close",
    text: t("close"),
    "aria-label": t("closeSession"),
    onClick: () => dialog.close(),
  }));
  const titleRow = el("div", { class: "dialog-title-row" });
  if (session.stream) {
    const code = el("span", { class: "cal-code code-inline", text: style.code });
    code.style.backgroundColor = style.colour;
    titleRow.append(code);
  }
  titleRow.append(el("h2", { id: "dialog-title", text: title }));
  header.append(titleRow);
  dialog.append(header);

  const body = el("div", { class: "dialog-body" });
  body.append(actionRow(session, { t, saved, onToggleSave, pageUrl }));
  body.append(metaList(session, language, t));
  if (session.formatNotes) body.append(el("h3", { text: t("formatNotes") }), el("p", { text: session.formatNotes }));

  const description = localContent(session.description, language);
  if (description) {
    body.append(el("h3", { text: t("description") }));
    for (const paragraph of description.split(/\n+/)) {
      if (paragraph.trim()) body.append(el("p", { text: paragraph.trim() }));
    }
  }
  if (session.people.length) body.append(el("h3", { text: t("sessionRoles") }), personList(session.people, language));
  if (session.agenda.length) body.append(el("h3", { text: t("agenda") }), agendaList(session, language));
  dialog.append(body);
}

export function sessionPageUrl(sessionId) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  url.hash = "";
  return url.toString();
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
    row.append(el("button", {
      type: "button",
      class: "secondary-button",
      text: t("downloadIcs"),
      onClick: () => downloadIcs(session, pageUrl),
    }));
    const calendarLink = el("a", {
      class: "secondary-button link-button",
      href: googleCalendarUrl(session, pageUrl),
      target: "_blank",
      rel: "noopener noreferrer",
      text: t("googleCalendar"),
    });
    row.append(calendarLink);
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

function metaList(session, language, t) {
  const rows = [];
  if (session.date) {
    rows.push([t("date"), formatIsoDate(session.date, language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })]);
  }
  if (session.start && session.end) rows.push([t("montrealTime"), `${session.start}–${session.end}`]);
  if (session.duration) rows.push([t("duration"), formatDuration(session.duration, t)]);
  if (session.room) rows.push([t("room"), session.room]);
  if (session.hostOrganisation) rows.push([t("hostOrganisation"), session.hostOrganisation]);
  if (session.type) rows.push([t("sessionType"), session.type]);
  if (session.format) rows.push([t("sessionFormat"), session.format]);
  if (session.stream) rows.push([t("stream"), session.stream]);
  if (session.subtopic) rows.push([t("subtopic"), session.subtopic]);
  if (session.specialTopics.length) rows.push([t("specialTopics"), session.specialTopics.join(" · ")]);
  if (session.language) rows.push([t("sessionLanguage"), translateSessionLanguage(session.language, language)]);

  const list = el("dl", { class: "meta-list" });
  for (const [label, value] of rows) list.append(el("div", {}, el("dt", { text: label }), el("dd", { text: value })));
  return list;
}

function personList(people, language) {
  return el("ul", { class: "people" }, ...people.map((person) => personItem(person, language)));
}

function personItem(person, language) {
  const affiliation = formatAffiliation(person);
  return el("li", { class: "person" },
    el("span", { class: "person-name", text: person.name }),
    person.role ? el("span", { class: "person-role", text: translateRole(person.role, language) }) : null,
    affiliation ? el("span", { class: "person-aff", text: affiliation }) : null,
  );
}

function agendaList(session, language) {
  const list = el("ol", { class: "agenda" });
  list.style.borderColor = streamStyle(session.stream).colour;
  for (const item of session.agenda) {
    const title = localContent(item.title, language);
    list.append(el("li", { class: "agenda-item-row" },
      item.start && item.end ? el("p", { class: "agenda-time", text: `${item.start}–${item.end}` }) : null,
      item.type && fold(item.type) !== fold(title) ? el("p", { class: "agenda-type", text: item.type }) : null,
      title ? el("p", { class: "agenda-title", text: title }) : null,
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
