const openReaderTools=require('./reader-tools.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P='local-photo-11111111-1111-4111-8111-111111111111',Q='local-photo-22222222-2222-4222-8222-222222222222';
const V='local-video-33333333-3333-4333-8333-333333333333',W='local-video-44444444-4444-4444-8444-444444444444';
const poster=id=>'https://flipyear.local/custom-media/'+id+'/poster';
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});
 try{
  const demo=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8').match(/const DEMO_PHOTOS=(.*?);\nconst \$=/s)[1]);
  const image=Buffer.from(demo[0].split(',')[1],'base64');const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(()=>{
   window.nativeResult=null;window.requests={photos:[],pairs:[],exports:[],inspect:[],motion:[],videos:[],archives:[],ack:[],cleanup:[],reports:[]};
   window.Android={playVideo:id=>requests.videos.push(id),saveBackup:(name,json)=>requests.reports.push(JSON.parse(json))};
   window.AlbumMedia={choosePhotos:id=>requests.photos.push(id),pairVideo:(book,page)=>requests.pairs.push({book,page}),resultUrl:()=>nativeResult?'https://flipyear.local/album-result/'+nativeResult.token:'',finishResult:(token,keep)=>{requests.ack.push({token,keep});nativeResult=null;},saveArchive:json=>requests.archives.push(JSON.parse(json)),cleanup:ids=>{requests.cleanup.push(JSON.parse(ids));onAlbumCleanup(1);}};
   window.PhotoMedia={inspectPhoto:(id,token)=>requests.inspect.push({id,token}),playMotion:id=>requests.motion.push(id),exportOriginal:(id,name,hash,bytes)=>requests.exports.push({id,name,hash,bytes}),deviceReport:()=>JSON.stringify({manufacturer:'mock-device',physicalDeviceTest:'not executed'})};
  });
  await context.route('https://flipyear.local/**',async route=>{
   const url=new URL(route.request().url());if(url.pathname.startsWith('/photo-detail/'))return route.fulfill({status:404,body:''});if(url.pathname.startsWith('/custom-media/'))return route.fulfill({body:image,contentType:'image/jpeg'});
   if(url.pathname.startsWith('/album-result/'))return route.fulfill({body:JSON.stringify(await route.request().frame().evaluate(()=>nativeResult)),contentType:'application/json'});
   const file=path.join(root,'app/src/main/assets',url.pathname);await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://flipyear.local/index.html');await p.waitForSelector('.year-option');await p.evaluate(()=>{state.settings.bookRenderer='curl';state.settings.customRenderer='curl';});
  await p.locator('[data-tab="albums"]').click();await p.locator('#newBook').click();await p.locator('#bookName').fill('原图与实况');await p.locator('#bookForm .primary').click();await p.waitForFunction(()=>current()?.title==='原图与实况'&&!$('reader').hidden);
  const book=await p.evaluate(()=>current().id);await openReaderTools(p);await p.locator('#addPhoto').click();assert.deepEqual(await p.evaluate(()=>requests.photos),[book]);
  const page={kind:'photo',originalId:P,src:poster(P),originalBytes:12345678,originalSha256:'a'.repeat(64),originalMime:'image/jpeg',width:6000,height:4000,filename:'IMG_20240901.jpg',date:'',caption:'',layout:'classic'};
  await p.evaluate(async result=>{nativeResult=result;await onAlbumMediaResult();},{type:'importPhotos',token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',target:book,pages:[page],created:[P]});
  assert.equal(await p.evaluate(()=>current().pages[0].originalId),P);assert.equal(await p.evaluate(()=>current().pages[0].date),'2024-09-01');
  await p.locator('.photo-leaf:visible .page-image').tap();await p.waitForSelector('#photoViewer:not([hidden])');
  assert.equal(await p.locator('#fullPhoto').getAttribute('src'),poster(P)+'?size=full');assert.equal(await p.locator('#saveOriginal').isVisible(),true);
  assert.equal(await p.locator('#enhanceOriginal').count(),0);
  const token=await p.evaluate(()=>motionToken);await p.evaluate(()=>onPhotoMotion('stale',true,'wrong photo'));assert.equal(await p.locator('#playMotion').isHidden(),true);
  await p.evaluate(token=>onPhotoMotion(token,true,'JPEG 实况照片'),token);await p.locator('#playMotion').click();assert.deepEqual(await p.evaluate(()=>requests.motion),[P]);
  await p.locator('#saveOriginal').click();const request=await p.evaluate(()=>requests.exports.at(-1));assert.deepEqual(request,{id:P,name:page.filename,hash:page.originalSha256,bytes:page.originalBytes});await p.evaluate(()=>onOriginalMessage('已取消原文件保存'));
  await p.locator('#pairMotion').click();await p.locator('#confirmPairMotion').click();const pageId=await p.evaluate(()=>current().pages[0].id);assert.deepEqual(await p.evaluate(()=>requests.pairs.at(-1)),{book,page:pageId});
  const video={kind:'video',videoId:V,src:poster(V),filename:'corresponding.MOV',durationMs:1800};
  await p.evaluate(async result=>{nativeResult=result;await onAlbumMediaResult();},{type:'pair',token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',target:book,pageId,pages:[video],created:[V]});
  assert.equal(await p.evaluate(()=>current().pages.length),1);assert.equal(await p.evaluate(()=>current().pages[0].liveVideoId),V);
  await p.locator('#playMotion').click();assert.equal(await p.evaluate(()=>requests.videos.at(-1)),V);
  await p.evaluate(async id=>exportBackup(state.books.filter(b=>b.id===id)),book);const archive=await p.evaluate(()=>requests.archives.at(-1));assert.equal(archive.version,3);assert.equal(archive.books[0].pages[0].originalSha256,page.originalSha256);assert.equal(archive.books[0].pages[0].liveVideoId,V);await p.evaluate(()=>onAlbumArchiveSaved());
  // Failed replacement rolls back the link and drops only the newly copied video.
  await p.evaluate(async result=>{const previous=save;save=async()=>false;try{nativeResult=result;await onAlbumMediaResult();}finally{save=previous;}},{type:'pair',token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',target:book,pageId,pages:[{...video,videoId:W,src:poster(W)}],created:[W]});
  assert.equal(await p.evaluate(()=>current().pages[0].liveVideoId),V);assert.equal(await p.evaluate(()=>requests.ack.at(-1).keep),false);
  await p.keyboard.press('Escape');await p.locator('#closeReader').click();await p.locator('[data-tab="settings"]').click();await p.locator('#cleanupVideos').click();
  const cleanupBefore=await p.evaluate(()=>requests.cleanup.length);
  await p.locator('#confirmCleanupVideos').click();
  // The click handler persists IndexedDB before it calls the native cleanup bridge.
  await p.waitForFunction(before=>requests.cleanup.length>before,cleanupBefore);
  assert.deepEqual((await p.evaluate(()=>requests.cleanup.at(-1))).sort(),[P,V].sort());
  const restore=JSON.parse(JSON.stringify(archive));restore.books[0].pages[0].originalId=Q;restore.books[0].pages[0].src=poster(Q);restore.books[0].pages[0].liveVideoId=W;
  const before=await p.evaluate(()=>state.books.length);
  await p.evaluate(async result=>{nativeResult=result;await onAlbumMediaResult();},{type:'restore',token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',backup:restore,created:[Q,W]});
  await p.locator('#confirmVideoRestore').click();await p.waitForFunction(n=>state.books.length===n+1,before);assert.equal(await p.evaluate(()=>state.books.at(-1).pages[0].originalId),Q);assert.equal(await p.evaluate(()=>state.books.at(-1).pages[0].liveVideoId),W);
  const bad=JSON.parse(JSON.stringify(restore));bad.books[0].pages[0].originalSha256='wrong';
  assert.equal(await p.evaluate(value=>{try{validateAlbumArchive(value);return false;}catch{return true;}},bad),true);
  assert.equal(await p.evaluate(value=>{value.version=1;try{validateBackup(value);return false;}catch{return true;}},restore),true,'Reference-only JSON never pretends to contain originals');
  await p.locator('[data-tab="settings"]').click();await p.locator('#deviceReport').click();assert.equal(await p.evaluate(()=>requests.reports.at(-1).results.physicalDeviceVerified),false);
  await p.reload();await p.waitForSelector('.year-option');await p.evaluate(()=>{state.settings.bookRenderer='curl';state.settings.customRenderer='curl';});assert.equal(await p.evaluate(id=>state.books.find(b=>b.id===id).pages[0].originalId,book),P);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS AI entry removed; original import metadata, full preview, stale motion callback rejection, embedded/paired playback transport, raw export, SHA references, v3 ZIP, pair rollback, cleanup retention, restore and honest device report. Native transport mocked.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
