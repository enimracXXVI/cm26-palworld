/* ============================================================
   BREEDING LOG + GOOGLE SHEET SYNC
   Lets the person record their own breeding combos: the two
   parent Pals (sex + skills as they saw them in-game) and the
   resulting offspring. Cached in localStorage, optionally synced
   to a Google Sheet the person owns via a small Apps Script
   bridge (see apps-script/Code.gs) — never anything hosted by us.
   The same connection also pulls reference tabs from that sheet
   (schema fully described in apps-script/Code.gs's header comment):
   pals (per-Pal picture URLs + discovered), partnerSkills (its own
   tab, keyed by palId), elements (per-type picture URLs),
   passiveSkills (seeded from PASSIVE_SKILLS above, then read back
   so the person can amend/expand it, plus an unlocked flag) and
   activeSkills (a list the person pastes in themselves — we don't
   ship one built in, since we couldn't verify one against a real
   source).
   ============================================================ */
const GENDER_ICONS = {
  male: '<svg class="gender-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="6"></circle><line x1="14.5" y1="9.5" x2="21" y2="3"></line><polyline points="15 3 21 3 21 9"></polyline></svg>',
  female: '<svg class="gender-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"></circle><line x1="12" y1="15" x2="12" y2="21"></line><line x1="9" y1="18" x2="15" y2="18"></line></svg>'
};

const BREEDING_STORAGE_KEY = 'palpedia-breeding-v1';
const SHEET_CONFIG_KEY = 'palpedia-sheet-config-v1';
const SHEET_DATA_CACHE_KEY = 'palpedia-sheet-data-cache-v1';
// Baked in so a brand-new device only has to type the SECRET once,
// instead of also hunting down and pasting this URL. Deliberately NOT
// baking in the SECRET itself: this repo is public, and the URL alone
// is useless to a stranger without it — the SECRET is what actually
// gates read/write access to the Sheet.
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyeAQ_l8-KJsvBdgiKRQG3VgLnRC0h_o54aRkTsMOnTK69IZ4BjXT-ZiNdx0_QNjG-YTA/exec';
// A pre-filled default URL alone does NOT mean "connected" — the SECRET
// still has to be entered once per device. Every place that decides
// whether to attempt a sync/push (as opposed to just pre-filling the
// settings form) must check both, via this helper, not sheetConfig.url
// alone — otherwise a brand-new device silently fires failing requests
// (401 Unauthorized) the moment you tick a Pal off, before you've ever
// opened the settings modal.
function isSheetConfigured(){
  return !!(sheetConfig.url && sheetConfig.secret);
}
let palImageDb = {};
let palPartnerSkillDb = {};
let elementImageDb = {};
let activeSkillNames = [];
// Both start as a working copy of the hardcoded PASSIVE_SKILLS data
// (mutated in place on sync — see applySheetData), so the app is fully
// usable before ever connecting a sheet, and everything reading from
// these two arrays (renderPassives, the breeding form's tag-input
// suggestions) picks up sheet edits live without rebuilding anything.
let passiveSkillsData = PASSIVE_SKILLS.map(p => [p[0], p[1], p[2], p[3].slice()]);
let passiveSkillNames = PASSIVE_SKILLS.map(p => p[0]);

