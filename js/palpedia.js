/* ============================================================
   STATE
   ============================================================ */
const STORAGE_KEY = 'palpedia-tracker-state-v1';
let state = { discovered:{}, base:{}, party:{}, images:{}, passivesUnlocked:{} };
let filters = { search:'', status:'all', baseOnly:false, partyOnly:false, types:new Set() };
let saveTimer = null;

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      state.discovered = parsed.discovered || {};
      state.base = parsed.base || {};
      state.party = parsed.party || {};
      state.images = parsed.images || {};
      state.passivesUnlocked = parsed.passivesUnlocked || {};
    }
  }catch(e){
    // no saved state yet, or read failed — start fresh
  }
}

function persistState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      showToast('Could not save — your progress may not persist.', true);
    }
  }, 150);
}

function showToast(msg, isErr){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => { t.className = 'toast'; }, 2400);
}

/* ============================================================
   RENDER
   ============================================================ */
function buildTypeChips(){
  // Rebuildable (not just built once): a Google Sheet sync can populate
  // elementImageDb after the initial call, and chips need to switch from
  // dot+label to a picture at that point — re-derive `active` from
  // filters.types each time so re-running this never loses the current
  // filter selection.
  const row = document.getElementById('typeRow');
  row.innerHTML = '';
  const frag = document.createDocumentFragment();
  TYPE_ORDER.forEach(code => {
    const meta = TYPE_META[code];
    const elImg = elementImageDb[code];
    const chip = document.createElement('button');
    chip.className = 'type-chip' + (filters.types.has(code) ? ' active' : '');
    chip.type = 'button';
    chip.dataset.type = code;
    chip.title = meta.label;
    chip.style.setProperty('--dot', `var(${meta.var})`);
    chip.innerHTML = elImg
      ? `<img class="type-chip-icon" src="${escapeHtml(elImg)}" alt="${meta.label}" loading="lazy" onerror="this.outerHTML='<span class=&quot;dot&quot;></span>${meta.label}'">`
      : `<span class="dot"></span>${meta.label}`;
    chip.addEventListener('click', () => {
      if(filters.types.has(code)) filters.types.delete(code);
      else filters.types.add(code);
      chip.classList.toggle('active');
      render();
    });
    frag.appendChild(chip);
  });
  row.appendChild(frag);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-types';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear types';
  clearBtn.addEventListener('click', () => {
    filters.types.clear();
    row.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
    render();
  });
  row.appendChild(clearBtn);
}

function matchesFilters(p){
  const id = p[0], num = p[1], suffix = p[2], name = p[3], types = p[4];
  const discovered = !!state.discovered[id];

  if(filters.status === 'discovered' && !discovered) return false;
  if(filters.status === 'undiscovered' && discovered) return false;

  if(filters.baseOnly && !state.base[id]) return false;
  if(filters.partyOnly && !state.party[id]) return false;

  // Type filter only ever matches on *discovered* pals — an undiscovered
  // pal's type is not shown, so it can't meaningfully match a type filter.
  if(filters.types.size > 0){
    if(!discovered) return false;
    const hasType = types.some(t => filters.types.has(t));
    if(!hasType) return false;
  }

  // Search matches the real name/number even for undiscovered pals
  // (typing a name is a deliberate act — the person already knows it).
  // The card itself still renders masked until it's ticked discovered.
  if(filters.search){
    const q = filters.search.trim().toLowerCase();
    const idStr = id.toLowerCase();
    const numStr = String(num);
    const nameMatch = name.toLowerCase().includes(q);
    const numMatch = idStr.includes(q) || numStr === q || (numStr + suffix.toLowerCase()) === q;
    if(!nameMatch && !numMatch) return false;
  }

  return true;
}

// Looked up so a first-ever sheet write for a Pal (discover/base/
// party/image) can pre-fill its name/type on the row the server
// creates, instead of leaving a bare id sitting there.
function palSheetInfo_(id){
  const p = PALS.find(x => x[0] === id);
  return p ? { name: p[3], type: p[4].join('|') } : {};
}

