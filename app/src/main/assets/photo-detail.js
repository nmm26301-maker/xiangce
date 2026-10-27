/* Visible original-pixel regions overlay the fast bounded preview during zoom. */
'use strict';
const detailCanvas=el('canvas','photo-detail-layer');detailCanvas.id='photoDetail';detailCanvas.hidden=true;photoViewport.append(detailCanvas);
$('photoZoomReset').closest('.photo-zoom-controls').insertAdjacentHTML('afterend','<div class="photo-detail-controls"><button class="secondary" id="photoOneToOne" hidden>原图 1:1</button><span id="photoDetailStatus" role="status" aria-live="polite"></span></div>');
let detailInfo=null,detailGeneration=0,detailSequence=0,detailTimer=0,detailAbort=null,detailMetaAbort=null;
function clearPhotoDetail(){
 detailGeneration++;detailSequence++;clearTimeout(detailTimer);detailMetaAbort?.abort();detailMetaAbort=null;detailAbort?.abort();detailAbort=null;detailInfo=null;detailCanvas.hidden=true;detailCanvas.width=detailCanvas.height=1;$('photoOneToOne').hidden=true;$('photoDetailStatus').textContent='';photoZoomLimit=4;
}
function detailGeometry(){
 if(!detailInfo||!photoZoom)return null;
 const r=fullPhoto.getBoundingClientRect(),v=photoViewport.getBoundingClientRect(),ratio=Math.min(r.width/detailInfo.width,r.height/detailInfo.height);
 const cx=r.x+(r.width-detailInfo.width*ratio)/2,cy=r.y+(r.height-detailInfo.height*ratio)/2;
 const x=Math.max(0,Math.floor((v.left-cx)/ratio)),y=Math.max(0,Math.floor((v.top-cy)/ratio));
 const right=Math.min(detailInfo.width,Math.ceil((v.right-cx)/ratio)),bottom=Math.min(detailInfo.height,Math.ceil((v.bottom-cy)/ratio));
 return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y,ratio,cx,cy,v}:null;
}
function queuePhotoDetail(){
 detailSequence++;detailCanvas.hidden=true;clearTimeout(detailTimer);detailAbort?.abort();
 if(!detailInfo||!photoZoom||$('photoViewer').hidden)return;
 if(photoZoom.getScale()<1.02){$('photoDetailStatus').textContent=`原图 ${detailInfo.width} × ${detailInfo.height} · 放大查看细节`;return;}
 detailTimer=setTimeout(loadPhotoDetail,90);
}
async function loadPhotoDetail(){
 const g=detailGeometry(),source=detailInfo;if(!g)return;
 const seq=detailSequence,controller=new AbortController();detailAbort=controller;
 const pixelRatio=Math.min(devicePixelRatio||1,3),edge=Math.max(64,Math.min(2048,Math.ceil(Math.max(g.w,g.h)*g.ratio*pixelRatio)));
 const query=new URLSearchParams({x:g.x,y:g.y,w:g.w,h:g.h,edge});
 $('photoDetailStatus').textContent='正在读取原图细节…';
 let bitmap;
 try{
  const response=await fetch(`https://flipyear.local/photo-detail/${source.id}/tile?${query}`,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('tile unavailable');bitmap=await createImageBitmap(await response.blob());
  if(seq!==detailSequence||detailInfo!==source||$('photoViewer').hidden)return;
  // The overlay uses the same oriented image coordinates, without resetting pan/zoom.
  detailCanvas.width=Math.min(2048,Math.ceil(g.v.width*pixelRatio));detailCanvas.height=Math.min(2048,Math.ceil(g.v.height*pixelRatio));
  const c=detailCanvas.getContext('2d');c.scale(detailCanvas.width/g.v.width,detailCanvas.height/g.v.height);
  c.drawImage(bitmap,g.cx-g.v.left+g.x*g.ratio,g.cy-g.v.top+g.y*g.ratio,g.w*g.ratio,g.h*g.ratio);detailCanvas.hidden=false;
  $('photoDetailStatus').textContent=g.ratio*pixelRatio>=1?'已达到原图像素 · 继续放大不会增加细节':'已显示原图细节';
 }catch(e){if(e.name!=='AbortError'&&seq===detailSequence)$('photoDetailStatus').textContent='原图细节暂不可用，当前显示预览';}
 finally{bitmap?.close();}
}
async function preparePhotoDetail(){
 const p=photoSet[photoAt],id=originalReference(p),seq=detailGeneration;
 if(!id||!globalThis.PhotoMedia){if(!isVideo(p))$('photoDetailStatus').textContent='当前为压缩照片，需重新添加原图才能查看更多细节';return;}
 const controller=new AbortController();detailMetaAbort=controller;
 try{
  const response=await fetch(`https://flipyear.local/photo-detail/${id}/info`,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('unsupported');const info=await response.json();
  if(seq!==detailGeneration||$('photoViewer').hidden)return;
  if(!info.regionSupported||!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<=0||info.height<=0)throw Error('invalid dimensions');
  detailInfo={id,width:info.width,height:info.height};photoZoomLimit=16;photoZoom?.setOptions({maxScale:photoZoomLimit});syncPhotoZoom();$('photoOneToOne').hidden=false;queuePhotoDetail();
 }catch(e){if(e.name!=='AbortError'&&seq===detailGeneration)$('photoDetailStatus').textContent='此照片暂无法读取原图细节，当前显示预览';}
}
const detailUpdatePhoto=updatePhotoViewer;
updatePhotoViewer=function(){clearPhotoDetail();detailUpdatePhoto();preparePhotoDetail();};
const detailClosePhoto=closePhotoViewer;
closePhotoViewer=function(){clearPhotoDetail();detailClosePhoto();};$('closePhotoViewer').onclick=closePhotoViewer;
fullPhoto.addEventListener('panzoomchange',queuePhotoDetail);fullPhoto.addEventListener('load',()=>{if(detailInfo){photoZoom?.setOptions({maxScale:photoZoomLimit});queuePhotoDetail();}});
window.addEventListener('resize',queuePhotoDetail);
$('photoOneToOne').onclick=()=>{const g=detailGeometry();if(g&&photoZoom){const scale=photoZoom.getScale()/(g.ratio*(devicePixelRatio||1));photoZoom.zoom(Math.max(1,Math.min(photoZoomLimit,scale)),{animate:false});queuePhotoDetail();}};
