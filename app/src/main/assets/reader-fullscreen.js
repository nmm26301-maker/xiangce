'use strict';
const fullscreenReader=$('reader');
fullscreenReader.classList.add('fullscreen-reader');
const readerTools=fullscreenReader.querySelector('.custom-video-toolbar');readerTools.id='readerToolsPanel';
const readerToolsToggle=el('button','icon reader-tools-toggle');readerToolsToggle.id='readerToolsToggle';readerToolsToggle.type='button';
readerToolsToggle.setAttribute('aria-label','展开相册操作');readerToolsToggle.setAttribute('aria-expanded','false');readerToolsToggle.setAttribute('aria-controls','readerToolsPanel');
readerToolsToggle.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
fullscreenReader.append(readerToolsToggle);
function setReaderTools(open){fullscreenReader.classList.toggle('tools-open',open);readerToolsToggle.setAttribute('aria-expanded',String(open));readerToolsToggle.setAttribute('aria-label',open?'收起相册操作':'展开相册操作');}
readerToolsToggle.onclick=()=>setReaderTools(!fullscreenReader.classList.contains('tools-open'));
let nativeReadingFullscreen=null;
function syncReadingFullscreen(){
 const active=!$('photoViewer').hidden&&$('yearReader').hidden;
 if(fullscreenReader.hidden)setReaderTools(false);
 if(active===nativeReadingFullscreen)return;nativeReadingFullscreen=active;
 try{globalThis.Android?.setReaderFullscreen?.(active);}catch{}
}
const fullscreenLock=lock;lock=function(){fullscreenLock();syncReadingFullscreen();};
const fullscreenBack=goBack;goBack=function(){
 if(!$('busy').hidden||!$('dialogLayer').hidden||!$('photoViewer').hidden)return fullscreenBack();
 if(!fullscreenReader.hidden&&fullscreenReader.classList.contains('tools-open')){setReaderTools(false);readerToolsToggle.focus();return true;}
 return fullscreenBack();
};window.goBack=goBack;
const readingVisibility=new MutationObserver(syncReadingFullscreen);
for(const node of [fullscreenReader,$('photoViewer')])readingVisibility.observe(node,{attributes:true,attributeFilter:['hidden']});
syncReadingFullscreen();
let readerViewport='',readerResizeTimer;
const fullscreenRender=renderReader;
renderReader=function(){readerViewport=fullscreenReader.clientWidth+':'+fullscreenReader.clientHeight;const result=fullscreenRender();updateReaderPhotoDetails();return result;};
function resizeFullscreenReader(){
 if(fullscreenReader.hidden)return;
 const size=fullscreenReader.clientWidth+':'+fullscreenReader.clientHeight;
 if(size===readerViewport)return;
 clearTimeout(readerResizeTimer);readerResizeTimer=setTimeout(()=>{
  if(fullscreenReader.hidden)return;
  if(customEngine)pageIndex=customEngine.getCurrentPageIndex();
  renderReader();
 },120);
}
new ResizeObserver(resizeFullscreenReader).observe(fullscreenReader);
window.addEventListener('resize',resizeFullscreenReader);

// Keep annotations available without painting over the complete photograph.
const readerPhotoDetails=el('p','reader-photo-details');readerPhotoDetails.id='readerPhotoDetails';readerTools.append(readerPhotoDetails);
const fitPhotoChrome=updateCustomChrome;
function updateReaderPhotoDetails(){const photo=current()?.pages[pageIndex];readerPhotoDetails.textContent=photo?[photo.caption,photo.date].filter(Boolean).join(' · '):'';}
updateCustomChrome=function(){fitPhotoChrome();updateReaderPhotoDetails();};
