import test from 'node:test';
import assert from 'node:assert/strict';
import {alertSnapshot,dotTimestamp,roadQuery,roadSnapshot,fetchSource,sourceState,example} from '../public/core.mjs';
const now=Date.parse('2026-11-19T18:30:00Z'), sec=now/1000;
const tr=text=>({translation:[{language:'en-html',text:'<b>Ignore HTML</b>'},{language:'en',text}]});
const a=(id,route,stop,start,end,more={})=>({id,alert:{header_text:tr('Example '+id),description_text:tr('Example description'),informed_entity:[{route_id:route,stop_id:stop}],active_period:[{start,end}],...more}});
test('only active/upcoming alerts; distinguishes island stop from route-wide and extracts plain English',()=>{
 const rows=[a('city','F',null,sec-10),a('site','M','B06N',sec-10),a('other','A',null,sec-10),a('past','M','B06',sec-20,sec-1),a('next','M','B06',sec+100),a('far','M','B06',sec+43201)];
 const result=alertSnapshot({header:{timestamp:sec-4},entity:rows},now);
 assert.deepEqual(result.items.map(x=>[x.id,x.local,x.active]),[['site',true,true],['city',false,true],['next',true,false]]);
 assert.equal(result.items[0].title,'Example site');
});
test('Mercury affected stations identify relevant alerts, malformed feed is rejected',()=>{
 const ent=a('ext','M',null,sec-10,undefined,{'transit_realtime.mercury_alert':{affected_stations:[{stop_id:'B06S'}]}});
 assert.ok(alertSnapshot({header:{timestamp:sec},entity:[ent]},now).items[0].local);
 assert.throws(()=>alertSnapshot({header:{timestamp:sec+130},entity:[]},now),/Invalid/);
});
test('parses Eastern floating timestamps, handles DST gaps/folds and explicit offsets',()=>{
 assert.equal(dotTimestamp('2026-11-19T13:30:00.000',now),now);
 assert.equal(dotTimestamp('2026-11-19T13:30:00-05:00',now),now);
 assert.equal(dotTimestamp('2026-03-08T02:30:00.000',now),null);
 assert.equal(dotTimestamp('2026-11-01T01:30:00.000',Date.parse('2026-11-01T05:31:00Z')),Date.parse('2026-11-01T05:30:00Z'));
 assert.equal(dotTimestamp('2026-11-01T01:30:00.000',Date.parse('2026-11-01T06:31:00Z')),Date.parse('2026-11-01T06:30:00Z'));
});
test('dedupes and validates readings without fabricating a clear road',()=>{
 const r=(id,minute,speed)=>({link_id:id,link_name:'Queensboro demo '+id,data_as_of:'2026-11-19T13:'+minute+':00.000',speed,travel_time:'60'});
 const x=roadSnapshot([r('a','03','19'),r('a','29','22'),r('b','26','0'),r('c','27','-34'),r('z','55','20')],now);
 assert.deepEqual(x.items.map(y=>[y.id,y.speed,y.seconds]),[['a',22,60]]);
 assert.equal(sourceState(roadSnapshot([],now),now),'no-data');
 assert.equal(sourceState(x,now),'live');
 assert.equal(sourceState(x,now,true),'stale');
});
test('query scopes fixed columns/corridor/hour and bounds response size',()=>{
 const u=new URL(roadQuery(now));assert.equal(u.origin,'https://data.cityofnewyork.us');
 assert.match(u.searchParams.get('$where'),/data_as_of >= '2026-11-19T12:30:00'/);
 assert.match(u.searchParams.get('$where'),/QUEENSBORO/);
 assert.equal(u.searchParams.get('$limit'),'600');
});
test('network contracts use omitted credentials and propagate vendor failure',async()=>{
 const mock=async(url,options)=>{assert.equal(options.credentials,'omit');assert.ok(options.signal);assert.match(url,/mta\.info/);return {ok:true,json:async()=>({header:{timestamp:sec},entity:[]})};};
 assert.equal((await fetchSource('subway',now,mock)).stamp,now);
 await assert.rejects(fetchSource('traffic',now,async()=>({ok:false,status:429})),/429/);
 assert.equal(sourceState(null,now,true),'unavailable');
 assert.equal(sourceState(example(now).traffic,now),'demo');
});
