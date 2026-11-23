import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRAM_OVERHAUL, tramOverhaulCopy, tramOverhaulState } from '../public/island/tram-advisory.mjs';

const state = iso => tramOverhaulState(Date.parse(iso));
test('advisory switches on New York dates, with a fully inclusive Feb 26', () => {
  assert.equal(state('2026-11-21T04:59:59.999Z'), null);
  assert.equal(state('2026-11-21T05:00:00.000Z'), 'upcoming');
  assert.equal(state('2027-01-02T04:59:59.999Z'), 'upcoming');
  assert.equal(state('2027-01-02T05:00:00.000Z'), 'in-window');
  assert.equal(state('2027-02-27T04:59:59.999Z'), 'in-window');
  assert.equal(state('2027-02-27T05:00:00.000Z'), null);
  assert.equal(tramOverhaulState(NaN), null);
});

test('dated headway is sourced but not live; undated second phase has no assumed window', () => {
  const html = readFileSync(new URL('../public/island/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(TRAM_OVERHAUL.source));
  assert.match(tramOverhaulCopy(Date.UTC(2026, 10, 22)), /^Planned maintenance, Jan 2–Feb 26, 2027:.*one cabin every 15 minutes.*not a live departure/);
  assert.match(tramOverhaulCopy(Date.UTC(2027, 0, 10)), /^Maintenance schedule through Feb 26, 2027/);
  assert.equal(tramOverhaulCopy(Date.UTC(2027, 5, 20)), '');
});
