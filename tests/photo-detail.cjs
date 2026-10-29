const openReaderTools=require('./reader-tools.cjs');
/* Native region transport is simulated with real crops; Android device testing is separate. */
const {chromium}=require('playwright'),sharp=require('sharp'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="4000"><defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="white"/><rect width="16" height="16" fill="black"/><rect x="16" y="16" width="16" height="16" fill="black"/></pattern></defs><rect width="6000" height="4000" fill="url(#p)"/></svg>');
  const original=await sharp(svg).png().toBuffer(),preview=await sharp(original).resize(640).jpeg({quality:70}).toBuffer();
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2});
  await context.addInitScript(()=>{window.PhotoMedia={inspectPhoto:()=>{}};});
  const tiles=[];let delay=false,unavailable=false;
  await context.route('https://flipyear.local/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.startsWith('/custom-media/'))return route.fulfill({body:preview,contentType:'image/jpeg'});
   if(u.pathname.endsWith('/info'))return route.fulfill({json:{width:6000,height:4000,regionSupported:true}});
   if(u.pathname.endsWith('/tile')){
    if(unavailable)return route.fulfill({status:404,body:''});
    const n=k=>Number(u.searchParams.get(k)),r={left:n('x'),top:n('y'),width:n('w'),height:n('h')};tiles.push(r);
    assert.ok(r.left>=0&&r.top>=0&&r.left+r.width<=6000&&r.top+r.height<=4000);
    if(delay)await new Promise(resolve=>setTimeout(resolve,300));
    const data=await sharp(original).extract(r).png().toBuffer();try{return await route.fulfill({body:data,contentType:'image/png'});}catch{return;}
   }
   const f=path.join(root,'app/src/main/assets',u.pathname);return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html'});
  });
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://flipyear.local/index.html');await p.waitForSelector('.year-option');
  assert.equal(await p.evaluate(()=>state.settings.bookRenderer),'webgl');assert.equal(await p.evaluate(()=>state.settings.customRenderer),'webgl');
  await p.locator('[data-tab="albums"]').click();await p.locator('#continueBook').click();await p.waitForFunction(()=>customEngine?.isWebGL&&customEngine.isReady());
  assert.match(await p.locator('#customRenderMode').innerText(),/已开启/);assert.equal(await p.evaluate(()=>customEngine.stacks.length),14);
  await p.locator('#nextPage').click();await p.waitForFunction(()=>pageIndex===1&&!customEngine.isAnimating());
  await openReaderTools(p);await p.locator('#customViewPhoto').click();await p.waitForSelector('#photoViewer:not([hidden])');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>pageIndex),1);
  const b=await p.locator('#stage canvas').boundingBox(),x=b.x+b.width*.85,y=b.y+b.height/2;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-b.width*.4,y,{steps:12});await p.waitForFunction(()=>customEngine.turn?.ready);
  assert.ok(await p.evaluate(()=>{const a=customEngine.book.flipGeom.attributes.position;return Array.from({length:a.count},(_,i)=>a.getZ(i)).some(z=>z>.3);}));
  await p.mouse.up();await p.waitForFunction(()=>!customEngine.isAnimating());await p.locator('#closeReader').click();
  await p.evaluate(()=>{const id='local-photo-11111111-1111-4111-8111-111111111111';showPhoto([{id:'original',kind:'photo',originalId:id,src:localPoster(id),date:'2026-10-27'},{id:'old',src:DEMO_PHOTOS[0],date:''}],0);});
  await p.waitForFunction(()=>detailInfo?.width===6000&&photoZoom);await p.locator('#photoOneToOne').click();await p.waitForFunction(()=>!detailCanvas.hidden);assert.ok(await p.evaluate(()=>photoZoom.getScale()>4));
  const first=tiles.at(-1);assert.ok(first.width<2000,'Only the visible original region is requested');
  const check=await p.evaluate(()=>{const g=detailGeometry(),c=detailCanvas.getContext('2d'),sx=detailCanvas.width/g.v.width,sy=detailCanvas.height/g.v.height;let bad=0,total=0;
   for(let j=1;j<8;j++)for(let i=1;i<8;i++){const ox=g.x+Math.floor(g.w*i/8),oy=g.y+Math.floor(g.h*j/8);if(ox%16<3||oy%16<3||ox%16>12||oy%16>12)continue;const dx=g.cx-g.v.left+ox*g.ratio,dy=g.cy-g.v.top+oy*g.ratio;const pixel=c.getImageData(Math.floor(dx*sx),Math.floor(dy*sy),1,1).data;if(pixel[3]!==255)continue;const expected=(Math.floor(ox/16)+Math.floor(oy/16))%2?255:0;total++;if(Math.abs(pixel[0]-expected)>5)bad++;}return{bad,total};});
  assert.ok(check.total>2);assert.equal(check.bad,0,'Original pixels align with the zoomed preview');
  const v=await p.locator('#photoViewport').boundingBox();await p.mouse.move(v.x+v.width/2,v.y+v.height/2);await p.mouse.down();await p.mouse.move(v.x+v.width/2+60,v.y+v.height/2+30,{steps:8});await p.mouse.up();await p.waitForFunction(()=>!detailCanvas.hidden);assert.notDeepEqual(tiles.at(-1),first);
  delay=true;await p.locator('#photoZoomIn').click();await p.locator('#fullPhotoNext').click();await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>detailCanvas.hidden),true);assert.equal(await p.evaluate(()=>detailInfo),null);assert.match(await p.locator('#photoDetailStatus').innerText(),/压缩照片/);
  await p.locator('#fullPhotoPrev').click();await p.waitForFunction(()=>detailInfo);unavailable=true;await p.locator('#photoOneToOne').click();await p.waitForFunction(()=>$('photoDetailStatus').textContent.includes('暂不可用'));assert.equal(await p.evaluate(()=>detailCanvas.hidden),true);
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>detailInfo),null);assert.deepEqual(errors,[]);await context.close();
  console.log('PASS default 3D/custom curved mesh; original 6000x4000 region alignment at 1:1, pan, stale cancellation and unavailable-source fallback. Android transport simulated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
