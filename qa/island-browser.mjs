import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base = 'http://127.0.0.1:4173';
const artifacts = process.env.ARTIFACT_DIR;
assert(artifacts,'ARTIFACT_DIR is required');
const times = {
  'before': '2026-11-25T04:59:59Z',
  'wednesday': '2026-11-25T05:00:00Z',
  'thursday-opening': '2026-11-26T05:00:00Z',
  'parade-active': '2026-11-26T15:59:59Z',
  'noaa-failure': '2026-11-26T16:00:00Z',
  'friday': '2026-11-27T05:00:00Z',
  'saturday-expired': '2026-11-28T05:00:00Z',
  'fictional-demo': '2026-11-26T15:59:59Z',
};
const predictions = {
  predictions: [
    {t:'2026-11-23 16:00',v:'4.20',type:'H'},
    {t:'2026-11-23 22:00',v:'0.80',type:'L'}
  ]
};
const browser = await chromium.launch();
const screens = [320,390];
try {
  for (const width of screens) {
    for (const state of Object.keys(times)) {
      const requests=[], errors=[], unexpected=[];
      const context = await browser.newContext({
        viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,
        reducedMotion:'reduce',timezoneId:'America/New_York',serviceWorkers:'block',
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(Date.parse(times[state]));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.href);
        if (url.origin === base) return route.continue();
        if (url.origin === 'https://api.tidesandcurrents.noaa.gov') {
          assert.equal(url.searchParams.get('station'),'8518687');
          assert.equal(url.searchParams.get('product'),'predictions');
          assert.equal(url.searchParams.get('datum'),'MLLW');
          return state === 'noaa-failure'
            ? route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{error:'fixture 503'}})
            : route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},json:predictions});
        }
        unexpected.push(url.href);
        return route.abort();
      });
      try {
        await page.goto(base+'/island/'+(state==='fictional-demo'?'?demo=1':''),{waitUntil:'load'});
        await page.getByRole('heading',{name:/Roosevelt Island now/i}).waitFor();
        if (state==='fictional-demo') {
          await page.getByText('FICTIONAL SAMPLE',{exact:true}).waitFor();
          for (const name of ['North','Mid-island','South']) {
            const option = page.getByRole('radio',{name});
            await option.check();
            assert(await option.isChecked(),name+' must be selected');
            assert.match(await page.locator('#rationale').textContent(),/Fictional example.+not travel advice/);
          }
          const before=await page.locator('input[name=origin]:checked').getAttribute('value');
          await page.locator('input[name=origin]:checked').focus();
          await page.keyboard.press('ArrowLeft');
          assert.notEqual(await page.locator('input[name=origin]:checked').getAttribute('value'),before,'native radio keyboard selection');
          assert.deepEqual(requests.filter(url=>!url.startsWith(base+'/')),[]);
        } else {
          await page.getByRole('link',{name:'MTA alerts',exact:true}).waitFor();
          assert.match(await page.locator('#subway-detail').textContent(),/Open MTA for current subway alerts/);
          assert.match(await page.locator('#q102-detail').textContent(),/Open MTA Bus Time/);
          const expected=state==='noaa-failure'?/Predictions unavailable here/:/High .*4\.2 ft MLLW.*Low .*0\.8 ft MLLW/;
          await page.locator('#tides').filter({hasText:expected}).waitFor();
          assert.equal(requests.filter(url=>url.startsWith('https://api.tidesandcurrents.noaa.gov/')).length,1);
        }
        assert(!requests.some(url=>/\/feeds\/mta-|https:\/\/[^/]*mta\.info/.test(url)),'no MTA fetch in reviewed configuration');
        const during = ['wednesday','thursday-opening','parade-active','noaa-failure'].includes(state);
        const parade = ['wednesday','thursday-opening','parade-active'].includes(state);
        const bus = during || state === 'friday';
        const normalRail = !during || state === 'wednesday';
        assert.equal(await page.locator('#holiday-subway').isVisible(),during,'dated F note');
        assert.equal(await page.locator('#subway-typical').isVisible(),normalRail,'weekday text override');
        assert.equal(await page.locator('#holiday-q102').isVisible(),bus,'dated Q102 note');
        if (during) {
          assert.match(await page.locator('#holiday-subway-message').textContent(),/F is scheduled at Roosevelt Island/);
          assert.equal(await page.getByRole('link',{name:'MTA planned changes'}).getAttribute('href'),'https://www.mta.info/planned-service-changes');
        }
        const paradeText=await page.locator('#holiday-parade').textContent();
        if (parade) assert.match(paradeText,/57 St–6 Av in Manhattan both ways, 4–11 a.m. ET/);
        else assert.equal(paradeText,'','no stale parade note');
        if (bus) {
          const note=await page.locator('#holiday-q102-message').textContent();
          assert.equal(note.includes('Sunday schedule'),during);
          assert.equal(note.includes('Reduced weekday schedule'),['wednesday','friday'].includes(state));
          assert.equal(await page.getByRole('link',{name:'Q102 timetable'}).getAttribute('href'),'https://www.mta.info/document/10321');
        }
        const layout=await page.locator('.routes article').evaluateAll(cards=>cards.map(card=>{
          const text=card.querySelector(':scope > div').getBoundingClientRect();
          const link=card.querySelector(':scope > a').getBoundingClientRect();
          return {textBottom:text.bottom, textLeft:text.left, textWidth:text.width,
            linkTop:link.top, linkLeft:link.left, linkHeight:link.height};
        }));
        assert.equal(layout.length,6);
        for(const row of layout){
          assert(row.linkTop>=row.textBottom,'operator link must sit below card description');
          assert(Math.abs(row.linkLeft-row.textLeft)<1,'operator link and description should align');
          assert(row.linkHeight>=44,'operator link must provide 44px target height');
          assert(row.textWidth>=215,'description should use the whole content column');
        }
        if(state==='fictional-demo'){
          const controls=await page.locator('.seg label').evaluateAll(labels=>labels.map(label=>{
            const box=label.getBoundingClientRect(); return {top:box.top,height:box.height};
          }));
          assert.equal(controls.length,3);
          assert(controls.every(box=>box.height>=44),'all radio label targets must be at least 44px high');
          assert(controls.every(box=>box.top===controls[0].top),'all radios fit in one line');
        }
        assert.deepEqual(unexpected,[]);
        assert.deepEqual(errors,[]);
        const size = await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches}));
        assert(size.reduce);
        assert.equal(size.viewport,width,'the mobile viewport must not scale wider to fit overflowing content');
        assert(size.scroll<=size.viewport,`horizontal overflow at ${width}: ${JSON.stringify(size)}`);
        await page.screenshot({path:resolve(artifacts,`island-${width}-${state}.png`),fullPage:true,animations:'disabled'});
        console.log(`PASS ${width}px ${state}, viewport ${size.viewport}px, scroll ${size.scroll}px`);
      } catch(error) {
        await page.screenshot({path:resolve(artifacts,`FAIL-island-${width}-${state}.png`),fullPage:true,animations:'disabled'}).catch(()=>{});
        console.error({width,state,requests,unexpected,errors});
        throw error;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
