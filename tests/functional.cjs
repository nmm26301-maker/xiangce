/* Run with NODE_PATH pointing to Playwright, CHROME_BIN set if required. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.join(root,'FlipYear.html'));
 await page.waitForSelector('.year-option');await page.locator('[data-tab="albums"]').click();await page.waitForSelector('.album-card');assert.equal(await page.locator('.album-card').count(),2);
 await page.locator('#continueBook').click();assert.match(await page.locator('#pageIndicator').innerText(),/01/);
 await page.locator('#nextPage').click();await page.waitForFunction(()=>document.querySelector('#pageIndicator strong')?.textContent==='02');
 await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('#pageIndicator strong')?.textContent==='01');
 await page.locator('#nextPage').click();await page.waitForFunction(()=>document.querySelector('#pageIndicator strong')?.textContent==='02');
 await page.locator('#closeReader').click();await page.reload();await page.waitForSelector('.year-option');await page.locator('[data-tab="albums"]').click();await page.waitForSelector('.album-card');await page.locator('#continueBook').click();assert.equal(await page.locator('#pageIndicator strong').innerText(),'02');
 await page.locator('#editPage').click();await page.locator('#caption').fill('山有木兮，风也温柔');await page.locator('#photoDate').fill('2026-10-24');await page.locator('#layout').selectOption('full');await page.locator('#pageOrder').selectOption('0');await page.locator('#pageForm .primary').click();await page.waitForSelector('#dialogLayer[hidden]',{state:'attached'});assert.equal(await page.locator('.paper-page:visible .page-caption').innerText(),'山有木兮，风也温柔');assert.equal(await page.locator('#pageIndicator strong').innerText(),'01');
 await page.locator('#closeReader').click();await page.locator('#newBook').click();await page.locator('#bookName').fill('我的秋日相册');await page.locator('#bookSubtitle').fill('把这一天，留在手边');await page.locator('[data-color="#9a6048"]').click();await page.locator('#bookForm .primary').click();await page.waitForSelector('.reader-empty');
 const photo=await page.evaluate(()=>DEMO_PHOTOS[0]);const img=Buffer.from(photo.split(',')[1],'base64');
 await page.locator('#photoInput').setInputFiles([{name:'一张照片.jpg',mimeType:'image/jpeg',buffer:img},{name:'第二张.jpg',mimeType:'image/jpeg',buffer:img}]);
 await page.waitForSelector('#busy[hidden]',{state:'attached'});await page.waitForSelector('.paper-page:visible .page-image');assert.equal(await page.locator('.thumb').count(),2);
 await page.locator('#editPage').click();await page.locator('#caption').fill('相册第一张');await page.locator('#pageForm .primary').click();await page.waitForSelector('#dialogLayer[hidden]',{state:'attached'});
 // Pointer gesture: next and previous, including live transform feedback.
 await page.mouse.move(300,350);await page.mouse.down();await page.mouse.move(120,350,{steps:12});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#pageIndicator strong')?.textContent==='02');
 await page.mouse.move(100,350);await page.mouse.down();await page.mouse.move(290,350,{steps:12});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#pageIndicator strong')?.textContent==='01');
 await page.locator('#editPage').click();await page.locator('#removePage').click();await page.locator('#keepPhoto').click();assert.equal(await page.locator('.thumb').count(),2);
 await page.locator('#closeReader').click();await page.reload();await page.waitForSelector('.year-option');await page.locator('[data-tab="albums"]').click();await page.waitForSelector('.album-card');assert.equal(await page.locator('.album-card').count(),3);await page.locator('#continueBook').click();assert.equal(await page.locator('.thumb').count(),2);assert.equal(await page.locator('.paper-page:visible .page-caption').innerText(),'相册第一张');await page.locator('#closeReader').click();
 await page.locator('[data-tab="settings"]').click();await page.locator('#nightMode').check();await page.locator('#reduceMotion').check();await page.locator('#flipSpeed').selectOption('550');assert.equal(await page.locator('body:not(.light).reduced').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportAll').click();const download=await downloadPromise;const backup=path.join(root,'tests','roundtrip.json');await download.saveAs(backup);const content=JSON.parse(fs.readFileSync(backup,'utf8'));assert.equal(content.books.length,3);assert.equal(content.books[2].pages.length,2);
 await page.locator('#backupInput').setInputFiles(backup);await page.waitForSelector('#confirmRestore');await page.locator('#confirmRestore').click();await page.waitForSelector('#busy[hidden]',{state:'attached'});assert.equal(await page.locator('.album-card').count(),6);
 await page.locator('[data-tab="settings"]').click();await page.locator('#backupInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});await page.waitForSelector('#busy[hidden]',{state:'attached'});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('有效的'));assert.equal(await page.locator('.album-card').count(),6);
 await page.reload();await page.waitForSelector('.year-option');await page.locator('[data-tab="albums"]').click();await page.waitForSelector('.album-card');assert.equal(await page.locator('body:not(.light).reduced').count(),1);
 await page.locator('[data-tab="memories"]').click();assert.ok(await page.locator('.memory-row').count()>0);await page.locator('.memory-photos button').first().click();await page.waitForSelector('#photoViewer:not([hidden])');assert.equal(await page.locator('#reader').isHidden(),true);await page.keyboard.press('Escape');
 await page.locator('[data-tab="albums"]').click();await page.locator('[data-filter="mine"]').click();assert.equal(await page.locator('.album-card').count(),4);
 await page.locator('[data-filter="all"]').click();await page.locator('.album-info .icon').last().click();await page.locator('#deleteBook').click();await page.locator('#confirmDelete').click();await page.waitForSelector('#dialogLayer[hidden]',{state:'attached'});assert.equal(await page.locator('.album-card').count(),5);
 // Mobile, tablet, desktop, landscape and enlarged system text.
 for(const viewport of [{width:320,height:740},{width:375,height:812},{width:768,height:1024},{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(viewport));
  await page.locator('#continueBook').click();assert.equal(await page.evaluate(()=>document.querySelector('#reader').scrollWidth<=innerWidth),true,'reader overflow '+JSON.stringify(viewport));await page.locator('#closeReader').click();
 }
 await page.setViewportSize({width:375,height:812});await page.evaluate(()=>document.body.style.fontSize='24px');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await context.close();await browser.close();fs.unlinkSync(backup);assert.deepEqual(errors,[]);console.log('PASS: flip buttons/keyboard/gestures, progress persistence, creation/import, captions/date/layout/order, removal cancel, backup/restore/invalid backup, preferences, timeline, filters, deletion, responsive layouts, no uncaught JS errors.');
})().catch(e=>{console.error(e);process.exit(1)});
