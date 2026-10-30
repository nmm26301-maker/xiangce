/* A journal collection is independent of user-created albums. Native targets
   carry the selected date through chooser cancellation and process recreation. */
'use strict';
function localToday(){const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;}
function yearStartPage(month){const key='year:'+selectedYear;if(month!==null)return month+1;if(Object.hasOwn(state.positions,key))return Number(state.positions[key])||0;return selectedYear===new Date().getFullYear()?new Date().getMonth()+1:1;}
function journalMediaBook(id){return id==='daily'?{id:'daily',pages:state.dailyPhotos||[]}:state.books.find(b=>b.id===id);}
function journalBackupBooks(books){
 const result=books.slice();if(books!==state.books)return result;
 const pages=state.dailyPhotos||[];
 for(let i=0;i<pages.length;i+=1000)result.push({id:'daily-journal-'+i,title:'每日照片',subtitle:'按日期记录',color:COLORS[0],dailyJournal:true,created:Date.now(),updated:Date.now(),pages:pages.slice(i,i+1000)});
 return result;
}
function appendRestoredJournal(books){
 state.dailyPhotos=state.dailyPhotos||[];
 for(const book of books){
  if(book.dailyJournal===true){for(const p of book.pages){p.id=uid();state.dailyPhotos.push(p);}}
  else{book.id=uid();book.demo=false;book.title=book.title.slice(0,36);state.books.push(book);}
 }
}
function refreshJournal(date){
 selectedYear=Number(date.slice(0,4));
 yearPhotos=recordCatalog().photos.filter(p=>p.date.startsWith(String(selectedYear)));
 ({byDate:yearPhotosByDate,monthTotals:yearMonthTotals}=indexYearPhotos(yearPhotos));
 renderYearShelf();
 if(!$('yearReader').hidden){$('annualReaderTitle').textContent=selectedYear+' 年鉴';mountYearEngine(Number(date.slice(5,7))-1);}
 if(tab==='memories'){renderTimeline();renderToday();}
}
async function acceptJournalImport(result){
 const date=(result.target||'').slice(4);if(!validPhotoDate(date))throw Error('记录日期无效，本次副本已撤回。');
 const pages=sanitizeOriginalPages(result.pages).map(p=>({...p,date,dateSource:'selected'}));
 state.dailyPhotos=state.dailyPhotos||[];const before=state.dailyPhotos.length,oldTokens=state.completedVideoOperations;
 state.dailyPhotos.push(...pages);rememberAlbumResult(result.token);
 if(await save()){ackAlbumResult(result.token,true);refreshJournal(date);showToast(`${dateText(date)} · 已保存 ${pages.length} 张照片`);}
 else{state.dailyPhotos.splice(before);state.completedVideoOperations=oldTokens;ackAlbumResult(result.token,false);}
}
let browserJournalDate='';
const journalInput=el('input');journalInput.id='journalPhotoInput';journalInput.type='file';journalInput.accept='image/jpeg,image/png,image/webp';journalInput.multiple=true;journalInput.hidden=true;document.body.append(journalInput);
function chooseJournalPhotos(date){
 if(!validPhotoDate(date)){showToast('请选择有效日期',true);return;}
 stopAutoTurn();yearEngine?.cancelTurn();
 if(!$('photoViewer').hidden)closePhotoViewer();if(!$('dialogLayer').hidden)closeDialog();
 if(globalThis.AlbumMedia?.choosePhotos){busy(true,`为 ${dateText(date)} 选择照片，每批最多 20 张。`);try{AlbumMedia.choosePhotos('day:'+date);}catch{onAlbumMediaError('照片选择器无法打开');}}
 else{browserJournalDate=date;journalInput.value='';journalInput.click();}
}
journalInput.onchange=async()=>{
 const date=browserJournalDate;browserJournalDate='';const files=[...journalInput.files];if(!files.length||!validPhotoDate(date))return;
 if(files.length>20){showToast('每批最多添加 20 张照片',true);return;}
 busy(true,'正在保存当天照片…');const added=[];let failed=0;
 try{
  for(const f of files){try{
   if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>25*1024*1024)throw Error();
   const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});
   const image=new Image();image.src=src;await image.decode();
   added.push({id:uid(),src,date,dateSource:'selected',filename:f.name,caption:'',layout:'classic'});
  }catch{failed++;}}
  state.dailyPhotos=state.dailyPhotos||[];const before=state.dailyPhotos.length;state.dailyPhotos.push(...added);
  if(added.length&&await save()){refreshJournal(date);showToast(`已保存 ${added.length} 张照片${failed?'，'+failed+' 张未能读取':''}`);}
  else{state.dailyPhotos.splice(before);if(!added.length)showToast('未能读取照片，请选择 JPG、PNG 或 WebP（单张最多 25MB）',true);}
 }finally{busy(false);}
};
function openJournalDay(date){
 const photos=yearPhotosByDate.get(date)||[];
 if(!photos.length){chooseJournalPhotos(date);return;}
 showPhoto(photos,0);
}
function openJournalDate(date=localToday()){
 openDialog('添加每日照片','<form id="journalDateForm"><label class="field" for="journalDate">记录日期<input id="journalDate" type="date" min="1900-01-01" max="2100-12-31" required></label><p class="notice">照片直接记在这一天，不需要新建相册。</p><button class="primary" type="submit">选择照片</button></form>');
 $('journalDate').value=date;$('journalDateForm').onsubmit=e=>{e.preventDefault();chooseJournalPhotos($('journalDate').value);};
}
// Put the daily action first; system-wide indexing remains an optional source.
const todayButton=el('button','primary','记录今天');todayButton.id='addToday';todayButton.type='button';todayButton.onclick=()=>chooseJournalPhotos(localToday());
$('galleryConnect').before(todayButton);$('galleryConnect').className='text-btn';
const yearAdd=el('button','icon');yearAdd.id='yearAddPhoto';yearAdd.type='button';yearAdd.innerHTML=icon('plus');yearAdd.setAttribute('aria-label','添加每日照片');yearAdd.onclick=()=>{const m=yearEngine?.getVisiblePages().find(i=>i>=1&&i<=12);const now=localToday();openJournalDate(m?`${selectedYear}-${String(m).padStart(2,'0')}-${now.startsWith(`${selectedYear}-${String(m).padStart(2,'0')}`)?now.slice(8):'01'}`:now);};
const yearTools=el('button','icon');yearTools.id='yearToolsToggle';yearTools.type='button';yearTools.innerHTML=icon('more');yearTools.setAttribute('aria-label','年鉴操作');yearTools.setAttribute('aria-expanded','false');yearTools.setAttribute('aria-controls','yearToolsPanel');
const yearPanel=$('monthPhotos').parentElement;yearPanel.id='yearToolsPanel';
yearPanel.prepend($('yearCoverPick'),$('yearCoverBack'));
$('yearReader').querySelector('.year-reader-actions').append(yearAdd,yearTools);
function setYearTools(open){$('yearReader').classList.toggle('year-tools-open',open);yearTools.setAttribute('aria-expanded',String(open));}
yearTools.onclick=()=>setYearTools(!$('yearReader').classList.contains('year-tools-open'));
yearPanel.addEventListener('click',e=>{if(e.target.closest('button'))setYearTools(false);});
$('yearReader').addEventListener('pointerdown',e=>{if(!yearPanel.contains(e.target)&&!yearTools.contains(e.target))setYearTools(false);},true);
const yearBack=goBack;goBack=function(){if($('busy').hidden&&$('dialogLayer').hidden&&$('photoViewer').hidden&&!$('yearReader').hidden&&$('yearReader').classList.contains('year-tools-open')){setYearTools(false);yearTools.focus();return true;}return yearBack();};window.goBack=goBack;
const dailyOpenYear=openYearbook;openYearbook=function(...args){setYearTools(false);dailyOpenYear(...args);};$('annualCover').onclick=$('openAnnual').onclick=()=>openYearbook();
const journalYearChrome=updateYearChrome;updateYearChrome=function(){journalYearChrome();const active=$('yearMonths').querySelector('.active');if(active){const left=active.offsetLeft-$('yearMonths').offsetLeft;$('yearMonths').scrollTo({left:left-($('yearMonths').clientWidth-active.clientWidth)/2,behavior:'instant'});}};
// The annual viewer uses the full width behind floating controls. Its tools open
// on demand; the photograph itself always stays complete and proportional.
const photoTools=el('div');photoTools.id='journalViewerTools';
for(const node of [...$('photoViewer').children])if(node.matches('.photo-zoom-controls,.photo-zoom-hint,.photo-caption,.original-actions,.original-status,.photo-detail-controls,#playVideo'))photoTools.append(node);
$('photoViewer').querySelector('footer').before(photoTools);
const photoMore=el('button','icon');photoMore.id='journalPhotoMore';photoMore.innerHTML=icon('more');photoMore.setAttribute('aria-label','照片操作');photoMore.setAttribute('aria-controls','journalViewerTools');photoMore.setAttribute('aria-expanded','false');
const photoAdd=el('button','icon');photoAdd.id='addDayPhoto';photoAdd.innerHTML=icon('plus');photoAdd.setAttribute('aria-label','为当天继续添加照片');
const headerActions=el('div','journal-photo-actions');headerActions.append(photoAdd,photoMore);$('photoViewer').querySelector('header>span').replaceWith(headerActions);
photoMore.onclick=()=>{const open=$('photoViewer').classList.toggle('photo-tools-open');photoMore.setAttribute('aria-expanded',String(open));};
photoAdd.onclick=()=>chooseJournalPhotos(photoSet[photoAt]?.date);
const removeDaily=el('button','secondary','从当天移除照片');removeDaily.id='removeDailyPhoto';photoTools.append(removeDaily);
removeDaily.onclick=()=>{
 const p=photoSet[photoAt];if(!(state.dailyPhotos||[]).some(x=>x.id===p?.id))return;
 openDialog('从这一天移除照片？','<p>手机里的源照片保留。应用内副本可稍后清理。</p><div class="dialog-buttons"><button class="secondary" id="keepDailyPhoto">保留</button><button class="primary" id="confirmRemoveDaily">移除</button></div>');
 $('keepDailyPhoto').onclick=closeDialog;$('confirmRemoveDaily').onclick=async()=>{
  const previous=state.dailyPhotos;state.dailyPhotos=previous.filter(x=>x.id!==p.id);
  if(await save()){closeDialog();closePhotoViewer();refreshJournal(p.date);showToast('已从当天移除');}else state.dailyPhotos=previous;
 };
};
const journalViewer=showPhoto;showPhoto=function(photos,index){
 if(!photos?.length)return;
 const annual=!$('yearReader').hidden;$('photoViewer').classList.toggle('daily-preview',annual);$('photoViewer').classList.remove('photo-tools-open');photoMore.setAttribute('aria-expanded','false');photoMore.hidden=!annual;
 journalViewer(photos,index);
};
const journalViewerUpdate=updatePhotoViewer;updatePhotoViewer=function(){journalViewerUpdate();const p=photoSet[photoAt];photoAdd.hidden=$('yearReader').hidden||!validPhotoDate(p?.date);removeDaily.hidden=!(state.dailyPhotos||[]).some(x=>x.id===p?.id);};
// Preserve the previous JSON and media ZIP schemas with marked journal blocks.
// Restore extracts these blocks back to dailyPhotos, never to the album shelf.
$('backupBtn').setAttribute('aria-label','备份相册与每日照片');$('exportAll').innerHTML=icon('download')+'导出相册与每日照片';
const journalShelf=renderYearShelf;renderYearShelf=function(){journalShelf();if(!state)return;const daily=state.dailyPhotos||[];if(daily.length)$('galleryStatus').textContent=`已记录 ${new Set(daily.map(p=>p.date)).size} 天 · ${daily.length} 张每日照片。点日期即可继续添加。`;else if(recordCatalog().sample)$('galleryStatus').textContent='现在是示例年鉴。点「记录今天」开始，或翻开年鉴为任意日期添加照片。';};
if(state){state.dailyPhotos=state.dailyPhotos||[];renderYearShelf();}

const journalTimeline=renderTimeline;renderTimeline=function(){
 if(!(state.dailyPhotos||[]).length)return journalTimeline();
 const groups=new Map();
 for(const p of [...state.books.flatMap(b=>b.pages),...state.dailyPhotos]){const key=p.date||'未标注';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 $('timeline').replaceChildren();
 for(const [date,photos]of [...groups].sort(([a],[b])=>b.localeCompare(a))){const row=el('div','memory-row'),heading=el('div','memory-date',date==='未标注'?'—':date.slice(8));heading.append(el('small',null,date==='未标注'?'待记录':date.slice(0,7).replace('-',' / ')));const strip=el('div','memory-photos');for(const [i,p]of photos.entries()){const button=el('button'),img=el('img');button.setAttribute('aria-label','查看'+(p.caption||date+'的照片'));img.src=mediaThumbnail(p);img.alt=p.caption||'每日照片';img.loading='lazy';button.append(img,el('small',null,p.caption||'这一天'));button.onclick=()=>showPhoto(photos,i);strip.append(button);}row.append(heading,strip);$('timeline').append(row);}
};
