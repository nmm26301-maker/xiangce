const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('file://'+path.join(root,'FlipYear.html'));await p.waitForSelector('.year-option');await p.locator('#openAnnual').click();await p.waitForFunction(()=>yearEngine?.isReady());
  await p.locator('#yearRenderMode').click();await p.waitForFunction(()=>yearEngine?.isWebGL&&yearEngine.isReady());
  assert.equal(await p.evaluate(()=>yearEngine.getPageCount()),14);assert.equal(await p.evaluate(()=>yearEngine.book.flipGeom.attributes.position.count),82);
  await p.locator('#yearMonths [data-month="5"]').click();await p.waitForFunction(()=>yearEngine.isReady()&&yearEngine.index===6);
  assert.equal(await p.evaluate(()=>yearEngine.displayed[0].getContext('2d').getImageData(300,380,1,1).data[3]),255,'Page content is opaque after rounded-corner masking');
  const frames=await p.evaluate(()=>yearEngine.book.renderer.info.render.frame);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>yearEngine.book.renderer.info.render.frame),frames,'No idle GPU render loop');
  const box=await p.locator('.webgl-book-canvas').boundingBox(),x=box.x+box.width*.85,y=box.y+box.height*.5;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-box.width*.45,y,{steps:12});await p.waitForFunction(()=>yearEngine.turn?.ready);
  assert.ok(await p.evaluate(()=>{const positions=yearEngine.book.flipGeom.attributes.position;let max=0;for(let i=0;i<positions.count;i++)max=Math.max(max,positions.getZ(i));return max>.3;}),'Subdivided vertices bend in actual 3D depth');
  await p.screenshot({path:'/tmp/flipyear-webgl-curl.png'});await p.mouse.up();await p.waitForFunction(()=>yearEngine.index===7&&!yearEngine.isAnimating()&&yearEngine.isReady());
  await p.locator('#yearPrev').click();await p.waitForFunction(()=>yearEngine.index===6&&!yearEngine.isAnimating()&&yearEngine.isReady());
  // Inverse-project a real photo cell through the perspective camera and tap it.
  const point=await p.evaluate(()=>{
   const engine=yearEngine,cell=engine.displayed[0].dayHits.find(h=>h.date==='2026-06-12'),mesh=engine.book.meshR;
   const v=mesh.position.clone().set(((cell.x+cell.w/2)/600-.5)*engine.book.PW,(.5-(cell.y+cell.h/2)/764)*engine.book.PH,0);
   mesh.localToWorld(v);v.project(engine.book.camera);const r=engine.canvas.getBoundingClientRect();return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
  });
  await p.touchscreen.tap(point.x,point.y);await p.waitForSelector('#photoViewer:not([hidden])');assert.match(await p.locator('#fullPhotoTitle').innerText(),/2026/);await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(()=>yearEngine.index),6);await p.screenshot({path:'/tmp/flipyear-webgl-portrait.png'});
  // A short drag returns to its initial page; a slow real touch drag completes.
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-20,y,{steps:8});await p.waitForTimeout(150);await p.mouse.up();await p.waitForFunction(()=>!yearEngine.isAnimating());assert.equal(await p.evaluate(()=>yearEngine.index),6);
  const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-box.width*.65*i/12,y}]});await p.waitForTimeout(30);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>yearEngine.index===7&&!yearEngine.isAnimating());
  await p.locator('#closeYearReader').click();await p.locator('#openAnnual').click();await p.waitForFunction(()=>yearEngine?.isWebGL&&yearEngine.isReady());assert.equal(await p.evaluate(()=>yearEngine.index),7);
  await p.setViewportSize({width:844,height:390});await p.waitForFunction(()=>yearEngine?.isWebGL&&yearEngine.wide&&yearEngine.isReady());assert.equal((await p.evaluate(()=>yearEngine.getVisiblePages())).length,2);
  for(const id of ['yearPrev','yearNext','monthPhotos','yearRenderMode']){const r=await p.locator('#'+id).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=844&&r.y+r.height<=390,id+' fits landscape viewport');}
  await p.screenshot({path:'/tmp/flipyear-webgl-wide.png'});await p.locator('#yearPrev').click();await p.waitForFunction(()=>!yearEngine.isAnimating()&&yearEngine.isReady());
  // Losing the actual WebGL context must recover through the existing HTML engine.
  await p.evaluate(()=>yearEngine.book.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await p.waitForFunction(()=>yearEngine&&!yearEngine.isWebGL&&yearEngine.isReady());assert.equal(await p.evaluate(()=>state.settings.bookRenderer),'curl');
  await p.locator('#closeYearReader').click();await p.locator('[data-tab="settings"]').click();await p.locator('#engineInfo').click();assert.match(await p.locator('#dialogBody').innerText(),/Three.js/);await p.keyboard.press('Escape');
  assert.deepEqual(errors,[]);await context.close();
  const unsupported=await browser.newContext({viewport:{width:390,height:844}});
  await unsupported.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(name,...args){return name==='webgl2'?null:get.call(this,name,...args);};});
  const q=await unsupported.newPage();await q.goto('file://'+path.join(root,'FlipYear.html'));await q.waitForSelector('.year-option');await q.locator('#openAnnual').click();await q.waitForFunction(()=>yearEngine?.isReady());await q.locator('#yearRenderMode').click();await q.waitForFunction(()=>state.settings.bookRenderer==='curl'&&yearEngine?.isReady());await unsupported.close();
  console.log('PASS real WebGL mesh depth, ray-picked photo dates, forward/reverse and slow touch curl, cancelled drag, demand rendering, progress persistence, portrait/wide layouts, context loss and unsupported-device fallback, bundled MIT notices. Chromium software GPU; not a phone GPU benchmark.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
