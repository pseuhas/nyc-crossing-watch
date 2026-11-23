const MTA = new URL('./feeds/mta-subway.json', import.meta.url).href;
const DOT = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json';
export const MAX_AGE = {subway:5*60000,traffic:20*60000};
export const LINKS = {
 subway:'https://www.mta.info/alerts',
 tram:'https://www.rioc.ny.gov/community/transportation/tram',
 notices:'https://www.rioc.ny.gov/news-and-events/advisories',
 ferry:'https://www.ferry.nyc/routes-and-schedules/astoria/',
 cameras:'https://511ny.org/',
 dot:'https://data.cityofnewyork.us/d/i4gi-tjb9'
};
const routeSet=new Set(['F','FX','M']);
const localStop=/^B06(?:N|S)?$/;
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const num=x=>(typeof x==='number'||(typeof x==='string'&&x.trim()))?Number(x):NaN;
const epoch=x=>{const n=num(x); return Number.isSafeInteger(n)&&n>0?n*1000:null};
const strip=(x,max=500)=>typeof x==='string'?x.trim().slice(0,max):'';
const translation=(v,max)=>Array.isArray(v?.translation)?strip(v.translation.find(t=>t?.language==='en')?.text,max):'';
function overlaps(p,start,end){const a=epoch(p?.start)??-Infinity,b=epoch(p?.end)??Infinity;return a<b&&a<end&&b>start;}
export function alertSnapshot(body,now=Date.now()){
 const stamp=epoch(body?.header?.timestamp);
 if(!stamp||stamp>now+120000||!Array.isArray(body.entity))throw new Error('Invalid MTA alert feed');
 const alerts=new Map();
 for(const ent of body.entity){
  if(!ent?.alert||ent.is_deleted)continue;
  const a=ent.alert,x=a['transit_realtime.mercury_alert'];
  const header=translation(a.header_text,350);
  const desc=translation(a.description_text,1100);
  if(!header)continue;
  const informed=Array.isArray(a.informed_entity)?a.informed_entity:[];
  const affected=Array.isArray(x?.affected_stations)?x.affected_stations:[];
  const routes=[...new Set(informed.map(e=>e?.route_id).filter(e=>routeSet.has(e)))].sort();
  // Fields in one selector are conjunctive: a line at another stop or a single trip
  // does not constitute a route-wide notice. Direction 0 is a real restriction.
  const lineWideRoutes=[...new Set(informed.filter(e=>routeSet.has(e?.route_id)
   &&(!e.agency_id||e.agency_id==='MTASBWY')&&!e.stop_id&&!e.trip&&e.direction_id==null)
   .map(e=>e.route_id))].sort();
  const local=[...affected,...informed].some(e=>localStop.test(e?.stop_id??''))
    ||(lineWideRoutes.length>0&&/roosevelt\s+island/i.test(header+' '+desc));
  if(!routes.length&&!local)continue;
  const periods=Array.isArray(a.active_period)?a.active_period:[];
  const active=!periods.length||periods.some(p=>overlaps(p,now,now+1));
  const soon=periods.map(p=>epoch(p?.start)).filter(t=>t>now&&t<=now+12*3600000).sort((a,b)=>a-b)[0];
  if(!active&&!soon)continue;
  const id=strip(ent.id,160)||header;
  const item={id,title:header,description:desc,routes,lineWideRoutes,local,active,startsAt:active?null:soon,kind:strip(x?.alert_type,80)||'Service alert'};
  alerts.set(id,item);
 }
 const items=[...alerts.values()].sort((a,b)=>Number(b.active)-Number(a.active)||Number(b.local)-Number(a.local)||(a.startsAt??0)-(b.startsAt??0)||a.id.localeCompare(b.id));
 return {kind:'subway',stamp,items};
}
export function dotTimestamp(input,reference=Date.now()){
 if(typeof input!=='string')return null;
 if(/(?:Z|[+-]\d\d:\d\d)$/.test(input)){const t=Date.parse(input);return Number.isFinite(t)?t:null;}
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?$/.exec(input);
 if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1).map(Number);
 const local=Date.UTC(year,month-1,day,hour,minute,second);
 const parts=['year','month','day','hour','minute','second'];
 return [4,5].map(offset=>local+offset*3600000).filter(t=>{
  const x=Object.fromEntries(fmt.formatToParts(t).map(({type,value})=>[type,Number(value)]));
  return parts.every((key,i)=>x[key]===[year,month,day,hour,minute,second][i])&&t<=reference+120000;
 }).sort((a,b)=>b-a)[0]??null;
}
export function roadQuery(now=Date.now()){
 const p=Object.fromEntries(fmt.formatToParts(now-60*60000).map(({type,value})=>[type,value]));
 const lookback=p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;
 const params=new URLSearchParams({
  '$select':'link_id,link_name,speed,travel_time,data_as_of',
  '$where':"data_as_of >= '"+lookback+"' AND (upper(link_name) like '%QUEENSBORO%' OR upper(link_name) like '%QUEENS MIDTOWN%' OR upper(link_name) like '%QUEENS-MIDTOWN%' OR upper(link_name) like '%MIDTOWN TUNNEL%' OR upper(link_name) like '%QBB%')",
  '$order':'data_as_of DESC', '$limit':'600'
 });
 return DOT+'?'+params.toString();
}
export function roadSnapshot(body,now=Date.now()){
 if(!Array.isArray(body))throw new Error('Invalid NYC DOT speed feed');
 const rows=new Map();
 for(const x of body){
  const id=strip(String(x?.link_id??''),80);
  const name=strip(x?.link_name,180);
  if(!id||!name)continue;
  const stamp=dotTimestamp(x.data_as_of,now);
  const speed=num(x.speed), seconds=num(x.travel_time);
  if(!stamp||stamp>now+120000||!Number.isFinite(speed)||speed<0||speed>100)continue;
  // DOT defines zero as no measurement; never display it as gridlock.
  if(speed===0)continue;
  const prior=rows.get(id);
  if(!prior||prior.stamp<stamp)rows.set(id,{id,name,stamp,speed,seconds:Number.isFinite(seconds)&&seconds>0&&seconds<86400?seconds:null});
 }
 const items=[...rows.values()].sort((a,b)=>Number(/QUEENSBORO|QBB/i.test(b.name))-Number(/QUEENSBORO|QBB/i.test(a.name))||b.stamp-a.stamp||a.name.localeCompare(b.name));
 return {kind:'traffic',stamp:items.length?Math.max(...items.map(r=>r.stamp)):null,items};
}
export async function fetchSource(kind,now=Date.now(),fetcher=fetch){
 const url=kind==='subway'?MTA:roadQuery(now);
 const r=await fetcher(url,{credentials:'omit',cache:'no-cache',...(kind==='subway'?{redirect:'error'}:{}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('Source HTTP '+r.status);
 const body=await r.json();
 return kind==='subway'?alertSnapshot(body,now):roadSnapshot(body,now);
}
export function sourceState(snapshot,now=Date.now(),failed=false){
 if(!snapshot)return failed?'unavailable':'loading';
 if(snapshot.sample)return 'demo';
 if(!snapshot.stamp)return failed?'unavailable':'no-data';
 return (now-snapshot.stamp>MAX_AGE[snapshot.kind]||failed)?'stale':'live';
}
export function groupSubwayAlerts(items){
 const station=[],route=[];
 for(const item of items)(item.local?station:route).push(item);
 return {station,route};
}
export function example(now=Date.now()){
 return {
 subway:{kind:'subway',sample:true,stamp:null,items:[
  {id:'demo-1',kind:'Example station alert',title:'Example: a train skips Roosevelt Island',description:'This is fictional and not a service report.',local:true,routes:['M'],active:true,startsAt:null},
  {id:'demo-2',kind:'Example planned work',title:'Example: route-wide weekend change',description:'Pick a different route in the official planner.',local:false,routes:['F'],active:false,startsAt:now+7200000}
 ]},
 traffic:{kind:'traffic',sample:true,stamp:null,items:[
  {id:'demo-1',name:'Example Queensboro approach · Manhattan',stamp:now,speed:11.2,seconds:96},
  {id:'demo-2',name:'Example Queens-Midtown Tunnel approach',stamp:now,speed:23.4,seconds:74}
 ]}
 };
}
