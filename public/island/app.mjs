import {fetchSource, sourceState, groupSubwayAlerts} from '../core.mjs';
import {fetchTides} from './tide.mjs';
import {compareTrips} from './decision.mjs';
import {fetchQ102Alerts} from './mta-q102.mjs';
import {tramOverhaulCopy} from './tram-advisory.mjs';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('demo')==='1';
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York', weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const lastValues=new Map();
function status(id,value){
 const el=$(id), prior=lastValues.get(id);
 if(el.textContent===value)return;
 lastValues.set(id,value);el.textContent=value;
 if(prior&&matchMedia('(prefers-reduced-motion: no-preference)').matches){
  el.animate([{opacity:.72},{opacity:1}],{duration:300,easing:'ease-out'});
 }
}
function showTides(tides){
 const text=[];
 for(const [key,title] of [['high','High'],['low','Low']]){
  const e=tides[key]; if(e)text.push(title+' '+clock.format(e.at)+' · '+e.heightFt.toFixed(1)+' ft MLLW');
 }
 status('tides',text.join(' / ')||'No upcoming prediction returned.');
}
const samples={north:[17,13,22],mid:[4,7,13],south:[14,7,2]};
const fixed=Date.UTC(2026,10,21,21,0);
const names={subway:'Subway',tram:'Tram',ferry:'Ferry'};
function showExample(origin){
 const choices=['subway','tram','ferry'].map((id,i)=>({id,walkMinutes:samples[origin][i],departureAt:fixed+[13,18,10][i]*60000,rideMinutes:[5,4,10][i],availability:'available',sourceKind:'schedule',observedAt:fixed}));
 const {best}=compareTrips(choices,fixed);
 status('decision',best?names[best.id]+' · '+best.totalMinutes+' min':'No comparable route');
 $('rationale').textContent=best?'Fictional example: '+best.walkMinutes+' min walk + '+best.waitMinutes+' min wait. This is not travel advice.':'The fictional departure has already passed on this route.';
}
async function subway(){
 try{
  const d=await fetchSource('subway');
  if(sourceState(d,Date.now())!=='live'){status('subway-detail','Alert feed is outdated. Check MTA.');return;}
  const {station,route}=groupSubwayAlerts(d.items);
  const activeStation=station.filter(a=>a.active);
  const activeLine=route.filter(a=>a.active&&a.lineWideRoutes?.length);
  const notices=[];
  if(activeStation.length)notices.push(activeStation[0].title);
  if(activeLine.length){
   const {lineWideRoutes,title}=activeLine[0];
   notices.push(lineWideRoutes.join('/')+' line alert: '+title);
  }
  if(activeStation.length+activeLine.length>notices.length)notices.push('More alerts at MTA.');
  if(!notices.length)notices.push('No current station or line-wide alert listed. Live arrivals aren’t shown.');
  if(Date.now()-d.stamp>60000)notices.push('MTA data may not be real time.');
  status('subway-detail',notices.join(' · '));
 }catch{status('subway-detail','Alert feed unavailable. Check MTA.');}
}
async function q102(){
 let feed;
 try{feed=await fetchQ102Alerts(Date.now());}
 catch{feed={state:'unavailable',sourceAt:null};}
 const stamp=$('q102-source');
 if(Number.isFinite(feed.sourceAt)){
  stamp.dateTime=new Date(feed.sourceAt).toISOString();
  stamp.textContent='MTA feed: '+clock.format(feed.sourceAt)+(Date.now()-feed.sourceAt>60000?' · May not be real time.':'');
  stamp.hidden=false;
 }else{
  stamp.hidden=true;stamp.removeAttribute('datetime');stamp.textContent='';
 }
 if(feed.state==='unavailable'){status('q102-detail','Route alerts unavailable. Check MTA Bus Time.');return;}
 if(feed.state==='stale'){status('q102-detail','Route alerts are out of date. Check MTA Bus Time.');return;}
 const active=feed.active[0], upcoming=feed.planned[0];
 if(active){
  const description=active.description&&active.description!==active.headline?' '+active.description:'';
  const more=feed.active.length>1?' More alerts at MTA Bus Time.':'';
  status('q102-detail',active.headline+description+more);
 }else if(upcoming){
  status('q102-detail','Planned '+clock.format(upcoming.startsAt)+': '+upcoming.headline);
 }else{
  status('q102-detail','No current Q102 route alert listed. Check MTA for arrivals.');
 }
}
async function tides(){
 try{showTides(await fetchTides(Date.now()));}
 catch{status('tides','Predictions unavailable here. Open NOAA’s tide table.');}
}
if(demo){
 $('mode').textContent='FICTIONAL SAMPLE';$('demo').textContent='Back to preview';$('demo').href='./';$('origin-controls').hidden=false;
 $('q102-detail').textContent='Route alert checks paused in sample mode.';
 $('subway-detail').textContent='Fictional sample; does not report service.';$('tides').textContent='Tide calls paused in sample mode.';
 showExample('mid');
 for(const opt of document.querySelectorAll('input[name=origin]'))opt.addEventListener('change',()=>showExample(opt.value));
}else{
 function renderTramAdvisory(){
  const message=tramOverhaulCopy(Date.now());
  $('tram-advisory').hidden=!message;
  if(message)status('tram-advisory-message',message);
 }
 const transitInterval=90000;
 const mtaCacheEnabled=document.documentElement?.dataset.mtaCache==='on';
 if(!mtaCacheEnabled){
  status('subway-detail','Open MTA for current subway alerts.');
  status('q102-detail','Open MTA Bus Time for current Q102 information.');
 }
 const sources=[...(mtaCacheEnabled?[[subway,transitInterval],[q102,transitInterval]]:[]),[tides,15*60000]]
  .map(([read,interval])=>({read,interval,lastStart:null,pending:false}));
 let timer;
 function refreshDueSources(){
  clearTimeout(timer);
  if(document.hidden)return;
  renderTramAdvisory();
  const now=performance.now();
  let nextDelay=Infinity;
  for(const source of sources){
   if(source.pending)continue;
   const delay=source.lastStart===null?0:source.interval-(now-source.lastStart);
   if(delay>0){nextDelay=Math.min(nextDelay,delay);continue;}
   source.pending=true;source.lastStart=now;
   void source.read().finally(()=>{source.pending=false;refreshDueSources();});
  }
  if(Number.isFinite(nextDelay))timer=setTimeout(refreshDueSources,nextDelay);
 }
 refreshDueSources();
 document.addEventListener('visibilitychange',refreshDueSources);
}
