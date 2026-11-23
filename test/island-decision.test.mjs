import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTrips,
  LIVE_MAX_AGE_MS,
  SCHEDULE_MAX_AGE_MS,
} from '../public/island/decision.mjs';

const now = Date.parse('2026-11-21T21:00:00Z');
const min = 60_000;
const trip = (id, patch = {}) => ({
  id, walkMinutes: 4, departureAt: now + 8 * min, rideMinutes: 5,
  availability: 'available', sourceKind: 'live', observedAt: now - min,
  ...patch,
});

test('compares trip totals with waits starting after walk and no double counting', () => {
  const trips = [trip('tram'), trip('subway', { departureAt: now + 6 * min, rideMinutes: 4 }),
    trip('ferry', { departureAt: now + 14 * min, rideMinutes: 2, sourceKind: 'schedule' })];
  const { best, ranked, omitted } = compareTrips(trips, now);
  assert.equal(best.id, 'subway');
  assert.deepEqual(ranked.map(x => [x.id, x.waitMinutes, x.totalMinutes]), [
    ['subway', 2, 10], ['tram', 4, 13], ['ferry', 10, 16],
  ]);
  assert.equal(ranked[2].sourceKind, 'schedule');
  assert.deepEqual(omitted, []);
  assert.equal(trips[0].totalMinutes, undefined);
});

test('does not rank impossible departures or disrupted/unknown services', () => {
  const { best, ranked, omitted } = compareTrips([
    trip('missed-on-walk', { departureAt: now + 3 * min }),
    trip('disrupted', { availability: 'disrupted' }),
    trip('unknown', { availability: 'unknown' }),
    trip('exact', { departureAt: now + 4 * min }),
  ], now);
  assert.equal(best.id, 'exact');
  assert.equal(ranked[0].waitMinutes, 0);
  assert.deepEqual(omitted.map(({ reason, totalMinutes, waitMinutes }) => [reason, totalMinutes, waitMinutes]), [
    ['departure-before-arrival', null, null],
    ['disrupted', null, null],
    ['availability-unknown', null, null],
  ]);
});

test('honors mode-specific freshness boundaries and rejects future timestamps', () => {
  const { ranked, omitted } = compareTrips([
    trip('fresh-live', { observedAt: now - LIVE_MAX_AGE_MS }),
    trip('stale-live', { observedAt: now - LIVE_MAX_AGE_MS - 1 }),
    trip('fresh-schedule', { sourceKind: 'schedule', observedAt: now - SCHEDULE_MAX_AGE_MS }),
    trip('stale-schedule', { sourceKind: 'schedule', observedAt: now - SCHEDULE_MAX_AGE_MS - 1 }),
    trip('future', { observedAt: now + 1 }),
  ], now);
  assert.deepEqual(ranked.map(x => x.id), ['fresh-live', 'fresh-schedule']);
  assert.deepEqual(omitted.map(x => x.reason), ['stale', 'stale', 'future-observation']);
});

test('does not coerce missing or invalid source data to zero and returns no winner', () => {
  const { best, ranked, omitted } = compareTrips([
    trip('missing-ride', { rideMinutes: null }),
    trip('numeric-string', { walkMinutes: '4' }),
    trip('negative', { rideMinutes: -1 }),
    trip('unsupported', { walkMinutes: Symbol('absent') }),
    trip('no-zone', { departureAt: '2026-11-21T21:07:00' }),
    trip('no-observed', { observedAt: undefined }),
    trip('no-kind', { sourceKind: undefined }),
    null,
  ], now);
  assert.equal(best, null);
  assert.deepEqual(ranked, []);
  assert.deepEqual(omitted.map(x => x.reason), [
    'incomplete-timing', 'incomplete-timing', 'incomplete-timing', 'incomplete-timing', 'incomplete-timing',
    'missing-observation', 'source-unknown', 'invalid-id',
  ]);
});

test('accepts timezone-qualified ISO timestamps and keeps stable ties', () => {
  const { best, ranked } = compareTrips([
    trip('first', { departureAt: '2026-11-21T16:08:00-05:00', observedAt: '2026-11-21T20:59:00Z' }),
    trip('second'),
  ], '2026-11-21T21:00:00Z');
  assert.equal(best.id, 'first');
  assert.deepEqual(ranked.map(x => x.totalMinutes), [13, 13]);
});

test('handles no candidates and invalid clocks without false recommendations', () => {
  assert.deepEqual(compareTrips([], now), { best: null, ranked: [], omitted: [] });
  assert.equal(compareTrips([trip('a')], 'bad').omitted[0].reason, 'invalid-clock');
});
