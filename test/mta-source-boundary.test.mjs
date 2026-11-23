import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {fetchSource, groupSubwayAlerts, sourceState} from '../public/core.mjs';
import {fetchQ102Alerts} from '../public/island/mta-q102.mjs';

const publicPath = new URL('../public/', import.meta.url);
const html = pathname => readFileSync(new URL(pathname, publicPath), 'utf8');
const now = Date.UTC(2026, 10, 23, 12);
const response = (age = 0) => ({ok:true,json:async()=>({header:{timestamp:(now-age)/1000},entity:[]})});

test('MTA requests are app-relative, omit credentials, and reject redirects', async () => {
  function mock(name, result) {
    return async (url, options) => {
      assert.equal(url, new URL(name, publicPath).href);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      return result;
    };
  }
  assert.equal((await fetchSource('subway',now,mock('feeds/mta-subway.json',response()))).stamp,now);
  assert.equal((await fetchQ102Alerts(now,mock('feeds/mta-bus.json',response()))).state,'fresh');
});

test('browser documents deny upstream MTA connections and retain official navigation links', () => {
  for (const path of ['index.html', 'island/index.html']) {
    const source = html(path);
    const connect = source.match(/connect-src ([^;"]+)/)[1];
    assert.match(connect, /'self'/);
    assert.doesNotMatch(connect, /mta\.info|https: |\*/);
    assert.match(source, /href="https:\/\/www\.mta\.info\/alerts"/);
  }
  assert.match(html('island/index.html'), /href="https:\/\/bustime\.mta\.info\//);
});

test('absent cache never looks like no alerts; older snapshots carry a realtime caveat', async () => {
  const src = html('island/app.mjs');
  const missing = async () => ({ok:false,status:404});
  const statusTexts = [];
  const invoke = fetcher => runInNewContext(
    src.slice(src.indexOf('async function subway()'),src.indexOf('async function q102()')) + '\nsubway',
    {fetchSource:kind=>fetchSource(kind,now,fetcher),sourceState,groupSubwayAlerts,
     Date:{now:()=>now},status:(id,value)=>statusTexts.push([id,value])}
  )();
  await invoke(missing);
  assert.deepEqual(statusTexts.pop(),['subway-detail','Alert feed unavailable. Check MTA.']);
  assert.equal((await fetchQ102Alerts(now,missing)).state,'unavailable');
  await invoke(async()=>response(61_000));
  assert.match(statusTexts.pop()[1], /may not be real time/);
});

test('default links-only mode makes no subway or bus request and leaves tide fetching enabled', async () => {
  const source = html('island/app.mjs').replace(/^import .+;$/gm,'');
  const calls=[], nodes=new Map();
  const getElementById=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true});
    return nodes.get(id);
  };
  const document={documentElement:{dataset:{mtaCache:'off'}},hidden:false,getElementById,addEventListener(){}};
  runInNewContext(source,{
    URLSearchParams,location:{search:''},document,tramOverhaulCopy:()=>null,matchMedia:()=>({matches:false}),
    performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},
    async fetchSource(){calls.push('subway');},async fetchQ102Alerts(){calls.push('bus');},
    async fetchTides(){calls.push('tides');return {};},
  });
  await new Promise(setImmediate);
  assert.deepEqual(calls,['tides']);
  assert.match(getElementById('subway-detail').textContent,/Open MTA/);
  assert.match(getElementById('q102-detail').textContent,/Open MTA Bus Time/);
  for(const page of ['index.html','island/index.html'])assert.match(html(page),/data-mta-cache="off"/);
});

test('root corridor view makes no MTA request when the cache is off, even on refresh',async()=>{
  const source=html('app.mjs').replace(/^import .+;$/gm,'');
  const nodes=new Map(),calls=[];
  function getElementById(id){
    if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},replaceChildren(){},append(){},addEventListener(_type,fn){this.click=fn;}});
    return nodes.get(id);
  }
  const document={documentElement:{dataset:{mtaCache:'off'}},getElementById,createElement:()=>({}),addEventListener(){}};
  runInNewContext(source,{
    URLSearchParams,location:{search:''},document,sourceState,groupSubwayAlerts,
    example:()=>({}),async fetchSource(kind){calls.push(kind);return {kind,stamp:null,items:[]};},
    setTimeout:()=>1,clearTimeout(){},
  });
  await new Promise(setImmediate);
  assert.deepEqual(calls,['traffic']);
  assert.equal(getElementById('subway-state').textContent,'Official link');
  await getElementById('refresh').click();
  assert.deepEqual(calls,['traffic','traffic']);
});
