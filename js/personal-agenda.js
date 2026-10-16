import { CONFIG } from "./config.js";
import { createSessionCard } from "./agenda-list.js";
import { localContent } from "./translations.js";
import { el, readStorage, writeStorage } from "./utils.js";

export function loadSavedIds() {
  try {
    const parsed = JSON.parse(readStorage(CONFIG.storageKeys.agenda, "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && id.length > 0 && id.length < 200);
  } catch {
    return [];
  }
}

export function saveSavedIds(ids) {
  writeStorage(CONFIG.storageKeys.agenda, JSON.stringify(ids));
}

export function findConflicts(sessions) {
  const conflicts = new Map();
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (!a.date || a.date !== b.date || a.startMinutes == null || b.startMinutes == null) continue;
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        if (!conflicts.has(a.id)) conflicts.set(a.id, []);
        if (!conflicts.has(b.id)) conflicts.set(b.id, []);
        conflicts.get(a.id).push(b);
        conflicts.get(b.id).push(a);
      }
    }
  }
  return conflicts;
}

export function renderPersonalAgenda(container, sessionsById, savedIds, options) {
  const { language, t, selectedId, onSelect, onRemove, onBack } = options;
  if (onBack) container.append(el("button", { type: "button", class: "text-button back-button", text: t("backToProgramme"), onClick: onBack }));
  container.append(el("h2", { text: t("viewingAgenda") }));
  container.append(el("p", { class: "intro", text: t("agendaIntro") }));

  const available = [];
  const missing = [];
  for (const id of savedIds) {
    const session = sessionsById.get(id);
    if (session) available.push(session);
    else missing.push(id);
  }
  available.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.startMinutes ?? 0) - (b.startMinutes ?? 0));

  const conflicts = findConflicts(available);
  if (conflicts.size) {
    const pairCount = [...conflicts.values()].reduce((total, list) => total + list.length, 0) / 2;
    container.append(el("p", {
      class: "conflict-summary",
      role: "status",
      text: pairCount === 1 ? t("conflictSummaryOne") : t("conflictSummaryMany", { count: pairCount }),
    }));
  }

  if (!available.length && !missing.length) {
    container.append(el("div", { class: "empty-state" }, el("p", { text: t("agendaEmpty") }), el("p", { text: t("agendaEmptyHint") })));
    return;
  }

  const list = el("div", { class: "session-list" });
  for (const session of available) {
    const wrap = el("div", { class: "agenda-item" });
    wrap.append(createSessionCard(session, { language, t, selectedId, saved: true, showDate: true, onSelect }));
    const others = conflicts.get(session.id) || [];
    if (others.length) {
      const titles = others.map((other) => localContent(other.title, language)).join("; ");
      wrap.append(el("p", { class: "conflict-note" }, el("strong", { text: t("conflict") }), ` — ${t("conflictWith", { titles })}`));
    }
    list.append(wrap);
  }
  container.append(list);

  if (missing.length) {
    const section = el("section", { class: "missing-saved" });
    for (const id of missing) {
      section.append(el("article", { class: "session-card missing-card" },
        el("div", {},
          el("h3", { text: t("unavailableTitle") }),
          el("p", { text: t("unavailableBody") }),
          el("p", { class: "missing-id", text: id }),
        ),
        el("button", { type: "button", class: "secondary-button", text: t("remove"), onClick: () => onRemove(id) }),
      ));
    }
    container.append(section);
  }
}