function cardTemplate(p){
  const id = p[0], num = p[1], suffix = p[2], name = p[3], types = p[4];
  const discovered = !!state.discovered[id];
  const inBase = !!state.base[id];
  const inParty = !!state.party[id];
  const noStr = '№' + String(num).padStart(3,'0') + suffix;

  const nameHtml = discovered
    ? `<div class="pal-name">${escapeHtml(name)}</div>`
    : `<div class="pal-name masked">?????????</div>`;

  const typesHtml = discovered
    ? types.map(t => {
        const meta = TYPE_META[t];
        const elImg = elementImageDb[t];
        return elImg
          ? `<img class="type-icon" src="${escapeHtml(elImg)}" alt="${meta.label}" title="${meta.label}" loading="lazy" onerror="this.outerHTML='<span class=&quot;type-pill&quot; style=&quot;background:var(${meta.var})&quot;>${meta.label}</span>'">`
          : `<span class="type-pill" style="background:var(${meta.var})">${meta.label}</span>`;
      }).join('')
    : `<span class="type-pill ghost">?</span>`;

  let partnerHtml = '';
  if (discovered) {
    const ps = palPartnerSkillDb[id] || PARTNER_SKILLS[id];
    partnerHtml = ps
      ? `<div class="partner-block"><div class="partner-label">Partner Skill</div><div class="partner-name">${escapeHtml(ps[0])}</div><div class="partner-desc">${escapeHtml(ps[1])}</div></div>`
      : `<div class="partner-block"><div class="partner-label">Partner Skill</div><div class="partner-empty">Not yet added</div></div>`;
  } else {
    partnerHtml = `<div class="partner-block"><div class="partner-label">Partner Skill</div><div class="partner-empty">Discover to reveal</div></div>`;
  }

  // A Pal can have several suitabilities, each with its own level
  // (1-9 in-game). Icons come from the workSuitability reference tab
  // when set; falls back to a text pill (name + level) otherwise.
  // Omitted entirely once no level data exists yet for this Pal.
  let suitabilityHtml = '';
  if (discovered) {
    const levels = palWorkSuitabilityDb[id] || {};
    const entries = Object.keys(levels).filter(k => levels[k] !== '' && levels[k] != null);
    if (entries.length) {
      suitabilityHtml = `<div class="suitability-row">${entries.map(k => {
        const level = levels[k];
        const icon = workSuitabilityImageDb[k];
        return icon
          ? `<span class="suitability-item" title="${escapeHtml(k)}: ${escapeHtml(level)}"><img class="suitability-icon" src="${escapeHtml(icon)}" alt="${escapeHtml(k)}" loading="lazy"><span class="suitability-level">${escapeHtml(level)}</span></span>`
          : `<span class="suitability-pill" title="${escapeHtml(k)}">${escapeHtml(k)} ${escapeHtml(level)}</span>`;
      }).join('')}</div>`;
    }
  }

  let imageHtml = '';
  if (discovered) {
    const imgUrl = state.images[id] || palImageDb[id];
    imageHtml = imgUrl
      ? `<div class="pal-image-box">
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.closest('.pal-image-box').classList.add('empty');this.closest('.pal-image-box').innerHTML='<span>!</span>'">
          <button class="image-edit-btn" data-action="image" title="Change picture">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
        </div>`
      : `<button class="pal-image-box empty" data-action="image" type="button" title="Add a picture">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-5-5L5 21"></path></svg>
        </button>`;
  } else {
    imageHtml = `<div class="pal-image-box empty locked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4M12 16h.01"></path></svg></div>`;
  }

  return `
    <div class="card ${discovered ? 'discovered' : 'hidden-pal'}" data-id="${id}">
      <div class="card-top">
        <span class="pal-no">${noStr}</span>
        <button class="discover-check ${discovered ? 'on' : ''}" data-action="discover" aria-pressed="${discovered}" title="Mark as discovered">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </div>
      <div class="card-head">
        ${imageHtml}
        <div class="card-info">
          ${nameHtml}
          <div class="type-row">${typesHtml}</div>
        </div>
      </div>
      ${suitabilityHtml}
      ${partnerHtml}
      <div class="role-row">
        <button class="role-btn base ${inBase ? 'on' : ''}" data-action="base" ${discovered ? '' : 'disabled'} aria-pressed="${inBase}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>
          Base
        </button>
        <button class="role-btn party ${inParty ? 'on' : ''}" data-action="party" ${discovered ? '' : 'disabled'} aria-pressed="${inParty}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18M5 4h13l-2.5 4L18 12H5"></path></svg>
          Party
        </button>
      </div>
    </div>`;
}

