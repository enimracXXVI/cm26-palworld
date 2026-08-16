/* ============================================================
   BOSSES
   Tracks which bosses you've beaten in the current run. Reference
   data (id/name/level/type) comes from the bosses tab on a connected
   Google Sheet (see breeding-sheet-sync.js's bossesData) — this file
   is purely the view: filtering, the defeated toggle, and the
   reset-run flow.
   ============================================================ */

// Matches a raw sheet type value ("Dragon", "dragon", "DR"…) to one of
// the game's 9 type codes so a boss can reuse the same icon/color as
// everywhere else types show up — falls back to a plain text pill for
// anything that doesn't match (a typo, a made-up label, etc.).
function typeCodeFromValue_(v){
  const raw = String(v || '').trim();
  if(!raw) return null;
  const upper = raw.toUpperCase();
  if(TYPE_META[upper]) return upper;
  const key = normKey_(raw);
  return TYPE_ORDER.find(code => normKey_(TYPE_META[code].label) === key) || null;
}

function bossTypeChipHtml_(t){
  const code = typeCodeFromValue_(t);
  if(code){
    const meta = TYPE_META[code];
    const elImg = elementImageDb[code];
    return elImg
      ? `<img class="type-icon" src="${escapeHtml(elImg)}" alt="${meta.label}" title="${meta.label}" loading="lazy" onerror="this.outerHTML='<span class=&quot;type-pill&quot; style=&quot;background:var(${meta.var})&quot;>${meta.label}</span>'">`
      : `<span class="type-pill" style="background:var(${meta.var})">${meta.label}</span>`;
  }
  return `<span class="type-pill ghost">${escapeHtml(t)}</span>`;
}

function bossCardTemplate_(b){
  const defeated = !!state.bossesDefeated[b.id];
  const typesHtml = (b.type || []).map(bossTypeChipHtml_).join('');
  return `
    <button type="button" class="boss-card ${defeated ? 'defeated' : ''}" data-id="${escapeHtml(b.id)}" data-action="toggle-boss" aria-pressed="${defeated}" title="${defeated ? 'Tap to mark as not yet defeated' : 'Tap to mark defeated'}">
      <span class="boss-stamp">Defeated</span>
      <span class="boss-icon">
        <svg class="boss-icon-skull" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 4.7 2.5 6 .5.6.5 1 .5 1.6V19a1 1 0 0 0 1 1h1.5v-2h1V20h2.5v-2h1v2H16a1 1 0 0 0 1-1v-1.4c0-.6 0-1 .5-1.6 1-1.3 2.5-3 2.5-6a8 8 0 0 0-8-8Z"></path><circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none"></circle></svg>
        <svg class="boss-icon-medal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12-4 8 4-1.5L11 21l3-6"></path><path d="m15 12 4 8-4-1.5L13 21l-3-6"></path><circle cx="12" cy="8" r="6"></circle><polyline points="9.5 8 11 9.5 14.5 6"></polyline></svg>
      </span>
      ${b.level ? `<span class="boss-level">Lv ${escapeHtml(b.level)}</span>` : ''}
      <span class="boss-name">${escapeHtml(b.name)}</span>
      <span class="boss-type-row">${typesHtml}</span>
    </button>`;
}

// No fixed type list for bosses (unlike Pals' 9 built-in types) — the
// filter row is built from whatever distinct type values are actually
// present, same approach as the Passive Skills category filter.
let bossTypeFilter = '';

function renderBosses(filterText){
  const grid = document.getElementById('bossesGrid');
  const q = (filterText || '').trim().toLowerCase();

  const types = [...new Set(bossesData.flatMap(b => b.type || []))].sort();
  const typeRow = document.getElementById('bossesTypeRow');
  if(types.length){
    if(bossTypeFilter && !types.includes(bossTypeFilter)) bossTypeFilter = '';
    typeRow.style.display = 'flex';
    typeRow.innerHTML = [{ v:'', label:'All' }].concat(types.map(t => ({ v:t, label:t })))
      .map(t => `<button class="chip-toggle ${bossTypeFilter === t.v ? 'on' : ''}" data-boss-type="${escapeHtml(t.v)}">${escapeHtml(t.label)}</button>`)
      .join('');
  } else {
    typeRow.style.display = 'none';
    typeRow.innerHTML = '';
  }

  const items = bossesData.filter(b => {
    if(q && !b.name.toLowerCase().includes(q)) return false;
    if(bossTypeFilter && !(b.type || []).includes(bossTypeFilter)) return false;
    return true;
  });

  const defeatedTotal = bossesData.filter(b => state.bossesDefeated[b.id]).length;
  document.getElementById('bossesDefeatedCount').textContent =
    bossesData.length ? `${defeatedTotal} / ${bossesData.length} defeated` : '';

  if(bossesData.length === 0){
    grid.innerHTML = `<div class="bosses-empty">No bosses yet — add rows to the <code>bosses</code> tab on your Google Sheet (id, name, level, type) and reconnect.</div>`;
    return;
  }
  if(items.length === 0){
    grid.innerHTML = `<div class="bosses-empty">No bosses match${q ? ` "${escapeHtml(filterText)}"` : ''}${bossTypeFilter ? ` in "${escapeHtml(bossTypeFilter)}"` : ''}.</div>`;
    return;
  }

  // One bad card shouldn't blank the whole grid — same isolation as render().
  grid.innerHTML = items.map(b => {
    try{ return bossCardTemplate_(b); }
    catch(e){ console.error('Boss card render failed for', b.id, e); return ''; }
  }).join('');
}

document.getElementById('bossSearch').addEventListener('input', (e) => renderBosses(e.target.value));
document.getElementById('bossesTypeRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-boss-type]');
  if(!btn) return;
  bossTypeFilter = btn.dataset.bossType;
  renderBosses(document.getElementById('bossSearch').value);
});
document.getElementById('bossesGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="toggle-boss"]');
  if(!btn) return;
  const id = btn.dataset.id;
  const now = !state.bossesDefeated[id];
  state.bossesDefeated[id] = now;
  persistState();
  renderBosses(document.getElementById('bossSearch').value);
  if(isSheetConfigured()){
    sheetSend('setBossDefeated', { id, defeated: now })
      .catch(() => showToast('Could not update this boss on your Google Sheet.', true));
  }
});

const resetBossesModal = document.getElementById('resetBossesModal');
document.getElementById('resetBossesBtn').addEventListener('click', () => { resetBossesModal.style.display = 'flex'; });
document.getElementById('resetBossesCancel').addEventListener('click', () => { resetBossesModal.style.display = 'none'; });
document.getElementById('resetBossesConfirm').addEventListener('click', async () => {
  state.bossesDefeated = {};
  persistState();
  resetBossesModal.style.display = 'none';
  renderBosses(document.getElementById('bossSearch').value);
  showToast('Boss run reset.');

  if(isSheetConfigured()){
    try{ await sheetSend('clearBossesDefeated', {}); }
    catch(e){ showToast('Reset locally, but could not clear bosses on your Google Sheet — it will re-sync on next connect.', true); }
  }
});