function loadSheetDataCache(){
  try{
    const raw = localStorage.getItem(SHEET_DATA_CACHE_KEY);
    if(!raw) return;
    const cached = JSON.parse(raw);
    palImageDb = cached.palImageDb || {};
    palPartnerSkillDb = cached.palPartnerSkillDb || {};
    elementImageDb = cached.elementImageDb || {};
    (cached.activeSkillNames || []).forEach(n => activeSkillNames.push(n));
    if(cached.passiveSkillsData && cached.passiveSkillsData.length){
      passiveSkillsData.length = 0;
      cached.passiveSkillsData.forEach(p => passiveSkillsData.push(p));
      passiveSkillNames.length = 0;
      passiveSkillsData.forEach(p => passiveSkillNames.push(p[0]));
    }
  }catch(e){}
}
function persistSheetDataCache(){
  try{ localStorage.setItem(SHEET_DATA_CACHE_KEY, JSON.stringify({ palImageDb, palPartnerSkillDb, elementImageDb, activeSkillNames, passiveSkillsData })); }catch(e){}
}
let breedingEntries = [];
let sheetConfig = { url:'', secret:'' };
let breedFilters = { search:'' };
let editingBreedId = null;
let breedBlocks = null;
function loadBreedingLocal(){
  try{
    const raw = localStorage.getItem(BREEDING_STORAGE_KEY);
    if(raw) breedingEntries = JSON.parse(raw) || [];
  }catch(e){ breedingEntries = []; }
  try{
    const raw2 = localStorage.getItem(SHEET_CONFIG_KEY);
    if(raw2) sheetConfig = Object.assign({ url:'', secret:'' }, JSON.parse(raw2));
  }catch(e){}
  // First time this browser has ever loaded the app: pre-fill the known
  // Web App URL so connecting is just "type the SECRET", not "also go
  // find and paste this long URL". A device that's connected before (or
  // explicitly disconnected) keeps whatever it already has, even blank.
  if(sheetConfig.url === '' && sheetConfig.secret === '' && localStorage.getItem(SHEET_CONFIG_KEY) === null){
    sheetConfig.url = DEFAULT_SHEET_URL;
  }
}
function persistBreedingLocal(){
  try{ localStorage.setItem(BREEDING_STORAGE_KEY, JSON.stringify(breedingEntries)); }catch(e){}
}
function persistSheetConfig(){
  try{ localStorage.setItem(SHEET_CONFIG_KEY, JSON.stringify(sheetConfig)); }catch(e){}
}

/* ---------- Google Sheet sync ---------- */
// Apps Script deployments most often "can't connect" for one of:
// wrong/stale SECRET, "Who has access" not set to Anyone, or the URL
// being a /dev test URL instead of the deployed /exec one — all three
// come back as a non-JSON (HTML sign-in/error page) response, so we
// surface that distinction instead of a single generic error.
async function parseSheetResponse_(res){
  const text = await res.text();
  let data;
  try{ data = JSON.parse(text); }
  catch(e){
    throw new Error(`The Sheet didn't return JSON (HTTP ${res.status}). Usually this means the deployment's "Who has access" isn't set to "Anyone", or the URL isn't the /exec one from Deploy → New deployment.`);
  }
  if(!data.ok) throw new Error((data.error || 'Request failed') + (data._build ? ` [script build ${data._build}]` : ' [no build tag — you are on a very old deployment, redeploy]'));
  return data;
}
async function sheetFetchAll(){
  const url = new URL(sheetConfig.url);
  url.searchParams.set('secret', sheetConfig.secret);
  const res = await fetch(url.toString());
  return parseSheetResponse_(res);
}
async function sheetSend(action, payload){
  const res = await fetch(sheetConfig.url, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' }, // avoids a CORS preflight Apps Script can't answer
    body: JSON.stringify({ action, secret: sheetConfig.secret, payload })
  });
  return parseSheetResponse_(res);
}
function updateSheetStatusLabel(){
  const btn = document.getElementById('sheetSettingsBtn');
  const label = document.getElementById('sheetStatusLabel');
  btn.classList.remove('connected','sync-error');
  if(isSheetConfigured()){
    btn.classList.add('connected');
    label.textContent = 'Google Sheet: connected';
  } else {
    label.textContent = 'Google Sheet: not connected';
  }
}
// Applies a doGet response in place: entries replace the local breeding
// cache; pals feed palImageDb, palPartnerSkillDb, and a two-way merge
// of discovery status; activeSkills feeds the live suggestions array
// (mutated in place — createTagInput() closures hold a reference to
// this exact array, so existing form fields pick up new suggestions
// live); elements feeds elementImageDb (type pill -> picture).
// A parent/offspring's palId should always be a string like "001" — the
// server now guards against Sheets silently turning that into a number,
// but coercing (and re-padding, if it still arrives as a bare number)
// again here is a cheap second line of defense.
function normalizePalId_(v){
  if(typeof v === 'number') return String(v).padStart(3, '0');
  return String(v || '');
}
function normalizeBreedSide_(s){
  s = s || {};
  return { palId: normalizePalId_(s.palId), sex: s.sex || '', passives: s.passives || [], actives: s.actives || [] };
}

