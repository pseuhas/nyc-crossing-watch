import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compareTrips } from '../public/island/decision.mjs';

test('fictional sample has no live calls or polling, even after switching origin', () => {
  const appURL = new URL('../public/island/app.mjs', import.meta.url);
  const source = readFileSync(appURL, 'utf8').replace(/^import .+;$/gm, '');
  const nodes = new Map();
  const calls = [];
  const getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent:'', hidden:true, animate(){} });
    return nodes.get(id);
  };
  const origins = ['north','mid','south'].map(value => ({
    value, addEventListener(type, callback) { assert.equal(type,'change'); this.select = () => callback(); },
  }));
  runInNewContext(source, {
    URLSearchParams, location:{search:'?demo=1'},
    document:{ getElementById, querySelectorAll: selector => { assert.equal(selector,'input[name=origin]'); return origins; } },
    compareTrips, matchMedia:() => ({matches:false}),
    fetchSource: (...args) => calls.push(['subway', ...args]),
    fetchQ102Alerts: (...args) => calls.push(['q102', ...args]),
    fetchTides: (...args) => calls.push(['tides', ...args]),
    setInterval: (...args) => calls.push(['interval', ...args]),
  });
  assert.equal(getElementById('mode').textContent, 'FICTIONAL SAMPLE');
  assert.equal(getElementById('origin-controls').hidden, false);
  origins.forEach(origin => origin.select());
  assert.match(getElementById('rationale').textContent, /fictional/i);
  assert.deepEqual(calls, []);
});
