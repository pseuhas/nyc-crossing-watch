import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const asset = name => readFileSync(new URL('../public/island/' + name, import.meta.url), 'utf8');
const html = asset('index.html');
const css = asset('island.css');
const app = asset('app.mjs');

test('sample origins are named native radios; the fixed diagram does not claim live positions', () => {
  assert.match(html, /<fieldset[^>]*id="origin-controls"[^>]*hidden[^>]*>\s*<legend>[^<]+<\/legend>/);
  for (const [value, name, x] of [['south', 'South', 129], ['mid', 'Mid-island', 176], ['north', 'North', 220]]) {
    assert.match(html, new RegExp('<label><input type="radio" name="origin" value="' + value + '"[^>]*>' + name + '</label>'));
    assert.ok(html.includes('<circle cx="' + x + '"'));
    assert.ok(css.includes('input[value="' + value + '"]:checked) .map circle[cx="' + x + '"]'));
  }
  assert.match(html, /<svg\b[^>]*aria-hidden="true"/);
  assert.match(html, /Island schematic[^<]*no vehicle positions/i);
  assert.match(css, /#origin-controls\[hidden\]\)\s*\.map circle\s*\{[^}]*transform:\s*none/);
  assert.match(css, /\.seg label:has\(input:focus-visible\)\s*\{[^}]*outline:/);
});

test('schematic transitions are opt-in to motion and announcements remain available', () => {
  const motionBlock = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*\.map circle\s*\{[^}]*transition:[^}]*\}\s*\}/;
  assert.match(css, motionBlock);
  assert.doesNotMatch(css.replace(motionBlock, ''), /\.map circle\s*\{[^}]*transition\s*:/);
  for (const id of ['decision', 'subway-detail', 'tides']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*aria-live="polite"'));
  }
});

test('status changes are conveyed as text with or without animation; duplicates stay quiet', () => {
  const block = app.slice(app.indexOf('function status('), app.indexOf('function showTides('));
  for (const allowsMotion of [false, true]) {
    const animations = [];
    const el = { textContent: '', animate(...args) { animations.push(args); } };
    const status = runInNewContext(block + '\nstatus', {
      $: () => el, lastValues: new Map(),
      matchMedia(query) {
        assert.equal(query, '(prefers-reduced-motion: no-preference)');
        return { matches: allowsMotion };
      },
    });
    status('decision', 'Fictional sample');
    assert.equal(el.textContent, 'Fictional sample');
    assert.equal(animations.length, 0);
    status('decision', 'Updated sample');
    status('decision', 'Updated sample');
    assert.equal(el.textContent, 'Updated sample');
    assert.equal(animations.length, allowsMotion ? 1 : 0);
  }
});
