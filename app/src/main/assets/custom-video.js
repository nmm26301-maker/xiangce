/* Private video copies are stored by Android; photo-only JSON remains compatible. */
'use strict';
const LOCAL_VIDEO=/^local-video-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCAL_PHOTO=/^local-photo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function localPhotoId(id){return typeof id==='string'&&LOCAL_PHOTO.test(id)&&!/[\r\n]/.test(id);}
function hasOriginal(p){return !isVideo(p)&&localPhotoId(p?.originalId);}
function pageMediaIds(p){return [isVideo(p)?p.videoId:null,p.originalId,p.liveVideoId].filter(id=>localVideoId(id)||localPhotoId(id));}
const VIDEO_PLACEHOLDER='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
let handlingAlbumResult=false,pendingAlbumRestore=null;
function localVideoId(id){return typeof id==='string'&&LOCAL_VIDEO.test(id)&&!/[\r\n]/.test(id);}
function localPoster(id){return 'https://flipyear.local/custom-media/'+id+'/poster';}
function videoIdentifier(p){return p.videoId||p.id;}
function launchAlbumVideo(p){const id=videoIdentifier(p);if(!isVideo(p)||(!localVideoId(id)&&!/^device-video-[1-9][0-9]{0,18}$/.test(id||''))||/[\r\n]/.test(id||'')){showToast('视频索引无效，请重新导入或扫描。',true);return;}if(!globalThis.Android?.playVideo){showToast('视频播放在 Android APK 中使用。');return;}try{Android.playVideo(id);}catch{onNativeVideoError();}}
$('playVideo').onclick=()=>launchAlbumVideo(photoSet[photoAt]);
const photoPageNode=pageNode;
pageNode=function(p,index){const node=photoPageNode(p,index);if(isVideo(p)){node.classList.add('video-page');const button=el('button','primary video-page-play','▶ 播放视频 · '+durationText(p.durationMs));button.type='button';button.onpointerdown=e=>e.stopPropagation();button.onclick=e=>{e.preventDefault();e.stopPropagation();launchAlbumVideo(p);};node.append(button);}return node;};
const photoThumbnail=mediaThumbnail;
mediaThumbnail=function(p){return hasOriginal(p)?localPoster(p.originalId)+'?size=thumb':isVideo(p)&&localVideoId(p.videoId)?localPoster(p.videoId)+'?size=thumb':photoThumbnail(p);};
$('addVideo').onclick=()=>{const book=current();if(!book)return;if(!globalThis.AlbumMedia?.chooseVideos){showToast('视频导入在 Android APK 中使用；网页版仍可制作照片相册。');return;}busy(true,'请选择视频，每批最多 20 段；单段最多 250MB。');try{AlbumMedia.chooseVideos(book.id);}catch{onAlbumMediaError('无法打开视频选择器');}};

const legacyValidateBackup=validateBackup;
validateBackup=function(value){if(value?.books?.some(b=>b?.pages?.some(p=>isVideo(p)||p.originalId||p.liveVideoId)))throw Error('含视频的相册请使用「从视频 ZIP 恢复」。');return legacyValidateBackup(value);};
function validateOriginalPage(p){
 if(isVideo(p)||!localPhotoId(p.originalId)||p.src!==localPoster(p.originalId)||!Number.isSafeInteger(p.originalBytes)||p.originalBytes<=0||p.originalBytes>250*1024*1024||!/^[0-9a-f]{64}$/.test(p.originalSha256||''))throw Error('原文件引用或校验值无效。');
}
function validateAlbumArchive(value){
 if(value?.format!=='flipyear'||![2,3].includes(value.version))throw Error('请选择 FlipYear 媒体 ZIP 备份。');
 const copy=clone(value),media=[];if(!Array.isArray(copy.books)||copy.books.length>200)throw Error('相册结构无效。');
 for(const book of copy.books){if(!Array.isArray(book.pages))throw Error('相册页结构无效。');for(const p of book.pages){
  if(p.originalId){if(value.version!==3)throw Error('原图需要新版 ZIP 备份。');validateOriginalPage(p);}
  if(p.liveVideoId&&(value.version!==3||isVideo(p)||!localVideoId(p.liveVideoId)))throw Error('实况视频引用无效。');
  if(isVideo(p)){if(!localVideoId(p.videoId)||p.src!==localPoster(p.videoId))throw Error('视频副本引用无效。');}
  if(isVideo(p)||p.originalId){media.push({p,src:p.src});p.src=VIDEO_PLACEHOLDER;}
 }}
 copy.version=1;const books=legacyValidateBackup(copy);
 for(const item of media){item.p.src=item.src;item.p.durationMs=Number.isFinite(item.p.durationMs)&&item.p.durationMs>0?item.p.durationMs:0;item.p.date=validPhotoDate(item.p.date)?item.p.date:'';}
 return books;
}

