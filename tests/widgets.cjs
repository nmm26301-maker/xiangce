/* Browser integration for the native widget bridge; launcher/URI grants need Android. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try {
  const web=await browser.newPage({viewport:{width:320,height:740}});
  const errors=[];web.on('pageerror',error=>errors.push(error.message));
  await web.goto('file://'+root+'/FlipYear.html');await web.waitForSelector('.year-option');await web.evaluate(()=>{state.settings.bookRenderer='curl';state.settings.customRenderer='curl';});
  await web.locator('[data-tab="settings"]').click();await web.locator('#addMemoryWidget').click();
  assert.match(await web.locator('#toast').innerText(),/Android APK/);
  assert.equal(await web.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const embedded=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8').match(/const DEMO_PHOTOS=(.*?);\nconst \$=/s)[1]);
  const image=Buffer.from(embedded[0].split(',')[1],'base64');
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
   window.widgetPending=JSON.stringify({open:true,src:'https://flipyear.local/widget-photo/42?v=1',date:'2024-02-29'});
   window.pinRequests=0;window.pinStatus='requested';
   window.Android={consumeWidgetOpen:()=>{const value=window.widgetPending;window.widgetPending='{}';return value;},requestMemoryWidget:()=>{window.pinRequests++;window.onNativeWidgetPinResult(window.pinStatus);}};
  });
  await context.route('https://flipyear.local/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/widget-photo/'))return route.fulfill({body:image,contentType:'image/jpeg'});
   const file=path.join(root,'app/src/main/assets',url.pathname);
   await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://flipyear.local/index.html');await page.waitForSelector('#photoViewer:not([hidden])');
  assert.equal(await page.evaluate(()=>tab),'memories');
  assert.match(await page.locator('#fullPhotoTitle').innerText(),/2024/);
  assert.equal(await page.locator('#fullPhoto').evaluate(node=>node.complete&&node.naturalWidth>0),true);
  assert.equal(await page.locator('#fullPhoto').evaluate(node=>getComputedStyle(node).objectFit),'contain');
  await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();await page.locator('#addMemoryWidget').click();
  assert.equal(await page.evaluate(()=>pinRequests),1);assert.match(await page.locator('#toast').innerText(),/请在桌面确认/);
  await page.evaluate(()=>pinStatus='unsupported');await page.locator('#addMemoryWidget').click();
  assert.match(await page.locator('#toast').innerText(),/长按桌面/);
  // A warm start closes the annual reader and its dialog before displaying the photo.
  await page.locator('[data-tab="years"]').click();await page.locator('#openAnnual').click();await page.waitForFunction(()=>yearEngine?.isReady());
  await page.locator('#yearCoverPick').click();await page.waitForSelector('#coverPicks');
  await page.evaluate(()=>{widgetPending=JSON.stringify({open:true,src:'https://flipyear.local/widget-photo/42?v=2',date:''});onNativeWidgetOpen();});
  assert.equal(await page.locator('#yearReader').isHidden(),true);assert.equal(await page.locator('#dialogLayer').isHidden(),true);
  assert.equal(await page.locator('#photoViewer').isVisible(),true);await page.keyboard.press('Escape');
  // Custom engine is also torn down, rather than left animating behind the viewer.
  await page.locator('[data-tab="albums"]').click();await page.locator('.album-cover').first().click();
  await page.evaluate(()=>{widgetPending=JSON.stringify({open:true,src:'https://flipyear.local/widget-photo/42?v=3'});onNativeWidgetOpen();});
  assert.equal(await page.locator('#reader').isHidden(),true);assert.equal(await page.evaluate(()=>customEngine),null);await page.keyboard.press('Escape');
  // Missing photos and malformed bridge payloads never load a remote or arbitrary source.
  for(const src of ['', 'https://evil.example/p.jpg','file:///etc/passwd','https://flipyear.local/widget-photo/../1?v=1']){
   await page.evaluate(src=>{widgetPending=JSON.stringify({open:true,src});onNativeWidgetOpen();},src);
   assert.equal(await page.locator('#photoViewer').isHidden(),true);
   assert.equal(await page.evaluate(()=>tab),'memories');
  }
  await page.evaluate(()=>{widgetPending='{broken';onNativeWidgetOpen();});
  await page.evaluate(()=>{widgetPending='{}';onNativeWidgetOpen();});
  assert.deepEqual(errors,[]);
  console.log('PASS widget entry, unsupported launcher/web fallback, cold and warm photo opens, annual/custom overlay cleanup, full-aspect photo and invalid-source rejection. Native transport mocked.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
