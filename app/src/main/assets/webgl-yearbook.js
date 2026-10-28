/* Calendar textures + interaction adapter. Curl vertices/lighting: pinned MIT turngl Book3D. */
'use strict';
class WebGLYearEngine {
 constructor(root,position,album=null){
  this.root=root;this.isWebGL=true;this.disposed=false;this.ready=false;this.events=new Map();this.cache=new Map();this.listeners=[];this.generation=0;
  this.album=album;this.count=album?album.pages.length:14;this.last=this.count-1;this.year=selectedYear;this.photos=album?album.pages.slice():yearPhotos.slice();this.byDate=indexYearPhotos(this.photos).byDate;
  this.wide=!album&&(innerWidth>=800||(innerWidth>=640&&innerWidth>innerHeight));this.index=this.normalize(position);
  this.textureWidth=this.wide?860:600;this.textureHeight=this.wide?650:764;
  if(!album)$('yearReader').classList.toggle('webgl-wide',this.wide&&innerHeight<=560);
  this.canvas=el('canvas','webgl-book-canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label',album?'立体相册，滑动翻页，轻点照片放大；也可用翻页和查看照片按钮':'立体照片日历，可滑动翻页；也可用月份、翻页和查看本月影像按钮操作');root.replaceChildren(this.canvas);
  if(!this.canvas.getContext('webgl2',{alpha:true,antialias:true}))throw Error('WebGL 2 不可用');
  this.book=new FlipYearWebGL.Book3D(this.canvas,{pageWidth:this.wide?1.8:1.65,pageHeight:album?2.2:this.wide?1.8*650/860:2.1,segments:40,theme:state.settings.light?'light':'dark'});
  cancelAnimationFrame(this.book._rafId); // Demand-render: no idle GPU loop behind overlays.
  this.book._amb.intensity=2;this.book._key.intensity=1.3;
  for(const object of this.book.scene.children)if(object.geometry?.type==='BoxGeometry'){object.material.color.setHex(0x8c7b64);object.position.z=-.015;}
  this.book.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.book._key.shadow.mapSize.set(512,512);
  this.book.resize(root.clientWidth,$('yearReader').classList.contains('webgl-wide')?root.clientHeight:Math.max(260,Math.min(innerHeight*.55,this.wide?440:470)));
  this.canvas.style.height=this.book.renderer.domElement.height/this.book.renderer.getPixelRatio()+'px';
  this.stacks=[];for(const side of ['L','R'])for(let i=1;i<=7;i++){const sheet=this.book['mesh'+side].clone();sheet.material=sheet.material.clone();sheet.material.map=null;sheet.material.color.setHex(i%2?0xd8cfbe:0xf4ecd9);sheet.position.z=-i*.009;sheet.position.x+=i*.002;sheet.position.y-=i*.003;sheet.userData.stackSide=side;this.book.scene.add(sheet);this.stacks.push(sheet);}this.bind();this.readyPromise=this.show();
 }
 normalize(n){n=Math.max(0,Math.min(this.last,Number(n)||0));return this.wide&&n>0&&n<13?1+Math.floor((n-1)/2)*2:n;}
 visible(n=this.index){return !this.wide||n===0||n===13?[n]:[n,n+1];}
 target(direction){if(!this.wide)return this.index+direction;if(direction>0)return this.index===0?1:this.index>=11?13:this.index+2;return this.index===13?11:this.index<=1?0:this.index-2;}
 getCurrentPageIndex(){return this.index;}
 getVisiblePages(){return this.visible();}
 getPageCount(){return this.count;}
 isReady(){return this.ready&&!this.disposed;}
 isAnimating(){return !!this.turn;}
 canTurn(direction){return this.isReady()&&(direction==='prev'?this.index>0:this.index<this.last);}
 on(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}
 emit(name){for(const fn of this.events.get(name)||[])fn();}
 async texture(index){
  if(!this.cache.has(index)){
   const promise=this.paint(index);this.cache.set(index,promise);
   while(this.cache.size>6)this.cache.delete(this.cache.keys().next().value);
  }
  return this.cache.get(index);
 }
 async image(src){return new Promise(resolve=>{const image=new Image();let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>finish(null),5000);image.onload=()=>finish(image);image.onerror=()=>finish(null);image.src=src;});}
 rounded(canvas){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,r=28;ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(w-r,0);ctx.quadraticCurveTo(w,0,w,r);ctx.lineTo(w,h-r);ctx.quadraticCurveTo(w,h,w-r,h);ctx.lineTo(r,h);ctx.quadraticCurveTo(0,h,0,h-r);ctx.lineTo(0,r);ctx.quadraticCurveTo(0,0,r,0);ctx.fill();ctx.globalCompositeOperation='source-over';return canvas;}
 drawImage(ctx,image,x,y,w,h){if(!image?.naturalWidth)return;const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(image,x+(w-image.naturalWidth*scale)/2,y+(h-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);ctx.restore();}
 async paint(index){
  if(this.album)return this.paintPhoto(index);
  const canvas=document.createElement('canvas');const W=this.textureWidth,H=this.textureHeight;canvas.width=W;canvas.height=H;canvas.dayHits=[];const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,W,H);
  if(index===0||index===13){
   const cover=this.photos.find(p=>p.id===state.yearCovers[this.year])||this.photos[0];
   if(index===0&&cover)this.drawImage(ctx,await this.image(cover.src),0,0,W,H);
   const shade=ctx.createLinearGradient(0,0,0,H);shade.addColorStop(0,'#0005');shade.addColorStop(1,'#000b');ctx.fillStyle=index===0?shade:'#ede4d3';ctx.fillRect(0,0,W,H);
   ctx.fillStyle=index===0?'#fff':'#5d5142';ctx.font='bold 104px Georgia';ctx.fillText(String(this.year),40,138);ctx.font='28px sans-serif';ctx.fillText(index===0?'这一年，我的日子。':'每一天，都值得被记住。',40,H-114);ctx.font='16px sans-serif';ctx.fillText('A YEAR TO REMEMBER',42,H-62);return this.rounded(canvas);
  }
  const month=index-1,color=MONTH_COLORS[month];ctx.fillStyle=color;ctx.font='bold 65px Georgia';ctx.fillText(MONTH_NAMES[month],34,92);ctx.font='bold 46px Georgia';ctx.fillText(String(index).padStart(2,'0'),W-90,88);ctx.fillStyle='#766c5d';ctx.font='21px Georgia';ctx.fillText(String(this.year),210,89);
  const slots=calendarSlots(this.year,month);while(slots.slice(-7).every(d=>!d))slots.splice(-7);
  const x0=34,y0=164,w=(W-68)/7,h=(H-238)/(slots.length/7);ctx.font='16px sans-serif';ctx.textAlign='center';
  ['一','二','三','四','五','六','日'].forEach((day,i)=>{ctx.fillStyle='#eee9e1';ctx.fillRect(x0+i*w,126,w-2,28);ctx.fillStyle=color;ctx.fillText(day,x0+(i+.5)*w,146);});
  for(let i=0;i<slots.length;i++){
   if(this.disposed)return canvas;const day=slots[i];if(!day)continue;const x=x0+(i%7)*w,y=y0+Math.floor(i/7)*h,date=`${this.year}-${String(index).padStart(2,'0')}-${String(day).padStart(2,'0')}`,photos=this.byDate.get(date)||[];
   ctx.fillStyle='#f3eee5';ctx.fillRect(x,y,w-1,h-1);if(photos.length){this.drawImage(ctx,await this.image(mediaThumbnail(photos[0])),x,y,w-1,h-1);canvas.dayHits.push({x,y,w:w-1,h:h-1,date});ctx.fillStyle='#0008';ctx.fillRect(x+w-28,y,27,24);}
   ctx.fillStyle=photos.length?'#fff':'#766c5d';ctx.font='bold 21px sans-serif';ctx.textAlign='right';ctx.fillText(String(day),x+w-6,y+19);
   if(photos.length>1){ctx.textAlign='left';ctx.font='14px sans-serif';ctx.fillStyle='#fff';ctx.fillText('+'+(photos.length-1),x+5,y+h-7);}
  }
  ctx.fillStyle='#766c5d';ctx.textAlign='left';ctx.font='14px sans-serif';ctx.fillText(`${this.photos.filter(p=>Number(p.date.slice(5,7))===index).length} 个瞬间`,34,H-33);
  const spine=ctx.createLinearGradient(0,0,32,0);spine.addColorStop(0,'#574a2d22');spine.addColorStop(1,'#574a2d00');ctx.fillStyle=spine;ctx.fillRect(0,0,32,H);return this.rounded(canvas);
 }
 async paintPhoto(index){
  const p=this.photos[index],canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;canvas.dayHits=[];const c=canvas.getContext('2d');c.fillStyle='#fffaf0';c.fillRect(0,0,600,800);
  const image=await this.image(p.src),full=p.layout==='full',border=full?0:24,box={x:border,y:border,w:600-border*2,h:800-border*2};
  if(image)this.drawImage(c,image,box.x,box.y,box.w,box.h);else{c.fillStyle='#e7dfd2';c.fillRect(box.x,box.y,box.w,box.h);c.fillStyle='#635748';c.font='22px sans-serif';c.fillText('照片暂不可用',60,300);}
  // Metadata sits over the photograph; no empty caption area shrinks the image.
  const shade=c.createLinearGradient(0,600,0,800-border);shade.addColorStop(0,'#0000');shade.addColorStop(1,'#0009');c.fillStyle=shade;c.fillRect(box.x,600,box.w,box.h+box.y-600);
  c.fillStyle='#fff';c.font='24px sans-serif';
  const caption=Array.from(p.caption||'');let line='',row=0;for(const letter of caption){if(c.measureText(line+letter).width>496){c.fillText(line,40,682+row*32);line='';if(++row>=2)break;}line+=letter;}if(row<2)c.fillText(line,40,682+row*32);
  c.font='18px sans-serif';c.fillText(p.date||'',40,752);c.textAlign='right';c.fillText(String(index+1).padStart(2,'0'),560,752);
  if(isVideo(p)){c.textAlign='center';c.font='56px sans-serif';c.fillText('▶',300,400);}return this.rounded(canvas);
 }
 render(single=this.visible().length===1){
  if(this.disposed)return;
  const b=this.book,w=this.root.clientWidth,h=parseFloat(this.canvas.style.height),aspect=w/h;
  const progress=this.turn?.progress||0,from=single?1:2,to=this.turn?(this.visible(this.turn.target).length===1?1:2):from,leaves=from+(to-from)*progress;
  const needed=Math.max(b.PH*1.14,b.PW*leaves*1.14/aspect),distance=needed/(2*Math.tan(b.camera.fov*Math.PI/360));
  const center=b.PW/2*(2-leaves);b.camera.position.set(center+.14,.34,distance);for(const sheet of this.stacks)sheet.visible=sheet.userData.stackSide==='R'||!single;b.camera.lookAt(center,0,0);b.camera.aspect=aspect;b.camera.updateProjectionMatrix();
  b.meshL.visible=!single;for(const mesh of [b.meshL,b.meshR,b.flipF,b.flipB]){const material=mesh.material;if(material.map.colorSpace!=='srgb'){material.map.colorSpace='srgb';material.map.needsUpdate=true;}material.alphaTest=.05;}b.renderer.render(b.scene,b.camera);
 }
 async show(){
  const generation=++this.generation,visible=this.visible(),textures=await Promise.all(visible.map(i=>this.texture(i)));
  if(this.disposed||generation!==this.generation)return;
  this.displayed=textures;this.book.endFlip();this.book.meshL.position.z=0;this.book.meshR.position.z=0;
  this.book.showSpread(visible.length===1?null:textures[0],textures.at(-1));this.ready=true;this.render();this.emit('loaded');this.emit('changeState');
  for(const direction of [-1,1]){const n=this.target(direction);if(n>=0&&n<=this.last)for(const i of this.visible(n))this.texture(i);}
 }
 turnToPage(index){this.cancelTurn();this.index=this.normalize(index);this.ready=false;this.show().then(()=>{if(!this.disposed)this.emit('flip');});}
 begin(direction){
  if(!this.canTurn(direction<0?'prev':'next')||this.turn)return;
  const turn=this.turn={direction,target:this.target(direction),progress:0,ready:false};this.emit('changeState');
  Promise.all([...this.visible(),...this.visible(turn.target)].map(i=>this.texture(i))).then(textures=>{
   if(this.disposed||this.turn!==turn)return;
   const current=textures.slice(0,this.visible().length),next=textures.slice(this.visible().length),single=this.visible().length===1;
   const left=direction>0?(single?null:current[0]):(next.length===1?null:next[0]);
   const right=direction>0?next.at(-1):current.at(-1);
   this.book.showSpread(left,right);this.book.prepFlip(direction>0?'fwd':'bwd',direction>0?current.at(-1):current[0],direction>0?next[0]:next.at(-1));
   this.book.meshL.visible=!single;this.book.meshR.visible=true;this.book.meshL.position.z=-.008;this.book.meshR.position.z=-.008;
   turn.ready=true;this.drawTurn();if(turn.settle!==undefined)this.settle(turn.settle);
  }).catch(()=>this.fallback());
 }
 drawTurn(){if(!this.turn?.ready)return;this.book.curl(this.turn.progress,this.turn.direction>0?'fwd':'bwd');this.render();}
 settle(target){
  const turn=this.turn;if(!turn)return;turn.settle=target;if(!turn.ready)return;
  const from=turn.progress,duration=reduced()?0:Math.max(80,state.settings.speed*Math.abs(target-from)),start=performance.now();cancelAnimationFrame(this.animationFrame);
  const tick=()=>{
   if(this.disposed||this.turn!==turn)return;const t=duration?Math.min(1,(performance.now()-start)/duration):1,eased=t*t*(3-2*t);turn.progress=from+(target-from)*eased;this.drawTurn();
   if(t<1)this.animationFrame=requestAnimationFrame(tick);
   else{this.turn=null;if(target===1)this.index=turn.target;this.show();this.emit('flip');this.emit('changeState');}
  };tick();
 }
 flip(direction){if(this.turn){this.settle(this.turn.direction===direction?1:0);return;}this.begin(direction);this.settle(1);}
 flipNext(){this.flip(1);}
 flipPrev(){this.flip(-1);}
 cancelTurn(){cancelAnimationFrame(this.animationFrame);this.drag=null;if(this.turn){this.turn=null;this.book.endFlip();this.show();this.emit('changeState');}}
 tap(x,y){
  if(this.turn||!this.ready)return;
  const rect=this.canvas.getBoundingClientRect(),ray=new FlipYearWebGL.Raycaster();ray.setFromCamera(new FlipYearWebGL.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.book.camera);
  const objects=this.visible().length===1?[this.book.meshR]:[this.book.meshL,this.book.meshR],hits=ray.intersectObjects(objects);if(!hits.length)return;
  const hit=hits[0],which=objects.indexOf(hit.object),texture=this.displayed[which],px=hit.uv.x*texture.width,py=(1-hit.uv.y)*texture.height;
  const day=texture?.dayHits.find(r=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h);if(this.album){showPhoto(this.photos,this.index);return;}if(day)showPhoto(this.byDate.get(day.date)||[],0);
 }
 listen(node,name,fn,options){node.addEventListener(name,fn,options);this.listeners.push(()=>node.removeEventListener(name,fn,options));}
 bind(){
  this.listen(this.canvas,'pointerdown',e=>{if(!e.isPrimary||e.button!==0){this.cancelTurn();return;}if(this.turn)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),max:0};this.canvas.setPointerCapture(e.pointerId);});
  this.listen(this.canvas,'pointermove',e=>{const d=this.drag;if(!d||e.pointerId!==d.id)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.max=Math.max(d.max,Math.hypot(dx,dy));if(!this.turn&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.5)this.begin(dx<0?1:-1);if(this.turn){this.turn.progress=Math.max(0,Math.min(1,(this.turn.direction>0?-dx:dx)/(this.root.clientWidth*.65)));this.drawTurn();}});
  this.listen(this.canvas,'pointerup',e=>{const d=this.drag;this.drag=null;if(!d||e.pointerId!==d.id)return;if(this.turn){const dx=this.turn.direction>0?d.x-e.clientX:e.clientX-d.x,velocity=dx/Math.max(1,performance.now()-d.time);this.settle(this.turn.progress>.24||dx>this.root.clientWidth*.12&&velocity>.35?1:0);}else if(d.max<8)this.tap(e.clientX,e.clientY);});
  this.listen(this.canvas,'pointercancel',()=>this.cancelTurn());
  this.listen(document,'visibilitychange',()=>{if(document.hidden)this.cancelTurn();});
  this.listen(this.canvas,'webglcontextlost',e=>{e.preventDefault();if(!this.disposed)this.fallback();});
 }
 fallback(){if(this.disposed)return;if(this.album){state.settings.customRenderer='curl';save();renderReader();syncCustomRenderMode();}else{state.settings.bookRenderer='curl';save();mountYearEngine();}showToast('此设备立体渲染不可用，已切回兼容翻页。');}
 destroy(){
  this.disposed=true;this.generation++;cancelAnimationFrame(this.animationFrame);for(const remove of this.listeners)remove();this.listeners=[];this.cache.clear();
  if(this.book){const disposed=new Set();this.book.scene.traverse(node=>{if(node.geometry&&!disposed.has(node.geometry)){disposed.add(node.geometry);node.geometry.dispose();}for(const material of [node.material].flat().filter(Boolean)){if(material.map)material.map.dispose();material.dispose();}if(node.shadow?.map)node.shadow.map.dispose();});this.book.dispose();this.book.renderer.forceContextLoss();}
  this.root.replaceChildren();
 }
}
function mountWebGLYearbook(month){
 const position=month===null?Number(state.positions['year:'+selectedYear]||0):month+1;destroyYearEngine();$('yearBookFrame').classList.add('webgl-reading');
 try{
  const engine=new WebGLYearEngine($('yearBookMount'),position);yearEngine=engine;
  engine.on('flip',()=>{updateYearChrome();state.positions['year:'+selectedYear]=engine.getCurrentPageIndex();save();});engine.on('changeState',updateYearChrome);
  engine.readyPromise.then(()=>{if(yearEngine===engine)updateYearChrome();}).catch(()=>engine.fallback());updateYearChrome();
 }catch(e){yearEngine?.destroy();yearEngine=null;state.settings.bookRenderer='curl';save();mountYearEngine(month);showToast('当前设备不支持立体渲染，已使用兼容翻页。');}
}
$('yearChangeCover').insertAdjacentHTML('afterend','<button class="secondary" id="yearRenderMode">切换立体 3D</button>');
function syncRenderMode(){const is3D=state.settings.bookRenderer==='webgl';$('yearRenderMode').textContent=is3D?'3D 卷页 · 已开启':'兼容翻页 · 切换 3D';$('yearRenderMode').setAttribute('aria-pressed',String(is3D));}
$('yearRenderMode').onclick=async()=>{stopAutoTurn();const previous=state.settings.bookRenderer;state.settings.bookRenderer=previous==='webgl'?'curl':'webgl';if(!await save()){state.settings.bookRenderer=previous;syncRenderMode();return;}mountYearEngine();syncRenderMode();};
const priorYearChrome=updateYearChrome;updateYearChrome=function(){priorYearChrome();syncRenderMode();};

