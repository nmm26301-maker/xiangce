async function openYearTools(p){if(await p.locator('#yearToolsToggle').getAttribute('aria-expanded')!=='true')await p.locator('#yearToolsToggle').click();}
async function openPhotoTools(p){if(await p.locator('#photoViewer').evaluate(n=>n.classList.contains('daily-preview'))&&await p.locator('#journalPhotoMore').getAttribute('aria-expanded')!=='true')await p.locator('#journalPhotoMore').click();}
module.exports={openYearTools,openPhotoTools};
