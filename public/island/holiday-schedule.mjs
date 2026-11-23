// Published New York service-day exceptions, November 2026 only.
// MTA Thanksgiving schedule + F planned work alert lmm:planned_work:36640 (B10).
// See https://www.mta.info/alerts and https://www.rioc.ny.gov/community/transportation/subway.
// Q102 holiday classification: https://www.mta.info/document/10321.
const wed = Date.parse('2026-11-25T00:00:00-05:00');
const thu = Date.parse('2026-11-26T00:00:00-05:00');
const paradeStart = Date.parse('2026-11-26T04:00:00-05:00');
const paradeEnd = Date.parse('2026-11-26T11:00:00-05:00');
const fri = Date.parse('2026-11-27T00:00:00-05:00');
const sat = Date.parse('2026-11-28T00:00:00-05:00');
const transition = [wed, thu, paradeStart, paradeEnd, fri, sat];

export function holidaySchedule(now) {
  const blank = {subway:'', parade:'', q102:'', overrideSubway:false, nextAt:null};
  if (!Number.isFinite(now) || now < wed - 7 * 86400000 || now >= sat) return blank;
  const nextAt = transition.find(t => t > now);
  if (now < wed) return {...blank,nextAt};
  if (now >= fri) return {...blank,nextAt,q102:'Fri, Nov 27: Reduced weekday schedule.'};
  const upcoming = now < thu;
  return {
    subway:'Thu, Nov 26: The F is scheduled at Roosevelt Island (Sunday service).',
    parade:now < paradeEnd
      ? 'Planned parade change: F skips 57 St–6 Av in Manhattan both ways, 4–11 a.m. ET.'
      : '',
    q102:upcoming
      ? 'Thu, Nov 26: Sunday schedule. Fri, Nov 27: Reduced weekday schedule.'
      : 'Thu, Nov 26: Sunday schedule.',
    overrideSubway:!upcoming,
    // The parade remains consistently phrased as a plan, even during the window.
    nextAt,
  };
}
