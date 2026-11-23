import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const path = name => new URL('../public/island/' + name, import.meta.url);
const app = readFileSync(path('app.mjs'), 'utf8');
const html = readFileSync(path('index.html'), 'utf8');
const sourceAt = Date.UTC(2026, 10, 21, 21, 0);
const check = async (result, before = {}) => {
  const stamp = { hidden: false, dateTime: new Date(sourceAt).toISOString(), textContent: 'old', ...before,
    removeAttribute(name) { assert.equal(name, 'datetime'); this.dateTime = ''; } };
  const messages = [];
  const run = runInNewContext(app.slice(app.indexOf('async function q102()'), app.indexOf('async function tides()')) + '\nq102', {
    $: id => { assert.equal(id, 'q102-source'); return stamp; },
    fetchQ102Alerts: async () => { if (result instanceof Error) throw result; return result; },
    clock: new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short', hour:'numeric', minute:'2-digit', timeZoneName:'short' }),
    status: (id, value) => { assert.equal(id, 'q102-detail'); messages.push(value); },
  });
  await run();
  assert.equal(messages.length, 1);
  return { stamp, message: messages[0] };
};

test('Q102 fresh empty, stale, and error remain distinct; failed refresh clears its previous timestamp', async () => {
  const fresh = await check({ state: 'fresh', sourceAt, active: [], planned: [] });
  assert.match(fresh.message, /No current Q102 route alert listed/);
  assert.equal(fresh.stamp.hidden, false);
  assert.equal(fresh.stamp.dateTime, new Date(sourceAt).toISOString());
  const stale = await check({ state: 'stale', sourceAt, active: [{ headline:'old notice' }], planned: [] });
  assert.match(stale.message, /out of date/);
  assert.doesNotMatch(stale.message, /old notice/);
  assert.equal(stale.stamp.hidden, false);
  const unavailable = await check(new Error('offline'));
  assert.match(unavailable.message, /unavailable/);
  assert.equal(unavailable.stamp.hidden, true);
  assert.equal(unavailable.stamp.dateTime, '');
  assert.equal(unavailable.stamp.textContent, '');
});

test('Q102 active details are actionable; planned-only notices are not described as active', async () => {
  const planned = [{ headline:'Stop change next week', startsAt: sourceAt + 86400000 }];
  const notice = { headline:'Stop moved', description:'Board at Main St.' };
  assert.equal((await check({ state:'fresh', sourceAt, active:[notice], planned })).message, 'Stop moved Board at Main St.');
  assert.match((await check({ state:'fresh', sourceAt, active:[], planned })).message, /^Planned .*: Stop change next week$/);
  assert.match(html, /href="https:\/\/bustime\.mta\.info\/\?search=450142">Track stop 450142<\/a>/);
});
