/* ============================================================
   DB SCHEMA — documents the Google Sheet backend
   Must be kept in sync by hand with apps-script/Code.gs whenever a
   tab, column, or write path changes there — this file does not read
   Code.gs at runtime, it's a maintained mirror of it.
   ============================================================ */
const DB_SCHEMA = [
  {
    tab: 'pals',
    purpose: 'One row per Pal you\'ve actually interacted with — not pre-seeded. A row is created the first time you discover a Pal, assign it Base/Party, or add a picture, pre-filled with its name/type at that moment. base/party and the 12 Work Suitability columns are added additively (appended, nothing else touched) the first time the app connects to a tab missing them.',
    keyedBy: 'palId',
    columns: [
      { name: 'id', notes: 'Row id — a simple incrementing number assigned when the row is created.' },
      { name: 'palId', notes: 'Palpedia number, as text ("001") or a real number displayed zero-padded via a custom format — either works, normalized on read. Never rewritten by the app.' },
      { name: 'name', notes: 'Pal name, filled in when the row is created.' },
      { name: 'type', notes: 'Type code(s), pipe-separated, filled in when the row is created.' },
      { name: 'imageUrl', notes: 'Picture URL for the card. Written when you add/change a picture in the app.', written: true },
      { name: 'discovered', notes: 'TRUE/FALSE. Written when you tick a Pal off in the app, and cleared by Reset Palpedia progress.', written: true },
      { name: 'base', notes: 'TRUE/FALSE. Written when you toggle a Pal\'s Base assignment, and cleared by Reset Palpedia progress or un-discovering the Pal.', written: true },
      { name: 'party', notes: 'TRUE/FALSE. Written when you toggle a Pal\'s Party assignment, and cleared by Reset Palpedia progress or un-discovering the Pal.', written: true },
      { name: 'Kindling, Watering, Planting, Generating Electricity, Handiwork, Gathering, Lumbering, Mining, Medicine Production, Cooling, Transporting, Farming', notes: 'The 12 Work Suitability levels. Added blank for you to fill in from a source you trust — the app only reads these, it never writes a value into them.' }
    ]
  },
  {
    tab: 'partnerSkills',
    purpose: 'Reference data, its own tab so a Pal can have zero, one, or (in theory) more partner skills. Not written by the app, and not pre-seeded — you populate it directly in the sheet.',
    keyedBy: 'palId',
    columns: [
      { name: 'id', notes: 'Row id.' },
      { name: 'palId', notes: 'Joins to pals.palId.' },
      { name: 'palName', notes: 'Convenience copy of the Pal name, for readability in the sheet only — the app looks the Pal up by palId, not this.' },
      { name: 'name', notes: 'Partner skill name, shown on the card.' },
      { name: 'description', notes: 'Partner skill effect text, shown on the card.' }
    ]
  },
  {
    tab: 'activeSkills',
    purpose: 'Reference list of move-set skills, used as suggestions in the breeding form. Not shipped with built-in data — you paste your own, since it couldn’t be verified against a real source. Only name is required.',
    keyedBy: 'name',
    columns: [
      { name: 'id', notes: 'Row id.' },
      { name: 'name', notes: 'Skill name — the only required column.' },
      { name: 'element', notes: 'Type code(s), comma- or pipe-separated.' },
      { name: 'power', notes: 'Free text/number, however you track it.' },
      { name: 'ct', notes: 'Cooldown, free text/number.' },
      { name: 'exclusive', notes: 'Pal(s) this move is exclusive to, comma- or pipe-separated.' },
      { name: 'description', notes: 'Effect text. Falls back to the notes column if description is absent.' },
      { name: 'notes', notes: 'Used as the description fallback when that column doesn’t exist.' }
    ]
  },
  {
    tab: 'elements',
    purpose: 'The 9 Palworld types, seeded once on first connect. Supplies the picture used for each type chip and card type pill.',
    keyedBy: 'code',
    columns: [
      { name: 'id', notes: 'Row id.' },
      { name: 'code', notes: 'Two-letter type code — joins to pals.type and activeSkills.element.' },
      { name: 'name', notes: 'Display name, e.g. "Fire".' },
      { name: 'imageUrl', notes: 'Icon shown on type chips and card type pills.' }
    ]
  },
  {
    tab: 'passiveSkills',
    purpose: 'Seeded once from the app’s built-in list of 115 named passive skills (not tied to a specific Pal) if the tab doesn’t exist yet. The app adds the category and unlocked columns itself, additively, the first time it connects to a tab that’s missing them — nothing else about an existing tab is touched.',
    keyedBy: 'name',
    columns: [
      { name: 'id', notes: 'Row id.' },
      { name: 'name', notes: 'Passive skill name.' },
      { name: 'rank', notes: 'Numeric rank/tier, as shown by the rank badge.' },
      { name: 'surgery', notes: 'TRUE/FALSE — whether it can be installed via surgery. Only shown once the skill is unlocked.' },
      { name: 'effects', notes: 'Effect text.' },
      { name: 'category', notes: 'Left blank — no official Palworld categorization exists to seed it with. Fill in your own grouping (Attack, Defense, Work, ...) and the Passive Skills tab automatically shows filter chips for whatever distinct values it finds here.' },
      { name: 'unlocked', notes: 'TRUE/FALSE. Written when you unlock a skill in the Passive Skills panel, and cleared by Reset Palpedia progress. Union-merged on read, never revoked by a stale local device.', written: true }
    ]
  },
  {
    tab: 'breedingLog',
    purpose: 'Fully owned by the app — every row is one entry you logged: two parents in, one offspring out. Created automatically on first connect.',
    keyedBy: 'id',
    columns: [
      { name: 'id', notes: 'App-generated id (UUID). Primary key for add/update/delete.', written: true },
      { name: 'createdAt', notes: 'ISO timestamp of when the entry was logged.', written: true },
      { name: 'parentA_palId / parentB_palId / offspring_palId', notes: 'Zero-padded palId, same rules as pals.palId (text-formatted + self-repairing).', written: true },
      { name: 'parentA_sex / parentB_sex / offspring_sex', notes: '"Male" or "Female".', written: true },
      { name: 'parentA_passives / parentB_passives / offspring_passives', notes: 'Passive skill names, pipe-separated, as picked in the breeding form.', written: true },
      { name: 'parentA_actives / parentB_actives / offspring_actives', notes: 'Active skill names, pipe-separated, as picked in the breeding form.', written: true },
      { name: 'notes', notes: 'Free-text notes for the entry.', written: true }
    ]
  }
];

