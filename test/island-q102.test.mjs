import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchQ102Alerts, Q102_ALERT_URL} from '../public/island/mta-q102.mjs';

const now = 1_795_295_600_000;
const sec = now / 1000;
const make = (id, route = 'Q102', period, agency_id = 'MTABC') => ({
  id, alert:{
    header_text:{translation:[{language:'es',text:'Texto'},{language:'en',text:id}]},
    active_period:period,
    informed_entity:[{agency_id, route_id:route}]
  }
});
const fake = (entity = [], timestamp = sec) => async (url, options) => {
  assert.equal(url,Q102_ALERT_URL);
  assert.equal(options.credentials,'omit');
  return {ok:true, json:async () => ({header:{timestamp}, entity})};
};

test('fresh exact route only, mixed periods, expired/end-exclusive and planned sorted',async () => {
  const actual = await fetchQ102Alerts(new Date(now), fake([
    make('wrong agency','Q102',undefined,'OTHER'),make('wrong route','Q103'),
    make('finished','Q102',[{end:sec}]),
    make('currently active','Q102',[{start:sec,end:sec+10},{start:sec+70}]),
    make('later','Q102',[{start:sec+90}]),make('soon','MTABC_Q102',[{start:sec+30}]),
    make('indefinite')
  ],String(sec)));
  assert.equal(actual.state,'fresh');
  assert.deepEqual(actual.active.map(o=>o.headline),['currently active','indefinite']);
  assert.deepEqual(actual.planned.map(o=>[o.headline,o.startsAt]),[['soon',now+30_000],['later',now+90_000]]);
});
test('fresh empty result is distinct from stale, future timestamp and failures',async () => {
  assert.deepEqual(await fetchQ102Alerts(now,fake()),{state:'fresh',sourceAt:now,active:[],planned:[]});
  assert.equal((await fetchQ102Alerts(now,fake([make('stale')],sec-301))).state,'stale');
  assert.equal((await fetchQ102Alerts(now,fake([],sec+31))).state,'unavailable');
  assert.equal((await fetchQ102Alerts(now,fake(null))).state,'unavailable');
  assert.equal((await fetchQ102Alerts(now,async()=>{throw new Error('network');})).state,'unavailable');
});
test('malformed periods for a Q102 notice cannot become a fresh empty result',async () => {
  assert.equal((await fetchQ102Alerts(now,fake([make('bad','Q102',[{start:'yesterday'}])]))).state,'unavailable');
});