async function applySheetData(data){
  const serverEntries = (data.entries || []).map(e => Object.assign({}, e, {
    synced: true,
    parentA: normalizeBreedSide_(e.parentA),
    parentB: normalizeBreedSide_(e.parentB),
    offspring: normalizeBreedSide_(e.offspring)
  }));
  const serverIds = new Set(serverEntries.map(e => e.id));
  // A sync must never silently drop something the user is still trying
  // to save: keep any local entry that hasn't confirmed as synced yet
  // and isn't already on the server (a failed push, or one made while
  // briefly offline) — it gets pushed below instead of discarded.
  const pendingLocal = breedingEntries.filter(e => e.synced === false && !serverIds.has(e.id));
  breedingEntries = serverEntries.concat(pendingLocal);
  persistBreedingLocal();

  palImageDb = {};
  const sheetDiscoveredIds = [];
  (data.pals || []).forEach(p => {
    if(p.imageUrl) palImageDb[p.id] = p.imageUrl;
    if(p.discovered) sheetDiscoveredIds.push(p.id);
  });

  // partnerSkills is its own tab, keyed by palId — join it in here.
  palPartnerSkillDb = {};
  (data.partnerSkills || []).forEach(p => {
    if(p.name) palPartnerSkillDb[p.palId] = [p.name, p.description || ''];
  });

  elementImageDb = {};
  (data.elements || []).forEach(t => { if(t.imageUrl) elementImageDb[t.code] = t.imageUrl; });

  const names = (data.activeSkills || []).map(s => s.name).filter(Boolean);
  activeSkillNames.length = 0;
  names.forEach(n => activeSkillNames.push(n));

  // passiveSkills is seeded from PASSIVE_SKILLS, so a connected sheet
  // should always have rows — only replace the working copy when it does,
  // so a not-yet-synced or briefly empty response can't blank the list.
  const sheetPassives = (data.passiveSkills || []).filter(p => p.name);
  if(sheetPassives.length){
    passiveSkillsData.length = 0;
    sheetPassives.forEach(p => passiveSkillsData.push([p.name, p.rank, p.surgery, p.effects || []]));
    passiveSkillNames.length = 0;
    passiveSkillsData.forEach(p => passiveSkillNames.push(p[0]));
  }

  // Discovery and passive-unlock status both sync the same way: the
  // sheet's set merges into local state (union — a sheet read never
  // un-discovers/re-locks something you've already ticked off here),
  // and anything true locally but still missing from the sheet gets
  // pushed up in one batch call.
  let localChanged = false;
  sheetDiscoveredIds.forEach(id => {
    if(!state.discovered[id]){ state.discovered[id] = true; localChanged = true; }
  });

  const sheetUnlockedNames = sheetPassives.filter(p => p.unlocked).map(p => p.name);
  sheetUnlockedNames.forEach(name => {
    if(!state.passivesUnlocked[name]){ state.passivesUnlocked[name] = true; localChanged = true; }
  });
  if(localChanged) persistState();

  const sheetDiscoveredSet = new Set(sheetDiscoveredIds);
  const palIdsToPush = Object.keys(state.discovered).filter(id => state.discovered[id] && !sheetDiscoveredSet.has(id));
  if(palIdsToPush.length){
    try{ await sheetSend('setDiscoveredBatch', { palIds: palIdsToPush }); }
    catch(e){ /* best effort — next sync will retry */ }
  }

  const sheetUnlockedSet = new Set(sheetUnlockedNames);
  const namesToPush = Object.keys(state.passivesUnlocked).filter(n => state.passivesUnlocked[n] && !sheetUnlockedSet.has(n));
  if(namesToPush.length){
    try{ await sheetSend('setPassiveUnlockedBatch', { names: namesToPush }); }
    catch(e){ /* best effort — next sync will retry */ }
  }

  persistSheetDataCache();
}
async function syncFromSheet(){
  if(!isSheetConfigured()) return;
  try{
    const data = await sheetFetchAll();
    await applySheetData(data);
    buildTypeChips();
    renderBreedEntries();
    render();
    await pushUnsyncedBreedingEntries();
  }catch(e){
    document.getElementById('sheetSettingsBtn').classList.add('sync-error');
    showToast('Could not reach your Google Sheet — showing your last saved copy.', true);
  }
}

