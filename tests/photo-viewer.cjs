const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file://'+path.join(root,'FlipYear.html'));await p.waitForSelector('.year-option');
 const neighbour=await p.locator('.year-neighbour').getAttribute('data-neighbour-year');await p.locator('.year-neighbour').click();assert.equal(await p.evaluate(()=>selectedYear),Number(neighbour));assert.equal(await p.evaluate(()=>document.querySelector('.year-shelf').scrollTop),0);await p.locator('[data-year="2026"]').click();
 await p.locator('[data-tab="albums"]').click();await p.locator('#continueBook').click();
 await p.waitForFunction(()=>customEngine?.isReady());
 const initial=await p.evaluate(()=>pageIndex);
 await p.locator('.photo-leaf:visible .page-image').tap();
 await p.waitForSelector('#photoViewer:not([hidden])');
 await p.waitForFunction(()=>Math.abs(photoZoom?.getScale()-1)<.01);
 assert.equal(await p.evaluate(()=>$('reader').inert),true);
 assert.equal(await p.evaluate(()=>photoSet[photoAt].src===current().pages[pageIndex].src),true);
 await p.locator('#photoZoomIn').click();await p.waitForFunction(()=>photoZoom.getScale()>1);
 await p.locator('#photoZoomReset').click();await p.waitForFunction(()=>Math.abs(photoZoom.getScale()-1)<.01);
 // A genuine two-finger gesture exercises the vendored pointer-based engine.
 const cdp=await context.newCDPSession(p),box=await p.locator('#photoViewport').boundingBox();
 const cx=box.x+box.width/2,cy=box.y+box.height/2;
 const fingers=d=>[{id:1,x:cx-d,y:cy},{id:2,x:cx+d,y:cy}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(30)});
 for(let d=40;d<=110;d+=10){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(d)});await p.waitForTimeout(20);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await p.waitForFunction(()=>photoZoom.getScale()>1.4);
 const scale=await p.evaluate(()=>photoZoom.getScale());assert.ok(scale<=4);
 await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+65,cy+40,{steps:8});await p.mouse.up();
 assert.ok(await p.evaluate(()=>Math.abs(photoZoom.getPan().x)>5));
 assert.equal(await p.evaluate(()=>pageIndex),initial,'zoom gestures do not turn the book');
 await p.locator('#photoZoomReset').click();await p.waitForFunction(()=>Math.abs(photoZoom.getScale()-1)<.01);
 await p.locator('#fullPhoto').dblclick();await p.waitForFunction(()=>photoZoom.getScale()>2);
 await p.locator('#fullPhoto').dblclick();await p.waitForFunction(()=>Math.abs(photoZoom.getScale()-1)<.01);
 // Two real taps also zoom on touch devices (without compatibility mouse events).
 await p.touchscreen.tap(cx,cy);await p.waitForTimeout(80);await p.touchscreen.tap(cx,cy);
 await p.waitForFunction(()=>photoZoom.getScale()>2);
 await p.keyboard.press('ArrowRight');
 assert.equal(await p.evaluate(()=>photoAt),initial+1);
 assert.equal(await p.evaluate(()=>pageIndex),initial,'viewer arrow does not turn hidden book');
 await p.waitForFunction(()=>Math.abs(photoZoom?.getScale()-1)<.01);
 await p.locator('#closePhotoViewer').click();
 assert.equal(await p.evaluate(()=>$('reader').inert),false);
 assert.equal(await p.evaluate(()=>$('app').inert&&document.body.classList.contains('lock')),true);
 assert.equal(await p.evaluate(()=>pageIndex),initial);
 // Keyboard activation and focus containment.
 await p.locator('.photo-leaf:visible .page-image').focus();await p.keyboard.press('Enter');
 await p.waitForSelector('#photoViewer:not([hidden])');await p.keyboard.press('Shift+Tab');
 assert.equal(await p.evaluate(()=>document.activeElement.id),'fullPhotoNext');
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'closePhotoViewer');
 await p.keyboard.press('Escape');await p.locator('.photo-leaf:visible .page-image').evaluate(n=>n.click());await p.waitForSelector('#photoViewer:not([hidden])');await p.keyboard.press('Escape');await p.locator('#closeReader').click();
 // Calendar day touch, then return to the same month and its actual neighbours.
 await p.locator('[data-tab="years"]').click();await p.locator('#openAnnual').click();
 await p.waitForFunction(()=>yearEngine?.isReady());await p.locator('#yearMonths [data-month="5"]').click();
 assert.equal(await p.locator('#yearMonthFan .month-preview').count(),4);
 await p.locator('.calendar-leaf:visible [data-date="2026-06-12"]').tap();
 await p.waitForSelector('#photoViewer:not([hidden])');await p.waitForFunction(()=>photoZoom);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>yearEngine.getCurrentPageIndex()),6);
 assert.equal(await p.evaluate(()=>$('yearReader').inert),false);
 await p.locator('#closeYearReader').click();
 await p.locator('[data-tab="memories"]').click();await p.locator('.memory-photos button').first().click();
 await p.waitForSelector('#photoViewer:not([hidden])');assert.equal(await p.locator('#reader').isHidden(),true);
 for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1440,height:900}]){
  await p.setViewportSize(viewport);await p.waitForTimeout(250);
  assert.equal(await p.evaluate(()=>$('photoViewer').scrollWidth<=innerWidth),true);
  for(const id of ['closePhotoViewer','photoZoomIn','fullPhotoNext']){
   const r=await p.locator('#'+id).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height,id+' reachable');
  }
 }
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.body.classList.contains('lock')),false);
 await p.locator('[data-tab="settings"]').click();await p.locator('#nightMode').uncheck();
 await p.locator('#engineInfo').click();assert.match(await p.locator('.viewer-license').first().textContent(),/Permission is hereby granted/);
 await p.keyboard.press('Escape');
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS custom/day/timeline photo taps, real pinch + double tap, mouse zoom + pan, reset, viewer-only arrows, original page + focus restoration, keyboard trap, responsive controls, bundled MIT notice.');
})().catch(e=>{console.error(e);process.exit(1)});
