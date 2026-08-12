/* ============================================================
   INIT
   ============================================================ */
(function init(){
  buildTypeChips();
  document.getElementById('totalCount').textContent = PALS.length;
  loadState();
  loadBreedingLocal();
  loadSheetDataCache();
  initBreedForm();
  updateSheetStatusLabel();
  setView('palpedia');
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('grid').style.display = 'grid';
  render();
  renderBreedEntries();
  if(isSheetConfigured()) syncFromSheet();
})();
