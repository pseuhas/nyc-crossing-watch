import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchTides} from '../public/island/tide.mjs';

const at = Date.parse('2026-11-21T23:59:00Z');
const row = (t, type, v) => ({t,type,v});
const fixture = (predictions) => async () => ({ok:true,json:async () => ({predictions})});

test('builds bounded UTC high/low prediction query and sorts by time, not input or height', async () => {
  let request;
  const reply = fixture([
    row('2026-11-22 17:35','H','5.716'),
    row('2026-11-21 23:59','H','4.961'),
    row('2026-11-22 01:29','L','-0.124'),
    row('2026-11-21 23:58','L','0.310'),
    row('2026-11-22 06:04','H','4.202'),
    row('2026-11-23 14:44','L','0.112')
  ]);
  const result = await fetchTides(at, (url, options) => {
    request = [new URL(url), options];
    return reply();
  });
  assert.equal(request[0].origin, 'https://api.tidesandcurrents.noaa.gov');
  assert.equal(request[0].pathname, '/api/prod/datagetter');
  for (const [k,v] of Object.entries({station:'8518687',begin_date:'20261121',end_date:'20261123',
    product:'predictions',datum:'MLLW',time_zone:'gmt',units:'english',interval:'hilo',format:'json'})) {
    assert.equal(request[0].searchParams.get(k),v);
  }
  assert.equal(request[1].credentials,'omit');
  assert.equal(request[1].cache,'no-store');
  assert.equal(request[1].signal.aborted,false);
  assert.deepEqual(result,{ high:{at:Date.parse('2026-11-22T06:04Z'),heightFt:4.202},
    low:{at:Date.parse('2026-11-22T01:29Z'),heightFt:-.124} });
});

test('allows exact duplicates and leaves a missing future type null', async () => {
  const high = row('2026-11-22 03:02','H',0);
  assert.deepEqual(await fetchTides(new Date(at),fixture([high,high])),
    {high:{at:Date.parse('2026-11-22T03:02Z'),heightFt:0},low:null});
  assert.deepEqual(await fetchTides(at,fixture([])),{high:null,low:null});
});

test('rejects invalid timestamps, values, types, out-of-window and contradictory rows', async () => {
  for (const invalid of [row('2026-11-22 24:00','L','1.2'),row('2026-11-31 04:00','L','1.2'),
    row('2026-11-22T05:01:00-05:00','L','1.2'),row('2026-11-22 03:01','L',' '),
    row('2026-11-22 03:01','L','1e2'),row('2026-11-22 03:01','H',null),
    row('2026-11-22 03:01','H',Infinity),row('2026-11-22 03:01','M','3'),
    row('2026-11-24 00:00','L','1.2')]) {
    await assert.rejects(fetchTides(at,fixture([invalid])),/Invalid NOAA tide prediction row/);
  }
  await assert.rejects(fetchTides(at,fixture([row('2026-11-22 03:02','H','4'),row('2026-11-22 03:02','L','2')])),
    /Conflicting NOAA tide/);
});

test('transport, NOAA errors, malformed JSON, and invalid caller time never fabricate events', async () => {
  await assert.rejects(fetchTides(at,async()=>({ok:false})),/unavailable/);
  await assert.rejects(fetchTides(at,async()=>{throw Error('network');}),/network/);
  await assert.rejects(fetchTides(at,async()=>({ok:true,json:async()=>{throw SyntaxError('JSON');}})),/JSON/);
  await assert.rejects(fetchTides(at,async()=>({ok:true,json:async()=>({error:{message:'No data'}})})),/Invalid NOAA/);
  await assert.rejects(fetchTides(at,async()=>({ok:true,json:async()=>null})),/Invalid NOAA/);
  await assert.rejects(fetchTides(NaN,fixture([])),/reference time/);
});
