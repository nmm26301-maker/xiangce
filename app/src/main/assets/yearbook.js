/* Application integration only. Curl geometry is supplied by the pinned MPL-2.0 engine. */
'use strict';
const MONTH_NAMES=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MONTH_COLORS=['#8f614d','#986578','#6a8869','#6a8694','#887a4b','#438e80','#865b8c','#bc7958','#958247','#b06154','#81678f','#4d7f87'];
let selectedYear=null,yearEngine=null,yearPhotos=[],yearList=[],galleryPending=null,galleryRunning=false,photoSet=[],photoAt=0,yearGeneration=0;
let autoTurnTimer=null,autoTurnEnabled=false;
let yearPhotosByDate=new Map(),yearMonthTotals=Array(12).fill(0);
function indexYearPhotos(photos){
 const byDate=new Map(),monthTotals=Array(12).fill(0);
 for(const photo of photos){
  if(typeof photo?.date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(photo.date))continue;
  const month=Number(photo.date.slice(5,7))-1;
  if(month<0||month>11)continue;
  if(!byDate.has(photo.date))byDate.set(photo.date,[]);
  byDate.get(photo.date).push(photo);
  monthTotals[month]++;
 }
 return {byDate,monthTotals};
}
function syncAutoTurnButton(){
 const button=$('yearAutoTurn');
 if(!button)return;
 button.textContent=autoTurnEnabled?'暂停自动翻页':'自动翻页';
 button.setAttribute('aria-pressed',String(autoTurnEnabled));
}
function stopAutoTurn(){
 clearTimeout(autoTurnTimer);autoTurnTimer=null;autoTurnEnabled=false;syncAutoTurnButton();
}
function queueAutoTurn(){
 clearTimeout(autoTurnTimer);
 if(!autoTurnEnabled||document.hidden||$('yearReader').hidden||!yearEngine){stopAutoTurn();return;}
 autoTurnTimer=setTimeout(()=>{
  autoTurnTimer=null;
  if(!autoTurnEnabled||!yearEngine||$('yearReader').hidden||document.hidden){stopAutoTurn();return;}
  if(yearEngine.isAnimating()){queueAutoTurn();return;}
  if(!yearEngine.canTurn('next')){stopAutoTurn();return;}
  yearEngine.flipNext();
  queueAutoTurn();
 },Math.max(1800,Number(state?.settings?.speed||550)+1100));
}
function toggleAutoTurn(){
 if(autoTurnEnabled){stopAutoTurn();return;}
 if(!yearEngine||!yearEngine.canTurn('next'))return;
 autoTurnEnabled=true;syncAutoTurnButton();queueAutoTurn();
}

