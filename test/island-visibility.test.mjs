import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { holidaySchedule } from '../public/island/holiday-schedule.mjs';
import { tramOverhaulCopy } from '../public/island/tram-advisory.mjs';
import { groupSubwayAlerts } from '../public/core.mjs';

const app=readFileSync(new URL('../public/island/app.mjs',import.meta.url),'utf8');
const start=app.lastIndexOf(' const transitInterval=');
const scheduling=app.slice(start,app.lastIndexOf('}'));

function harness(hidden=false){
 let now=0,timer,visibility;
 const calls=[],pending=[];
 const request=name=>()=>{calls.push(name);return new Promise(resolve=>pending.push(resolve));};
 const document={documentElement:{dataset:{mtaCache:'on'}},hidden,addEventListener(type,callback){assert.equal(type,'visibilitychange');visibility=callback;}};
 runInNewContext(scheduling,{
  document,status(){},renderDatedAdvisories(){},performance:{now:()=>now},subway:request('subway'),q102:request('q102'),tides:request('tides'),
  setTimeout(callback,delay){assert.ok(delay>0);timer={callback,at:now+delay};return timer;},
  clearTimeout(previous){if(previous===timer)timer=undefined;},
 });
 return {calls,show(isVisible){document.hidden=!isVisible;visibility();},setNow(value){now=value;},
  next(){return timer?.at;}, tick(){const scheduled=timer;now=scheduled.at;scheduled.callback();},
  async finish(){pending.splice(0).forEach(resolve=>resolve());await Promise.resolve();}};
}

test('returning from a short background pause does not duplicate fresh requests',async()=>{
 const h=harness();assert.deepEqual(h.calls,['subway','q102','tides']);await h.finish();
 assert.equal(h.next(),90000);h.setNow(10000);h.show(false);assert.equal(h.next(),undefined);
 h.setNow(20000);h.show(true);assert.equal(h.next(),90000);assert.equal(h.calls.length,3);
 h.tick();assert.deepEqual(h.calls.slice(3),['subway','q102']);await h.finish();
 assert.equal(h.next(),180000);
});

test('a long background pause catches up immediately and does not stack in-flight reads',async()=>{
 const h=harness();await h.finish();h.show(false);h.setNow(904000);h.show(true);
 assert.deepEqual(h.calls.slice(3),['subway','q102','tides']);
 h.show(false);h.show(true);assert.equal(h.calls.length,6);
 await h.finish();assert.equal(h.next(),994000);
});

test('an initially background tab makes no calls until visible',()=>{
 const h=harness(true);assert.deepEqual(h.calls,[]);assert.equal(h.next(),undefined);
 h.setNow(30000);h.show(true);assert.deepEqual(h.calls,['subway','q102','tides']);
});

test('a Q102 failure during visibility catch-up clears its old stamp without blocking other sources',async()=>{
 const nodes=new Map();
 const getElementById=id=>{
  if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,dateTime:'',removeAttribute(){this.dateTime='';}});
  return nodes.get(id);
 };
 const initial=Date.UTC(2026,10,22,16,30);
 let elapsed=0,visibility,fail=false;
 const calls=[];
 const document={documentElement:{dataset:{mtaCache:'on'}},hidden:false,getElementById,addEventListener(type,handler){assert.equal(type,'visibilitychange');visibility=handler;}};
 runInNewContext(app.replace(/^import .+;$/gm,''),{
  URLSearchParams,location:{search:''},document,tramOverhaulCopy,holidaySchedule,matchMedia:()=>({matches:false}),
  performance:{now:()=>elapsed},Date:class extends Date{static now(){return initial+elapsed;}},
  setTimeout:()=>1,clearTimeout(){},sourceState:()=> 'live',groupSubwayAlerts,
  async fetchSource(){calls.push('subway');return {items:[{active:true,local:true,title:fail?'New subway notice':'Initial subway notice'}]};},
  async fetchQ102Alerts(){calls.push('q102');if(fail)throw new Error('Q102 unavailable');return {state:'fresh',sourceAt:initial,active:[{headline:'Initial route notice'}],planned:[]};},
  async fetchTides(){calls.push('tides');return {high:{at:initial+(fail?10800000:7200000),heightFt:fail?5:4.2}};},
 });
 await new Promise(setImmediate);
 assert.equal(getElementById('q102-source').hidden,false);
 assert.equal(getElementById('q102-detail').textContent,'Initial route notice');
 assert.match(getElementById('tides').textContent,/4\.2 ft MLLW/);
 document.hidden=true;visibility();elapsed=905000;fail=true;document.hidden=false;visibility();
 await new Promise(setImmediate);
 assert.deepEqual(calls,['subway','q102','tides','subway','q102','tides']);
 assert.equal(getElementById('q102-source').hidden,true);
 assert.equal(getElementById('q102-source').dateTime,'');
 assert.match(getElementById('q102-detail').textContent,/unavailable/);
 assert.equal(getElementById('subway-detail').textContent,'New subway notice');
 assert.match(getElementById('tides').textContent,/5\.0 ft MLLW/);
});
