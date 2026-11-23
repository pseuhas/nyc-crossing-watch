import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {alertSnapshot,groupSubwayAlerts,sourceState} from '../public/core.mjs';

const app=readFileSync(new URL('../public/island/app.mjs',import.meta.url),'utf8');
const now=Date.UTC(2026,10,23,6);
const make=(id,title,selectors,active_period)=>({id,alert:{
 header_text:{translation:[{language:'en',text:title}]},
 informed_entity:selectors,active_period
}});
const f=[{agency_id:'MTASBWY',route_id:'F'}];
const suspended=make('f','[F] trains are suspended.',f);
const station=make('stop','Use the alternate Roosevelt Island exit.',[{stop_id:'B06N'}]);
const feed=(entity,age=0)=>alertSnapshot({header:{timestamp:(now-age)/1000},entity},now);
async function render(snapshot){
 const messages=[];
 const invoke=runInNewContext(app.slice(app.indexOf('async function subway()'),app.indexOf('async function q102()'))+'\nsubway',{
  fetchSource:async kind=>{assert.equal(kind,'subway');if(snapshot instanceof Error)throw snapshot;return snapshot;},
  sourceState,groupSubwayAlerts,Date:{now:()=>now},
  status:(id,value)=>{assert.equal(id,'subway-detail');messages.push(value);}
 });
 await invoke();
 assert.equal(messages.length,1);
 return messages[0];
}

test('the island card shows an active F line notice without calling it a station closure',async()=>{
 assert.equal(await render(feed([suspended])),'F line alert: [F] trains are suspended.');
 assert.deepEqual(feed([suspended]).items[0].lineWideRoutes,['F']);
});

test('an island notice is first but does not hide a distinct F-wide notice',async()=>{
 const second=make('other','[M] delays.',[{route_id:'M'}]);
 assert.equal(await render(feed([second,station,suspended])),
  'Use the alternate Roosevelt Island exit. · F line alert: [F] trains are suspended. · More alerts at MTA.');
});

test('nonlocal stop, wrong agency, trip and direction restrictions are not inferred as line-wide',async()=>{
 const restricted=[
  {route_id:'F',stop_id:'D14'},
  {route_id:'F',agency_id:'OTHER'},
  {route_id:'F',trip:{trip_id:'a'}},
  {route_id:'F',direction_id:0}
 ];
 for(const [i,scope] of restricted.entries()){
  const sample=feed([make(String(i),'Use Roosevelt Island as an alternative.',[scope])]);
  assert.deepEqual(sample.items[0].lineWideRoutes,[]);
  assert.equal(sample.items[0].local,false);
  assert.match(await render(sample),/^No current station or line-wide alert listed/);
 }
 const separate=feed([make('separate','Broad F notice.',[restricted[0],...f])]);
 assert.deepEqual(separate.items[0].lineWideRoutes,['F']);
});

test('expired, planned, stale, fresh-empty and unavailable do not show an active notice',async()=>{
 const timed=[make('expired','Old alert.',f,[{end:now/1000}]),
  make('planned','Later alert.',f,[{start:now/1000+60}])];
 assert.match(await render(feed(timed)),/^No current station or line-wide alert listed/);
 assert.match(await render(feed([])),/^No current station or line-wide alert listed/);
 assert.equal(await render(feed([suspended],6*60_000)),'Alert feed is outdated. Check MTA.');
 assert.equal(await render(new Error('offline')),'Alert feed unavailable. Check MTA.');
});
