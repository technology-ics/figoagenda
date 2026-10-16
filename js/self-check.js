import assert from "node:assert/strict";
import { CONFIG } from "./config.js";
import { fetchProgrammeCsv, mapHeaders, parseCsv } from "./data-loader.js";
import { buildProgramme } from "./data-model.js";
import { sessionMatches, createFilterState } from "./filters.js";
import { explainMatch, highlightRanges } from "./search.js";
import { buildIcs, zonedWallTimeToUtc } from "./calendar-export.js";
import { fold, parseDate } from "./utils.js";

const csv = [
  "Session ID,Session Title,Session type,Stream,Subtopic,Special topics,Session language,Session description,Date,Session Start,Session End,Room,Presentation ID,Presentation Title,Presentation order,Segment ID,Segment Type,Segment Title,Agenda Start,Personal Title,First Name,Last Name,Role,Author affiliation name,Host Organisation",
  'FIGO-1,"Hello, world",Workshop,Gynaecology,Fibroids,"Obesity; Anaemia",English,"A description",31 Oct 2027,09:00,10:00,Room A,,,,,,,,Dr,Ann,Lee,Moderator,Hospital A,',
  'FIGO-1,"Hello, world",Workshop,Gynaecology,Fibroids,"Obesity; Anaemia",English,"A description",31 Oct 2027,09:00,10:00,Room A,P1,"Talk, one",1,A1,Presentation,"Talk, one",09:10,Dr,Lucía,Kim,Speaker,Clinic B,',
  'FIGO-1,"Hello, world",Workshop,Gynaecology,Fibroids,"Obesity; Anaemia",English,"A description",31 Oct 2027,09:00,10:00,Room A,,,,A2,Break,Coffee,10:40,,,,,,',
  'FIGO-1,"Different title",Plenary,Gynaecology,Fibroids,,English,"Other",31 Oct 2027,09:00,10:00,Room B,,,,,,,,,,,,,,',
].join("\n");

const parsed = parseCsv(csv);
const headers = mapHeaders(parsed.headers);
const programme = buildProgramme(parsed.records, headers);

assert.equal(programme.sessions.length, 1, "rows group into sessions");
assert.equal(programme.hasHostOrganisation, true);
const first = programme.sessions.find((session) => session.id === "FIGO-1");
assert.equal(first.hostOrganisation, "");
assert.equal(first.people.length, 1, "session moderator is not a presentation");
assert.equal(first.people[0].name, "Dr Ann Lee");
assert.equal(first.agenda.filter((item) => item.kind === "presentation").length, 1);
assert.deepEqual(first.specialTopics, ["Obesity", "Anaemia"]);
assert.equal(first.agenda.some((item) => item.type === "Break"), true);
assert.ok(programme.issues.some((issue) => issue.code === "contradictory-session"));
assert.equal(parseDate("31 Oct 2027"), "2027-10-31");
assert.equal(parseDate("03 Nov 2027"), "2027-11-03");
assert.equal(fold("Lucía"), fold("lucia"));

const filters = createFilterState();
assert.equal(sessionMatches(first, { query: "lucia kim", filters, date: "all" }), true);
const speakerHit = explainMatch(first, "Lucía Kim");
assert.equal(speakerHit.rank, 2);
assert.equal(speakerHit.hits[0].kind, "person");
assert.equal(speakerHit.hits[0].name, "Dr Lucía Kim");
assert.match(speakerHit.hits[0].activityTitle, /Talk, one/);
const titleHit = explainMatch(first, "Hello, world");
assert.equal(titleHit.rank, 1);
assert.deepEqual(highlightRanges("Dr Lucía Kim", "lucia"), [[3, 8]]);
const timed = first.agenda.filter((item) => item.startMinutes != null);
assert.ok(timed.every((item, index) => index === 0 || item.startMinutes >= timed[index - 1].startMinutes));
assert.equal(sessionMatches(first, { query: "missing person", filters, date: "all" }), false);
filters.specials.add("Pain");
assert.equal(sessionMatches(first, { query: "", filters, date: "all" }), false);

const multiline = parseCsv('Session ID,Session Title\nS1,"Line one\nLine two"\n');
assert.equal(multiline.records[0]["Session Title"], "Line one\nLine two");

const summer = zonedWallTimeToUtc("2027-10-31", "09:00");
assert.equal(summer.toISOString(), "2027-10-31T13:00:00.000Z");
const stillDaylight = zonedWallTimeToUtc("2027-11-05", "17:30");
assert.equal(stillDaylight.toISOString(), "2027-11-05T21:30:00.000Z");
const winter = zonedWallTimeToUtc("2027-11-08", "09:00");
assert.equal(winter.toISOString(), "2027-11-08T14:00:00.000Z");

const ics = buildIcs({
  id: "FIGO-1",
  date: "2027-10-31",
  start: "09:00",
  end: "12:30",
  title: { source: "Hello, world" },
  description: { source: "A description" },
  room: "Room A",
  timeZone: "America/Montreal",
}, "https://example.org/?session=FIGO-1");
assert.match(ics, /DTSTART;TZID=America\/Montreal:20271031T090000/);
assert.match(ics, /DTEND;TZID=America\/Montreal:20271031T123000/);
assert.match(ics, /SUMMARY:Hello\\, world/);
assert.doesNotMatch(ics, /20271031T130000/);

const liveText = await fetchProgrammeCsv(CONFIG.csvUrl);
const liveParsed = parseCsv(liveText);
const liveHeaders = mapHeaders(liveParsed.headers);
const live = buildProgramme(liveParsed.records, liveHeaders);
const ids = new Set(live.sessions.map((session) => session.id));

assert.equal(liveParsed.headers.length, 41);
assert.equal(live.hasHostOrganisation, false);
assert.ok(liveHeaders.missing.includes("hostOrganisation"));
assert.equal(live.unknownHeaders.length, 0);
assert.equal(ids.size, live.sessions.length);
assert.equal(live.sessions.length, 151);
assert.equal(live.issues.filter((issue) => issue.code === "contradictory-session").length, 0);
assert.equal(live.sessions.filter((session) => session.hostOrganisation).length, 0);
assert.ok(live.sessions.every((session) => session.timeZone === "America/Montreal"));

const moderator = live.sessions.find((session) => session.id === "FIGO27-S0001");
assert.equal(moderator.people.some((person) => person.role === "Moderator"), true);
assert.equal(moderator.agenda.filter((item) => item.kind === "presentation").length, 4);

console.log(JSON.stringify({
  rows: live.rowCount,
  sessions: live.sessions.length,
  presentations: live.sessions.reduce((total, session) => total + session.agenda.filter((item) => item.kind === "presentation").length, 0),
  missingFields: live.missingFields,
  unknownHeaders: live.unknownHeaders,
  issueCounts: live.issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {}),
  streams: [...new Set(live.sessions.map((session) => session.stream))],
  dates: [...new Set(live.sessions.map((session) => session.date))],
}, null, 2));
