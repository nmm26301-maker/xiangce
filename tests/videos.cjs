/* Native transport is mocked. Actual playback/codecs/permissions need an Android device. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try {
  const embedded=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8').match(/const DEMO_PHOTOS=(.*?);\nconst \$=/s)[1]),image=Buffer.from(embedded[0].split(',')[1],'base64');
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await context.addInitScript(()=>{window.playCalls=[];window.refreshCalls=0;window.access='partial';window.Android={galleryAccess:()=>access,playVideo:id=>playCalls.push(id),refreshGallery:()=>refreshCalls++};});
  await context.route('https://flipyear.local/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/media/'))return route.fulfill(url.pathname==='/media/video/8'?{status:404,body:''}:{body:image,contentType:'image/jpeg'});
   const file=path.join(root,'app/src/main/assets',url.pathname);
   await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://flipyear.local/index.html');await page.waitForFunction(()=>typeof window.onNativeVideoError==='function');await page.waitForSelector('.year-option');await page.evaluate(()=>{state.settings.bookRenderer='curl';state.settings.customRenderer='curl';});
  const now=new Date(),today=`${now.getFullYear()-1}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const records=[{id:'device-7',kind:'photo',src:'https://flipyear.local/media/7?v=1',date:'2024-06-12',dateSource:'taken'},
   {id:'device-video-7',kind:'video',src:'https://flipyear.local/media/video/7?v=1',date:'2024-06-12',durationMs:61000,dateSource:'taken',filename:'六月.mp4'},
   {id:'device-video-8',kind:'video',src:'https://flipyear.local/media/video/8?v=1',date:'2024-06-13',durationMs:0,dateSource:'taken'},
   {id:'device-video-9',kind:'video',src:'https://flipyear.local/media/video/9?v=1',date:today,durationMs:3601000,dateSource:'taken'},
   {id:'device-video-10',kind:'video',src:'https://flipyear.local/media/video/10?v=1',date:'',durationMs:800,dateSource:'unknown'}];
  await page.evaluate(async records=>{beginGalleryImport();receiveGalleryBatch(records.slice(0,2));receiveGalleryBatch(records.slice(2));await finishGalleryImport('partial',null,{images:'full',videos:'partial'});},records);
  assert.equal(await page.evaluate(()=>state.gallery.length),5);assert.match(await page.locator('#galleryStatus').innerText(),/1 张照片 · 4 段视频/);
  assert.deepEqual(await page.evaluate(()=>[durationText(61000),durationText(3601000),durationText(0),durationText(NaN),durationText(Infinity)]),['1:01','1:00:01','时长未知','时长未知','时长未知']);
  await page.locator('[data-year="2024"]').click();assert.match(await page.locator('#annualCaptionMeta').innerText(),/1 张照片 · 2 段视频/);
  await page.locator('#openAnnual').click();await page.waitForFunction(()=>yearEngine?.isReady());await page.locator('#yearMonths [data-month="5"]').click();
  const day=page.locator('.calendar-leaf:visible [data-date="2024-06-12"]');assert.match(await day.getAttribute('aria-label'),/1 张照片 · 1 段视频/);assert.equal(await day.locator('.video-badge').count(),1);
  await day.click();await page.waitForSelector('#photoViewer:not([hidden])');assert.equal(await page.locator('#playVideo').isHidden(),true);
  await page.locator('#fullPhotoNext').click();assert.match(await page.locator('#playVideo').innerText(),/1:01/);assert.deepEqual(await page.evaluate(()=>playCalls),[]);
  await page.locator('#playVideo').click();assert.deepEqual(await page.evaluate(()=>playCalls),['device-video-7']);
  await page.evaluate(()=>onNativeVideoError());assert.match(await page.locator('#toast').innerText(),/未能打开/);
  await page.keyboard.press('Escape');await page.locator('.calendar-leaf:visible [data-date="2024-06-13"]').click();
  await page.waitForFunction(()=>document.querySelector('#fullPhoto').complete);assert.equal(await page.locator('#playVideo').isVisible(),true);await page.locator('#playVideo').click();assert.equal(await page.evaluate(()=>playCalls.at(-1)),'device-video-8');
  await page.keyboard.press('Escape');await page.locator('#monthPhotos').click();assert.match(await page.locator('#dayPhotoList').innerText(),/视频 1:01/);await page.keyboard.press('Escape');
  await page.locator('#yearCoverPick').click();await page.locator('#coverPicks button').nth(1).click();await page.waitForSelector('#dialogLayer[hidden]',{state:'attached'});assert.equal(await page.evaluate(()=>state.yearCovers[2024]),'device-video-7');
  await page.locator('#closeYearReader').click();await page.locator('[data-tab="memories"]').click();assert.equal(await page.locator('#todayCard .video-badge').count(),1);
  await page.locator('#todayCard button').click();assert.match(await page.locator('#playVideo').innerText(),/1:00:01/);await page.keyboard.press('Escape');
  // Removing a type's grant filters old records even when the current scan fails.
  await page.locator('[data-tab="years"]').click();await page.locator('[data-year="2024"]').click();await page.locator('#openAnnual').click();await page.waitForFunction(()=>yearEngine?.isReady());
  await page.evaluate(async()=>{beginGalleryImport();receiveGalleryBatch([{id:'uncommitted'}]);await finishGalleryImport('partial','读取失败',{images:'full',videos:'denied'});});
  assert.equal(await page.evaluate(()=>state.gallery.length),1);assert.equal(await page.locator('#yearReader').isHidden(),true);assert.equal(await page.locator('#busy').isHidden(),true);
  await page.evaluate(async records=>{beginGalleryImport();receiveGalleryBatch(records);await finishGalleryImport('partial',null,{images:'denied',videos:'full'});},records);
  assert.equal(await page.evaluate(()=>state.gallery.length),4);assert.ok((await page.evaluate(()=>state.gallery)).every(p=>p.kind==='video'));
  // Resume/reselection refreshes an existing partial index, including same enum values.
  const before=await page.evaluate(()=>refreshCalls);await page.evaluate(()=>onNativeGalleryChanged());assert.equal(await page.evaluate(()=>refreshCalls),before+1);
  await page.evaluate(()=>onGalleryPermissionChanged());assert.equal(await page.evaluate(()=>state.gallery.length),0);assert.equal(await page.evaluate(()=>refreshCalls),before+2);
  await page.evaluate(async records=>{beginGalleryImport();receiveGalleryBatch(records);await finishGalleryImport('full',null);beginGalleryImport();await finishGalleryImport('denied','授权已收回',{images:'denied',videos:'denied'});},records);
  assert.equal(await page.evaluate(()=>state.gallery.length),0);assert.equal(await page.evaluate(()=>state.books.length),2);
  // Missing native support and malicious identifiers produce a message, not a launch.
  await page.evaluate(records=>showPhoto([records[1]],0),records);await page.evaluate(()=>delete Android.playVideo);await page.locator('#playVideo').click();assert.match(await page.locator('#toast').innerText(),/Android APK/);
  await page.evaluate(()=>{photoSet[0].id='https://example.com/video.mp4';});await page.locator('#playVideo').click();assert.match(await page.locator('#toast').innerText(),/索引无效/);
  assert.equal(await page.evaluate(()=>playCalls.length),2);
  for(const viewport of [{width:320,height:740},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.locator('#photoViewer').evaluate(n=>n.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#playVideo').isVisible(),true);}
  await page.screenshot({path:path.join(root,'build/video-preview-internal.png')});
  assert.deepEqual(errors,[]);console.log('PASS photo/video batches, day and month badges, durations, explicit native playback, poster failure, video covers, on-this-day, grant filtering on scan failure, partial refresh/revocation, bridge fallback, invalid IDs and responsive preview. Native transport mocked.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