/* ---------- searchable Pal combobox ---------- */
function createPalCombo(){
  const wrap = document.createElement('div');
  wrap.className = 'combo-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search Pal by name…';
  input.autocomplete = 'off';
  wrap.appendChild(input);
  const dropdown = document.createElement('div');
  dropdown.className = 'combo-dropdown';
  dropdown.style.display = 'none';
  wrap.appendChild(dropdown);

  let selectedId = '';

  function setSelected(id){
    selectedId = id;
    const p = PALS.find(x => x[0] === id);
    input.value = p ? p[3] : '';
  }
  function renderDropdown(query){
    // Only Pals already ticked off in the Palpedia are selectable here —
    // a breeding log entry is about Pals you actually have.
    const q = query.trim().toLowerCase();
    const pool = PALS.filter(p => state.discovered[p[0]]);
    const matches = (!q ? pool : pool.filter(p => p[3].toLowerCase().includes(q))).slice(0, 30);
    if(matches.length === 0){
      dropdown.innerHTML = pool.length === 0
        ? `<div class="combo-empty">Discover some Pals on the Palpedia tab first.</div>`
        : `<div class="combo-empty">No discovered Pals match "${escapeHtml(query)}"</div>`;
    } else {
      dropdown.innerHTML = matches.map(p => `<div class="combo-option" data-id="${p[0]}">№${String(p[1]).padStart(3,'0')}${p[2]} ${escapeHtml(p[3])}</div>`).join('');
    }
    dropdown.style.display = 'block';
  }
  input.addEventListener('focus', () => renderDropdown(input.value));
  input.addEventListener('input', () => { selectedId = ''; renderDropdown(input.value); });
  input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
  dropdown.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-option');
    if(!opt) return;
    e.preventDefault();
    setSelected(opt.dataset.id);
    dropdown.style.display = 'none';
  });

  return {
    el: wrap,
    getValue(){ return selectedId; },
    setValue(id){ setSelected(id || ''); },
    reset(){ setSelected(''); }
  };
}

