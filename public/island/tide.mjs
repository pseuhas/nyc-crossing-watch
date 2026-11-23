// NOAA CO-OPS https://api.tidesandcurrents.noaa.gov/api/prod/
// Site 8518687, Queensboro Bridge: predicted water levels, not measured
// current speeds/directions. H/L predictions are in feet relative to MLLW.
const BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const DAY = 86_400_000;
const stamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;
const decimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const dayParam = (time) => new Date(time).toISOString().slice(0,10).replaceAll('-','');

function gmtMinute(value) {
  if (typeof value !== 'string') return NaN;
  const parts = stamp.exec(value);
  if (!parts) return NaN;
  const iso = parts[1] + 'T' + parts[2] + ':00.000Z';
  const at = Date.parse(iso);
  return Number.isFinite(at) && new Date(at).toISOString() === iso ? at : NaN;
}

export async function fetchTides(now, fetcher = fetch) {
  const since = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(since) || !Number.isFinite(new Date(since + 3 * DAY).getTime()) ||
      !Number.isFinite(new Date(since).getTime())) throw new TypeError('Invalid tide reference time');
  // Begin at today's UTC midnight and include two further UTC calendar days.
  const firstDay = Math.floor(since / DAY) * DAY;
  const query = new URLSearchParams({
    station: '8518687', begin_date: dayParam(firstDay), end_date: dayParam(firstDay + 2 * DAY),
    product: 'predictions', datum: 'MLLW', time_zone: 'gmt', units: 'english', interval: 'hilo',
    format: 'json', application: 'RooseveltIslandPreview'
  });
  const response = await fetcher(BASE + '?' + query, {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(6500)
  });
  if (!response?.ok) throw new Error('NOAA tide predictions unavailable');
  const data = await response.json();
  if (!data || Object.hasOwn(data, 'error') || !Array.isArray(data.predictions) ||
      data.predictions.length > 64) throw new Error('Invalid NOAA tide predictions');

  const future = {high: null, low: null};
  const observed = new Map();
  for (const row of data.predictions) {
    const at = gmtMinute(row?.t);
    const type = row?.type;
    const heightFt = typeof row?.v === 'number' ? row.v
      : typeof row?.v === 'string' && decimal.test(row.v) ? Number(row.v) : NaN;
    if (!Number.isFinite(at) || at < firstDay || at >= firstDay + 3 * DAY ||
        (type !== 'H' && type !== 'L') || !Number.isFinite(heightFt)) {
      throw new Error('Invalid NOAA tide prediction row');
    }
    const previous = observed.get(at);
    if (previous && (previous.type !== type || previous.heightFt !== heightFt)) {
      throw new Error('Conflicting NOAA tide predictions');
    }
    observed.set(at, {type, heightFt});
    if (at <= since) continue;
    const kind = type === 'H' ? 'high' : 'low';
    if (!future[kind] || at < future[kind].at) future[kind] = {at, heightFt};
  }
  return future;
}
