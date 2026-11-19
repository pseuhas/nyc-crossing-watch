import {fetchSource,sourceState,example,groupSubwayAlerts} from './core.mjs';
const get=id=>document.getElementById(id);
const mode=new URLSearchParams(location.search).get('demo')==='1';
const refresh=get('refresh');
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const sample=example();
const cards={subway:{data:null,error:false},traffic:{data:null,error:false}};
let running=false,timer;
const states={loading:'Loading',live:'Live feed',stale:'Stale · recheck',unavailable:'Unavailable','no-data':'No recent readings',demo:'Fictional demo'};
const empty={
 subway:{loading:'Checking the MTA service feed.',unavailable:'The MTA feed could not be loaded. Check official alerts before you travel.'},
 traffic:{loading:'Checking the NYC DOT speed feed.',unavailable:'The traffic feed could not be loaded. Use the official 511NY map to check conditions.','no-data':'NYC DOT returned no usable observations for the selected corridor in the past hour. Missing sensors or readings do not mean roads are clear.'}
};
function node(parent,tag,content,cls){const x=document.createElement(tag);if(cls)x.className=cls;x.textContent=content;parent.append(x);return x;}
function render(kind){
 const data=mode?sample[kind]:cards[kind].data;
 const state=sourceState(data,Date.now(),cards[kind].error);
 const badge=get(kind+'-state'),out=get(kind+'-body');
 if(badge.textContent!==states[state])badge.textContent=states[state];
 badge.dataset.state=state;
 out.replaceChildren();
 if(empty[kind][state]){node(out,'p',empty[kind][state],'content-line');return;}
 if(!data)return;
 if(state==='demo')node(out,'p','Sample readings only. Do not use these values to plan travel.','content-line');
 else node(out,'p','Latest source timestamp: '+clock.format(data.stamp)+(state==='stale'?'. This view may be outdated.':'.'),'content-line');
 if(kind==='subway'){
  const groups=groupSubwayAlerts(data.items);
  const sections=[
    ['Roosevelt Island station',groups.station,'No matching station-specific alerts reported for the next 12 hours.'],
    ['F / M route context',groups.route,'No other F or M alerts reported for the next 12 hours.']
  ];
  for(const [label,rows,none] of sections){
   const group=node(out,'section','','alert-group');
   node(group,'h3',label);
   if(!rows.length)node(group,'p',none,'content-line');
   for(const a of rows.slice(0,6)){
    const el=node(group,'article','','item');
    node(el,'p',[a.routes.join(' / '),a.active?'Active in feed':'Planned '+clock.format(a.startsAt)].filter(Boolean).join(' · '));
    node(el,'h4',a.title);
    if(a.description)node(el,'p',a.description);
   }
   if(rows.length>6)node(group,'p','Showing 6 of '+rows.length+' alerts. Check MTA for the complete list.','content-line');
  }
  node(out,'p','No matching alert does not verify train arrivals or normal service.','content-line');
  return;
 }
 for(const a of data.items.slice(0,8)){
  const el=node(out,'article','','item');
  node(el,'h3',a.name);
  node(el,'strong',a.speed.toFixed(1)+' mph','metric');
  const old=!data.sample&&sourceState({kind:'traffic',stamp:a.stamp},Date.now())==='stale';
  node(el,'p',(a.seconds?Math.round(a.seconds)+' s on this link · ':'')+clock.format(a.stamp)+(old?' · Older reading':''));
 }
}
async function reload(){
 if(mode||running)return;
 clearTimeout(timer);
 running=true;refresh.disabled=true;
 const now=Date.now();
 await Promise.all(Object.keys(cards).map(async kind=>{
  try{cards[kind].data=await fetchSource(kind,now);cards[kind].error=false;}
  catch{cards[kind].error=true;}
  render(kind);
 }));
 running=false;refresh.disabled=false;
 timer=setTimeout(()=>{if(!document.hidden)reload();},90000);
}
refresh.addEventListener('click',reload);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!mode)reload();});
if(mode){refresh.disabled=true;get('demo-link').href='./';get('demo-link').textContent='Back to live feeds';}
for(const kind of Object.keys(cards))render(kind);
if(!mode)reload();