function escapeHtml(s){
  // Sheet-sourced fields can arrive as numbers, booleans, or dates
  // (Sheets cell types are unpredictable), so coerce defensively —
  // String(s) never throws, unlike calling .replace on a non-string.
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function render(){
  const grid = document.getElementById('grid');
  const visible = PALS.filter(matchesFilters);

  if(visible.length === 0){
    grid.innerHTML = `<div class="empty-state"><div class="big">No matches</div>No Pals fit the current search and filters.</div>`;
  } else {
    // One bad card (odd sheet data, etc.) shouldn't blank the whole grid —
    // isolate each card's render so the rest still show.
    grid.innerHTML = visible.map(p => {
      try{ return cardTemplate(p); }
      catch(e){ console.error('Card render failed for', p[0], e); return ''; }
    }).join('');
  }

  updateStats();
  updateFiltersIndicator();
}

function updateFiltersIndicator(){
  const active = filters.search.trim() !== '' || filters.status !== 'all' ||
    filters.baseOnly || filters.partyOnly || filters.types.size > 0;
  const toggle = document.getElementById('filtersToggle');
  toggle.classList.toggle('active-filters', active);
  document.getElementById('filtersBadge').hidden = !active;
}

function updateStats(){
  const total = PALS.length;
  const discCount = Object.values(state.discovered).filter(Boolean).length;

  document.getElementById('discCount').textContent = discCount;
  document.getElementById('totalCount').textContent = total;

  const pct = total ? discCount / total : 0;
  const circumference = 263.9;
  const offset = circumference * (1 - pct);
  document.getElementById('gaugeFill').style.strokeDashoffset = offset;
  document.getElementById('gaugePct').textContent = Math.round(pct * 100) + '%';
}

/* ============================================================
   EVENTS
   ============================================================ */
document.getElementById('grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const card = e.target.closest('.card');
  const id = card.dataset.id;
  const action = btn.dataset.action;

  if(action === 'discover'){
    const now = !state.discovered[id];
    state.discovered[id] = now;
    if(!now){
      // un-discovering clears its role assignments and image too, since they
      // were only meaningful once you knew what the Pal was
      delete state.base[id];
      delete state.party[id];
      delete state.images[id];
    }
    if(isSheetConfigured()){
      sheetSend('setDiscovered', Object.assign({ palId:id, discovered:now }, palSheetInfo_(id)))
        .catch(() => showToast('Could not update this Pal’s discovered status on your Google Sheet.', true));
      if(!now){
        sheetSend('setBase', { palId:id, base:false }).catch(() => {});
        sheetSend('setParty', { palId:id, party:false }).catch(() => {});
      }
    }
  } else if(action === 'base'){
    if(!state.discovered[id]) return;
    const now = !state.base[id];
    state.base[id] = now;
    if(isSheetConfigured()){
      sheetSend('setBase', Object.assign({ palId:id, base:now }, palSheetInfo_(id)))
        .catch(() => showToast('Could not update this Pal’s Base status on your Google Sheet.', true));
    }
  } else if(action === 'party'){
    if(!state.discovered[id]) return;
    const now = !state.party[id];
    state.party[id] = now;
    if(isSheetConfigured()){
      sheetSend('setParty', Object.assign({ palId:id, party:now }, palSheetInfo_(id)))
        .catch(() => showToast('Could not update this Pal’s Party status on your Google Sheet.', true));
    }
  } else if(action === 'image'){
    openImageModal(id);
    return; // don't persist/re-render yet — wait for modal save
  }

  persistState();
  render();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  filters.search = e.target.value;
  render();
});

document.getElementById('statusSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-status]');
  if(!btn) return;
  filters.status = btn.dataset.status;
  document.querySelectorAll('#statusSeg button').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

document.getElementById('baseFilterBtn').addEventListener('click', () => {
  filters.baseOnly = !filters.baseOnly;
  document.getElementById('baseFilterBtn').classList.toggle('on', filters.baseOnly);
  render();
});
document.getElementById('partyFilterBtn').addEventListener('click', () => {
  filters.partyOnly = !filters.partyOnly;
  document.getElementById('partyFilterBtn').classList.toggle('on', filters.partyOnly);
  render();
});

document.getElementById('filtersToggle').addEventListener('click', () => {
  const panel = document.getElementById('controlsPanel');
  const open = panel.classList.toggle('open');
  document.getElementById('filtersToggle').setAttribute('aria-expanded', String(open));
});

/* ============================================================
   PASSIVE SKILLS
   ============================================================ */
function rankBadgeHtml(rank){
  const sign = rank > 0 ? '+' + rank : rank;
  const cls = rank < 0 ? 'rank-neg' : 'rank-pos';
  return `<span class="rank-badge ${cls}">${sign}</span>`;
}

