// MTA feeds: https://www.mta.info/developers
// Route-level service notices only; not bus positions, departures, or on-time status.
export const Q102_ALERT_URL = new URL('../feeds/mta-bus.json', import.meta.url).href;
const MAX_AGE = 5 * 60_000;
const CLOCK_SKEW = 30_000;
const epoch = value => {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(n * 1000) ? n * 1000 : null;
};
const matches = selector => selector?.route_id === 'MTABC_Q102' ||
  (selector?.route_id === 'Q102' && (!selector.agency_id || selector.agency_id === 'MTABC'));
const translation = field => {
  const options = field?.translation;
  if (!Array.isArray(options)) return '';
  const valid = options.filter(item => typeof item?.text === 'string' && item.text.trim());
  return (valid.find(item => /^en(?:-|$)/i.test(item.language ?? '')) ??
    valid.find(item => !item.language) ?? valid[0])?.text.trim() ?? '';
};

export async function fetchQ102Alerts(now, fetcher = fetch) {
  const time = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(time)) throw new TypeError('Invalid Q102 reference time');
  const unavailable = {state:'unavailable', sourceAt:null, active:[], planned:[]};
  try {
    const response = await fetcher(Q102_ALERT_URL, {
      credentials:'omit', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(6500)
    });
    if (!response?.ok) return unavailable;
    const data = await response.json();
    const sourceAt = epoch(data?.header?.timestamp);
    if (!sourceAt || sourceAt > time + CLOCK_SKEW || !Array.isArray(data?.entity)) return unavailable;
    if (time - sourceAt > MAX_AGE) return {...unavailable, sourceAt, state:'stale'};
    const active = [], planned = [], seen = new Set();
    for (const entity of data.entity) {
      const alert = entity?.alert;
      if (entity?.is_deleted || !Array.isArray(alert?.informed_entity) ||
          !alert.informed_entity.some(matches)) continue;
      const headline = translation(alert.header_text);
      const description = translation(alert.description_text);
      if (!headline && !description) return unavailable;
      if (alert.active_period != null && !Array.isArray(alert.active_period)) return unavailable;
      const periods = (alert.active_period ?? []).map(period => ({
        start: period?.start == null ? -Infinity : epoch(period.start),
        end: period?.end == null ? Infinity : epoch(period.end)
      }));
      if (periods.some(({start,end}) => start === null || end === null || start >= end)) return unavailable;
      const isActive = !periods.length || periods.some(({start,end}) => start <= time && time < end);
      const next = periods.filter(({start}) => start > time).sort((a,b) => a.start-b.start)[0];
      if (!isActive && !next) continue;
      const id = entity.id ?? (headline + '\\n' + description);
      if (seen.has(id)) continue;
      seen.add(id);
      const notice = {id, headline:headline || description, description:headline ? description : ''};
      if (isActive) active.push(notice);
      else planned.push({...notice, startsAt:next.start});
    }
    planned.sort((a,b) => a.startsAt-b.startsAt);
    return {state:'fresh', sourceAt, active, planned};
  } catch {
    return unavailable;
  }
}
