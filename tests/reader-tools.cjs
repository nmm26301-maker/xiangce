// Follow the same disclosure control as users before operating hidden reader tools.
module.exports=async function openReaderTools(page){
 const toggle=page.locator('#readerToolsToggle');
 if(await toggle.count()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
};
