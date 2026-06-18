/**
 * Minimal iCalendar (.ics) builder for exporting a task as a calendar event.
 * Times are emitted as "floating" local time (no Z / TZID) so the event shows
 * at the same wall-clock in whatever calendar imports it — adequate for a task
 * reminder and free of timezone-conversion bugs.
 */

export interface CalEvent {
  uid: string;
  title: string;
  description?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM — omitted (with allDay) for an all-day event. */
  start?: string;
  /** HH:MM */
  end?: string;
  allDay?: boolean;
}

const compactDate = (d: string) => d.replace(/-/g, ""); // 2026-06-23 → 20260623
const compactTime = (t: string) => `${t.replace(":", "")}00`; // 09:00 → 090000

function addDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Escape per RFC 5545 (backslash, comma, semicolon, newline). */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long content lines to ≤75 octets (CRLF + single space continuation). */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

/** UTC timestamp in iCal basic format (for DTSTAMP). */
export function icsStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildICS(e: CalEvent, dtstamp: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AROCO//Tareas//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dtstamp}`,
  ];

  if (e.allDay || !e.start) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDay(e.date))}`);
  } else {
    lines.push(`DTSTART:${compactDate(e.date)}T${compactTime(e.start)}`);
    const end = e.end && e.end > e.start ? e.end : e.start;
    lines.push(`DTEND:${compactDate(e.date)}T${compactTime(end)}`);
  }

  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}
