const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {openPhotoTools}=require('./year-tools.cjs');
const P='local-photo-11111111-1111-4111-8111-111111111111',Q='local-photo-22222222-2222-4222-8222-222222222222';
const poster=id=>'https://flipyear.local/custom-media/'+id+'/poster';
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const photo=await sharp({create:{width:800,height:1200,channels:3,background:'#1768dc'}}).png().toBuffer();
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(()=>{
   window.nativeResult=null;window.calls={choose:[],ack:[],archives:[],cleanup:[],fullscreen:[]};
   window.Android={setReaderFullscreen:v=>calls.fullscreen.push(v)};
   window.AlbumMedia={choosePhotos:target=>calls.choose.push(target),resultUrl:()=>nativeResult?'https://flipyear.local/album-result/'+nativeResult.token:'',finishResult:(token,keep)=>{calls.ack.push({token,keep});nativeResult=null;},saveArchive:json=>calls.archives.push(JSON.parse(json)),cleanup:json=>{calls.cleanup.push(JSON.parse(json));onAlbumCleanup(0);}};
  });
  await context.route('https://flipyear.local/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/custom-media/'))return route.fulfill({body:photo,contentType:'image/png'});
   if(url.pathname.startsWith('/photo-detail/'))return route.fulfill({status:404,body:''});
   if(url.pathname.startsWith('/album-result/'))return route.fulfill({body:JSON.stringify(await route.request().frame().evaluate(()=>nativeResult)),contentType:'application/json'});
   const file=path.join(root,'app/src/main/assets',url.pathname);await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://flipyear.local/index.html');await p.waitForSelector('#addToday');
  const initialBooks=await p.evaluate(()=>state.books.length);
  await p.locator('#addToday').click();assert.equal(await p.evaluate(()=>calls.choose.at(-1)),'day:'+await p.evaluate(()=>localToday()));
  await p.evaluate(()=>onAlbumMediaError('已取消选择'));assert.equal(await p.locator('#busy').isHidden(),true);assert.equal(await p.evaluate(()=>state.dailyPhotos.length),0);
  await p.locator('#openAnnual').click();await p.waitForFunction(()=>yearEngine?.isWebGL&&yearEngine.isReady());await p.locator('#yearMonths [data-month="9"]').click();await p.waitForFunction(()=>yearEngine.index===10&&yearEngine.isReady());
  // Real ray picking must work on an empty date, not only dates with thumbnails.
  const point=await p.evaluate(()=>{const e=yearEngine,c=e.displayed[0].dayHits.find(h=>h.date==='2026-10-05'),v=e.book.meshR.position.clone().set(((c.x+c.w/2)/e.textureWidth-.5)*e.book.PW,(.5-(c.y+c.h/2)/e.textureHeight)*e.book.PH,0);e.book.meshR.localToWorld(v);v.project(e.book.camera);const r=e.canvas.getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};});
  await p.touchscreen.tap(point.x,point.y);assert.equal(await p.evaluate(()=>calls.choose.at(-1)),'day:2026-10-05');
  const page={originalId:P,src:poster(P),originalBytes:123456,originalSha256:'a'.repeat(64),originalMime:'image/jpeg',width:800,height:1200,filename:'IMG_20200101.jpg',date:'2020-01-01'};
  const result={type:'importPhotos',token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',target:'day:2026-10-05',pages:[page]};
  await p.evaluate(async r=>{nativeResult=r;await onAlbumMediaResult();},result);await p.waitForFunction(()=>yearEngine.isReady());
  assert.equal(await p.evaluate(()=>state.books.length),initialBooks,'No album is created');assert.equal(await p.evaluate(()=>state.dailyPhotos[0].date),'2026-10-05','Selected date wins over EXIF and filename');assert.equal(await p.evaluate(()=>yearPhotosByDate.get('2026-10-05').length),1);
  await p.evaluate(async r=>{nativeResult=r;await onAlbumMediaResult();},result);assert.equal(await p.evaluate(()=>state.dailyPhotos.length),1,'Replayed transport results are idempotent');
  const failed={...result,token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',pages:[{...page,originalId:Q,src:poster(Q)}]};
  await p.evaluate(async r=>{const previous=save;save=async()=>false;try{nativeResult=r;await onAlbumMediaResult();}finally{save=previous;}},failed);assert.equal(await p.evaluate(()=>state.dailyPhotos.length),1);assert.equal(await p.evaluate(()=>calls.ack.at(-1).keep),false,'Failed storage rejects only the new copy');
  await p.evaluate(()=>openJournalDay('2026-10-05'));await p.waitForSelector('#photoViewer:not([hidden])');await p.waitForFunction(()=>$('fullPhoto').complete&&$('fullPhoto').naturalWidth>0);
  assert.equal(await p.locator('#journalViewerTools').isVisible(),false);assert.equal(await p.evaluate(()=>calls.fullscreen.at(-1)),false,'Annual photos do not force native immersive mode');
  for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await p.setViewportSize(viewport);await p.waitForTimeout(280);const bounds=await p.locator('#photoViewport').boundingBox();assert.equal(bounds.width,viewport.width);assert.equal(bounds.height,viewport.height);
   const pixels=await sharp(await p.screenshot()).raw().toBuffer({resolveWithObject:true}),scale=Math.min(viewport.width/800,viewport.height/1200),left=(viewport.width-800*scale)/2,top=(viewport.height-1200*scale)/2;
   const color=(x,y)=>{const at=(Math.floor(y)*pixels.info.width+Math.floor(x))*pixels.info.channels;return [...pixels.data.subarray(at,at+3)];};
   assert.ok(color(left+800*scale*.25,top+1200*scale*.25)[2]>150,'Complete image fills expected contain bounds');
   if(top>60)assert.ok(color(8,top-10).every(v=>v<4),'Top black mat');if(left>60)assert.ok(color(left-10,viewport.height/2).every(v=>v<4),'Side black mat');
  }
  await p.setViewportSize({width:390,height:844});await p.locator('#addDayPhoto').click();assert.equal(await p.evaluate(()=>calls.choose.at(-1)),'day:2026-10-05');await p.evaluate(()=>onAlbumMediaError('已取消选择'));
  await p.evaluate(async()=>exportBackup());const backup=await p.evaluate(()=>calls.archives.at(-1));assert.equal(backup.version,3);assert.equal(backup.books.filter(b=>b.dailyJournal).length,1);assert.equal(backup.books.find(b=>b.dailyJournal).pages[0].originalId,P);await p.evaluate(()=>onAlbumArchiveSaved());
  await p.locator('#closeYearReader').click();await p.locator('[data-tab="settings"]').click();await p.locator('#cleanupVideos').click();await p.locator('#confirmCleanupVideos').click();await p.waitForFunction(()=>calls.cleanup.length);assert.ok((await p.evaluate(()=>calls.cleanup.at(-1))).includes(P),'Daily original survives cleanup');
  const restore=JSON.parse(JSON.stringify(backup));restore.books=restore.books.filter(b=>b.dailyJournal);restore.books[0].pages[0].originalId=Q;restore.books[0].pages[0].src=poster(Q);
  await p.evaluate(async backup=>{nativeResult={type:'restore',token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',backup};await onAlbumMediaResult();},restore);await p.locator('#confirmVideoRestore').click();await p.waitForFunction(()=>state.dailyPhotos.length===2);assert.equal(await p.evaluate(()=>state.books.length),initialBooks,'ZIP restores journal photos outside albums');
  await p.reload();await p.waitForSelector('#addToday');assert.equal(await p.evaluate(()=>state.dailyPhotos.length),2,'Daily photos persist across reload');assert.equal(await p.evaluate(()=>state.dailyPhotos[0].originalId),P);
  await p.locator('[data-tab="memories"]').click();assert.equal(await p.locator('.memory-photos img').evaluateAll(nodes=>nodes.filter(n=>n.src.includes('/custom-media/')).length),2);
  // Compatibility calendar exposes every real day as a native button.
  await p.evaluate(()=>{state.settings.bookRenderer='curl';openYearbook(2026,9);});await p.waitForFunction(()=>yearEngine?.isReady());
  assert.equal(await p.locator('.calendar-leaf:visible button[data-action="day"]').count(),31);
  const chooser=p.locator('.calendar-leaf:visible [data-date="2026-10-06"]');await chooser.focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>calls.choose.at(-1)),'day:2026-10-06');await p.evaluate(()=>onAlbumMediaError('已取消选择'));
  await p.locator('.calendar-leaf:visible [data-date="2026-10-05"]').click();await p.waitForSelector('#photoViewer:not([hidden])');await openPhotoTools(p);await p.locator('#removeDailyPhoto').click();await p.locator('#keepDailyPhoto').click();assert.equal(await p.evaluate(()=>state.dailyPhotos.length),2);await p.locator('#removeDailyPhoto').click();await p.locator('#confirmRemoveDaily').click();await p.waitForFunction(()=>state.dailyPhotos.length===1&&$('photoViewer').hidden);assert.equal(await p.evaluate(()=>state.books.length),initialBooks);
  // The native result is replayed only after IndexedDB and all app modules load.
  await p.addInitScript(r=>{window.nativeResult=r;},{...result,token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',target:'day:2024-02-29'});
  await p.reload();await p.waitForFunction(()=>state?.dailyPhotos?.length===2&&$('busy').hidden);assert.equal(await p.evaluate(()=>state.dailyPhotos.at(-1).date),'2024-02-29');assert.equal(await p.evaluate(()=>calls.ack.at(-1).keep),true);
  assert.deepEqual(errors,[]);await context.close();
  // Web fallback stores bytes directly and JSON restores to the same collection.
  const web=await browser.newPage({viewport:{width:390,height:844}});await web.goto('file://'+root+'/FlipYear.html');await web.waitForSelector('#addToday');
  await web.evaluate(()=>chooseJournalPhotos('2024-02-29'));await web.locator('#journalPhotoInput').setInputFiles({name:'20200101.png',mimeType:'image/png',buffer:photo});await web.waitForFunction(()=>state.dailyPhotos.length===1&&$('busy').hidden);
  assert.equal(await web.evaluate(()=>state.dailyPhotos[0].date),'2024-02-29');assert.equal(await web.evaluate(()=>state.dailyPhotos[0].src),'data:image/png;base64,'+photo.toString('base64'),'No JPEG recompression');
  const json=await web.evaluate(()=>JSON.stringify({format:'flipyear',version:1,books:journalBackupBooks(state.books).filter(b=>b.dailyJournal)}));await web.locator('#backupInput').setInputFiles({name:'daily.json',mimeType:'application/json',buffer:Buffer.from(json)});await web.locator('#confirmRestore').click();await web.waitForFunction(()=>state.dailyPhotos.length===2);assert.equal(await web.evaluate(()=>state.books.length),2);
  await web.close();console.log('PASS daily direct import, empty-day ray picking and keyboard, selected-date priority, originals, idempotence, storage rollback, no album creation, contain-size pixels, no forced fullscreen, append, ZIP/JSON restore, cleanup protection, reload, timeline and removal. Native transport mocked; no physical-phone test.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