function isVideo(p){return p?.kind==='video';}
function mediaThumbnail(p){const src=p.src||'';return /^https:\/\/flipyear\.local\/media\/(?:video\/)?[0-9]+\?v=[0-9]+$/.test(src)?src+'&size=thumb':src;}
function mediaSummary(items){const videos=items.filter(isVideo).length,photos=items.length-videos;return [photos?photos+' 张照片':'',videos?videos+' 段视频':''].filter(Boolean).join(' · ')||'0 个瞬间';}
function durationText(ms){if(!Number.isFinite(ms)||ms<=0)return '时长未知';const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),tail=String(seconds%60).padStart(2,'0');return hours?hours+':'+String(minutes).padStart(2,'0')+':'+tail:minutes+':'+tail;}
function validPhotoDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const [y,m,d]=value.split('-').map(Number);if(y<1900||y>2100)return false;return new Date(y,m-1,d).getFullYear()===y&&new Date(y,m-1,d).getMonth()===m-1&&new Date(y,m-1,d).getDate()===d;}
function calendarSlots(year,month){const offset=(new Date(year,month,1).getDay()+6)%7,count=new Date(year,month+1,0).getDate();return Array.from({length:42},(_,i)=>i>=offset&&i<offset+count?i-offset+1:null);}
function recordCatalog(){const real=[],demo=[];for(const b of state.books){for(const p of b.pages){if(validPhotoDate(p.date))(b.demo?demo:real).push({...p,bookId:b.id,bookTitle:b.title});}}for(const p of state.gallery||[])if(validPhotoDate(p.date))real.push(p);if(real.length)return {photos:real,sample:false};const samples=demo.slice();for(const y of [2024,2025])for(let i=0;i<DEMO_PHOTOS.length;i++)samples.push({id:`sample-${y}-${i}`,src:DEMO_PHOTOS[i],caption:cap[i],date:`${y}-${String(i%3+5).padStart(2,'0')}-${String(12+i).padStart(2,'0')}`,sample:true});return {photos:samples,sample:true};}
function initYearbook(){state.gallery=state.gallery||[];state.yearCovers=state.yearCovers||{};if(!state.settings)state.settings={};if(typeof state.settings.light!=='boolean')state.settings.light=false;if(state.settings.rendererDefaults!==2){state.settings.bookRenderer='webgl';state.settings.customRenderer='webgl';state.settings.rendererDefaults=2;}renderYearShelf();applyYearPrefs();}
function applyYearPrefs(){document.body.classList.remove('night');document.body.classList.toggle('light',!!state.settings.light);document.body.classList.toggle('reduced',!!state.settings.reduce);$('nightMode').checked=!state.settings.light;}
const shelfV1=renderShelf;
renderShelf=function(){shelfV1();if(state)initYearbook();};
const prefsV1=applyPrefs;
applyPrefs=function(){prefsV1();applyYearPrefs();};
switchTab=function(next){tab=next;for(const t of ['years','albums','memories','settings']){$(t+'Panel').hidden=t!==next;const btn=document.querySelector(`[data-tab="${t}"]`);if(btn){btn.classList.toggle('active',t===next);if(t===next)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');}}if(next==='years')renderYearShelf();if(next==='memories'){renderTimeline();renderToday();}window.scrollTo(0,0);};
function renderYearShelf(){if(!state||!$('yearWheel'))return;const catalog=recordCatalog();yearList=[...new Set(catalog.photos.map(p=>Number(p.date.slice(0,4))))].sort((a,b)=>b-a);if(!yearList.includes(selectedYear))selectedYear=yearList[0]||new Date().getFullYear();const wheel=$('yearWheel');wheel.replaceChildren();for(const year of yearList){const btn=el('button','year-option'+(year===selectedYear?' active':''),String(year));btn.dataset.year=year;btn.setAttribute('aria-pressed',String(year===selectedYear));btn.setAttribute('aria-label',`选择 ${year} 年`);btn.onclick=()=>selectYear(year,true);wheel.append(btn);}updateYearCover();const total=(state.gallery||[]).length,undated=state.books.filter(b=>!b.demo).reduce((n,b)=>n+b.pages.filter(p=>!validPhotoDate(p.date)).length,0);$('galleryStatus').textContent=galleryRunning?'正在连接系统相册…':catalog.sample?'当前展示示例年鉴。连接系统相册，或给自建相册的照片填写拍摄日期后，自动生成你的年度照片书。':`已按拍摄日期生成 ${yearList.length} 本年鉴 · ${total?mediaSummary(state.gallery):'来自自建相册'}${state.galleryAccess==='partial'?' · 当前仅能读取你授权的部分照片与视频':''}${undated?` · ${undated} 张照片待填写日期`:''}`;$('galleryConnect').innerHTML=icon(total?'clock':'image')+(total?'重新扫描系统相册':'连接系统相册');requestAnimationFrame(()=>centerSelectedYear(false));}
function centerSelectedYear(smooth){const node=$('yearWheel').querySelector('.active');if(node)$('yearWheel').scrollTo({top:node.offsetTop-$('yearWheel').offsetTop-($('yearWheel').clientHeight-node.clientHeight)/2,behavior:smooth&&!reduced()?'smooth':'instant'});}
function selectYear(year,center=false){selectedYear=year;for(const btn of $('yearWheel').children){const chosen=Number(btn.dataset.year)===year;btn.classList.toggle('active',chosen);btn.setAttribute('aria-pressed',String(chosen));}updateYearCover();if(center)centerSelectedYear(true);}
function updateYearCover(){const catalog=recordCatalog();const records=catalog.photos.filter(p=>p.date.startsWith(String(selectedYear)));const cover=records.find(p=>p.id===state.yearCovers[selectedYear])||records[0];$('annualCover').style.setProperty('--year-accent',MONTH_COLORS[(selectedYear||0)%12]);$('annualCoverYear').textContent=selectedYear;$('annualCoverPhoto').src=cover?.src||DEMO_PHOTOS[0];$('annualCoverPhoto').alt=selectedYear+'年照片书封面';$('annualCaptionTitle').textContent=selectedYear+'，有迹可循。';$('annualCaptionMeta').textContent=`12 个月 · ${mediaSummary(records)}${catalog.sample?' · 灵感示例':''}`;$('openAnnual').disabled=!records.length;updateYearNeighbours(catalog);}
let wheelTimeout;
$('yearWheel').addEventListener('scroll',()=>{clearTimeout(wheelTimeout);wheelTimeout=setTimeout(()=>{if(!$('yearReader').hidden)return;const box=$('yearWheel').getBoundingClientRect(),middle=box.top+box.height/2;let best=null,dist=Infinity;for(const n of $('yearWheel').children){const r=n.getBoundingClientRect(),d=Math.abs(r.top+r.height/2-middle);if(d<dist){best=n;dist=d;}}if(best&&Number(best.dataset.year)!==selectedYear)selectYear(Number(best.dataset.year));},140);});
function createCoverLeaf(back=false){const root=el('div','calendar-leaf');root.dataset.density='hard';const face=el('div',back?'calendar-back':'calendar-cover-inner');if(back){face.append(el('div',null,'每一天，都值得被记住。'));face.append(el('h2',null,String(selectedYear)));face.append(el('p',null,'A YEAR TO REMEMBER'));}else{const im=el('img');const cover=yearPhotos.find(p=>p.id===state.yearCovers[selectedYear])||yearPhotos[0];im.src=cover?.src||DEMO_PHOTOS[0];im.alt=selectedYear+'年度照片书封面';im.draggable=false;face.append(im,el('div','annual-number',String(selectedYear)));const text=el('div','annual-text');text.append(el('h3',null,'这一年，我的日子。'),el('p',null,`${yearPhotos.length} MOMENTS · TWELVE MONTHS`));face.append(text);}root.append(face);return root;}
function createMonthLeaf(month){const root=el('div','calendar-leaf');root.dataset.month=month;const paper=el('div','calendar-paper');paper.style.setProperty('--month-color',MONTH_COLORS[month]);const head=el('div','calendar-heading'),left=el('div');left.append(el('span','month-name',MONTH_NAMES[month]),el('span','month-year',String(selectedYear)));head.append(left,el('span','month-index',String(month+1).padStart(2,'0')));paper.append(head);const week=el('div','calendar-week');for(const s of ['一','二','三','四','五','六','日'])week.append(el('span',null,s));paper.append(week);const grid=el('div','calendar-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',`${selectedYear}年${month+1}月照片日历`);const slots=calendarSlots(selectedYear,month);while(slots.slice(-7).every(d=>!d))slots.splice(-7);grid.style.gridTemplateRows='repeat('+(slots.length/7)+',minmax(0,1fr))';for(const d of slots){if(!d){grid.append(el('span','calendar-day blank'));continue;}const date=`${selectedYear}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,photos=yearPhotosByDate.get(date)||[];const cell=el(photos.length?'button':'span','calendar-day'+(photos.length?' has-photo':''));cell.dataset.date=date;if(photos.length){cell.type='button';cell.dataset.action='day';cell.setAttribute('aria-label',`${month+1}月${d}日，${mediaSummary(photos)}`);const im=el('img');im.src=mediaThumbnail(photos[0]);im.alt='';im.loading='lazy';im.draggable=false;im.onerror=()=>{im.remove();cell.classList.remove('has-photo');cell.title='照片不可用，请重新扫描相册';};cell.append(im);if(photos.some(isVideo))cell.append(el('span','video-badge','▶'));if(photos.length>1)cell.append(el('span','photo-count','+'+(photos.length-1)));}cell.append(el('span','day-number',String(d)));grid.append(cell);}paper.append(grid);const foot=el('div','calendar-foot');const count=yearMonthTotals[month];foot.append(el('span',null,count+' 个瞬间'),el('span',null,MONTH_NAMES[month]+' / '+selectedYear));paper.append(foot);root.append(paper);return root;}
function engineSize(){const frame=$('yearBookFrame'),wide=innerWidth>=800,width=wide?Math.min(370,(frame.clientWidth-48)/2):Math.min(340,frame.clientWidth-40);return {width:Math.max(240,width),height:Math.max(350,Math.round(width*1.28)),wide};}
function destroyYearEngine(){stopAutoTurn();yearGeneration++;if(yearEngine){try{yearEngine.cancelTurn();yearEngine.destroy();}catch{}yearEngine=null;}const mount=el('div','year-book-mount');mount.id='yearBookMount';const fan=el('div','year-month-fan');fan.id='yearMonthFan';fan.setAttribute('aria-hidden','true');fan.inert=true;$('yearBookFrame').replaceChildren(fan,mount);}
function openYearbook(year=selectedYear,month=null){selectedYear=year;yearPhotos=recordCatalog().photos.filter(p=>p.date.startsWith(String(year)));({byDate:yearPhotosByDate,monthTotals:yearMonthTotals}=indexYearPhotos(yearPhotos));$('yearReader').hidden=false;document.body.classList.add('lock');$('app').inert=true;document.querySelector('.bottom-nav').inert=true;$('annualReaderTitle').textContent=year+' 年鉴';$('yearMonths').replaceChildren();for(let m=0;m<12;m++){const btn=el('button','month-tab',String(m+1).padStart(2,'0'));btn.setAttribute('aria-label',`跳到${m+1}月`);btn.dataset.month=m;btn.onclick=()=>{stopAutoTurn();if(yearEngine){yearEngine.cancelTurn();yearEngine.turnToPage(m+1);updateYearChrome();}};$('yearMonths').append(btn);}mountYearEngine(month);$('closeYearReader').focus();}
function mountYearEngine(month=null){if(state.settings.bookRenderer==='webgl'&&typeof mountWebGLYearbook==='function'){mountWebGLYearbook(month);return;}destroyYearEngine();const mount=$('yearBookMount'),size=engineSize();mount.style.minHeight=size.height+'px';for(const n of [createCoverLeaf(),...Array.from({length:12},(_,m)=>createMonthLeaf(m)),createCoverLeaf(true)])mount.append(n);const position=month===null?Number(state.positions['year:'+selectedYear]||0):month+1;try{yearEngine=new FlipBookEngine.PageFlip(mount,{width:size.width,height:size.height,sizing:'fixed',hardCovers:true,usePortrait:!size.wide,autoSize:true,flippingTime:reduced()?0:state.settings.speed,drawShadow:!reduced(),maxShadowOpacity:.45,allowTouchScroll:false,respectInteractiveContent:false,flipOnClick:'never',respectReducedMotion:true,pageBackground:'#fffdf8'});yearEngine.on('flip',()=>{updateYearChrome();state.positions['year:'+selectedYear]=yearEngine.getCurrentPageIndex();save();});yearEngine.on('changeState',()=>updateYearChrome());yearEngine.on('loaded',()=>updateYearChrome());yearEngine.loadFromHTML(mount.querySelectorAll('.calendar-leaf'));yearEngine.turnToPage(Math.max(0,Math.min(position,13)));updateYearChrome();}catch(err){showToast('翻页引擎加载失败，请关闭后重试。',true);console.error(err);}}
function updateYearChrome(){if(!yearEngine)return;updateYearFan();const index=yearEngine.getCurrentPageIndex(),visible=yearEngine.getVisiblePages(),months=visible.filter(i=>i>=1&&i<=12);$('yearPageLabel').replaceChildren();$('yearPageLabel').append(el('span',null,months.length?months.map(i=>i+' 月').join(' · '):index===0?'年度封面':'年鉴封底'),el('small',null,months.length?`${selectedYear} / ${months.map(i=>String(i).padStart(2,'0')).join('–')}`:'A YEAR TO REMEMBER'));for(const btn of $('yearMonths').children){const isVisible=months.includes(Number(btn.dataset.month)+1);btn.classList.toggle('active',isVisible);btn.setAttribute('aria-pressed',String(isVisible));}$('yearPrev').disabled=!yearEngine.canTurn('prev');$('yearNext').disabled=!yearEngine.canTurn('next');$('monthPhotos').disabled=!months.length;}
function closeYearbook(){destroyYearEngine();yearPhotosByDate.clear();yearMonthTotals.fill(0);$('yearReader').hidden=true;$('app').inert=false;document.querySelector('.bottom-nav').inert=false;document.body.classList.remove('lock');renderYearShelf();$('openAnnual').focus();}
function showMonthPhotos(){stopAutoTurn();if(!yearEngine)return;const months=yearEngine.getVisiblePages().filter(i=>i>=1&&i<=12);const photos=yearPhotos.filter(p=>months.includes(Number(p.date.slice(5,7))));openPhotoList(photos,months.map(m=>m+'月').join(' · ')+'的影像');}
function openPhotoList(photos,title){openDialog(title,'<div id="dayPhotoList" class="day-photo-list"></div>');if(!photos.length){$('dayPhotoList').append(el('p','muted','这个月还没有照片。添加照片并填写拍摄日期后，会自动出现在日历中。'));return;}for(let i=0;i<photos.length;i++){const p=photos[i],btn=el('button'),im=el('img');im.src=mediaThumbnail(p);im.alt='';const text=el('span',null,p.caption||p.filename||'这一天的照片');text.append(el('small',null,dateText(p.date)+(isVideo(p)?' · 视频 '+durationText(p.durationMs):'')));btn.append(im,text);btn.onclick=()=>{closeDialog();showPhoto(photos,i);};$('dayPhotoList').append(btn);}}
function showPhoto(photos,index){stopAutoTurn();photoSet=photos;photoAt=index;$('photoViewer').hidden=false;document.body.classList.add('lock');$('yearReader').inert=true;$('app').inert=true;document.querySelector('.bottom-nav').inert=true;updatePhotoViewer();$('closePhotoViewer').focus();}
function updatePhotoViewer(){const p=photoSet[photoAt];$('fullPhoto').src=p.src;$('fullPhoto').alt=isVideo(p)?'视频封面':p.caption||'完整照片';$('fullPhoto').onerror=()=>showToast(isVideo(p)?'视频封面不可用，仍可尝试播放。':'照片不可用，请检查授权后重新扫描。',true);$('fullPhotoTitle').textContent=dateText(p.date);$('fullPhotoCaption').textContent=(p.caption||p.filename||(isVideo(p)?'本地视频':'照片按原比例完整呈现'))+(isVideo(p)?' · '+durationText(p.durationMs):'');$('fullPhotoCount').textContent=(photoAt+1)+' / '+photoSet.length;$('fullPhotoPrev').disabled=photoAt===0;$('fullPhotoNext').disabled=photoAt===photoSet.length-1;$('playVideo').hidden=!isVideo(p);$('playVideo').textContent='播放视频 · '+durationText(p.durationMs);}
function closePhotoViewer(){$('photoViewer').hidden=true;$('playVideo').hidden=true;$('fullPhoto').removeAttribute('src');$('yearReader').inert=false;const annual=!$('yearReader').hidden;$('app').inert=annual;document.querySelector('.bottom-nav').inert=annual;document.body.classList.toggle('lock',annual);if(annual)$('monthPhotos').focus();}
function chooseYearCover(){
 stopAutoTurn();
 openDialog('选择年度封面','<p class="muted">用这一年的某个瞬间，作为故事的开头。</p><div class="cover-picks" id="coverPicks"></div>');
 const photos=yearPhotos.slice(),container=$('coverPicks');
 let offset=0;
 function addChoices(){
  const page=photos.slice(offset,offset+72);offset+=page.length;
  for(const p of page){const btn=el('button',state.yearCovers[selectedYear]===p.id?'selected':'');btn.setAttribute('aria-label','选择'+(p.caption||p.date)+'为封面');const im=el('img');im.src=mediaThumbnail(p);im.alt=p.caption||p.date;im.loading='lazy';btn.append(im);btn.onclick=async()=>{const previous=state.yearCovers[selectedYear];state.yearCovers[selectedYear]=p.id;if(await save()){closeDialog();mountYearEngine();updateYearCover();showToast('年度封面已更新');}else state.yearCovers[selectedYear]=previous;};container.append(btn);}
  const previous=container.querySelector('#moreYearCovers');if(previous)previous.remove();
  if(offset<photos.length){const more=el('button','secondary',`加载更多封面 (${offset}/${photos.length})`);more.id='moreYearCovers';more.onclick=addChoices;container.append(more);}
 }
 addChoices();
}
function renderToday(){const existing=$('todayCard');if(existing)existing.remove();const now=new Date(),md=`${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;const all=recordCatalog().photos.filter(p=>p.date.slice(5)===md&&Number(p.date.slice(0,4))<now.getFullYear()),card=el('section','today-card');card.id='todayCard';card.append(el('h2',null,'那年今日'),el('p','muted',all.length?`${now.getMonth()+1} 月 ${now.getDate()} 日 · ${all.length} 个旧时光的瞬间`:'往年的今天暂无照片。记录会在同一个日子，与你重逢。'));const row=el('div','today-photos');for(let i=0;i<all.length;i++){const p=all[i],btn=el('button'),im=el('img');im.src=mediaThumbnail(p);im.alt=p.caption||p.date;btn.append(im,el('small',null,p.date.slice(0,4)+' 年'));if(isVideo(p))btn.append(el('span','video-badge','▶ '+durationText(p.durationMs)));btn.onclick=()=>showPhoto(all,i);row.append(btn);}card.append(row);$('timeline').before(card);}
function requestGallery(){if(galleryRunning)return;if(!globalThis.Android?.scanGallery){showToast('系统相册读取在 APK 中使用；网页版可新建相册并导入带日期的照片。');return;}openDialog('连接手机系统相册',`<p>授权后，按照片与视频的拍摄日期自动生成年鉴。原始媒体保留在手机相册中，应用只保存索引，不上传。</p><p class="notice">可选择部分照片与视频，也可只授权其中一类；拒绝授权仍可手动制作照片相册。源照片被删除或权限被收回后，对应照片会不可用。</p><div class="dialog-buttons"><button class="secondary" id="cancelGallery">暂不连接</button><button class="primary" id="startGallery">选择授权范围</button></div>`);$('cancelGallery').onclick=closeDialog;$('startGallery').onclick=()=>{closeDialog();galleryRunning=true;busy(true,'正在读取系统相册…');Android.scanGallery();};}
window.beginGalleryImport=()=>{galleryPending=[];galleryRunning=true;busy(true,'正在读取系统相册…');};
window.receiveGalleryBatch=batch=>{if(!Array.isArray(galleryPending)||!Array.isArray(batch))return;galleryPending.push(...batch);$('busyText').textContent=`已读取 ${galleryPending.length} 个影像信息…`;};
function permittedGallery(records,access,details){if(access==='denied')return [];if(!details)return records;return records.filter(p=>(isVideo(p)?details.videos:details.images)!=='denied');}
function closeRemovedMedia(previous,next){const ids=new Set(next.map(p=>p.id));if(previous.some(p=>!ids.has(p.id))){if(!$('photoViewer').hidden)closePhotoViewer();if(!$('yearReader').hidden)closeYearbook();}}
window.finishGalleryImport=async(access,error,details)=>{
 if(error){const previous=state.gallery;state.gallery=permittedGallery(previous,access,details);if(state.gallery.length!==previous.length){closeRemovedMedia(previous,state.gallery);state.galleryAccess=access;await save();}galleryPending=null;galleryRunning=false;busy(false);renderYearShelf();showToast(error,true);return;}
 if(!Array.isArray(galleryPending)){galleryRunning=false;busy(false);return;}
 const previous=state.gallery,oldAccess=state.galleryAccess;
 state.gallery=permittedGallery(galleryPending,access,details);state.galleryAccess=access;galleryPending=null;
 if(await save()){closeRemovedMedia(previous,state.gallery);selectedYear=null;renderYearShelf();showToast('已连接 '+mediaSummary(state.gallery)+(access==='partial'?'（仅已授权范围）':''));}
 else{state.gallery=permittedGallery(previous,access,details);state.galleryAccess=oldAccess;closeRemovedMedia(previous,state.gallery);}
 galleryRunning=false;busy(false);renderYearShelf();
};
window.onGalleryPermissionChanged=()=>{if(state?.gallery?.length){state.gallery=[];state.galleryAccess='denied';if(!$('photoViewer').hidden)closePhotoViewer();if(!$('yearReader').hidden)closeYearbook();save();renderYearShelf();const refresh=globalThis.Android?.refreshGallery&&globalThis.Android?.galleryAccess&&Android.galleryAccess()!=='denied';showToast(refresh?'照片与视频授权已变化，正在更新可访问范围。':'照片与视频授权已收回，请重新连接系统相册。');if(refresh)Android.refreshGallery();}};
const oldGoBack=goBack;goBack=function(){if(!$('busy').hidden)return true;if(!$('dialogLayer').hidden){closeDialog();return true;}if(!$('photoViewer').hidden){closePhotoViewer();return true;}if(!$('yearReader').hidden){closeYearbook();return true;}if($('reader').hidden){if(tab!=='years'){switchTab('years');return true;}return false;}return oldGoBack();};window.goBack=goBack;
const oldLock=lock;lock=function(){oldLock();const viewer=!$('photoViewer').hidden;$('reader').inert=viewer||!$('dialogLayer').hidden;if(!$('yearReader').hidden){$('app').inert=true;document.querySelector('.bottom-nav').inert=true;$('yearReader').inert=viewer||!$('dialogLayer').hidden;document.body.classList.add('lock');}if(!$('photoViewer').hidden){$('app').inert=true;document.querySelector('.bottom-nav').inert=true;document.body.classList.add('lock');}};
$('annualCover').onclick=$('openAnnual').onclick=()=>openYearbook();$('galleryConnect').onclick=requestGallery;$('closeYearReader').onclick=closeYearbook;$('yearNext').onclick=()=>{stopAutoTurn();yearEngine?.flipNext();};$('yearPrev').onclick=()=>{stopAutoTurn();yearEngine?.flipPrev();};
const yearAutoTurn=el('button','secondary','自动翻页');
yearAutoTurn.id='yearAutoTurn';yearAutoTurn.type='button';
yearAutoTurn.setAttribute('aria-pressed','false');
yearAutoTurn.onclick=toggleAutoTurn;
$('monthPhotos').parentElement.append(yearAutoTurn);
$('yearBookFrame').addEventListener('pointerdown',()=>{if(autoTurnEnabled)stopAutoTurn();},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAutoTurn();});window.addEventListener('blur',stopAutoTurn);$('monthPhotos').onclick=showMonthPhotos;$('yearCoverPick').onclick=$('yearChangeCover').onclick=chooseYearCover;$('closePhotoViewer').onclick=closePhotoViewer;$('fullPhotoPrev').onclick=()=>{photoAt--;updatePhotoViewer();};$('fullPhotoNext').onclick=()=>{photoAt++;updatePhotoViewer();};$('yearCoverBack').onclick=()=>{stopAutoTurn();yearEngine.cancelTurn();yearEngine.turnToPage(0);updateYearChrome();};$('createThemeBook').onclick=()=>{switchTab('albums');newBook();};$('viewMyAlbums').onclick=()=>switchTab('albums');
$('nightMode').onchange=async()=>{state.settings.light=!$('nightMode').checked;applyYearPrefs();await save();};$('reduceMotion').onchange=async()=>{state.settings.reduce=$('reduceMotion').checked;document.body.classList.toggle('reduced',state.settings.reduce);await save();if(!$('yearReader').hidden)mountYearEngine();};
for(const btn of document.querySelectorAll('[data-tab]'))btn.onclick=()=>switchTab(btn.dataset.tab);
document.addEventListener('keydown',e=>{if(!someOverlay())return;if(e.key==='Escape'){e.stopImmediatePropagation();goBack();return;}if(!$('dialogLayer').hidden)return;if(!$('photoViewer').hidden){if(e.key==='ArrowRight'||e.key==='ArrowLeft')e.stopImmediatePropagation();if(e.key==='ArrowRight'&&photoAt<photoSet.length-1){e.preventDefault();photoAt++;updatePhotoViewer();}if(e.key==='ArrowLeft'&&photoAt>0){e.preventDefault();photoAt--;updatePhotoViewer();}return;}if(!$('yearReader').hidden){if(e.key==='ArrowRight'){stopAutoTurn();e.preventDefault();yearEngine?.flipNext();}if(e.key==='ArrowLeft'){stopAutoTurn();e.preventDefault();yearEngine?.flipPrev();}}},true);
function someOverlay(){return !$('yearReader').hidden||!$('photoViewer').hidden;}
let resizeTimer;window.addEventListener('resize',()=>{if($('yearReader').hidden)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!$('yearReader').hidden)mountYearEngine();},220);});
$('engineInfo').onclick=()=>{openDialog('开源组件与参考',`<p>翻页引擎：@gullabs/flipbook-core 3.2.2，MPL-2.0。保留上游 StPageFlip MIT 声明。</p><p class="notice">应用界面调用公开 API，未修改引擎几何算法。对应源码和完整许可证随源码包提供，也可在这里导出。</p><label class="field">上游源码地址<input readonly id="engineSourceUrl"></label><button class="secondary" id="exportEngineSource">导出引擎源码与许可证</button>`);$('engineSourceUrl').value='https://github.com/gul-labs/flipbook/tree/3fb7192c02ecca559d67192d15a1479fd7cf3af8';$('exportEngineSource').onclick=async()=>{try{const source=window.EMBEDDED_ENGINE_SOURCE||await fetch('vendor/engine-source.json').then(r=>r.text());if(globalThis.Android?.saveBackup)Android.saveBackup('FlipYear-engine-source.json',source);else{const url=URL.createObjectURL(new Blob([source],{type:'application/json'})),a=el('a');a.href=url;a.download='FlipYear-engine-source.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}}catch{showToast('源码导出失败，请使用配套源码包。',true);}};};
// The metadata list follows the system chooser's URI order; source images are never modified.
window.nativePhotoMetadata=[];
$('restoreBtn').insertAdjacentHTML('afterend','<p class="notice">备份包含自建相册。系统年鉴引用手机源照片，请使用系统相册的备份功能保管原图。</p>');
$('exportAll').innerHTML=icon('download')+'导出自建相册';$('backupBtn').setAttribute('aria-label','备份自建相册');
tab='years';switchTab('years');if(typeof state!=='undefined'&&state)initYearbook();
// Reuse the same tested curl engine for custom photo books; discard v1's hand-written gesture handlers.
let customEngine=null;
const oldStage=$('stage'),freshStage=oldStage.cloneNode(false);oldStage.replaceWith(freshStage);
const renderCustomV1=renderReader;
function destroyCustomEngine(){if(customEngine){try{customEngine.cancelTurn();customEngine.destroy();}catch{}customEngine=null;}if(!$('stage')){const replacement=el('div','book-stage');replacement.id='stage';$('reader').querySelector('.reader-topnote').after(replacement);}}
function updateCustomChrome(){if(!customEngine||!current())return;pageIndex=customEngine.getCurrentPageIndex();state.positions[current().id]=pageIndex;const count=current().pages.length;$('prevPage').disabled=!customEngine.canTurn('prev');$('nextPage').disabled=!customEngine.canTurn('next');$('pageIndicator').replaceChildren(el('strong',null,String(pageIndex+1).padStart(2,'0')),document.createTextNode('/ '+String(count).padStart(2,'0')));for(const [i,btn]of [...$('thumbnails').children].entries()){btn.classList.toggle('active',i===pageIndex);btn.setAttribute('aria-pressed',String(i===pageIndex));}}
renderReader=function(){destroyCustomEngine();renderCustomV1();const b=current();if(!b?.pages.length)return;if(state.settings.customRenderer==='webgl'&&typeof mountWebGLCustomBook==='function'){mountWebGLCustomBook(b,pageIndex);return;}const mount=$('stage'),initialPage=pageIndex;mount.replaceChildren();mount.style.aspectRatio='auto';mount.style.minHeight='0';const fullscreen=$('reader').classList.contains('fullscreen-reader'),width=fullscreen?Math.max(160,$('reader').clientWidth):Math.max(220,Math.min(innerWidth<800?310:350,innerWidth-56)),height=fullscreen?Math.max(160,$('reader').clientHeight):Math.round(width/0.75);for(let i=0;i<b.pages.length;i++){const leaf=el('div','photo-leaf');leaf.append(pageNode(b.pages[i],i));mount.append(leaf);}try{customEngine=new FlipBookEngine.PageFlip(mount,{width,height,sizing:'fixed',usePortrait:true,hardCovers:false,flippingTime:reduced()?0:state.settings.speed,pageBackground:'#fffaf0',maxShadowOpacity:.45,respectReducedMotion:true,allowTouchScroll:false,respectInteractiveContent:false,flipOnClick:'never'});customEngine.on('flip',()=>{updateCustomChrome();save();});customEngine.loadFromHTML(mount.querySelectorAll('.photo-leaf'));customEngine.turnToPage(Math.min(initialPage,b.pages.length-1));updateCustomChrome();bindSlowTouchTurn(mount,()=>customEngine);}catch(err){console.error(err);showToast('相册翻页加载失败，请重新打开。',true);}};
const cancelV1=cancelFlip;cancelFlip=function(){cancelV1();customEngine?.cancelTurn();};
turn=async function(direction){if(!customEngine)return;if(direction>0)customEngine.flipNext();else customEngine.flipPrev();};
jump=function(index){if(!customEngine)return;customEngine.cancelTurn();customEngine.turnToPage(index);updateCustomChrome();save();};
const closeCustomV1=closeReader;closeReader=function(){destroyCustomEngine();closeCustomV1();};$('closeReader').onclick=closeReader;
const addPhotoV1=$('addPhoto').onclick;$('addPhoto').onclick=()=>addPhotoV1();
// Virtual HTTPS origin serves native assets and previews locally; there is no network request.
if(state?.gallery?.length&&globalThis.Android?.galleryAccess&&Android.galleryAccess()==='denied')window.onGalleryPermissionChanged();
// Keep source-file metadata associated with its successful import, even if another file fails decoding.
$('photoInput').onchange=async e=>{const b=current();if(!b)return;const files=[...e.target.files],metadata=window.nativePhotoMetadata||[];window.nativePhotoMetadata=[];if(!files.length)return;if(files.length>100){showToast('每批最多添加 100 张照片，请分批导入。',true);return;}busy(true);const added=[];let failed=0;try{for(let i=0;i<files.length;i++){$('busyText').textContent=`正在整理照片 ${i+1} / ${files.length}`;try{const src=await compress(files[i]);let date=metadata[i]?.date||'',dateSource=date?'taken':'';if(!validPhotoDate(date)){const match=files[i].name.match(/(?:^|\D)((?:19|20)\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/);date=match?`${match[1]}-${match[2]}-${match[3]}`:'';dateSource=date?'filename':'';}added.push({id:uid(),src,caption:'',date:validPhotoDate(date)?date:'',dateSource,filename:files[i].name,layout:'classic'});}catch{failed++;}}if(added.length){const oldLength=b.pages.length;b.pages.push(...added);b.updated=Date.now();if(await save()){pageIndex=oldLength;renderReader();renderYearShelf();showToast(`已添加 ${added.length} 张照片${failed?'，'+failed+' 张格式不支持':''}。日期可在编辑页校正。`);}else b.pages.splice(oldLength);}else showToast('未能导入照片，请选择 JPG、PNG 或 WebP。',true);}catch{showToast('导入失败，请减少照片数量后重试。',true);}finally{busy(false);}};
window.onNativeGalleryChanged=()=>{if(state?.gallery?.length&&!galleryRunning&&globalThis.Android?.refreshGallery)Android.refreshGallery();};
let customResizeTimer;window.addEventListener('resize',()=>{if($('reader').hidden)return;clearTimeout(customResizeTimer);customResizeTimer=setTimeout(()=>{if(!$('reader').hidden)renderReader();},220);});
const galleryFallbackText=renderYearShelf;renderYearShelf=function(){galleryFallbackText();if(!state)return;const fallback=(state.gallery||[]).filter(p=>p.dateSource==='added').length;if(fallback)$('galleryStatus').textContent+=` · ${fallback} 个影像缺拍摄时间，按入库时间归档`;const undated=(state.gallery||[]).filter(p=>!validPhotoDate(p.date)).length;if(undated)$('galleryStatus').textContent+=` · ${undated} 个系统影像无有效日期，未加入年鉴`;};
// Refresh an existing native index only after IndexedDB has finished opening.
const firstShelf=renderShelf;let nativeInitialRefresh=false;renderShelf=function(){firstShelf();if(!nativeInitialRefresh&&state){nativeInitialRefresh=true;if(state.gallery?.length&&globalThis.Android?.refreshGallery){if(Android.galleryAccess()==='denied')window.onGalleryPermissionChanged();else Android.refreshGallery();}}};

// The pinned engine recognizes quick swipes within 250ms. For a slower horizontal
// touch release, settle through its public cancel/turn APIs; geometry remains upstream.
function bindSlowTouchTurn(host,getEngine){let track=null;host.addEventListener('pointerdown',e=>{if(getEngine()?.isWebGL){track=null;return;}if(!e.isPrimary){track=null;return;}if(e.pointerType==='mouse')return;track={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};},true);host.addEventListener('pointercancel',()=>track=null,true);host.addEventListener('pointerup',e=>{const start=track;track=null;if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(performance.now()-start.time<200||Math.abs(dx)<host.clientWidth*.22||Math.abs(dy)>Math.abs(dx)*.5)return;const engine=getEngine();if(!engine)return;e.stopImmediatePropagation();engine.cancelTurn();if(dx<0)engine.flipNext();else engine.flipPrev();},true);}
bindSlowTouchTurn($('yearBookFrame'),()=>yearEngine);

// Widgets open only after IndexedDB is ready, including cold starts and legacy migration.
$('addMemoryWidget').onclick=()=>{
 if(globalThis.Android?.requestMemoryWidget)Android.requestMemoryWidget();
 else showToast('桌面小组件在 Android APK 中使用。安装后在「偏好」添加，或长按桌面选择 FlipYear 小组件。');
};
window.onNativeWidgetPinResult=status=>showToast(status==='requested'?'请在桌面确认添加；添加后点小组件右上角设置。':'当前桌面不支持快捷添加，请长按桌面 → 小组件 → FlipYear 桌面回忆。');
window.onNativeWidgetOpen=()=>{
 if(!state||!globalThis.Android?.consumeWidgetOpen)return;
 let data;try{data=JSON.parse(Android.consumeWidgetOpen());}catch{return;}
 if(!data?.open)return;
 if(!$('dialogLayer').hidden)closeDialog();
 if(!$('photoViewer').hidden)closePhotoViewer();
 if(!$('yearReader').hidden)closeYearbook();
 if(!$('reader').hidden)closeReader();
 switchTab('memories');
 // The native bridge supplies a local, permission-checked photo route, never arbitrary URLs.
 if(/^https:\/\/flipyear\.local\/widget-photo\/\d+\?v=\d+$/.test(data.src||''))showPhoto([{id:'widget-photo',src:data.src,date:validPhotoDate(data.date)?data.date:'',caption:'桌面珍藏的照片'}],0);
};
const widgetShelf=renderShelf;renderShelf=function(){widgetShelf();window.onNativeWidgetOpen();};
if(state)window.onNativeWidgetOpen();

$('playVideo').onclick=()=>{const p=photoSet[photoAt];if(!isVideo(p)||(!/^device-video-[1-9][0-9]{0,18}$/.test(p.id||'')||/[\r\n]/.test(p.id||''))){showToast('视频索引无效，请重新扫描系统相册。',true);return;}if(!globalThis.Android?.playVideo){showToast('系统视频播放在 Android APK 中使用。');return;}try{Android.playVideo(p.id);}catch{window.onNativeVideoError();}};
window.onNativeVideoError=()=>showToast('视频未能打开，请检查授权、源文件及系统编码支持。',true);

// Real adjacent-month thumbnails form the book stack; no second gesture engine.
function updateYearFan(){
 const fan=$('yearMonthFan');if(!fan||!yearEngine)return;if(yearEngine.isWebGL){fan.replaceChildren();return;}
 const visible=yearEngine.getVisiblePages(),months=visible.filter(i=>i>=1&&i<=12);
 const key=visible.join(',');if(fan.dataset.pages===key)return;
 fan.dataset.pages=key;fan.replaceChildren();if(!months.length)return;
 const size=engineSize(),count=visible.length,width=size.width*count;
 for(const side of [-1,1])for(const depth of [2,1]){
  const month=(side<0?Math.min(...months):Math.max(...months))+side*depth;
  if(month<1||month>12)continue;
  const preview=createMonthLeaf(month-1);preview.className='month-preview';preview.removeAttribute('data-month');preview.inert=true;
  for(const node of preview.querySelectorAll('[data-action],[data-date]')){node.removeAttribute('data-action');node.removeAttribute('data-date');if(node.tagName==='BUTTON'){node.disabled=true;node.tabIndex=-1;}}
  preview.style.width=size.width+'px';preview.style.height=size.height+'px';
  preview.style.left='calc(50% + '+(side<0?-width/2:width/2-size.width)+'px)';
  preview.style.transform='translateX('+(side*depth*17)+'px) scale('+(1-depth*.045)+') rotate('+(side*depth*1.2)+'deg)';
  preview.style.zIndex=3-depth;fan.append(preview);
 }
}

function updateYearNeighbours(catalog){
 let stack=$('yearNeighbours');if(!stack){stack=el('div','year-neighbours');stack.id='yearNeighbours';$('annualCover').parentNode.append(stack);}
 stack.replaceChildren();document.querySelector('.year-shelf').scrollTop=0;const at=yearList.indexOf(selectedYear);
 for(const offset of [-1,1]){
  const year=yearList[at+offset];if(!year)continue;
  const records=catalog.photos.filter(p=>p.date.startsWith(String(year)));
  const cover=records.find(p=>p.id===state.yearCovers[year])||records[0];if(!cover)continue;
  const button=el('button','year-cover year-neighbour '+(offset<0?'previous':'following'));
  button.type='button';button.dataset.neighbourYear=year;button.setAttribute('aria-label','选择 '+year+' 年照片书');
  button.style.setProperty('--year-accent',MONTH_COLORS[year%12]);const image=el('img');image.src=mediaThumbnail(cover);image.alt='';image.draggable=false;
  button.append(image,el('span','cover-scrim'),el('strong',null,String(year)));
  button.onclick=()=>selectYear(year,true);stack.append(button);
 }
}