// No official Palworld categorization exists for passive skills, so
// this isn't a hardcoded list — it's whatever distinct, non-blank
// values are actually sitting in the sheet's "category" column right
// now. The filter row only appears once there's something to filter
// by, since the column starts out blank for you to fill in yourself.
let passiveCategoryFilter = '';

function renderPassives(filterText){
  const list = document.getElementById('passivesList');
  const q = (filterText || '').trim().toLowerCase();

  // Each skill's category cell can hold more than one value
  // (comma/pipe-separated, e.g. "Attack, Defense") — the server
  // already splits it into an array, so the distinct-values list and
  // the filter check both need to look inside each skill's set, not
  // treat the whole cell as one category.
  const categories = [...new Set(passiveSkillsData.flatMap(p => p[4]))].sort();
  const catRow = document.getElementById('passivesCategoryRow');
  if(categories.length){
    if(passiveCategoryFilter && !categories.includes(passiveCategoryFilter)) passiveCategoryFilter = '';
    catRow.style.display = 'flex';
    catRow.innerHTML = [{ v:'', label:'All' }].concat(categories.map(c => ({ v:c, label:c })))
      .map(c => `<button class="chip-toggle ${passiveCategoryFilter === c.v ? 'on' : ''}" data-category="${escapeHtml(c.v)}">${escapeHtml(c.label)}</button>`)
      .join('');
  } else {
    catRow.style.display = 'none';
    catRow.innerHTML = '';
  }

  const items = passiveSkillsData.filter(p => {
    if(q && !p[0].toLowerCase().includes(q)) return false;
    if(passiveCategoryFilter && !p[4].includes(passiveCategoryFilter)) return false;
    return true;
  });

  const unlockedTotal = passiveSkillsData.filter(p => state.passivesUnlocked[p[0]]).length;
  document.getElementById('passivesUnlockedCount').textContent =
    `${unlockedTotal} / ${passiveSkillsData.length} unlocked`;

  if(items.length === 0){
    list.innerHTML = `<div class="passives-empty">No passive skills match${q ? ` "${escapeHtml(filterText)}"` : ''}${passiveCategoryFilter ? ` in "${escapeHtml(passiveCategoryFilter)}"` : ''}.</div>`;
    return;
  }

  list.innerHTML = items.map(([name, rank, surgery, effects]) => {
    const unlocked = !!state.passivesUnlocked[name];
    const effectsHtml = unlocked
      ? effects.map(e => `<span>${escapeHtml(e)}</span>`).join('')
      : `<span class="locked-hint">Tap to unlock and reveal its effect</span>`;
    return `
    <div class="passive-item ${unlocked ? '' : 'locked'}" data-name="${escapeHtml(name)}">
      <div class="passive-item-top">
        <button class="discover-check ${unlocked ? 'on' : ''}" data-action="unlock-passive" aria-pressed="${unlocked}" title="${unlocked ? 'Unlocked — tap to re-lock' : 'Tap to unlock'}">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
        <span class="passive-name">${escapeHtml(name)}</span>
        ${rankBadgeHtml(rank)}
        ${unlocked && surgery ? '<span class="surgery-badge">Surgery</span>' : ''}
      </div>
      <div class="passive-effects">${effectsHtml}</div>
    </div>`;
  }).join('');
}

document.getElementById('passiveSearch').addEventListener('input', (e) => renderPassives(e.target.value));
document.getElementById('passivesCategoryRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-category]');
  if(!btn) return;
  passiveCategoryFilter = btn.dataset.category;
  renderPassives(document.getElementById('passiveSearch').value);
});
document.getElementById('passivesList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="unlock-passive"]');
  if(!btn) return;
  const item = e.target.closest('.passive-item');
  const name = item.dataset.name;
  const now = !state.passivesUnlocked[name];
  state.passivesUnlocked[name] = now;
  persistState();
  renderPassives(document.getElementById('passiveSearch').value);
  if(isSheetConfigured()){
    try{ await sheetSend('setPassiveUnlocked', { name, unlocked: now }); }
    catch(err){ showToast(`Could not update "${name}" on your Google Sheet: ${err.message}`, true); }
  }
});