const DB_RELATIONSHIPS = [
  'pals.palId ↔ partnerSkills.palId — a Pal’s partner skill, looked up by id.',
  'pals.palId ↔ breedingLog.parentA_palId / parentB_palId / offspring_palId — which Pals were bred.',
  'pals.type ↔ elements.code — type pictures for card type pills and filter chips.',
  'activeSkills.element ↔ elements.code — same type codes, for active skill type badges.',
  'breedingLog.*_passives ↔ passiveSkills.name — free-text match, not an enforced key (the breeding form suggests names from passiveSkills, but the column stores plain text).',
  'breedingLog.*_actives ↔ activeSkills.name — same: suggested, not enforced.'
];

function renderSchema(){
  const root = document.getElementById('schemaView');
  if(!root) return;
  const tableHtml = DB_SCHEMA.map(t => `
    <div class="schema-table">
      <div class="schema-table-head">
        <h3>${escapeHtml(t.tab)}</h3>
        <span class="schema-key">keyed by <code>${escapeHtml(t.keyedBy)}</code></span>
      </div>
      <p class="schema-purpose">${escapeHtml(t.purpose)}</p>
      <div class="schema-cols">
        ${t.columns.map(c => `
          <div class="schema-col-row ${c.written ? 'written' : ''}">
            <code class="schema-col-name">${escapeHtml(c.name)}</code>
            <span class="schema-col-notes">${escapeHtml(c.notes)}</span>
            ${c.written ? '<span class="schema-written-badge" title="Written by the app">app-writes</span>' : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');

  const relHtml = DB_RELATIONSHIPS.map(r => `<li>${escapeHtml(r)}</li>`).join('');

  root.innerHTML = `
    <div class="schema-wrap">
      <div class="schema-tables">${tableHtml}</div>
      <div class="schema-relationships">
        <h3>Relationships</h3>
        <ul>${relHtml}</ul>
      </div>
    </div>`;
}