/* ---------- tag input (chips), optionally with suggestions ---------- */
function createTagInput({ maxCount, suggestions, placeholder }){
  const wrap = document.createElement('div');
  wrap.className = 'tag-input-wrap';
  const row = document.createElement('div');
  row.className = 'tag-input-row';
  wrap.appendChild(row);

  const chipsHolder = document.createElement('div');
  chipsHolder.className = 'tag-chips';
  row.appendChild(chipsHolder);

  const input = document.createElement('input');
  input.className = 'tag-input-field';
  input.type = 'text';
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';
  row.appendChild(input);

  let dropdown = null;
  if(suggestions){
    dropdown = document.createElement('div');
    dropdown.className = 'combo-dropdown';
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);
  }

  const note = document.createElement('div');
  note.className = 'tag-max-note';
  wrap.appendChild(note);

  let tags = [];

  function updateNote(){
    note.textContent = `${tags.length} / ${maxCount} added` + (tags.length >= maxCount ? ' — remove one to add another' : '');
  }
  function renderChips(){
    chipsHolder.innerHTML = '';
    tags.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      const label = document.createElement('span');
      label.textContent = t;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label','Remove');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => { tags.splice(i, 1); renderChips(); });
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      chipsHolder.appendChild(chip);
    });
    input.style.display = tags.length >= maxCount ? 'none' : '';
    updateNote();
  }
  function addTag(value){
    const v = (value || '').trim();
    if(!v || tags.length >= maxCount || tags.includes(v)) return;
    tags.push(v);
    input.value = '';
    renderChips();
    if(dropdown) dropdown.style.display = 'none';
  }
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ','){
      e.preventDefault();
      addTag(input.value);
    } else if(e.key === 'Backspace' && !input.value && tags.length){
      tags.pop();
      renderChips();
    }
  });
  if(suggestions){
    function renderDropdown(){
      const q = input.value.trim().toLowerCase();
      const pool = suggestions.filter(s => !tags.includes(s));
      const matches = (!q ? pool : pool.filter(s => s.toLowerCase().includes(q))).slice(0, 30);
      if(matches.length === 0){ dropdown.style.display = 'none'; return; }
      dropdown.innerHTML = matches.map(s => `<div class="combo-option" data-v="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
      dropdown.style.display = 'block';
    }
    input.addEventListener('focus', renderDropdown);
    input.addEventListener('input', renderDropdown);
    input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
    dropdown.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.combo-option');
      if(!opt) return;
      e.preventDefault();
      addTag(opt.dataset.v);
    });
  }
  renderChips();

  return {
    el: wrap,
    getValue(){ return tags.slice(); },
    setValue(arr){ tags = (arr || []).slice(0, maxCount); renderChips(); },
    reset(){ tags = []; renderChips(); }
  };
}

/* ---------- one parent/offspring block (Pal + sex + passives + actives) ---------- */
function createBreedBlock(title, isOffspring){
  const block = document.createElement('div');
  block.className = 'breed-block' + (isOffspring ? ' offspring' : '');

  const h = document.createElement('div');
  h.className = 'breed-block-title';
  h.textContent = title;
  block.appendChild(h);

  const row1 = document.createElement('div');
  row1.className = 'breed-block-row';
  const palCell = document.createElement('div');
  palCell.innerHTML = '<label class="breed-field-label">Pal</label>';
  const palCombo = createPalCombo();
  palCell.appendChild(palCombo.el);
  row1.appendChild(palCell);

  const sexCell = document.createElement('div');
  sexCell.innerHTML = '<label class="breed-field-label">Sex</label>';
  const sexToggle = document.createElement('div');
  sexToggle.className = 'sex-toggle';
  const maleBtn = document.createElement('button');
  maleBtn.type = 'button'; maleBtn.className = 'male';
  maleBtn.innerHTML = `${GENDER_ICONS.male}<span>Male</span>`;
  const femaleBtn = document.createElement('button');
  femaleBtn.type = 'button'; femaleBtn.className = 'female';
  femaleBtn.innerHTML = `${GENDER_ICONS.female}<span>Female</span>`;
  let sexVal = '';
  function setSex(v){
    sexVal = v;
    maleBtn.classList.toggle('on', v === 'Male');
    femaleBtn.classList.toggle('on', v === 'Female');
  }
  maleBtn.addEventListener('click', () => setSex(sexVal === 'Male' ? '' : 'Male'));
  femaleBtn.addEventListener('click', () => setSex(sexVal === 'Female' ? '' : 'Female'));
  sexToggle.appendChild(maleBtn);
  sexToggle.appendChild(femaleBtn);
  sexCell.appendChild(sexToggle);
  row1.appendChild(sexCell);
  block.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'breed-block-row';
  const passCell = document.createElement('div');
  passCell.innerHTML = '<label class="breed-field-label">Passive skills (up to 4)</label>';
  const passiveInput = createTagInput({ maxCount:4, suggestions: passiveSkillNames, placeholder:'Search passives…' });
  passCell.appendChild(passiveInput.el);
  row2.appendChild(passCell);
  block.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'breed-block-row';
  const actCell = document.createElement('div');
  actCell.innerHTML = '<label class="breed-field-label">Active skills (up to 10)</label>';
  // activeSkillNames starts empty (free-text) and fills in live once a
  // connected Google Sheet's activeSkills tab has rows — same array
  // reference, so this input picks up suggestions without rebuilding.
  const activeInput = createTagInput({ maxCount:10, suggestions:activeSkillNames, placeholder:'Type a skill, press Enter…' });
  actCell.appendChild(activeInput.el);
  row3.appendChild(actCell);
  block.appendChild(row3);

  return {
    el: block,
    getValue(){ return { palId: palCombo.getValue(), sex: sexVal, passives: passiveInput.getValue(), actives: activeInput.getValue() }; },
    setValue(v){
      v = v || {};
      palCombo.setValue(v.palId);
      setSex(v.sex || '');
      passiveInput.setValue(v.passives);
      activeInput.setValue(v.actives);
    },
    reset(){ palCombo.reset(); setSex(''); passiveInput.reset(); activeInput.reset(); }
  };
}

function initBreedForm(){
  const body = document.getElementById('breedFormBody');
  const a = createBreedBlock('Parent A', false);
  const b = createBreedBlock('Parent B', false);
  const off = createBreedBlock('Offspring', true);
  body.appendChild(a.el);
  body.appendChild(b.el);
  body.appendChild(off.el);
  breedBlocks = { a, b, off };
}

/* ---------- rendering the entry list ---------- */
function palNameById(id){
  const p = PALS.find(x => x[0] === id);
  return p ? p[3] : (id || 'Unknown Pal');
}
function formatEntryDate(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); }
  catch(e){ return ''; }
}
function palImageById(id){
  return (state.images[id] || palImageDb[id] || '');
}
function breedPalChipHtml(data, isOffspring){
  const name = palNameById(data.palId);
  const sexCls = data.sex === 'Male' ? 'male' : data.sex === 'Female' ? 'female' : '';
  const genderIcon = sexCls ? GENDER_ICONS[sexCls] : '';
  const passives = data.passives && data.passives.length ? data.passives.join(', ') : '—';
  const actives = data.actives && data.actives.length ? data.actives.join(', ') : '—';
  const img = palImageById(data.palId);
  const thumbHtml = img
    ? `<img class="breed-pal-chip-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<span class="breed-pal-chip-thumb"></span>`;
  return `<div class="breed-pal-chip${isOffspring ? ' offspring' : ''}">
    <div class="breed-pal-chip-top">
      ${thumbHtml}
      <div class="pname">${escapeHtml(name)}${data.sex ? ` <span class="sex ${sexCls}" title="${data.sex}">${genderIcon}</span>` : ''}</div>
    </div>
    <div class="skills"><b>Passives:</b> ${escapeHtml(passives)}</div>
    <div class="skills"><b>Actives:</b> ${escapeHtml(actives)}</div>
  </div>`;
}
function renderBreedEntries(){
  const container = document.getElementById('breedEntries');
  const q = (breedFilters.search || '').trim().toLowerCase();
  const entries = breedingEntries.filter(e => {
    if(!q) return true;
    const names = [palNameById(e.parentA.palId), palNameById(e.parentB.palId), palNameById(e.offspring.palId)].join(' ').toLowerCase();
    return names.includes(q);
  }).slice().sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));

  if(entries.length === 0){
    container.innerHTML = `<div class="breed-empty"><div class="big">No entries yet</div>Log your first breeding combo with "New entry".</div>`;
    return;
  }

  container.innerHTML = entries.map(e => {
    try{
      return `
    <div class="breed-entry" data-id="${e.id}">
      <div class="breed-entry-top">
        <span class="breed-entry-date">${formatEntryDate(e.createdAt)}</span>
        <div class="breed-entry-actions">
          ${e.synced === false && isSheetConfigured() ? `<button class="breed-unsynced" data-action="retry-sync" title="Tap to retry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>Not synced</button>` : ''}
          <button class="breed-icon-btn" data-action="edit-breed" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button class="breed-icon-btn danger" data-action="delete-breed" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
          </button>
        </div>
      </div>
      <div class="breed-flow">
        ${breedPalChipHtml(e.parentA)}
        <span class="breed-plus">+</span>
        ${breedPalChipHtml(e.parentB)}
        <span class="breed-arrow">→</span>
        ${breedPalChipHtml(e.offspring, true)}
      </div>
      ${e.notes ? `<div class="breed-entry-notes">${escapeHtml(e.notes)}</div>` : ''}
    </div>
  `;
    }catch(err){
      console.error('Breeding entry render failed for', e.id, err);
      return '';
    }
  }).join('');
}

/* ---------- form open/close/save ---------- */
function openBreedForm(entry){
  editingBreedId = entry ? entry.id : null;
  document.getElementById('breedFormTitle').textContent = entry ? 'Edit breeding entry' : 'Log a breeding';
  breedBlocks.a.setValue(entry ? entry.parentA : null);
  breedBlocks.b.setValue(entry ? entry.parentB : null);
  breedBlocks.off.setValue(entry ? entry.offspring : null);
  document.getElementById('breedNotes').value = entry ? (entry.notes || '') : '';
  document.getElementById('breedFormModal').style.display = 'flex';
}
function closeBreedForm(){
  document.getElementById('breedFormModal').style.display = 'none';
  editingBreedId = null;
}

document.getElementById('newBreedingBtn').addEventListener('click', () => {
  breedBlocks.a.reset(); breedBlocks.b.reset(); breedBlocks.off.reset();
  openBreedForm(null);
});
document.getElementById('breedFormClose').addEventListener('click', closeBreedForm);
document.getElementById('breedFormCancel').addEventListener('click', closeBreedForm);
document.getElementById('breedFormModal').addEventListener('click', (e) => { if(e.target.id === 'breedFormModal') closeBreedForm(); });

document.getElementById('breedFormSave').addEventListener('click', async () => {
  const a = breedBlocks.a.getValue();
  const b = breedBlocks.b.getValue();
  const off = breedBlocks.off.getValue();
  if(!a.palId || !b.palId || !off.palId){
    showToast('Pick a Pal for both parents and the offspring.', true);
    return;
  }
  const notes = document.getElementById('breedNotes').value.trim();
  const wasEditing = editingBreedId;

  let entry;
  if(wasEditing){
    entry = breedingEntries.find(x => x.id === wasEditing);
    if(!entry) return;
    entry.parentA = a; entry.parentB = b; entry.offspring = off; entry.notes = notes;
  } else {
    entry = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'e' + Date.now() + Math.random().toString(36).slice(2)),
      createdAt: new Date().toISOString(),
      parentA: a, parentB: b, offspring: off, notes
    };
    breedingEntries.push(entry);
  }
  entry.synced = false;
  persistBreedingLocal();
  renderBreedEntries();
  closeBreedForm();

  await pushBreedingEntry(entry, true);
});

// Always an upsert (Code.gs's 'update' action appends the row if it
// doesn't find an existing id), so this is safe to call for a brand
// new entry, an edit, or a retry — no need to remember which one it was.
async function pushBreedingEntry(entry, announceFailure){
  if(!isSheetConfigured()) return;
  try{
    await sheetSend('update', entry);
    entry.synced = true;
    persistBreedingLocal();
    renderBreedEntries();
  }catch(err){
    entry.synced = false;
    persistBreedingLocal();
    renderBreedEntries();
    if(announceFailure){
      showToast(`Saved locally, but could not sync to your Google Sheet: ${err.message}`, true);
    }
  }
}

// Anything still marked unsynced (a failed push, or an entry created
// while offline) gets one retry attempt each time a sheet sync succeeds.
async function pushUnsyncedBreedingEntries(){
  if(!isSheetConfigured()) return;
  const pending = breedingEntries.filter(e => e.synced === false);
  for(const entry of pending){
    await pushBreedingEntry(entry, false);
  }
}

document.getElementById('breedEntries').addEventListener('click', async (e) => {
  const card = e.target.closest('.breed-entry');
  if(!card) return;
  const id = card.dataset.id;
  if(e.target.closest('[data-action="edit-breed"]')){
    const entry = breedingEntries.find(x => x.id === id);
    if(entry) openBreedForm(entry);
    return;
  }
  if(e.target.closest('[data-action="retry-sync"]')){
    const entry = breedingEntries.find(x => x.id === id);
    if(entry) await pushBreedingEntry(entry, true);
    return;
  }
  if(e.target.closest('[data-action="delete-breed"]')){
    breedingEntries = breedingEntries.filter(x => x.id !== id);
    persistBreedingLocal();
    renderBreedEntries();
    if(isSheetConfigured()){
      try{ await sheetSend('delete', { id }); }
      catch(err){ showToast(`Deleted locally, but could not remove it from your Google Sheet: ${err.message}`, true); }
    }
  }
});

document.getElementById('breedSearchInput').addEventListener('input', (e) => {
  breedFilters.search = e.target.value;
  renderBreedEntries();
});

/* ---------- Google Sheet settings modal ---------- */
document.getElementById('sheetSettingsBtn').addEventListener('click', () => {
  document.getElementById('sheetUrlInput').value = sheetConfig.url || '';
  document.getElementById('sheetSecretInput').value = sheetConfig.secret || '';
  document.getElementById('sheetDisconnect').style.display = isSheetConfigured() ? 'inline-block' : 'none';
  const statusEl = document.getElementById('sheetTestStatus');
  statusEl.textContent = '';
  statusEl.className = 'sheet-status-line';
  document.getElementById('sheetSettingsModal').style.display = 'flex';
});
document.getElementById('sheetSettingsClose').addEventListener('click', () => { document.getElementById('sheetSettingsModal').style.display = 'none'; });
document.getElementById('sheetSettingsCancel').addEventListener('click', () => { document.getElementById('sheetSettingsModal').style.display = 'none'; });
document.getElementById('sheetSettingsModal').addEventListener('click', (e) => { if(e.target.id === 'sheetSettingsModal') document.getElementById('sheetSettingsModal').style.display = 'none'; });

document.getElementById('sheetSettingsSave').addEventListener('click', async () => {
  const url = document.getElementById('sheetUrlInput').value.trim();
  const secret = document.getElementById('sheetSecretInput').value.trim();
  const statusEl = document.getElementById('sheetTestStatus');
  if(!url || !secret){
    statusEl.textContent = 'Both the Web app URL and SECRET are required.';
    statusEl.className = 'sheet-status-line err';
    return;
  }
  statusEl.textContent = 'Testing connection…';
  statusEl.className = 'sheet-status-line';
  const prevConfig = Object.assign({}, sheetConfig);
  sheetConfig = { url, secret };
  try{
    const data = await sheetFetchAll();
    persistSheetConfig();
    await applySheetData(data);
    buildTypeChips();
    renderBreedEntries();
    render();
    await pushUnsyncedBreedingEntries();
    updateSheetStatusLabel();
    const n = (data.entries || []).length;
    const skillCount = (data.activeSkills || []).length;
    const passiveCount = (data.passiveSkills || []).length;
    statusEl.textContent = `Connected — loaded ${n} breeding ${n === 1 ? 'entry' : 'entries'}, ${(data.pals || []).length} Pals, ${passiveCount} passive skill${passiveCount === 1 ? '' : 's'}, ${skillCount} active skill${skillCount === 1 ? '' : 's'}.`;
    statusEl.className = 'sheet-status-line ok';
    showToast('Google Sheet connected.');
    setTimeout(() => { document.getElementById('sheetSettingsModal').style.display = 'none'; }, 1400);
  }catch(err){
    sheetConfig = prevConfig;
    statusEl.textContent = (err && err.message) ? err.message : 'Could not connect — check the URL and SECRET, and that the deployment allows "Anyone" access.';
    statusEl.className = 'sheet-status-line err';
  }
});

document.getElementById('sheetDisconnect').addEventListener('click', () => {
  sheetConfig = { url:'', secret:'' };
  persistSheetConfig();
  updateSheetStatusLabel();
  document.getElementById('sheetSettingsModal').style.display = 'none';
  showToast('Disconnected. Your breeding log stays saved in this browser.');
});

document.getElementById('copyScriptBtn').addEventListener('click', async () => {
  try{
    await navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
    showToast('Script copied — paste it into Apps Script.');
  }catch(err){
    showToast('Could not copy automatically — select and copy manually.', true);
  }
});
