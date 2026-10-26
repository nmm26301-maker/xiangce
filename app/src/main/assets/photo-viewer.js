/* Viewer integration. Pan/zoom geometry is provided by unmodified MIT Panzoom. */
'use strict';
let photoZoom=null,photoViewerFocus=null,photoZoomFrame=0;
const photoViewport=$('photoViewport'),fullPhoto=$('fullPhoto');
function destroyPhotoZoom(){
 cancelAnimationFrame(photoZoomFrame);
 if(photoZoom){photoZoom.destroy();photoZoom.resetStyle();photoZoom=null;}
 fullPhoto.style.transform='';fullPhoto.style.transition='';
 $('photoZoomValue').textContent='100%';
 for(const id of ['photoZoomIn','photoZoomOut','photoZoomReset'])$(id).disabled=true;
}
// CSS interpolation plus containment reads a partly animated bounding box. Keep
// zoom steps immediate, so rapid reset and resize always use the true geometry.
function resetPhotoZoom(){if(photoZoom)photoZoom.reset({animate:false});}
function syncPhotoZoom(){
 if(!photoZoom)return;
 const scale=photoZoom.getScale();
 $('photoZoomValue').textContent=Math.round(scale*100)+'%';
 $('photoZoomIn').disabled=scale>=4-.01;
 $('photoZoomOut').disabled=scale<=1+.01;
 $('photoZoomReset').disabled=scale<=1+.01;
}
function initPhotoZoom(){
 if($('photoViewer').hidden||!fullPhoto.naturalWidth)return;
 destroyPhotoZoom();
 photoZoom=Panzoom(fullPhoto,{minScale:1,maxScale:4,contain:'outside',panOnlyWhenZoomed:true,pinchAndPan:false,canvas:true,duration:reduced()?0:180});
 photoZoomFrame=requestAnimationFrame(syncPhotoZoom);
}
fullPhoto.addEventListener('load',initPhotoZoom);
fullPhoto.addEventListener('error',destroyPhotoZoom);
fullPhoto.addEventListener('panzoomchange',syncPhotoZoom);
$('photoZoomIn').onclick=()=>photoZoom?.zoomIn({animate:false});
$('photoZoomOut').onclick=()=>photoZoom?.zoomOut({animate:false});
$('photoZoomReset').onclick=resetPhotoZoom;
photoViewport.addEventListener('wheel',e=>photoZoom?.zoomWithWheel(e),{passive:false});
function togglePhotoZoom(point){
 if(!photoZoom)return;
 if(photoZoom.getScale()>1.01)resetPhotoZoom();
 else photoZoom.zoomToPoint(2.5,point,{animate:false});
}
let photoPointerType='mouse';
photoViewport.addEventListener('pointerdown',e=>photoPointerType=e.pointerType,true);
photoViewport.addEventListener('dblclick',e=>{e.preventDefault();if(photoPointerType==='mouse')togglePhotoZoom(e);});
// Pointer Events are also used by the upstream engine. Track maximum displacement,
// not just release position, so a drag that returns to its origin is never a tap.
function bindPhotoTap(host,selector,onTap){
 let start=null,lastPointerAt=-Infinity;
 host.addEventListener('pointerdown',e=>{
  lastPointerAt=performance.now();
  if(!e.isPrimary||e.button!==0){start=null;return;}
  const target=e.target.closest(selector);
  start=target?{id:e.pointerId,x:e.clientX,y:e.clientY,target}:null;
 },true);
 host.addEventListener('pointermove',e=>{if(start&&e.pointerId===start.id&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)start=null;},true);
 host.addEventListener('pointercancel',()=>start=null,true);
 host.addEventListener('pointerup',e=>{
  const tap=start;start=null;
  if(!tap||tap.id!==e.pointerId||!tap.target.isConnected||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)return;
  onTap(tap.target,e);
 },true);
 host.addEventListener('keydown',e=>{
  const target=e.target.closest(selector);
  if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopImmediatePropagation();onTap(target,e);}
 },true);
 // Screen readers may activate a control with a click and no pointer/key events.
 host.addEventListener('click',e=>{
  const target=e.target.closest(selector);
  if(e.detail===0&&target?.matches('button,[role="button"]')&&performance.now()-lastPointerAt>500)onTap(target,e);
 });
}
let lastPhotoTap=null,photoPointers=new Set();
photoViewport.addEventListener('pointerdown',e=>{photoPointers.add(e.pointerId);if(photoPointers.size>1)lastPhotoTap=null;},true);
bindPhotoTap(photoViewport,'#fullPhoto',(target,e)=>{
 if(e.pointerType==='mouse'||photoPointers.size>1)return;
 const now=performance.now();
 if(lastPhotoTap&&now-lastPhotoTap.time<320&&Math.hypot(e.clientX-lastPhotoTap.x,e.clientY-lastPhotoTap.y)<30){lastPhotoTap=null;togglePhotoZoom(e);}
 else lastPhotoTap={time:now,x:e.clientX,y:e.clientY};
});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>photoPointers.delete(e.pointerId));
const previewPhoto=showPhoto;
showPhoto=function(photos,index){
 if(!Array.isArray(photos)||!photos.length||!Number.isInteger(index)||index<0||index>=photos.length)return;
 photoViewerFocus=document.activeElement;
 previewPhoto(photos,index);$('reader').inert=true;
};
// System photos use a higher-resolution, bounded native decode only inside the full-screen viewer.
function fullResolutionPhotoSource(photo){
 const src=photo?.src;
 if(isVideo(photo)||typeof src!=='string')return src;
 return /^https:\/\/flipyear\.local\/media\/[0-9]+\?v=[0-9]+$/.test(src)?src+'&size=full':src;
}
const updatePhoto=updatePhotoViewer;
updatePhotoViewer=function(){
 destroyPhotoZoom();lastPhotoTap=null;photoPointers.clear();
 updatePhoto();
 const detailedSource=fullResolutionPhotoSource(photoSet[photoAt]);
 if(fullPhoto.getAttribute('src')!==detailedSource)fullPhoto.src=detailedSource;
 fullPhoto.setAttribute('aria-label',isVideo(photoSet[photoAt])?'视频封面，可双击缩放':'照片，可双击缩放');
 // A cached image may already be complete when switching between duplicate photos.
 if(fullPhoto.complete&&fullPhoto.naturalWidth)photoZoomFrame=requestAnimationFrame(initPhotoZoom);
};
const closePhoto=closePhotoViewer;
closePhotoViewer=function(){
 destroyPhotoZoom();lastPhotoTap=null;photoPointers.clear();closePhoto();lock();
 $('reader').inert=!$('dialogLayer').hidden;
 if(photoViewerFocus?.isConnected&&!photoViewerFocus.closest('[inert]'))photoViewerFocus.focus();
 else if(!$('reader').hidden)$('closeReader').focus();
};
$('closePhotoViewer').onclick=closePhotoViewer;
window.addEventListener('resize',()=>{if(!$('photoViewer').hidden)resetPhotoZoom();});
// All photo entry points use the same viewer, including photos without a date.
const previewPageNode=pageNode;
pageNode=function(p,index){
 const node=previewPageNode(p,index),image=node.querySelector('.page-image');
 image.dataset.photoIndex=index;image.tabIndex=0;image.setAttribute('role','button');
 image.setAttribute('aria-label','放大查看'+(p.caption||'第'+(index+1)+'张照片'));
 return node;
};
bindPhotoTap($('reader'),'.page-image[data-photo-index]',target=>{
 const book=current(),index=Number(target.dataset.photoIndex);
 if(!book||!book.pages[index])return;
 customEngine?.cancelTurn();showPhoto(book.pages,index);
});
bindPhotoTap($('yearBookFrame'),'[data-action="day"]',target=>{
 if(!yearEngine)return;
 yearEngine.cancelTurn();showPhoto(yearPhotos.filter(p=>p.date===target.dataset.date),0);
});
const timelinePhotos=renderTimeline;
renderTimeline=function(){
 timelinePhotos();
 const groups=new Map();
 for(const b of state.books)for(const p of b.pages){const key=p.date||'未标注';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const sorted=[...groups].sort(([a],[b])=>b.localeCompare(a));
 for(const [i,row]of [...$('timeline').children].entries()){
  const photos=sorted[i]?.[1];if(!photos)continue;
  for(const [j,button]of [...row.querySelectorAll('.memory-photos button')].entries())button.onclick=()=>showPhoto(photos,j);
 }
};
// Keep keyboard focus and arrows inside the viewer; the underlying book stays still.
$('photoViewer').addEventListener('keydown',e=>{
 if(e.key==='Tab'){
  const items=[...$('photoViewer').querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden&&b.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
 if(e.key==='+'||e.key==='='){e.preventDefault();$('photoZoomIn').click();}
 if(e.key==='-'){e.preventDefault();$('photoZoomOut').click();}
 if(e.key==='0'){e.preventDefault();resetPhotoZoom();}
});

const originalEngineInfo=$('engineInfo').onclick;
$('engineInfo').onclick=()=>{originalEngineInfo();const details=el('details'),summary=el('summary',null,'大图缩放：Panzoom 4.6.2 · MIT'),license=el('pre','viewer-license',"Copyright 2016-2019 Timmy Willison\n\nPermission is hereby granted, free of charge, to any person obtaining\na copy of this software and associated documentation files (the\n\"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to\npermit persons to whom the Software is furnished to do so, subject to\nthe following conditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND\nNONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE\nLIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION\nOF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION\nWITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n");details.append(summary,license);$('dialogBody').append(details);};
