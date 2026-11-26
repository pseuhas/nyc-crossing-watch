// Published New York service-day exceptions, November 2026 only.
// MTA's dated Thanksgiving bulletin: https://www.mta.info/article/mta-service-thanksgiving-2026-0.
// The parade moved to Saturday; do not repeat the superseded Thursday stop skip.
// See https://www.mta.info/alerts and https://www.rioc.ny.gov/community/transportation/subway.
// Q102 holiday classification: https://www.mta.info/document/10321.
const wed = Date.parse('2026-11-25T00:00:00-05:00');
const thu = Date.parse('2026-11-26T00:00:00-05:00');
const fri = Date.parse('2026-11-27T00:00:00-05:00');
const sat = Date.parse('2026-11-28T00:00:00-05:00');
const transition = [wed, thu, fri, sat];

export function holidaySchedule(now) {
  const blank = {subway:'', parade:'', q102:'', overrideSubway:false, nextAt:null};
  if (!Number.isFinite(now) || now < wed - 7 * 86400000 || now >= sat) return blank;
  const nextAt = transition.find(t => t > now);
  if (now < wed) return {...blank,nextAt};
  if (now >= fri) return {...blank,nextAt,q102:'Fri, Nov 27: Reduced weekday schedule.'};
  const upcoming = now < thu;
  return {
    subway:'Thu, Nov 26: The F is scheduled at Roosevelt Island (Sunday service).',
    parade:'',
    q102:upcoming
      ? 'Thu, Nov 26: Sunday schedule. Fri, Nov 27: Reduced weekday schedule.'
      : 'Thu, Nov 26: Sunday schedule.',
    overrideSubway:!upcoming,
    nextAt,
  };
}