const photoExportBackup=exportBackup;
exportBackup=async function(books=state.books){if(!books.some(b=>b.pages.some(p=>pageMediaIds(p).length)))return photoExportBackup(books);if(!globalThis.AlbumMedia?.saveArchive){showToast('含视频的相册请在 Android APK 中导出 ZIP，避免丢失视频。',true);return;}try{const json=JSON.stringify({format:'flipyear',version:books.some(b=>b.pages.some(p=>p.originalId||p.liveVideoId))?3:2,exportedAt:new Date().toISOString(),books,settings:state.settings,positions:state.positions});if(new TextEncoder().encode(json).length>32*1024*1024)throw Error('相册说明超过 32MB，请逐本导出。');busy(true,'请选择视频 ZIP 的保存位置…');AlbumMedia.saveArchive(json);}catch(e){busy(false);showToast(e.message||'备份未保存',true);}};

function ackAlbumResult(token,keep){try{AlbumMedia.finishResult(token,keep);}catch{showToast('视频操作尚未收尾，请重新打开应用。',true);}handlingAlbumResult=false;}
function rememberAlbumResult(token){state.completedVideoOperations=[...(state.completedVideoOperations||[]).filter(x=>x!==token),token].slice(-100);}
function sanitizeVideoPages(pages){if(!Array.isArray(pages)||!pages.length||pages.length>20)throw Error('每批最多添加 20 段视频。');return pages.map(p=>{if(!localVideoId(p.videoId)||p.src!==localPoster(p.videoId))throw Error('导入结果无效。');let date=validPhotoDate(p.date)?p.date:'';if(!date){const match=(p.filename||'').match(/(?:^|\D)((?:19|20)\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/);if(match&&validPhotoDate(`${match[1]}-${match[2]}-${match[3]}`))date=`${match[1]}-${match[2]}-${match[3]}`;}return {...p,id:uid(),kind:'video',caption:'',date,layout:'classic',durationMs:Number.isFinite(p.durationMs)&&p.durationMs>0?p.durationMs:0};});}
window.onAlbumMediaResult=async()=>{
 if(!state||!globalThis.AlbumMedia?.resultUrl||handlingAlbumResult)return;
 const url=AlbumMedia.resultUrl();if(!/^https:\/\/flipyear\.local\/album-result\/[0-9a-f-]{36}$/.test(url||''))return;
 handlingAlbumResult=true;let persisted;
 try{persisted=await readDB();if(!Array.isArray(persisted?.books))throw Error();}catch{handlingAlbumResult=false;busy(false);showToast('本地相册暂不可读，导入结果已保留，请重新打开应用继续。',true);return;}
 const resultToken=url.split('/').pop();if((persisted.completedVideoOperations||[]).includes(resultToken)||(state.completedVideoOperations||[]).includes(resultToken)){ackAlbumResult(resultToken,true);busy(false);return;}
 let result;
 try{
  busy(true,'正在读取视频操作结果…');const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('视频结果暂不可读，请重新打开应用。');result=await response.json();
  if(typeof result.token!=='string'||url!=='https://flipyear.local/album-result/'+result.token)throw Error('视频结果编号无效。');
  if((persisted.completedVideoOperations||[]).includes(result.token)||(state.completedVideoOperations||[]).includes(result.token)){ackAlbumResult(result.token,true);busy(false);return;}
  if(result.type==='pair'){
   const book=state.books.find(b=>b.id===result.target),page=book?.pages.find(p=>p.id===result.pageId);
   if(!page||isVideo(page))throw Error('目标照片已不存在，实况视频副本已撤回。');
   const videos=sanitizeVideoPages(result.pages);if(videos.length!==1)throw Error('请选择一段对应实况视频。');
   const previous=clone(page),oldTokens=state.completedVideoOperations;page.liveVideoId=videos[0].videoId;page.liveFilename=videos[0].filename;rememberAlbumResult(result.token);
   if(await save()){ackAlbumResult(result.token,true);showToast('已手动关联实况视频，请导出 ZIP 保管照片与视频。');if(typeof refreshOriginalPreview==='function')refreshOriginalPreview(book.id,page.id);}
   else{Object.keys(page).forEach(k=>delete page[k]);Object.assign(page,previous);state.completedVideoOperations=oldTokens;ackAlbumResult(result.token,false);}
   busy(false);return;
  }
  if(result.type==='import'||result.type==='importPhotos'){
   const book=state.books.find(b=>b.id===result.target);if(!book)throw Error('目标相册已不存在，本次视频副本已撤回。');
   const pages=result.type==='importPhotos'?sanitizeOriginalPages(result.pages):sanitizeVideoPages(result.pages);if(book.pages.length+pages.length>1000)throw Error('一本相册最多 1000 页。');
   const oldLength=book.pages.length,oldTokens=state.completedVideoOperations,oldUpdated=book.updated;book.pages.push(...pages);book.updated=Date.now();rememberAlbumResult(result.token);
   if(await save()){ackAlbumResult(result.token,true);renderShelf();if(current()?.id===book.id&&!$('reader').hidden){pageIndex=oldLength;renderReader();}showToast(`已添加 ${pages.length} 个影像，请检查拍摄日期并导出 ZIP 备份。`);}
   else{book.pages.splice(oldLength);book.updated=oldUpdated;state.completedVideoOperations=oldTokens;ackAlbumResult(result.token,false);}busy(false);return;
  }
  if(result.type!=='restore')throw Error('未知的视频操作。');
  const incoming=validateAlbumArchive(result.backup);busy(false);
  openDialog('恢复视频相册备份？','<p id="videoRestoreInfo"></p><p class="notice">作为新相册添加，现有相册保留。视频副本已在手机内暂存，取消会撤回本次副本。</p><div class="dialog-buttons"><button class="secondary" id="cancelVideoRestore">取消</button><button class="primary" id="confirmVideoRestore">恢复相册</button></div>');
  $('videoRestoreInfo').textContent=`${incoming.length} 本相册 · ${mediaSummary(incoming.flatMap(b=>b.pages))}`;
  pendingAlbumRestore={token:result.token};$('cancelVideoRestore').onclick=()=>closeDialog();
  $('confirmVideoRestore').onclick=async()=>{const token=pendingAlbumRestore?.token;if(!token)return;pendingAlbumRestore=null;busy(true,'正在保存恢复的相册…');const oldLength=state.books.length,oldTokens=state.completedVideoOperations;for(const book of incoming){book.id=uid();book.demo=false;book.title=book.title.slice(0,36);state.books.push(book);}rememberAlbumResult(token);if(await save()){ackAlbumResult(token,true);closeDialog();renderShelf();switchTab('albums');showToast('视频相册已恢复');}else{state.books.splice(oldLength);state.completedVideoOperations=oldTokens;ackAlbumResult(token,false);closeDialog();}busy(false);};
 }catch(e){ackAlbumResult(resultToken,false);busy(false);showToast(e.message||'视频操作未完成，现有相册保留。',true);}
};
const closePhotoDialog=closeDialog;
closeDialog=function(){if(pendingAlbumRestore){ackAlbumResult(pendingAlbumRestore.token,false);pendingAlbumRestore=null;}closePhotoDialog();};
$('closeDialog').onclick=closeDialog;$('dialogLayer').onclick=e=>{if(e.target===$('dialogLayer'))closeDialog();};
window.onAlbumMediaError=message=>{busy(false);showToast(message||'视频操作未完成',true);};
window.onAlbumMediaProgress=(index,total)=>{if(!$('busy').hidden)$('busyText').textContent=`正在复制原文件 ${index} / ${total}，请保持应用开启…`;};
window.onAlbumArchiveSaved=()=>{busy(false);showToast('媒体 ZIP 备份已保存');};
window.onAlbumCleanup=count=>{busy(false);showToast(`已清理 ${count} 个未使用的媒体副本`);};
$('restoreBtn').insertAdjacentHTML('afterend','<button class="secondary" id="restoreVideoArchive">从媒体 ZIP 恢复</button><button class="secondary" id="cleanupVideos">清理未使用的媒体副本</button><p class="notice">原图、实况和视频使用媒体 ZIP 保存原文件；旧版压缩照片仍可导出 JSON。卸载会删除应用内副本，请定期备份。视频每批最多 20 段、单段 250MB，单份 ZIP 解压总量最多 512MB。</p>');
$('restoreVideoArchive').onclick=()=>{if(!globalThis.AlbumMedia?.restoreArchive){showToast('视频 ZIP 恢复在 Android APK 中使用。');return;}busy(true,'请选择 FlipYear 视频 ZIP 备份…');try{AlbumMedia.restoreArchive();}catch{onAlbumMediaError('无法打开 ZIP 选择器');}};
$('cleanupVideos').onclick=()=>{if(!globalThis.AlbumMedia?.cleanup){showToast('视频副本清理在 Android APK 中使用。');return;}openDialog('清理未使用的媒体副本？','<p>只清理已不被任何自建相册引用的应用内媒体副本。手机原文件和相册仍使用的副本会保留。</p><div class="dialog-buttons"><button class="secondary" id="cancelCleanupVideos">取消</button><button class="primary" id="confirmCleanupVideos">清理副本</button></div>');$('cancelCleanupVideos').onclick=closeDialog;$('confirmCleanupVideos').onclick=async()=>{busy(true,'正在检查相册引用…');if(!await save()){busy(false);return;}const kept=[...new Set(state.books.flatMap(b=>b.pages.flatMap(pageMediaIds)))];closeDialog();try{AlbumMedia.cleanup(JSON.stringify(kept));}catch{onAlbumMediaError('清理未完成');}};};
const videoResultShelf=renderShelf;renderShelf=function(){videoResultShelf();onAlbumMediaResult();};
if(state)onAlbumMediaResult();

function sanitizeOriginalPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>20)throw Error('每批最多 20 张原图。');
 return pages.map(p=>{validateOriginalPage(p);let date=validPhotoDate(p.date)?p.date:'';
  if(!date){const m=(p.filename||'').match(/(?:^|\D)((?:19|20)\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/);if(m&&validPhotoDate(`${m[1]}-${m[2]}-${m[3]}`))date=`${m[1]}-${m[2]}-${m[3]}`;}
  return {...p,id:uid(),kind:'photo',date,caption:'',layout:'classic'};
 });
}
const compressedPhotoChooser=$('addPhoto').onclick;
$('addPhoto').onclick=()=>{
 if(!globalThis.AlbumMedia?.choosePhotos)return compressedPhotoChooser();
 const book=current();if(!book)return;busy(true,'选择原文件：每批最多 20 张，不缩放、不转码。');
 try{AlbumMedia.choosePhotos(book.id);}catch{onAlbumMediaError('原图选择器无法打开');}
};
