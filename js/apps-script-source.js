const APPS_SCRIPT_SOURCE = `/**
 * Palpedia Field Tracker — Google Sheet bridge.
 *
 * Paste this into Extensions -> Apps Script on a Google Sheet, add a
 * Script Property named SECRET (Project Settings -> Script Properties),
 * then Deploy -> New deployment -> Web app (Execute as: Me, Who has
 * access: Anyone). Paste the resulting URL and your SECRET into the
 * app's "Google Sheet sync" settings.
 *
 * IMPORTANT if you're updating an existing deployment: editing this
 * file alone does NOT change what your live Web app URL runs. Go to
 * Deploy -> Manage deployments -> pencil icon on your deployment ->
 * Version: New version -> Deploy. (Or make a fresh deployment, but
 * then you must re-paste the new URL into the app.)
 *
 * SCHEMA — six tabs, all lowercase, everything looked up by column
 * name (not position), so reordering or adding your own columns never
 * breaks anything. A missing tab is created with sensible defaults;
 * an existing tab is never restructured, only ever read from — except
 * for a handful of narrow, purpose-built writes: pals.discovered/
 * imageUrl/base/party and passiveSkills.unlocked. pals.base/party and
 * passiveSkills.unlocked are added as new columns if they aren't there
 * yet, appended at the end, nothing else touched.
 *
 *  - breedingLog:   id, createdAt, parentA_palId, parentA_sex,
 *                   parentA_passives, parentA_actives, parentB_palId,
 *                   parentB_sex, parentB_passives, parentB_actives,
 *                   offspring_palId, offspring_sex, offspring_passives,
 *                   offspring_actives, notes. Fully owned by the app.
 *  - pals:          id, palId, name, type, imageUrl, discovered, base,
 *                   party, plus 12 Work Suitability columns (Kindling,
 *                   Watering, Planting, Generating Electricity,
 *                   Handiwork, Gathering, Lumbering, Mining, Medicine
 *                   Production, Cooling, Transporting, Farming) — left
 *                   blank for you to fill in yourself; the app only
 *                   adds and reads these columns, never writes values
 *                   into them. 'type' may be comma- or pipe-separated
 *                   (a Sheets multi-select dropdown auto-joins with
 *                   commas).
 *  - partnerSkills: id, palId, palName, name, description — a
 *                   separate tab, one row per Pal.
 *  - activeSkills:  id, name, element, power, ct, exclusive,
 *                   description, notes — you populate this yourself;
 *                   only 'name' is required for a row to be used.
 *  - elements:      id, code, name, imageUrl — the 9 Palworld types.
 *  - passiveSkills: id, name, rank, surgery, effects, unlocked.
 *                   'effects' may be comma- or pipe-separated.
 *
 * Every *_palId column is read tolerantly: the cell may be the text
 * "001" or the real number 1 (e.g. displayed zero-padded via a custom
 * number format like "000") — either is normalized to "001" in memory
 * on read via normalizePalId_(). Nothing is ever written back to
 * change a palId cell's type or format; the sheet is left exactly as
 * you set it up.
 */

var TYPES_SEED = [
  ["NE","Neutral"],
  ["FI","Fire"],
  ["WA","Water"],
  ["GR","Grass"],
  ["EL","Electric"],
  ["IC","Ice"],
  ["GD","Ground"],
  ["DA","Dark"],
  ["DR","Dragon"]
];

var PASSIVE_SKILLS_SEED = [
  ["Demon's Hand",5,true,"Work Speed +90%|SAN drains 15% faster|World Tree resources stay put when approached"],
  ["Dimensional Leap",5,true,"Move Speed +50%|Hunger drains 15% faster|World Tree resources stay put when approached"],
  ["God of Destruction",5,true,"Attack +40%|Defense +20%|Max HP -50%|World Tree resources stay put when approached"],
  ["Hermit Sage",5,true,"SAN drains 50% slower|Work Speed -20%|World Tree resources stay put when approached"],
  ["Sanctified Meat Shield",5,true,"Defense +50%|Attack -30%|World Tree resources stay put when approached"],
  ["Twin-Edged Holy Blade",5,true,"Attack +50%|Defense -30%|World Tree resources stay put when approached"],
  ["World Tree Seedbed",5,true,"Hunger drains 50% slower|HP -20%|World Tree resources stay put when approached"],
  ["Babysitter",4,true,"At base: +30% egg production and +30% incubation speed for Breeding Farm Pals"],
  ["Demon God",4,true,"Attack +30%|Defense +5%"],
  ["Diamond Body",4,true,"Defense +30%|Immune to Flinch|Immune to Knockback"],
  ["Eternal Engine",4,true,"Max Stamina +75% (rideable Pals only)"],
  ["Eternal Flame",4,false,"+30% Fire damage|+30% Electric damage"],
  ["Heart of the Immovable King",4,true,"SAN drains 20% slower"],
  ["Heavily Armored",4,true,"Immune to Explosion damage"],
  ["Idiosyncratic",4,true,"Auto HP regen +50%|Defense +25%|Immune to Poison|Immune to Burn"],
  ["Immortality",4,true,"Lifesteal +5%|Auto HP regen +100%|Attack +15%"],
  ["Invader",4,false,"+30% Dark damage|+30% Dragon damage"],
  ["King of the Waves",4,true,"+50% Move Speed on water"],
  ["Lavish Hospitality",4,false,"+100% items dropped"],
  ["Legend",4,false,"Attack +20%|Defense +20%|Move Speed +20%"],
  ["Lightfooted",4,false,"+1 mounted jump count"],
  ["Lucky",4,false,"Attack +15%|Defense +15%|Work Speed +20%"],
  ["Lunker",4,false,"+20% Water damage|+20% Ice damage|+20% Defense"],
  ["Mastery of Fasting",4,true,"Hunger drains 20% slower"],
  ["Ranch Master",4,false,"Farming suitability +2"],
  ["Remarkable Craftsmanship",4,true,"Work Speed +75%"],
  ["Savior",4,false,"+30% Neutral damage|+30% Grass damage"],
  ["Siren of the Void",4,false,"+30% Dark damage|+30% Ice damage"],
  ["Skymarcher",4,true,"+2 mounted jump count"],
  ["Swift",4,true,"+30% Move Speed"],
  ["Vampiric",4,true,"Absorbs a share of damage dealt as healing; never sleeps, keeps working at night"],
  ["Ace Swimmer",3,true,"+40% Move Speed on water"],
  ["Artisan",3,true,"Work Speed +50%"],
  ["Burly Body",3,true,"Defense +20%|Immune to Flinch"],
  ["Celestial Emperor",3,false,"+30% Neutral damage"],
  ["Diet Lover",3,true,"Hunger drains 15% slower"],
  ["Divine Dragon",3,false,"+30% Dragon damage"],
  ["Earth Emperor",3,false,"+30% Ground damage"],
  ["Farmhand",3,false,"Farming suitability +1"],
  ["Ferocious",3,true,"Attack +20%"],
  ["Flame Emperor",3,false,"+30% Fire damage"],
  ["Healing Coach",3,true,"Player auto HP regen +5%"],
  ["Ice Emperor",3,false,"+30% Ice damage"],
  ["Infinite Stamina",3,true,"Max Stamina +50% (rideable Pals only)"],
  ["Logging Foreman",3,true,"+25% player logging efficiency"],
  ["Lord of Lightning",3,false,"+30% Electric damage"],
  ["Lord of the Sea",3,false,"+30% Water damage"],
  ["Lord of the Underworld",3,false,"+30% Dark damage"],
  ["Mine Foreman",3,true,"+25% player mining efficiency"],
  ["Motivational Leader",3,true,"+25% player Work Speed"],
  ["Noble",3,true,"+5% sale value of items"],
  ["Philanthropist",3,true,"+100% breeding speed on a Breeding Farm"],
  ["Reload Master",3,true,"+4% player reload speed"],
  ["Runner",3,true,"+20% Move Speed"],
  ["Serenity",3,true,"Active skill cooldown -30%|Attack +10%"],
  ["Service-Minded",3,false,"+50% items dropped"],
  ["Spirit Emperor",3,false,"+30% Grass damage"],
  ["Stronghold Strategist",3,true,"+10% player Defense"],
  ["Vanguard",3,true,"+10% player Attack"],
  ["Wellness Watcher",3,true,"Player Stamina use -5%"],
  ["Whopper",3,false,"+5% Water damage|+5% Ice damage|+5% Defense"],
  ["Workaholic",3,true,"SAN drains 15% slower"],
  ["Heavyweight",2,false,"Defense +20%|Immune to Knockback"],
  ["Musclehead",2,true,"Attack +30%|Work Speed -50%"],
  ["Abnormal",1,false,"-10% Neutral damage taken"],
  ["Aggressive",1,false,"Attack +10%|Defense -10%"],
  ["Blood of the Dragon",1,false,"+10% Dragon damage"],
  ["Botanical Barrier",1,false,"-10% Grass damage taken"],
  ["Brave",1,true,"Attack +10%"],
  ["Capacitor",1,false,"+10% Electric damage"],
  ["Cheery",1,false,"-10% Dark damage taken"],
  ["Coldblooded",1,false,"+10% Ice damage"],
  ["Conceited",1,false,"Work Speed +10%|Defense -10%"],
  ["Dainty Eater",1,true,"Hunger drains 10% slower"],
  ["Dragonkiller",1,false,"-10% Dragon damage taken"],
  ["Earthquake Resistant",1,false,"-10% Ground damage taken"],
  ["Fine Furs",1,true,"+3% sale value of items"],
  ["Fit as a Fiddle",1,true,"Max Stamina +25% (rideable Pals only)"],
  ["Fragrant Foliage",1,false,"+10% Grass damage"],
  ["Hard Skin",1,true,"Defense +10%"],
  ["Heated Body",1,false,"-10% Ice damage taken"],
  ["Hooligan",1,false,"Attack +15%|Work Speed -10%"],
  ["Hydromaniac",1,false,"+10% Water damage"],
  ["Impatient",1,true,"Active skill cooldown -15%"],
  ["Insomnia",1,true,"Never sleeps, keeps working at night"],
  ["Insulated Body",1,false,"-10% Electric damage taken"],
  ["Masochist",1,false,"Defense +15%|Attack -15%"],
  ["Nimble",1,true,"+10% Move Speed"],
  ["Otherworldly Cells",1,false,"Attack +10%|-15% Fire damage taken|-15% Electric damage taken"],
  ["Positive Thinker",1,true,"SAN drains 10% slower"],
  ["Power of Gaia",1,false,"+10% Ground damage"],
  ["Pyromaniac",1,false,"+10% Fire damage"],
  ["Sadist",1,false,"Attack +15%|Defense -15%"],
  ["Serious",1,true,"Work Speed +20%"],
  ["Sleek Stroke",1,true,"+30% Move Speed on water"],
  ["Spirit of Zen",1,false,"+10% Neutral damage"],
  ["Suntan Lover",1,false,"-10% Fire damage taken"],
  ["Veil of Darkness",1,false,"+10% Dark damage"],
  ["Waterproof",1,false,"-10% Water damage taken"],
  ["Work Slave",1,true,"Work Speed +30%|Attack -30%"],
  ["Clumsy",-1,false,"Work Speed -10%"],
  ["Coward",-1,false,"Attack -10%"],
  ["Downtrodden",-1,false,"Defense -10%"],
  ["Easygoing",-1,false,"Active skill cooldown +15% (longer)"],
  ["Glutton",-1,false,"Hunger drains 10% faster"],
  ["Mercy Hit",-1,true,"Pacifist — attacks never finish off a target"],
  ["Night Owl",-1,false,"Naps through the day despite being nocturnal"],
  ["Shabby",-1,false,"-10% sale value of items"],
  ["Sickly",-1,false,"Max Stamina -25% (rideable Pals only)"],
  ["Unstable",-1,false,"SAN drains 10% faster"],
  ["Bottomless Stomach",-2,false,"Hunger drains 15% faster"],
  ["Destructive",-2,false,"SAN drains 15% faster"],
  ["Brittle",-3,false,"Defense -20%"],
  ["Pacifist",-3,false,"Attack -20%"],
  ["Slacker",-3,false,"Work Speed -30%"]
];

var BREEDING_SHEET_NAME = 'breedingLog';
var BREEDING_HEADERS = [
  'id', 'createdAt',
  'parentA_palId', 'parentA_sex', 'parentA_passives', 'parentA_actives',
  'parentB_palId', 'parentB_sex', 'parentB_passives', 'parentB_actives',
  'offspring_palId', 'offspring_sex', 'offspring_passives', 'offspring_actives',
  'notes'
];

// The 12 Work Suitability types from the base game, in the order the
// game itself lists them. Left blank for every Pal — the app never
// populates these, only adds the columns so they can be filled in by
// hand from a source you trust.
var WORK_SUITABILITY_COLUMNS = [
  'Kindling', 'Watering', 'Planting', 'Generating Electricity', 'Handiwork',
  'Gathering', 'Lumbering', 'Mining', 'Medicine Production', 'Cooling',
  'Transporting', 'Farming'
];

var PALS_SHEET_NAME = 'pals';
var PALS_HEADERS = ['id', 'palId', 'name', 'type', 'imageUrl', 'discovered', 'base', 'party']
  .concat(WORK_SUITABILITY_COLUMNS);

var PARTNER_SKILLS_SHEET_NAME = 'partnerSkills';
var PARTNER_SKILLS_HEADERS = ['id', 'palId', 'palName', 'name', 'description'];

var ACTIVE_SKILLS_SHEET_NAME = 'activeSkills';
var ACTIVE_SKILLS_HEADERS = ['id', 'name', 'element', 'power', 'ct', 'exclusive', 'description', 'notes'];

var ELEMENTS_SHEET_NAME = 'elements';
var ELEMENTS_HEADERS = ['id', 'code', 'name', 'imageUrl'];

var PASSIVE_SKILLS_SHEET_NAME = 'passiveSkills';
var PASSIVE_SKILLS_HEADERS = ['id', 'name', 'rank', 'surgery', 'effects', 'category', 'unlocked'];

/* ============================================================
   GENERIC HELPERS
   ============================================================ */
function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

function checkSecret_(secret) {
  var expected = getSecret_();
  return !!expected && secret === expected;
}

// Bumped on every change to this file. Stamped on every response (even
// errors) so it's obvious from the outside whether a live deployment is
// actually running this version — editing the code in the Apps Script
// editor does NOT update what's live until you redeploy (see header
// comment), which is easy to think you did and not have actually done.
var SCRIPT_BUILD = '2026-08-13.2';

function jsonOut_(obj) {
  obj._build = SCRIPT_BUILD;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Exact match, case-insensitive — every read/write below looks columns
// up by name through this, never by fixed position.
function headerIndex_(header, name) {
  var lower = header.map(function (h) { return String(h || '').toLowerCase().trim(); });
  return lower.indexOf(String(name).toLowerCase());
}

function isTruthyCell_(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'x';
}

// A "multi-value" cell may be comma- or pipe-separated: our own writes
// use "|", but a Sheets multi-select dropdown column auto-joins with
// ", " — tolerate both on every read so it doesn't matter which one
// produced the cell.
function splitMulti_(v) {
  if (!v) return [];
  return String(v).split(/[|,]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

function padPalId_(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}

// A palId cell may legitimately be a real number in the sheet (e.g.
// formatted with a custom number format like "000" so it displays
// zero-padded) rather than a text string — that's the actual cell
// type the person chose, not something to "fix." This never writes
// anything back to the sheet; it just normalizes whatever's there
// into the "001"-style string the app matches on, in memory, on read.
function normalizePalId_(v) {
  if (typeof v === 'number') return padPalId_(v);
  return String(v || '');
}

// Additively appends any of columnNames not already present in the
// sheet's header row, in order, at the end — never renames, reorders,
// or touches an existing column. Same pattern as the one-off
// 'unlocked' migration in getPassiveSkillsSheet_, generalized so it
// can add several columns at once.
function ensureHeaderColumns_(sheet, columnNames) {
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  columnNames.forEach(function (name) {
    if (headerIndex_(header, name) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(name);
      header.push(name);
    }
  });
}

function getSheetOrCreate_(name, headers, seedRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (seedRows && seedRows.length) {
      sheet.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    }
  }
  return sheet;
}

/* ============================================================
   breedingLog — fully owned by the app
   ============================================================ */
function getBreedingSheet_() {
  return getSheetOrCreate_(BREEDING_SHEET_NAME, BREEDING_HEADERS, []);
}

function rowToEntry_(row, header) {
  function get(name) {
    var i = headerIndex_(header, name);
    return i === -1 ? '' : row[i];
  }
  return {
    id: String(get('id') || ''),
    createdAt: String(get('createdAt') || ''),
    parentA: {
      palId: normalizePalId_(get('parentA_palId')), sex: String(get('parentA_sex') || ''),
      passives: splitMulti_(get('parentA_passives')), actives: splitMulti_(get('parentA_actives'))
    },
    parentB: {
      palId: normalizePalId_(get('parentB_palId')), sex: String(get('parentB_sex') || ''),
      passives: splitMulti_(get('parentB_passives')), actives: splitMulti_(get('parentB_actives'))
    },
    offspring: {
      palId: normalizePalId_(get('offspring_palId')), sex: String(get('offspring_sex') || ''),
      passives: splitMulti_(get('offspring_passives')), actives: splitMulti_(get('offspring_actives'))
    },
    notes: String(get('notes') || '')
  };
}

function entryToRow_(e, header) {
  var pa = e.parentA || {}, pb = e.parentB || {}, off = e.offspring || {};
  var map = {
    id: e.id, createdAt: e.createdAt,
    parentA_palId: pa.palId || '', parentA_sex: pa.sex || '',
    parentA_passives: (pa.passives || []).join('|'), parentA_actives: (pa.actives || []).join('|'),
    parentB_palId: pb.palId || '', parentB_sex: pb.sex || '',
    parentB_passives: (pb.passives || []).join('|'), parentB_actives: (pb.actives || []).join('|'),
    offspring_palId: off.palId || '', offspring_sex: off.sex || '',
    offspring_passives: (off.passives || []).join('|'), offspring_actives: (off.actives || []).join('|'),
    notes: e.notes || ''
  };
  return header.map(function (h) { return map.hasOwnProperty(h) ? map[h] : ''; });
}

function findRowIndexById_(sheet, header, id) {
  var idCol = headerIndex_(header, 'id');
  if (idCol === -1) idCol = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/* ============================================================
   pals — id, palId, name, type, imageUrl, discovered
   ============================================================ */
function getPalsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PALS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PALS_SHEET_NAME);
    sheet.appendRow(PALS_HEADERS);
  } else {
    ensureHeaderColumns_(sheet, ['base', 'party'].concat(WORK_SUITABILITY_COLUMNS));
  }
  return sheet;
}

function readPals_() {
  var sheet = getPalsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cId = headerIndex_(header, 'palId'), cName = headerIndex_(header, 'name'),
    cType = headerIndex_(header, 'type'), cImg = headerIndex_(header, 'imageUrl'),
    cDisc = headerIndex_(header, 'discovered'), cBase = headerIndex_(header, 'base'),
    cParty = headerIndex_(header, 'party');
  var workCols = WORK_SUITABILITY_COLUMNS.map(function (name) {
    return { name: name, idx: headerIndex_(header, name) };
  });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cId === -1 || !row[cId]) continue;
    var workSuitability = {};
    workCols.forEach(function (c) {
      if (c.idx !== -1 && row[c.idx] !== '') workSuitability[c.name] = row[c.idx];
    });
    out.push({
      id: normalizePalId_(row[cId]),
      name: cName !== -1 ? String(row[cName] || '') : '',
      types: cType !== -1 ? splitMulti_(row[cType]) : [],
      imageUrl: cImg !== -1 ? String(row[cImg] || '') : '',
      discovered: cDisc !== -1 ? isTruthyCell_(row[cDisc]) : false,
      base: cBase !== -1 ? isTruthyCell_(row[cBase]) : false,
      party: cParty !== -1 ? isTruthyCell_(row[cParty]) : false,
      workSuitability: workSuitability
    });
  }
  return out;
}

function findPalRow_(sheet, header, palId) {
  var idCol = headerIndex_(header, 'palId');
  if (idCol === -1) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (normalizePalId_(ids[i][0]) === palId) return i + 2;
  }
  return -1;
}

// pals rows are no longer pre-seeded (see header comment) — a row is
// created the first time you interact with that Pal (tick it off,
// assign Base/Party, add a picture), pre-filled with its name/type if
// the caller has them, so the row isn't just a bare id sitting there.
function ensurePalRow_(sheet, header, palId, extra) {
  var rowIdx = findPalRow_(sheet, header, palId);
  if (rowIdx !== -1) return rowIdx;
  var newRow = header.map(function () { return ''; });
  var idCol = headerIndex_(header, 'id');
  var palIdCol = headerIndex_(header, 'palId');
  if (idCol !== -1) newRow[idCol] = sheet.getLastRow();
  if (palIdCol !== -1) newRow[palIdCol] = palId;
  if (extra) {
    if (extra.name) {
      var nameCol = headerIndex_(header, 'name');
      if (nameCol !== -1) newRow[nameCol] = extra.name;
    }
    if (extra.type) {
      var typeCol = headerIndex_(header, 'type');
      if (typeCol !== -1) newRow[typeCol] = extra.type;
    }
  }
  sheet.appendRow(newRow);
  return sheet.getLastRow();
}

function setPalField_(palId, fieldName, value, extra) {
  var sheet = getPalsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headerIndex_(header, fieldName);
  if (colIdx === -1) return false;
  var rowIdx = ensurePalRow_(sheet, header, palId, extra);
  sheet.getRange(rowIdx, colIdx + 1).setValue(value);
  return true;
}

function setDiscovered_(palId, discovered, extra) { return setPalField_(palId, 'discovered', !!discovered, extra); }
function setPalImageUrl_(palId, imageUrl, extra) { return setPalField_(palId, 'imageUrl', imageUrl || '', extra); }
function setPalBase_(palId, inBase, extra) { return setPalField_(palId, 'base', !!inBase, extra); }
function setPalParty_(palId, inParty, extra) { return setPalField_(palId, 'party', !!inParty, extra); }

function clearPalsColumn_(colName) {
  var sheet = getPalsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headerIndex_(header, colName);
  if (col === -1) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var blanks = [];
  for (var i = 0; i < lastRow - 1; i++) blanks.push([false]);
  sheet.getRange(2, col + 1, blanks.length, 1).setValues(blanks);
}
function clearAllDiscovered_() { clearPalsColumn_('discovered'); }
function clearAllBase_() { clearPalsColumn_('base'); }
function clearAllParty_() { clearPalsColumn_('party'); }

/* ============================================================
   partnerSkills — its own tab: id, palId, palName, name, description
   ============================================================ */
function getPartnerSkillsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PARTNER_SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PARTNER_SKILLS_SHEET_NAME);
    sheet.appendRow(PARTNER_SKILLS_HEADERS);
  }
  return sheet;
}

function readPartnerSkills_() {
  var sheet = getPartnerSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cPal = headerIndex_(header, 'palId'), cName = headerIndex_(header, 'name'), cDesc = headerIndex_(header, 'description');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cPal === -1 || !row[cPal]) continue;
    var name = cName !== -1 ? String(row[cName] || '') : '';
    if (!name) continue;
    out.push({ palId: normalizePalId_(row[cPal]), name: name, description: cDesc !== -1 ? String(row[cDesc] || '') : '' });
  }
  return out;
}

/* ============================================================
   activeSkills — you populate this; only 'name' is required
   ============================================================ */
function getActiveSkillsSheet_() {
  return getSheetOrCreate_(ACTIVE_SKILLS_SHEET_NAME, ACTIVE_SKILLS_HEADERS, []);
}

function readActiveSkills_() {
  var sheet = getActiveSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cName = headerIndex_(header, 'name'), cEl = headerIndex_(header, 'element'),
    cPow = headerIndex_(header, 'power'), cCt = headerIndex_(header, 'ct'),
    cExcl = headerIndex_(header, 'exclusive'), cDesc = headerIndex_(header, 'description'),
    cNotes = headerIndex_(header, 'notes');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cName === -1 || !row[cName]) continue;
    out.push({
      name: String(row[cName]),
      element: cEl !== -1 ? splitMulti_(row[cEl]) : [],
      power: cPow !== -1 ? String(row[cPow] || '') : '',
      ct: cCt !== -1 ? String(row[cCt] || '') : '',
      exclusive: cExcl !== -1 ? splitMulti_(row[cExcl]) : [],
      description: cDesc !== -1 ? String(row[cDesc] || '') : (cNotes !== -1 ? String(row[cNotes] || '') : '')
    });
  }
  return out;
}

/* ============================================================
   elements — id, code, name, imageUrl
   ============================================================ */
function getElementsSheet_() {
  var seedRows = TYPES_SEED.map(function (t, i) { return [i + 1, t[0], t[1], '']; });
  return getSheetOrCreate_(ELEMENTS_SHEET_NAME, ELEMENTS_HEADERS, seedRows);
}

function readElements_() {
  var sheet = getElementsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cCode = headerIndex_(header, 'code'), cName = headerIndex_(header, 'name'), cImg = headerIndex_(header, 'imageUrl');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cCode === -1 || !row[cCode]) continue;
    out.push({ code: String(row[cCode]), name: cName !== -1 ? String(row[cName] || '') : '', imageUrl: cImg !== -1 ? String(row[cImg] || '') : '' });
  }
  return out;
}

/* ============================================================
   passiveSkills — id, name, rank, surgery, effects, unlocked
   'unlocked' is the one column this script adds to an existing
   tab if it's missing, purpose-built for tracking which passives
   you've discovered — appended at the end, nothing else touched.
   ============================================================ */
function getPassiveSkillsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PASSIVE_SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PASSIVE_SKILLS_SHEET_NAME);
    sheet.appendRow(PASSIVE_SKILLS_HEADERS);
    var rows = PASSIVE_SKILLS_SEED.map(function (p, i) { return [i + 1, p[0], p[1], !!p[2], p[3], '', false]; });
    sheet.getRange(2, 1, rows.length, PASSIVE_SKILLS_HEADERS.length).setValues(rows);
    return sheet;
  }
  // 'category' is left blank — there's no official Palworld
  // categorization to seed it with, it's here for you to fill in
  // however you'd like to filter (Attack, Defense, Work, ...).
  ensureHeaderColumns_(sheet, ['category', 'unlocked']);
  return sheet;
}

function readPassiveSkills_() {
  var sheet = getPassiveSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cName = headerIndex_(header, 'name'), cRank = headerIndex_(header, 'rank'),
    cSurg = headerIndex_(header, 'surgery'), cEff = headerIndex_(header, 'effects'),
    cCat = headerIndex_(header, 'category'), cUnlock = headerIndex_(header, 'unlocked');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cName === -1 || !row[cName]) continue;
    out.push({
      name: String(row[cName]),
      rank: cRank !== -1 ? (Number(row[cRank]) || 0) : 0,
      surgery: cSurg !== -1 ? isTruthyCell_(row[cSurg]) : false,
      effects: cEff !== -1 ? splitMulti_(row[cEff]) : [],
      category: cCat !== -1 ? String(row[cCat] || '') : '',
      unlocked: cUnlock !== -1 ? isTruthyCell_(row[cUnlock]) : false
    });
  }
  return out;
}

function setPassiveUnlocked_(name, unlocked) {
  var sheet = getPassiveSkillsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var nameCol = headerIndex_(header, 'name');
  var unlockCol = headerIndex_(header, 'unlocked');
  if (nameCol === -1 || unlockCol === -1) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var names = sheet.getRange(2, nameCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === name) {
      sheet.getRange(i + 2, unlockCol + 1).setValue(!!unlocked);
      return true;
    }
  }
  return false;
}

function clearAllPassivesUnlocked_() {
  var sheet = getPassiveSkillsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var unlockCol = headerIndex_(header, 'unlocked');
  if (unlockCol === -1) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var blanks = [];
  for (var i = 0; i < lastRow - 1; i++) blanks.push([false]);
  sheet.getRange(2, unlockCol + 1, blanks.length, 1).setValues(blanks);
}

/* ============================================================
   HTTP entry points
   ============================================================ */
function doGet(e) {
  if (!checkSecret_(e.parameter.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized — the SECRET sent by the app does not match this deployment\'s Script Property.' });
  }
  try {
    var sheet = getBreedingSheet_();
    var values = sheet.getDataRange().getValues();
    var header = values[0];
    var rows = values.slice(1).filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); });
    var entries = rows.map(function (r) { return rowToEntry_(r, header); });
    return jsonOut_({
      ok: true,
      entries: entries,
      pals: readPals_(),
      partnerSkills: readPartnerSkills_(),
      activeSkills: readActiveSkills_(),
      elements: readElements_(),
      passiveSkills: readPassiveSkills_()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Sheet error: ' + err.message });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Bad request' });
  }
  if (!checkSecret_(body.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized — the SECRET sent by the app does not match this deployment\'s Script Property.' });
  }

  try {
    if (body.action === 'setDiscovered') { setDiscovered_(body.payload.palId, body.payload.discovered, body.payload); return jsonOut_({ ok: true }); }
    if (body.action === 'setDiscoveredBatch') { (body.payload.palIds || []).forEach(function (id) { setDiscovered_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearDiscovered') { clearAllDiscovered_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setPalImageUrl') { setPalImageUrl_(body.payload.palId, body.payload.imageUrl, body.payload); return jsonOut_({ ok: true }); }
    if (body.action === 'setBase') { setPalBase_(body.payload.palId, body.payload.base, body.payload); return jsonOut_({ ok: true }); }
    if (body.action === 'setBaseBatch') { (body.payload.palIds || []).forEach(function (id) { setPalBase_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearBase') { clearAllBase_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setParty') { setPalParty_(body.payload.palId, body.payload.party, body.payload); return jsonOut_({ ok: true }); }
    if (body.action === 'setPartyBatch') { (body.payload.palIds || []).forEach(function (id) { setPalParty_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearParty') { clearAllParty_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setPassiveUnlocked') { setPassiveUnlocked_(body.payload.name, body.payload.unlocked); return jsonOut_({ ok: true }); }
    if (body.action === 'setPassiveUnlockedBatch') { (body.payload.names || []).forEach(function (n) { setPassiveUnlocked_(n, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearPassivesUnlocked') { clearAllPassivesUnlocked_(); return jsonOut_({ ok: true }); }

    var sheet = getBreedingSheet_();
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (body.action === 'add') {
      sheet.appendRow(entryToRow_(body.payload, header));
      return jsonOut_({ ok: true });
    }

    if (body.action === 'update') {
      var idx = findRowIndexById_(sheet, header, body.payload.id);
      var row = entryToRow_(body.payload, header);
      if (idx === -1) sheet.appendRow(row);
      else sheet.getRange(idx, 1, 1, row.length).setValues([row]);
      return jsonOut_({ ok: true });
    }

    if (body.action === 'delete') {
      var delIdx = findRowIndexById_(sheet, header, body.payload.id);
      if (delIdx !== -1) sheet.deleteRow(delIdx);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Sheet error: ' + err.message });
  }
}
`;