const resetModal = document.getElementById('resetModal');
document.getElementById('resetBtn').addEventListener('click', () => { resetModal.style.display = 'flex'; });
document.getElementById('resetCancel').addEventListener('click', () => { resetModal.style.display = 'none'; });
document.getElementById('resetConfirm').addEventListener('click', async () => {
  state = { discovered:{}, base:{}, party:{}, images:{}, passivesUnlocked:{} };
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    showToast('Could not save the reset — try again.', true);
  }
  resetModal.style.display = 'none';
  render();
  renderPassives(document.getElementById('passiveSearch').value);
  showToast('Progress reset.');

  if(isSheetConfigured()){
    try{ await sheetSend('clearDiscovered', {}); }
    catch(e){ showToast('Reset locally, but could not clear "Discovered" on your Google Sheet — it will re-sync on next connect.', true); }
    try{ await sheetSend('clearBase', {}); }
    catch(e){ showToast('Reset locally, but could not clear "Base" on your Google Sheet — it will re-sync on next connect.', true); }
    try{ await sheetSend('clearParty', {}); }
    catch(e){ showToast('Reset locally, but could not clear "Party" on your Google Sheet — it will re-sync on next connect.', true); }
    try{ await sheetSend('clearPassivesUnlocked', {}); }
    catch(e){ showToast('Reset locally, but could not clear passive unlocks on your Google Sheet — it will re-sync on next connect.', true); }
  }
});

/* ============================================================
   IMAGE MODAL
   Lets the person attach their own image URL to a discovered
   Pal (their own screenshot, their own hosting — never anything
   we choose or embed on their behalf).
   ============================================================ */
const imageModal = document.getElementById('imageModal');
const imageUrlInput = document.getElementById('imageUrlInput');
let imageTargetId = null;

function openImageModal(id){
  imageTargetId = id;
  imageUrlInput.value = state.images[id] || '';
  document.getElementById('imageRemove').style.display = state.images[id] ? 'inline-block' : 'none';
  const note = document.getElementById('imageModalNote');
  if(!state.images[id] && palImageDb[id]){
    note.textContent = `Currently showing a picture from your connected Google Sheet. Save a URL here to override it just in this browser, or leave this blank to keep using the Sheet's.`;
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }
  imageModal.style.display = 'flex';
  setTimeout(() => imageUrlInput.focus(), 30);
}

document.getElementById('imageCancel').addEventListener('click', () => { imageModal.style.display = 'none'; imageTargetId = null; });
imageModal.addEventListener('click', (e) => { if(e.target === imageModal){ imageModal.style.display = 'none'; imageTargetId = null; } });

document.getElementById('imageSave').addEventListener('click', async () => {
  if(!imageTargetId) return;
  const id = imageTargetId;
  const url = imageUrlInput.value.trim();
  if(url) state.images[id] = url;
  else delete state.images[id];
  persistState();
  imageModal.style.display = 'none';
  imageTargetId = null;
  render();

  if(isSheetConfigured()){
    try{
      await sheetSend('setPalImageUrl', Object.assign({ palId: id, imageUrl: url }, palSheetInfo_(id)));
      if(url) palImageDb[id] = url; else delete palImageDb[id];
      persistSheetDataCache();
      render();
    }catch(err){
      showToast(`Saved locally, but could not save this picture to your Google Sheet: ${err.message}`, true);
    }
  }
});

document.getElementById('imageRemove').addEventListener('click', async () => {
  if(!imageTargetId) return;
  const id = imageTargetId;
  delete state.images[id];
  persistState();
  imageModal.style.display = 'none';
  imageTargetId = null;
  render();

  if(isSheetConfigured()){
    try{
      await sheetSend('setPalImageUrl', Object.assign({ palId: id, imageUrl: '' }, palSheetInfo_(id)));
      delete palImageDb[id];
      persistSheetDataCache();
      render();
    }catch(err){
      showToast(`Removed locally, but could not clear this picture on your Google Sheet: ${err.message}`, true);
    }
  }
});

/* ============================================================
   VIEW TABS (Palpedia <-> Breeding Log)
   ============================================================ */
function setView(view){
  document.body.dataset.view = view;
  document.querySelectorAll('#viewTabs button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const subEls = { palpedia: 'subPalpedia', passives: 'subPassives', breeding: 'subBreeding', styleguide: 'subStyleguide', schema: 'subSchema' };
  Object.keys(subEls).forEach(key => {
    document.getElementById(subEls[key]).style.display = key === view ? '' : 'none';
  });
  if(view === 'passives') renderPassives(document.getElementById('passiveSearch').value);
  if(view === 'breeding') renderBreedEntries();
  if(view === 'styleguide' && !styleGuideRendered){ styleGuideRendered = true; renderStyleGuide(); }
  if(view === 'schema') renderSchema();
}
document.getElementById('viewTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if(!btn) return;
  setView(btn.dataset.view);
});
