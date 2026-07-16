import { LS } from './storage';
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d;
};

// Build a complete ICS file for the whole trip
export const generateICS = ({ trip, itinerary }) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TravelPal//TravelPal v1//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escICS(trip.name||"My Trip")}`,
    `X-WR-CALDESC:${escICS(trip.destination||"")}`,
    "X-WR-TIMEZONE:UTC",
  ];

  // One all-day trip summary event
  if (trip.startDate) {
    const start = addDays(trip.startDate, 0);
    const end   = trip.endDate ? addDays(trip.endDate, 1) : addDays(trip.startDate, 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:travelpal-trip-${trip.startDate}@travelpal`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(end)}`,
      `SUMMARY:✈️ ${escICS(trip.name||"Trip")}${trip.destination?" → "+escICS(trip.destination):""}`,
      `DESCRIPTION:${escICS(trip.destination||"")}`,
      `LOCATION:${escICS(trip.destination||"")}`,
      "END:VEVENT"
    );
  }

  // One all-day event per activity
  itinerary.forEach((day, idx) => {
    if (!trip.startDate) return;
    const dayDate = addDays(trip.startDate, idx);
    const nextDay = addDays(trip.startDate, idx + 1);
    day.activities.forEach((act, ai) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:travelpal-${trip.startDate}-d${idx}-a${ai}@travelpal`,
        `DTSTART;VALUE=DATE:${icsDate(dayDate)}`,
        `DTEND;VALUE=DATE:${icsDate(nextDay)}`,
        `SUMMARY:${escICS(act.text)}`,
        `DESCRIPTION:${escICS(day.label + (trip.name?" · "+trip.name:""))}`,
        `LOCATION:${escICS(trip.destination||"")}`,
        `STATUS:${act.done?"COMPLETED":"CONFIRMED"}`,
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

// Download ICS as a file
export const downloadICS = (icsStr, filename) => {
  const blob = new Blob([icsStr], { type:"text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Google Calendar "Add Event" URL for a single day
export const gcalDayUrl = (day, idx, trip) => {
  if (!trip.startDate) return null;
  const d    = addDays(trip.startDate, idx);
  const dStr = d.toISOString().split("T")[0].replace(/-/g,"");
  const nStr = addDays(trip.startDate, idx+1).toISOString().split("T")[0].replace(/-/g,"");
  const title = `${day.label}${trip.destination?" · "+trip.destination:""}`;
  const desc  = day.activities.map(a=>(a.done?"✓ ":"• ")+a.text).join("\n");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${dStr}/${nStr}` +
    `&details=${encodeURIComponent(desc)}` +
    `&location=${encodeURIComponent(trip.destination||"")}`;
};

// Outlook web "Add Event" URL for a single day
export const outlookDayUrl = (day, idx, trip) => {
  if (!trip.startDate) return null;
  const d     = addDays(trip.startDate, idx);
  const start = d.toISOString().split("T")[0]+"T09:00:00";
  const end   = d.toISOString().split("T")[0]+"T17:00:00";
  const title = `${day.label}${trip.destination?" · "+trip.destination:""}`;
  const body  = day.activities.map(a=>(a.done?"✓ ":"• ")+a.text).join("\n");
  return "https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
    `&subject=${encodeURIComponent(title)}` +
    `&startdt=${encodeURIComponent(start)}` +
    `&enddt=${encodeURIComponent(end)}` +
    `&body=${encodeURIComponent(body)}` +
    `&location=${encodeURIComponent(trip.destination||"")}`;
};

