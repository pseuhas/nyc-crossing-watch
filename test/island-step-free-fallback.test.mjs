import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('step-free directions use an official link without asserting access', () => {
  const html = readFileSync(new URL('../public/island/index.html', import.meta.url), 'utf8');
  const card = html.match(/<article aria-labelledby="step-free">[\s\S]*?<\/article>/)?.[0];
  assert.ok(card, 'official fallback exists as static content for both preview modes and without scripts');
  assert.match(card, /Elevator status isn’t verified here/);
  assert.match(card, /Check your platform direction/);
  assert.match(card, /href="https:\/\/www\.mta\.info\/elevators">MTA elevator status<\/a>/);
  assert.doesNotMatch(card, /aria-live|aria-hidden="true">MTA elevator status|all clear/i);
});

test('mobile layout preserves the sample and operator-link touch heights', () => {
  const css = readFileSync(new URL('../public/island/island.css', import.meta.url), 'utf8');
  assert.match(css, /\.demo\{[^}]*min-height:44px/);
  assert.match(css, /\.routes a\{[^}]*min-height:44px/);
  assert.doesNotMatch(css, /\.lede\s+\.demo\s*\{[^}]*min-height/);
});

test('Red Bus uses one static route handoff, not a background Transit feed', () => {
  const html = readFileSync(new URL('../public/island/index.html', import.meta.url), 'utf8');
  const card = html.match(/<article><span class="route-icon bus"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);
  assert.match(card, /href="https:\/\/transitapp\.com\/en\/region\/nyc\/roosevelt-island-operating-corporation\/bus-red-bus">Track Red Bus in Transit<\/a>/);
  assert.equal((card.match(/<a /g) ?? []).length, 1);
  assert.equal((html.match(/transitapp\.com/g) ?? []).length, 1);
  for (const file of ['app.mjs', 'decision.mjs', 'mta-q102.mjs', 'tide.mjs']) {
    assert.doesNotMatch(readFileSync(new URL('../public/island/' + file, import.meta.url), 'utf8'), /transitapp\.com/);
  }
});
