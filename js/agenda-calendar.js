import { CONFIG } from "./config.js";
import { localContent } from "./translations.js";
import { el, formatIsoDate } from "./utils.js";
import { streamStyle } from "./data-model.js";

export function renderCalendar(container, sessions, options) {
  const { language, t, selectedId, onSelect } = options;
  const dated = new Map();
  const unscheduled = [];

  for (const session of sessions) {
    if (!session.date || session.startMinutes == null || session.endMinutes == null || session.endMinutes <= session.startMinutes) {
      unscheduled.push(session);
      continue;
    }
    if (!dated.has(session.date)) dated.set(session.date, []);
    dated.get(session.date).push(session);
  }

  const dates = [...dated.keys()].sort();
  for (const date of dates) {
    const heading = formatIsoDate(date, language, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const section = el("section", { class: "day-block", "aria-label": t("calendarRegion", { date: heading }) });
    section.append(el("h2", { text: heading }));
    section.append(buildDay(dated.get(date), heading, { language, t, selectedId, onSelect }));
    container.append(section);
  }

  if (unscheduled.length) {
    const section = el("section", { class: "day-block" });
    section.append(el("h2", { text: t("unscheduled") }));
    const list = el("ul", { class: "plain-list" });
    for (const session of unscheduled) {
      const button = el("button", {
        type: "button",
        class: `text-session${session.id === selectedId ? " is-selected" : ""}`,
        text: localContent(session.title, language) || session.id,
        "data-session-id": session.id,
        onClick: () => onSelect(session.id),
      });
      if (session.id === selectedId) button.setAttribute("aria-current", "true");
      list.append(el("li", {}, button));
    }
    section.append(list);
    container.append(section);
  }
}

function buildDay(sessions, heading, { language, t, selectedId, onSelect }) {
  const rooms = roomColumns(sessions);
  const start = Math.floor(Math.min(...sessions.map((session) => session.startMinutes)) / 60) * 60;
  const end = Math.ceil(Math.max(...sessions.map((session) => session.endMinutes)) / 60) * 60;
  const ppm = CONFIG.pixelsPerMinute;
  const trackHeight = (end - start) * ppm;
  const slot = 30 * ppm;

  const scroll = el("div", { class: "cal-scroll" });
  const grid = el("div", { class: "cal-grid" });
  grid.style.gridTemplateColumns = `4.75rem repeat(${rooms.length}, minmax(10.75rem, 1fr))`;
  grid.style.setProperty("--track", `${trackHeight}px`);
  grid.style.setProperty("--slot", `${slot}px`);

  const corner = el("div", { class: "cal-corner" }, el("span", { text: t("timeCorner") }));
  corner.style.gridColumn = "1";
  corner.style.gridRow = "1";
  grid.append(corner);

  rooms.forEach((room, index) => {
    const name = el("div", { class: "cal-room-name", text: room.name });
    name.style.gridColumn = String(index + 2);
    name.style.gridRow = "1";
    grid.append(name);
  });

  const times = el("div", { class: "cal-times" });
  times.style.gridColumn = "1";
  times.style.gridRow = "2";
  for (let minute = start; minute <= end; minute += 30) {
    const label = el("span", { class: "cal-time", text: formatMinute(minute) });
    label.style.top = `${(minute - start) * ppm}px`;
    times.append(label);
  }
  grid.append(times);

  rooms.forEach((room, index) => {
    const track = el("div", { class: "cal-track" });
    track.style.gridColumn = String(index + 2);
    track.style.gridRow = "2";
    const layout = assignLanes(room.sessions);
    for (const item of layout.items) {
      track.append(sessionTile(item, layout.lanes, start, ppm, { language, selectedId, onSelect, heading }));
    }
    grid.append(track);
  });

  scroll.append(grid);
  return scroll;
}

function roomColumns(sessions) {
  const byRoom = new Map();
  for (const session of sessions) {
    const name = session.room || "—";
    if (!byRoom.has(name)) byRoom.set(name, []);
    byRoom.get(name).push(session);
  }
  return [...byRoom.entries()]
    .sort((a, b) => roomRank(a[0]) - roomRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, roomSessions]) => ({ name, sessions: roomSessions }));
}

function roomRank(room) {
  const index = CONFIG.roomOrder.indexOf(room);
  return index === -1 ? 1000 : index;
}

function assignLanes(sessions) {
  const items = [...sessions].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const laneEnds = [];
  const placed = items.map((session) => {
    let lane = laneEnds.findIndex((end) => end <= session.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(session.endMinutes);
    } else {
      laneEnds[lane] = session.endMinutes;
    }
    return { session, lane };
  });
  return { items: placed, lanes: Math.max(1, laneEnds.length) };
}

function sessionTile(item, lanes, dayStart, ppm, { language, selectedId, onSelect, heading }) {
  const { session, lane } = item;
  const style = streamStyle(session.stream);
  const title = localContent(session.title, language) || session.id;
  const selected = session.id === selectedId;
  const button = el("button", {
    type: "button",
    class: `cal-session${selected ? " is-selected" : ""}`,
    "data-session-id": session.id,
    "aria-label": `${title}. ${session.stream}. ${session.room}. ${session.start}–${session.end}. ${heading}`,
    onClick: () => onSelect(session.id),
  });
  button.style.top = `${(session.startMinutes - dayStart) * ppm}px`;
  button.style.height = `${Math.max((session.endMinutes - session.startMinutes) * ppm - 3, 32)}px`;
  button.style.left = `calc(${(100 / lanes) * lane}% + 3px)`;
  button.style.width = `calc(${100 / lanes}% - 6px)`;
  button.style.backgroundColor = style.colour;
  if (selected) button.setAttribute("aria-current", "true");
  button.append(el("span", { class: "cal-code", text: style.code }), el("span", { class: "cal-title", text: title }));
  return button;
}

function formatMinute(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
