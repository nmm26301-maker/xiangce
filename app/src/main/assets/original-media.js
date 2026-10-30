/* Original files stay in native private storage; the WebView only receives previews. */
'use strict';
$('photoZoomReset').closest('.photo-zoom-controls').insertAdjacentHTML('afterend','<div class="original-actions" id="originalActions"><button class="secondary" id="saveOriginal" hidden>保存原文件</button><button class="secondary" id="playMotion" hidden>播放实况</button><button class="secondary" id="pairMotion" hidden>关联实况视频</button><button class="secondary" id="unlinkMotion" hidden>解除关联</button></div><p class="original-status" id="originalStatus" aria-live="polite"></p>');
let motionToken='',motionFound=false;
function originalReference(p){return hasOriginal(p)?p.originalId:/^device-[1-9][0-9]{0,18}$/.test(p?.id||'')&&!isVideo(p)?p.id:null;}
function originalBook(p){
 if(!p)return null;if((state.dailyPhotos||[]).some(x=>x.id===p.id))return journalMediaBook('daily');
 if(p.bookId)return state.books.find(b=>b.id===p.bookId&&b.pages.some(x=>x.id===p.id));
 return state.books.find(b=>b.pages.includes(p))||null;
}
function refreshOriginalPreview(bookId,pageId){
 const p=photoSet[photoAt],book=originalBook(p);
 if(!$('photoViewer').hidden&&p?.id===pageId&&book?.id===bookId){Object.assign(p,book.pages.find(x=>x.id===pageId));updatePhotoViewer();}
}
const originalViewerUpdate=updatePhotoViewer;
updatePhotoViewer=function(){
 originalViewerUpdate();motionToken=uid();motionFound=false;
 const p=photoSet[photoAt],reference=originalReference(p),book=originalBook(p);
 $('saveOriginal').hidden=!reference||!globalThis.PhotoMedia?.exportOriginal;
 $('pairMotion').hidden=isVideo(p)||!book||!globalThis.AlbumMedia?.pairVideo;
 $('unlinkMotion').hidden=!p?.liveVideoId||!book;
 $('playMotion').hidden=!localVideoId(p?.liveVideoId);
 $('originalStatus').textContent='';
 if(isVideo(p))return;
 if(p.liveVideoId){$('originalStatus').textContent='手动关联的实况视频 · 照片与视频均通过 ZIP 备份';return;}
 if(reference&&globalThis.PhotoMedia?.inspectPhoto){
  $('originalStatus').textContent='正在检测原文件中的实况视频…';
  try{PhotoMedia.inspectPhoto(reference,motionToken);}catch{$('originalStatus').textContent='实况检测不可用';}
 }else if(!reference)$('originalStatus').textContent='旧版压缩照片没有原文件副本；请重新导入原图。';
};
window.onPhotoMotion=(token,found,status)=>{
 if(token!==motionToken||$('photoViewer').hidden)return;
 motionFound=found===true;$('playMotion').hidden=!motionFound;$('originalStatus').textContent=status||'';
};
$('saveOriginal').onclick=()=>{
 const p=photoSet[photoAt],id=originalReference(p);if(!id||!globalThis.PhotoMedia?.exportOriginal)return;
 busy(true,'请选择原文件保存位置，不缩放、不重新编码。');
 try{PhotoMedia.exportOriginal(id,p.filename||'FlipYear-original',p.originalSha256||'',p.originalBytes||0);}catch{onOriginalMessage('原文件未保存：选择器不可用');}
};
$('playMotion').onclick=()=>{
 const p=photoSet[photoAt];
 if(localVideoId(p.liveVideoId)){launchAlbumVideo({kind:'video',videoId:p.liveVideoId});return;}
 if(motionFound&&globalThis.PhotoMedia?.playMotion)PhotoMedia.playMotion(originalReference(p));
};
$('pairMotion').onclick=()=>{
 const p=photoSet[photoAt],book=originalBook(p);if(!book)return;
 openDialog('关联对应的实况视频','<p>请选择这张照片对应的 MOV / MP4。Apple Live Photo 需要同时保留照片与视频；本功能由你手动确认对应关系，不按文件名猜测配对。</p><div class="dialog-buttons"><button class="secondary" id="cancelPairMotion">取消</button><button class="primary" id="confirmPairMotion">选择对应视频</button></div>');
 $('cancelPairMotion').onclick=closeDialog;$('confirmPairMotion').onclick=()=>{closeDialog();busy(true,'选择一段对应的实况视频…');try{AlbumMedia.pairVideo(book.id,p.id);}catch{onAlbumMediaError('实况选择器不可用');}};
};
$('unlinkMotion').onclick=()=>{
 const p=photoSet[photoAt],book=originalBook(p),page=book?.pages.find(x=>x.id===p.id);if(!page)return;
 openDialog('解除实况关联？','<p>照片保留。视频副本可稍后通过「清理未使用的媒体副本」回收。</p><div class="dialog-buttons"><button class="secondary" id="cancelUnlinkMotion">保留关联</button><button class="primary" id="confirmUnlinkMotion">解除关联</button></div>');
 $('cancelUnlinkMotion').onclick=closeDialog;$('confirmUnlinkMotion').onclick=async()=>{
  const old=clone(page);delete page.liveVideoId;delete page.liveFilename;
  if(await save()){delete p.liveVideoId;delete p.liveFilename;closeDialog();updatePhotoViewer();showToast('已解除关联，原照片保留');}
  else Object.assign(page,old);
 };
};
const originalViewerClose=closePhotoViewer;
closePhotoViewer=function(){motionToken='';motionFound=false;try{globalThis.PhotoMedia?.inspectPhoto('','');}catch{}originalViewerClose();};
$('closePhotoViewer').onclick=closePhotoViewer;
window.onOriginalMessage=message=>{busy(false);showToast(message||'原文件操作结束',/失败|无法|未完整|未保存|未通过/.test(message||''));};
const originalLock=lock;
lock=function(){originalLock();$('photoViewer').inert=!$('dialogLayer').hidden;};
$('engineInfo').insertAdjacentHTML('beforebegin','<button class="secondary" id="deviceReport">导出设备验证记录</button>');
$('deviceReport').onclick=()=>{
 if(!globalThis.PhotoMedia?.deviceReport||!globalThis.Android?.saveBackup){showToast('设备记录在 Android APK 中导出。');return;}
 try{
  const device=JSON.parse(PhotoMedia.deviceReport());
  const report={format:'flipyear-device-report',version:1,recordedAt:new Date().toISOString(),device,userAgent:navigator.userAgent,screen:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio},results:{physicalDeviceVerified:false,photoImport:'待验证',originalExport:'待验证',motionPlayback:'待验证',permissions:'待验证',upgrade:'待验证'}};
  Android.saveBackup('FlipYear-device-check.json',JSON.stringify(report,null,2));
 }catch{showToast('设备记录导出失败',true);}
};
