const {chromium}=require('playwright'),sharp=require('sharp'),assert=require('node:assert/strict'),path=require('node:path');
async function checkPhoto(page,viewport,label){
 const {data,info}=await sharp(await page.screenshot({path:'/tmp/flipyear-fit-'+label+'.png'})).raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>{const i=(Math.round(y)*info.width+Math.round(x))*info.channels;return [data[i],data[i+1],data[i+2]];};
 const scale=Math.min(viewport.width/800,viewport.height/1200),w=800*scale,h=1200*scale,left=(viewport.width-w)/2,top=(viewport.height-h)/2;
 const red=(x,y)=>{const [r,g,b]=pixel(x,y);return r>50&&r>g*2&&r>b*2;};let horizontal=0,vertical=0;
 for(let x=0;x<info.width;x++)if(red(x,Math.floor(info.height/2)))horizontal++;
 for(let y=0;y<info.height;y++)if(red(Math.floor(info.width/2),y))vertical++;
 assert.ok(horizontal>60&&Math.abs(horizontal-vertical)<5,'Rendered circle keeps its aspect ratio: '+label);
 const corners=[[32,32],[768,32],[32,1168],[768,1168]].map(([x,y])=>pixel(left+x*scale,top+y*scale));
 assert.ok(corners[0][1]>corners[0][0]*2&&corners[0][1]>corners[0][2]*2,'Top-left corner remains visible');
 assert.ok(corners[1][0]>150&&corners[1][1]>150&&corners[1][2]<100,'Top-right corner remains visible');
 assert.ok(corners[2][0]>150&&corners[2][2]>150&&corners[2][1]<100,'Bottom-left corner remains visible');
 assert.ok(corners[3][1]>150&&corners[3][2]>150&&corners[3][0]<100,'Bottom-right corner remains visible');
 if(top>20)assert.ok(pixel(viewport.width/2,top/2).every(c=>c<3),'Top letterbox is black');
 if(left>20)assert.ok(pixel(left/2,viewport.height/2).every(c=>c<3),'Side letterbox is black');
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.fullscreenRequests=[];window.Android={setReaderFullscreen:enabled=>fullscreenRequests.push(enabled)};});
  await p.goto('file://'+path.resolve(__dirname,'../FlipYear.html'));await p.waitForSelector('.year-option');
  await p.locator('[data-tab="albums"]').click();await p.locator('#continueBook').click();await p.waitForFunction(()=>customEngine?.isWebGL&&customEngine.isReady());
  assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),false,'Reading does not force Android fullscreen');
  assert.equal(await p.locator('#readerToolsToggle').getAttribute('aria-expanded'),'false');
  await p.evaluate(()=>{
   const source=document.createElement('canvas');source.width=800;source.height=1200;const c=source.getContext('2d');c.fillStyle='#164edc';c.fillRect(0,0,800,1200);c.fillStyle='#ee281e';c.beginPath();c.arc(400,600,100,0,Math.PI*2);c.fill();
   for(const [color,x,y] of [['#00d020',0,0],['#fae614',736,0],['#dc1ec8',0,1136],['#14e6f0',736,1136]]){c.fillStyle=color;c.fillRect(x,y,64,64);}
   current().pages=Array.from({length:3},(_,i)=>({id:'fit-'+i,src:source.toDataURL(),caption:'保留备注',date:'2026-10-29',layout:'classic'}));pageIndex=0;renderReader();
  });
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){
   await p.setViewportSize(viewport);await p.waitForFunction(({width,height})=>customEngine?.isWebGL&&customEngine.isReady()&&Math.abs(customEngine.canvas.clientWidth-width)<2&&Math.abs(customEngine.canvas.clientHeight-height)<2,viewport);
   await checkPhoto(p,viewport,'3d-'+viewport.width);
   for(const id of ['closeReader','readerToolsToggle','prevPage','nextPage']){const r=await p.locator('#'+id).boundingBox();assert.ok(r.width>=48&&r.height>=48);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1);}
  }
  await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>customEngine?.isReady()&&customEngine.canvas.clientHeight===844);
  await p.locator('#readerToolsToggle').click();assert.match(await p.locator('#readerPhotoDetails').innerText(),/保留备注.*2026-10-29/);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#reader').isVisible(),true);assert.equal(await p.locator('#readerToolsToggle').getAttribute('aria-expanded'),'false');
  await p.locator('#nextPage').click();await p.waitForFunction(()=>pageIndex===1&&customEngine.isReady()&&!customEngine.isAnimating());
  const box=await p.locator('#stage canvas').boundingBox(),x=box.width*.8,y=box.height*.5;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-box.width*.45,y,{steps:12});await p.waitForFunction(()=>customEngine.turn?.ready);
  assert.ok(await p.evaluate(()=>{const a=customEngine.book.flipGeom.attributes.position;return Array.from({length:a.count},(_,i)=>a.getZ(i)).some(z=>z>.3);}));
  await p.mouse.up();await p.waitForFunction(()=>pageIndex===2&&!customEngine.isAnimating());
  await p.touchscreen.tap(box.width/2,box.height/2);await p.waitForSelector('#photoViewer:not([hidden])');assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),true);
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>pageIndex),2);assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),false);
  await p.locator('#readerToolsToggle').click();await p.locator('#customRenderMode').click();await p.waitForFunction(()=>customEngine&&!customEngine.isWebGL&&customEngine.isReady());
  await p.locator('#readerToolsToggle').click();await checkPhoto(p,{width:390,height:844},'compatible');
  await p.locator('#closeReader').click();assert.equal(await p.evaluate(()=>fullscreenRequests.at(-1)),false);assert.deepEqual(errors,[]);
  console.log('PASS complete photos, all four corners, unchanged aspect, centered black bars, viewport sizes, compatible reader, 3D curl, metadata and no forced Android fullscreen. Native system bars mocked.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
