const {chromium}=require('playwright'),sharp=require('sharp'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.fullscreenRequests=[];window.Android={setReaderFullscreen:enabled=>fullscreenRequests.push(enabled)};});
  await p.goto('file://'+path.resolve(__dirname,'../FlipYear.html'));await p.waitForSelector('.year-option');
  await p.locator('[data-tab="albums"]').click();await p.locator('#continueBook').click();await p.waitForFunction(()=>customEngine?.isWebGL&&customEngine.isReady());
  assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),true);
  assert.equal(await p.locator('#readerToolsToggle').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#addVideo').isHidden(),true);
  await p.evaluate(()=>{
   const source=document.createElement('canvas');source.width=source.height=800;const c=source.getContext('2d');c.fillStyle='#164edc';c.fillRect(0,0,800,800);c.fillStyle='#ee281e';c.beginPath();c.arc(400,400,100,0,Math.PI*2);c.fill();
   current().pages=Array.from({length:3},(_,i)=>({id:'fullscreen-'+i,src:source.toDataURL(),caption:'',date:'',layout:'classic'}));pageIndex=0;renderReader();
  });
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){
   await p.setViewportSize(viewport);await p.waitForFunction(({width,height})=>customEngine?.isWebGL&&customEngine.isReady()&&Math.abs(customEngine.canvas.clientWidth-width)<2&&Math.abs(customEngine.canvas.clientHeight-height)<2,viewport);
   const canvas=await p.locator('#stage canvas').boundingBox();assert.ok(Math.abs(canvas.x)<1&&Math.abs(canvas.y)<1);assert.equal(canvas.width,viewport.width);assert.ok(Math.abs(canvas.height-viewport.height)<1);
   const {data,info}=await sharp(await p.screenshot({path:'/tmp/flipyear-fullscreen-'+viewport.width+'.png'})).raw().toBuffer({resolveWithObject:true});
   const pixel=(x,y)=>{const i=(y*info.width+x)*info.channels;return [data[i],data[i+1],data[i+2]];};
   const red=(x,y)=>{const [r,g,b]=pixel(x,y);return r>50&&r>g*2&&r>b*2;};const blue=(x,y)=>{const [r,g,b]=pixel(x,y);return b>r*2&&b>g*1.4;};
   const cx=Math.floor(info.width/2),cy=Math.floor(info.height/2);let horizontal=0,vertical=0;const xs=[],ys=[];
   for(let x=0;x<info.width;x++){if(red(x,cy))horizontal++;if(blue(x,cy))xs.push(x);}
   for(let y=0;y<info.height;y++){if(red(cx,y))vertical++;if(blue(cx,y))ys.push(y);}
   assert.ok(horizontal>60&&Math.abs(horizontal-vertical)<5,'Actual rendered circle '+JSON.stringify({viewport,horizontal,vertical}));
   assert.ok(xs.at(-1)-xs[0]>info.width*.92,'Actual photograph fills screen width');assert.ok(ys.at(-1)-ys[0]>info.height*.92,'Actual photograph fills screen height');
   for(const id of ['closeReader','readerToolsToggle','prevPage','nextPage']){const r=await p.locator('#'+id).boundingBox();assert.ok(r.width>=48&&r.height>=48);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1,id+' fits viewport');}
  }
  await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>customEngine?.isReady()&&customEngine.canvas.clientHeight===844);
  await p.locator('#readerToolsToggle').click();assert.equal(await p.locator('#addVideo').isVisible(),true);assert.equal(await p.locator('#editPage').isVisible(),true);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#reader').isVisible(),true);assert.equal(await p.locator('#readerToolsToggle').getAttribute('aria-expanded'),'false');
  await p.locator('#nextPage').click();await p.waitForFunction(()=>pageIndex===1&&customEngine.isReady()&&!customEngine.isAnimating());
  const box=await p.locator('#stage canvas').boundingBox(),x=box.x+box.width*.8,y=box.y+box.height*.5;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-box.width*.45,y,{steps:12});await p.waitForFunction(()=>customEngine.turn?.ready);
  assert.ok(await p.evaluate(()=>{const a=customEngine.book.flipGeom.attributes.position;return Array.from({length:a.count},(_,i)=>a.getZ(i)).some(z=>z>.3);}),'Full screen keeps real 3D curl');
  await p.mouse.up();await p.waitForFunction(()=>pageIndex===2&&!customEngine.isAnimating());
  await p.touchscreen.tap(box.width/2,box.height/2);await p.waitForSelector('#photoViewer:not([hidden])');assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),true);
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>pageIndex),2);await p.locator('#closeReader').click();await p.waitForFunction(()=>fullscreenRequests.at(-1)===false);
  assert.deepEqual(errors,[]);console.log('PASS full viewport photo pixels, undistorted circle, orientation/tablet resize, floating tools, back handling, real 3D curl, original viewer and native fullscreen bridge. Android system bars mocked.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
