import { test } from "node:test";
import assert from "node:assert/strict";
import { buildICS, icsStamp } from "./ics";

const STAMP = "20260618T120000Z";

test("buildICS emits a timed VEVENT", () => {
  const ics = buildICS(
    {
      uid: "abc@aroco",
      title: "Comprar trampas",
      description: "Seis trampas para la bodega",
      date: "2026-06-23",
      start: "09:00",
      end: "11:00",
    },
    STAMP,
  );
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:abc@aroco/);
  assert.match(ics, /DTSTART:20260623T090000/);
  assert.match(ics, /DTEND:20260623T110000/);
  assert.match(ics, /SUMMARY:Comprar trampas/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("buildICS emits an all-day VEVENT spanning one day", () => {
  const ics = buildICS(
    { uid: "x@aroco", title: "Sin hora", date: "2026-06-23", allDay: true },
    STAMP,
  );
  assert.match(ics, /DTSTART;VALUE=DATE:20260623/);
  assert.match(ics, /DTEND;VALUE=DATE:20260624/);
});

test("buildICS escapes commas/semicolons in text", () => {
  const ics = buildICS(
    { uid: "y@aroco", title: "A, B; C", date: "2026-06-23", allDay: true },
    STAMP,
  );
  assert.match(ics, /SUMMARY:A\\, B\\; C/);
});

test("icsStamp formats a UTC basic timestamp", () => {
  assert.equal(icsStamp(new Date("2026-06-18T12:00:00.000Z")), "20260618T120000Z");
});
