const openReaderTools=require('./reader-tools.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'../FlipYear.html'));await p.waitForSelector('.year-option');
  await p.locator('[data-tab="albums"]').click();await p.locator('#continueBook').click();await p.waitForFunction(()=>customEngine?.isWebGL&&customEngine.isReady());
  await p.evaluate(()=>{
   const source=document.createElement('canvas');source.width=source.height=800;const c=source.getContext('2d');c.fillStyle='#164edc';c.fillRect(0,0,800,800);c.fillStyle='#ee281e';c.beginPath();c.arc(400,400,100,0,2*Math.PI);c.fill();
   const b=current();b.pages=['classic','polaroid','full'].map((layout,i)=>({id:'frame-'+i,src:source.toDataURL(),caption:i===0?'文案保留':'',date:'',layout}));pageIndex=0;renderReader();
  });
  await p.waitForFunction(()=>customEngine?.isWebGL&&customEngine.isReady());
  const samples=await p.evaluate(async()=>{
   const out=[];for(let i=0;i<3;i++){
    const canvas=await customEngine.paintPhoto(i),c=canvas.getContext('2d'),color=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
    const red=(x,y)=>{const a=color(x,y);return a[0]>200&&a[1]<90&&a[2]<90;};let horizontal=0,vertical=0;
    for(let j=100;j<500;j++)if(red(j,Math.round(canvas.height/2)))horizontal++;for(let j=Math.round(canvas.height/2)-200;j<Math.round(canvas.height/2)+200;j++)if(red(300,j))vertical++;
    out.push({top:color(300,48),bottom:color(300,canvas.height-62),rim:color(4,Math.round(canvas.height/2)),horizontal,vertical});
   }return out;
  });
  for(const [i,s] of samples.entries()){
   assert.ok(s.top[2]>s.top[0]*2,'Photo fills frame at top, style '+i);assert.ok(s.bottom[2]>s.bottom[0]*2,'Photo fills formerly blank lower area, style '+i);
   assert.ok(Math.abs(s.horizontal-s.vertical)<=2,'Circle stays round instead of stretching, style '+i);
   if(i<2)assert.ok(s.rim[0]>240&&s.rim[1]>230,'Thin paper rim retained');else assert.ok(s.rim[2]>s.rim[0]*2,'Full bleed reaches page edge');
  }
  await p.screenshot({path:'/tmp/flipyear-frame-3d.png',fullPage:true});
  assert.equal(await p.locator('#enhanceOriginal').count(),0);
  await openReaderTools(p);await p.locator('#customRenderMode').click();await p.waitForFunction(()=>customEngine&&!customEngine.isWebGL&&customEngine.isReady());
  for(const viewport of [{width:375,height:812},{width:844,height:390},{width:768,height:1024}]){
   await p.setViewportSize(viewport);await p.waitForTimeout(350);
   for(const light of [false,true]){
    await p.evaluate(light=>document.body.classList.toggle('light',light),light);
    const bounds=await p.locator('.photo-leaf .paper-page').evaluateAll(nodes=>nodes.map(node=>{const f=node.getBoundingClientRect(),im=node.querySelector('.page-image').getBoundingClientRect(),meta=node.querySelector('.page-meta').getBoundingClientRect();return {style:node.classList.contains('full')?'full':'framed',f:{w:f.width,h:f.height,x:f.x,y:f.y,b:f.bottom},im:{w:im.width,h:im.height,x:im.x,y:im.y,b:im.bottom},metaBottom:meta.bottom,fit:getComputedStyle(node.querySelector('.page-image')).objectFit};}).filter(bounds=>bounds.f.h>0));
    assert.ok(bounds.length>0,'A compatible page is visible');
    for(const {style,f,im,metaBottom,fit} of bounds){
     assert.equal(fit,'cover');assert.ok(im.h/f.h>.9,'Compatible reader image bounds '+JSON.stringify({viewport,style,f,im,metaBottom}));assert.ok(im.w/f.w>.9);assert.ok(metaBottom<=f.b+1);
     assert.ok(Math.abs(im.h-(f.h-(style==='full'?0:24)))<1);assert.ok(Math.abs(im.w-(f.w-(style==='full'?0:24)))<1);
    }
   }
  }
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.body.classList.remove('light'));await p.waitForTimeout(350);
  await p.screenshot({path:'/tmp/flipyear-frame-compatible.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS photos fill 3D and compatible frames; circle aspect preserved, thin border/full bleed, caption overlay, portrait/landscape/tablet and light/dark, AI button absent. Chromium software GPU.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
