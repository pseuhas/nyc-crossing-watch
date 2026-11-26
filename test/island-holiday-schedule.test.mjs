import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {holidaySchedule} from '../public/island/holiday-schedule.mjs';
const at = s => holidaySchedule(Date.parse(s));

test('dated planning starts at New York midnight, not UTC date or annual recurrence', () => {
  assert.equal(at('2026-11-25T04:59:59.999Z').subway,'');
  const wed=at('2026-11-25T05:00:00Z');
  assert.match(wed.subway,/F is scheduled at Roosevelt Island/);
  assert.equal(wed.overrideSubway,false);
  assert.match(wed.q102,/Thu.+Sunday schedule.+Fri.+Reduced weekday/);
  assert.equal(at('2027-11-25T14:00:00Z').subway,'');
  assert.equal(holidaySchedule(NaN).nextAt,null);
});

test('Thursday uses F service without the canceled parade notice; Friday is Q102 only', () => {
  assert.equal(at('2026-11-26T04:59:59.999Z').overrideSubway,false);
  const thu=at('2026-11-26T05:00:00Z');
  assert.equal(thu.overrideSubway,true);
  assert.equal(thu.nextAt,Date.parse('2026-11-27T05:00:00Z'));
  assert.equal(at('2026-11-25T20:00:00Z').parade,'');
  assert.equal(at('2026-11-26T09:00:00Z').parade,'');
  assert.equal(at('2026-11-26T15:59:59.999Z').parade,'');
  assert.equal(at('2026-11-28T13:30:00Z').parade,'');
  assert.equal(at('2026-11-26T16:00:00Z').parade,'');
  assert.equal(at('2026-11-27T04:59:59.999Z').overrideSubway,true);
  const fri=at('2026-11-27T05:00:00Z');
  assert.equal(fri.overrideSubway,false);
  assert.equal(fri.subway,'');
  assert.match(fri.q102,/Reduced weekday schedule/);
  assert.equal(at('2026-11-28T05:00:00Z').q102,'');
});

test('published source links and initial hidden state; no external feed added', () => {
  const html=readFileSync(new URL('../public/island/index.html',import.meta.url),'utf8');
  assert.match(html,/id="holiday-subway" hidden/);
  assert.match(html,/id="holiday-q102" hidden/);
  assert.match(html,/href="https:\/\/www\.mta\.info\/planned-service-changes"/);
  assert.match(html,/href="https:\/\/www\.mta\.info\/document\/10321"/);
  assert.match(html,/data-mta-cache="off"/);
  assert.doesNotMatch(html,/connect-src[^;]+mta\.info/);
});
