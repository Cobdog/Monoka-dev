// Run from the repository root. Writes actual browser frame captures to /tmp.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const output = '/tmp/gpu-review-evidence';
fs.mkdirSync(output, {recursive:true});
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:600}});
    await page.goto(pathToFileURL(path.resolve('gpu-review/setA/review-v2.html')).href);
    await page.evaluate(() => {
      document.body.innerHTML = '<canvas id="sample" style="display:block"></canvas>';
      document.body.style.margin = '0';
    });
    const results = [];
    for (const side of ['L','R']) for (const index of [60,61,62,63]) for (const offset of [0,.5]) {
      const mediaTime = await page.evaluate(async ({side,index,offset}) => {
        const video = document.createElement('video');
        video.src = `pairs/p03_${side}.mp4`;
        document.body.append(video);
        await new Promise((resolve,reject) => {video.onloadeddata=resolve;video.onerror=reject;});
        const presented = new Promise(resolve => video.requestVideoFrameCallback((_,meta) => resolve(meta.mediaTime)));
        await new Promise(resolve => {video.onseeked=resolve;video.currentTime=(index+offset)/24;});
        const timestamp = await presented;
        const canvas = document.querySelector('canvas');
        canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        canvas.getContext('2d').drawImage(video,0,0);
        video.remove();
        return timestamp;
      }, {side,index,offset});
      await page.locator('canvas').screenshot({path:path.join(output,`seek-p03-${side}-${index}-${offset}.png`)});
      results.push({side,index,offset,mediaTime});
    }
    fs.writeFileSync(path.join(output,'boundaries.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify(results,null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
