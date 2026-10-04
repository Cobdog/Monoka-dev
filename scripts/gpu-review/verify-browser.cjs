/* Local-only Chromium checks. Run from repo root:
 * node scripts/gpu-review/verify-browser.cjs /tmp/gpu-review-evidence
 * Requires the repository's installed @playwright/test, not a page dependency.
 */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const output = process.argv[2] || '/tmp/gpu-review-evidence';
fs.mkdirSync(output,{recursive:true});
const url = pathToFileURL(path.resolve('gpu-review/setA/review-v2.html')).href;
const profile = fs.mkdtempSync('/tmp/gpu-review-profile-');
const errors = [], logs = [];
const log = value => { logs.push(value); console.log(value); };
let context;
async function open() {
  context = await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1280,height:900},acceptDownloads:true,args:['--no-sandbox']});
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  page.on('request',r=>{assert.ok(!r.url().endsWith('/.key'),'Escrow must never be requested');assert.ok(r.url().startsWith('file:') || r.url().startsWith('blob:') || r.url().startsWith('data:'), 'Unexpected nonlocal request '+r.url());});
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelectorAll('.stage[data-frame="0"]').length===8);
  return page;
}
async function shot(locator, options={}) { await locator.evaluate(e=>e.scrollIntoView({block:'center',inline:'center'})); return locator.screenshot(options); }
const digest = buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
async function frame(page,id,index) {
  const pair=page.locator(`[data-pair="${id}"]`);
  await pair.locator('.scrub').evaluate((e,i)=>{e.value=i;e.dispatchEvent(new Event('input',{bubbles:true}));},index);
  await page.waitForFunction(({id,index})=>document.querySelector(`[data-pair="${id}"] .stage`).dataset.frame===String(index),{id,index});
  return pair;
}
(async()=>{
  let page = await open();
  await page.clock.install();
  const frozenAt=new Date();await page.clock.pauseAt(frozenAt);
  for(const id of ['p01','p02','p03','p04','p05','p06','p07','p08']) {
    const pair=await frame(page,id,id==='p07'?23:61);
    assert.equal(await pair.locator('.meta-sides').isVisible(),false);
    assert.equal(await pair.locator('.meta-sides').innerText(),'');
    await pair.locator('[data-mode="sbs"]').click();
    await shot(pair.locator('.stage'),{path:path.join(output,id+'-sbs.png')});
    await pair.locator('[data-mode="slider"]').click();
    const box=await pair.locator('canvas').boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await page.mouse.up();
    await shot(pair.locator('.stage'),{path:path.join(output,id+'-slider.png')});
    await pair.locator('[data-mode="blink"]').click();await pair.locator('.blink-control').selectOption('manual');
    const left=await shot(pair.locator('canvas'),{path:path.join(output,id+'-blink-L.png')});
    await pair.locator('.flip').click();
    const right=await shot(pair.locator('canvas'),{path:path.join(output,id+'-blink-R.png')});
    assert.equal(digest(left)===digest(right),id==='p07',id+' expected content comparison');
    log(id+': all modes present; manual blink '+(id==='p07'?'pixel-identical null':'reveals a pixel difference')+' at frame '+(id==='p07'?23:61));
  }
  const nullPair=page.locator('[data-pair="p07"]');
  for(let i=0;i<39;i++) {
    await frame(page,'p07',i);
    const first=await shot(nullPair.locator('canvas'));await nullPair.locator('.flip').click();
    assert.equal(digest(first),digest(await shot(nullPair.locator('canvas'))),'p07 frame '+i);
  }
  log('p07: all 39 frames have identical L/R canvas screenshots');
  await frame(page,'p07',23);await nullPair.locator('.blink-control').selectOption('auto');
  await page.evaluate(()=>{window.phaseChanges=0;const s=document.querySelector('[data-pair="p07"] .stage');let side=s.dataset.side;new MutationObserver(()=>{if(s.dataset.side!==side){side=s.dataset.side;window.phaseChanges++}}).observe(s,{attributes:true,attributeFilter:['data-side']});});
  for(let hz=.5;hz<=8;hz+=.5) {
    await nullPair.locator('.hz').evaluate((e,h)=>{e.value=h;e.dispatchEvent(new Event('input',{bubbles:true}));},hz);
    const before=await page.evaluate(()=>window.phaseChanges);
    const screenshot=await shot(nullPair.locator('canvas'));
    await page.clock.runFor(4000);
    const flips=await page.evaluate(()=>window.phaseChanges)-before;
    assert.ok(Math.abs(flips-8*hz)<=1,`${hz} Hz: ${flips} flips`);
    assert.equal(digest(screenshot),digest(await shot(nullPair.locator('canvas'))));
    assert.equal(await nullPair.locator('.stage').getAttribute('data-frame'),'23');
    log(`p07 paused content: ${hz} Hz / ${flips} flips in 4s; unchanged pixels`);
  }
  await nullPair.locator('.blink-control').selectOption('manual');
  const side=await nullPair.locator('.stage').getAttribute('data-side');await page.clock.runFor(4000);
  assert.equal(await nullPair.locator('.stage').getAttribute('data-side'),side);
  await nullPair.locator('.stage').focus();await page.keyboard.press('b');
  assert.notEqual(await nullPair.locator('.stage').getAttribute('data-side'),side);
  await nullPair.locator('.stage').click();
  assert.equal(await nullPair.locator('.stage').getAttribute('data-side'),side);
  for(const mode of ['sbs','slider','blink']) {
    await nullPair.locator(`[data-mode="${mode}"]`).click();await frame(page,'p07',10);
    await nullPair.locator('.stepf').click();await page.waitForFunction(()=>document.querySelector('[data-pair="p07"] .stage').dataset.frame==='11');
    await nullPair.locator('.stepb').click();await page.waitForFunction(()=>document.querySelector('[data-pair="p07"] .stage').dataset.frame==='10');
    await nullPair.locator('.play').click();await page.clock.runFor(50);await page.waitForFunction(()=>document.querySelector('[data-pair="p07"] .stage').dataset.frame!=='10');
    await nullPair.locator('.play').click();
    await nullPair.locator('.restart').click();await page.waitForFunction(()=>document.querySelector('[data-pair="p07"] .stage').dataset.frame==='0');
    await nullPair.locator('.fs').click();assert.equal(await page.evaluate(()=>document.fullscreenElement?.classList.contains('stage')),true);
    await page.locator('[data-pair="p07"] .stage').screenshot({path:path.join(output,'p07-'+mode+'-fullscreen.png')});
    await page.evaluate(()=>document.exitFullscreen());
    log(mode+': true-frame steps, playback, pause, restart and fullscreen passed');
  }
  for(const index of [60,61,62,63]) {
    const pair=await frame(page,'p03',index);await pair.locator('[data-mode="blink"]').click();await pair.locator('.blink-control').selectOption('manual');
    // Save both phases around the known adjacent-frame reversal for inspection.
    await shot(pair.locator('canvas'),{path:path.join(output,`p03-${index}-phase1.png`)});await pair.locator('.flip').click();
    await shot(pair.locator('canvas'),{path:path.join(output,`p03-${index}-phase2.png`)});
  }
  // Exercise the actual wall clock as well as deterministic RAF timing.
  await page.clock.resume();
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelectorAll('.stage[data-frame="0"]').length===8);
  const live=page.locator('[data-pair="p07"]');
  await live.locator('[data-mode="blink"]').click();
  await live.locator('.hz').evaluate(e=>{e.value=8;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.evaluate(()=>{
    window.liveFrames=[];window.livePhases=[];
    const s=document.querySelector('[data-pair="p07"] .stage');let frame=s.dataset.frame,side=s.dataset.side;
    new MutationObserver(()=>{const now=performance.now();if(frame!==s.dataset.frame){frame=s.dataset.frame;window.liveFrames.push({frame:Number(frame),now});}if(side!==s.dataset.side){side=s.dataset.side;window.livePhases.push(now);}}).observe(s,{attributes:true});
  });
  await live.locator('.play').click();await page.waitForTimeout(3000);await live.locator('.play').click();
  const liveResult=await page.evaluate(()=>({frames:window.liveFrames,phases:window.livePhases}));
  fs.writeFileSync(path.join(output,'real-clock.json'),JSON.stringify(liveResult,null,2));
  console.log('Real-clock samples:',liveResult.frames.length,'frames,',liveResult.phases.length,'flips');
  assert.ok(liveResult.frames.length>=55 && liveResult.frames.length<=80,'real-clock playback '+liveResult.frames.length);
  assert.ok(liveResult.phases.length>=40 && liveResult.phases.length<=55,'real-clock blink '+liveResult.phases.length);
  for(let i=1;i<liveResult.frames.length;i++)assert.equal(liveResult.frames[i].frame,(liveResult.frames[i-1].frame+1)%39);
  fs.writeFileSync(path.join(output,'real-clock.json'),JSON.stringify(liveResult,null,2));
  log(`Real wall clock: ${liveResult.frames.length} consecutive frames and ${liveResult.phases.length} blink flips in ~3s at 24fps / 8Hz`);
  await nullPair.locator('.note').fill('Persistence check — isolated test profile');
  assert.equal(await nullPair.locator('.meta-sides').isVisible(),false);
  await nullPair.locator('[data-call="tie"]').click();assert.equal(await nullPair.locator('.meta-sides').isVisible(),true);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  await download.saveAs(path.join(output,'downloaded-responses.js'));
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(output,'downloaded-responses.js'),'utf8'),sandbox);
  assert.equal(sandbox.window.REVIEW_RESPONSES.responses.p07.call,'tie');
  await context.close();page=await open();
  const reopened=page.locator('[data-pair="p07"]');assert.equal(await reopened.locator('[data-call="tie"]').getAttribute('class'),'tie sel');
  assert.equal(await reopened.locator('.note').inputValue(),'Persistence check — isolated test profile');assert.equal(await reopened.locator('.meta-sides').isVisible(),true);
  log('file:// JS Blob download parsed; call/note survive full Chromium close and reopen at exact URL');
  await page.goto(pathToFileURL(path.resolve('gpu-review/setB/review.html')).href);
  const countB=await page.evaluate(()=>Object.keys(window.REVIEW_FRAMES?.pairs||{}).length);
  assert.equal(await page.locator('.pair').count(),countB);
  if(!countB) assert.match(await page.locator('.empty').innerText(),/No matched frame/);
  else await page.waitForFunction(n=>document.querySelectorAll('.stage[data-frame="0"]').length===n,countB);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gpu-review-B-responses')),null);
  log('setB '+(countB?countB+' generated pairs':'empty state')+' and distinct persistence key passed');
  assert.deepEqual(errors,[]);
  log('No page/console errors; no HTTP requests; no escrow requests');
  fs.writeFileSync(path.join(output,'browser-results.txt'),logs.join('\n')+'\n');
  await context.close();
})().catch(async e=>{console.error(e);if(context)await context.close();process.exitCode=1;});