const priorWebGLInfo=$('engineInfo').onclick;
$('engineInfo').onclick=()=>{priorWebGLInfo();const details=el('details'),summary=el('summary',null,'立体 3D：turngl / Three.js · MIT'),license=el('pre','viewer-license',"turngl Book3D\nMIT License\n\nCopyright (c) 2026 O\u011fuzhan Togay\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n\nThree.js 0.180.0\nThe MIT License\n\nCopyright \u00a9 2010-2025 three.js authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.\n");details.append(summary,license);$('dialogBody').append(details);};

function mountWebGLCustomBook(album,position){
 const mount=$('stage');mount.replaceChildren();mount.style.aspectRatio='auto';mount.style.minHeight='0';
 try{
  const engine=new WebGLYearEngine(mount,position,album);customEngine=engine;
  engine.on('flip',()=>{updateCustomChrome();save();});engine.on('changeState',updateCustomChrome);
  engine.readyPromise.then(()=>{if(customEngine===engine)updateCustomChrome();}).catch(()=>engine.fallback());updateCustomChrome();
 }catch(e){customEngine?.destroy();customEngine=null;state.settings.customRenderer='curl';save();renderReader();showToast('此设备立体渲染不可用，已使用兼容翻页。');}
 syncCustomRenderMode();
}
$('addVideo').insertAdjacentHTML('afterend','<button class="secondary" id="customRenderMode">3D 卷页</button><button class="secondary" id="customViewPhoto">查看照片</button>');
function syncCustomRenderMode(){const enabled=state?.settings.customRenderer==='webgl';$('customRenderMode').textContent=enabled?'3D 卷页 · 已开启':'兼容翻页 · 切换 3D';$('customRenderMode').setAttribute('aria-pressed',String(enabled));}
$('customRenderMode').onclick=async()=>{const before=state.settings.customRenderer;state.settings.customRenderer=before==='webgl'?'curl':'webgl';if(!await save()){state.settings.customRenderer=before;return;}renderReader();syncCustomRenderMode();};
$('customViewPhoto').onclick=()=>{const b=current();if(b?.pages[pageIndex])showPhoto(b.pages,pageIndex);};
