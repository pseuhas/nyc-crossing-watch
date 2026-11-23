// A dated operator advisory, not a live feed or an assertion about any other outage.
export const TRAM_OVERHAUL = Object.freeze({
  source: 'https://www.rioc.ny.gov/news-and-events/advisories/92',
  announcedLocalDate: '2026-11-21',
  startsLocalDate: '2027-01-02',
  endsLocalDateInclusive: '2027-02-26',
  plannedCabins: 1,
  plannedHeadwayMinutes: 15,
});

const easternDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function tramOverhaulState(instantMs) {
  if (!Number.isFinite(instantMs) || !Number.isFinite(new Date(instantMs).getTime())) return null;
  const parts = Object.fromEntries(easternDay.formatToParts(instantMs).map(({ type, value }) => [type, value]));
  const date = [parts.year.padStart(4, '0'), parts.month, parts.day].join('-');
  if (date < TRAM_OVERHAUL.announcedLocalDate || date > TRAM_OVERHAUL.endsLocalDateInclusive) return null;
  return date < TRAM_OVERHAUL.startsLocalDate ? 'upcoming' : 'in-window';
}

export function tramOverhaulCopy(instantMs) {
  const state = tramOverhaulState(instantMs);
  if (!state) return '';
  const label = state === 'upcoming' ? 'Planned maintenance, Jan 2–Feb 26, 2027' : 'Maintenance schedule through Feb 26, 2027';
  return label + ': RIOC plans one cabin every 15 minutes. This is not a live departure.';
}
