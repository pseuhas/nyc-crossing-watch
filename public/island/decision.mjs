/** Timestamps are epoch milliseconds or timezone-qualified ISO strings. */
export const LIVE_MAX_AGE_MS = 2 * 60_000;
export const SCHEDULE_MAX_AGE_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;

function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  return Date.parse(value);
}

function duration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Rank only catchable trips with affirmatively available, current data.
 * Schedule observations mean when the schedule was last verified, not when the
 * vehicle was observed; their totals are explicitly estimates.
 * Omitted items keep original fields and have null totals with a stable reason.
 * Ties preserve input order. Equal-to-arrival departure is catchable; callers
 * should include any needed boarding/access buffer in walkMinutes.
 */
export function compareTrips(candidates, now = Date.now()) {
  const current = timestamp(now);
  const ranked = [];
  const omitted = [];

  for (const entry of Array.isArray(candidates) ? candidates : []) {
    const candidate = entry && typeof entry === 'object' ? entry : {};
    const { id, walkMinutes, departureAt, rideMinutes, availability, sourceKind, observedAt } = candidate;
    const observed = timestamp(observedAt);
    const departure = timestamp(departureAt);
    const staleAfter = sourceKind === 'live' ? LIVE_MAX_AGE_MS : SCHEDULE_MAX_AGE_MS;
    const age = current - observed;
    const elapsedUntilDeparture = (departure - current) / MINUTE_MS;
    const waitMinutes = duration(walkMinutes) ? elapsedUntilDeparture - walkMinutes : NaN;
    const totalMinutes = duration(rideMinutes) ? elapsedUntilDeparture + rideMinutes : NaN;
    let reason;

    if (!Number.isFinite(current)) reason = 'invalid-clock';
    else if (typeof id !== 'string' || !id.trim()) reason = 'invalid-id';
    else if (availability === 'disrupted') reason = 'disrupted';
    else if (availability !== 'available') reason = 'availability-unknown';
    else if (sourceKind !== 'live' && sourceKind !== 'schedule') reason = 'source-unknown';
    else if (!Number.isFinite(observed)) reason = 'missing-observation';
    else if (age < 0) reason = 'future-observation';
    else if (age > staleAfter) reason = 'stale';
    else if (!duration(walkMinutes) || !duration(rideMinutes) || !Number.isFinite(departure) ||
             !Number.isFinite(waitMinutes) || !Number.isFinite(totalMinutes)) reason = 'incomplete-timing';
    else if (waitMinutes < 0) reason = 'departure-before-arrival';

    if (reason) omitted.push({ ...candidate, reason, waitMinutes: null, totalMinutes: null });
    else ranked.push({ ...candidate, waitMinutes, totalMinutes });
  }

  ranked.sort((a, b) => a.totalMinutes - b.totalMinutes);
  return { best: ranked[0] ?? null, ranked, omitted };
}
