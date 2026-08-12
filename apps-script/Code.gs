/**
 * Palpedia Field Tracker — Google Sheet bridge.
 *
 * Paste this into Extensions -> Apps Script on a Google Sheet, add a
 * Script Property named SECRET (Project Settings -> Script Properties),
 * then Deploy -> New deployment -> Web app (Execute as: Me, Who has
 * access: Anyone). Paste the resulting URL and your SECRET into the
 * app's "Google Sheet sync" settings.
 *
 * Three tabs are created automatically the first time the script runs
 * (a doGet call is enough — you don't need to run anything by hand):
 *
 *  - BreedingLog:    your logged breeding entries. Fully owned by the
 *                    app; don't hand-edit the columns.
 *  - PalsDB:         seeded once with the app's built-in 284-Pal
 *                    roster (id/number/suffix/name/types) and a blank
 *                    ImageUrl column. Paste a picture URL per row and
 *                    the app will show it for that Pal everywhere —
 *                    it's only seeded if the tab doesn't exist yet, so
 *                    your edits are never overwritten by this script.
 *  - ActiveSkillsDB: created empty (headers only) — paste in your own
 *                    active-skill data (Name / Element / Power / CT /
 *                    Notes, in any order, extra columns ignored) and
 *                    the breeding form's active-skill field switches
 *                    from free text to a search-as-you-type list.
 */
var BREEDING_SHEET_NAME = 'BreedingLog';
var BREEDING_HEADERS = [
  'id', 'createdAt',
  'parentA_palId', 'parentA_sex', 'parentA_passives', 'parentA_actives',
  'parentB_palId', 'parentB_sex', 'parentB_passives', 'parentB_actives',
  'offspring_palId', 'offspring_sex', 'offspring_passives', 'offspring_actives',
  'notes'
];

var PALS_SHEET_NAME = 'PalsDB';
var PALS_HEADERS = ['PalId', 'Number', 'Suffix', 'Name', 'Types', 'ImageUrl'];
// [id, number, suffix, name, types joined with "|"] — mirrors the app's
// built-in PALS array so the tab starts out matching what's on-screen.
var PALS_SEED = [
  ["001",1,"","Lamball","NE"],
  ["002",2,"","Cattiva","NE"],
  ["003",3,"","Chikipi","NE"],
  ["004",4,"","Lifmunk","GR"],
  ["005",5,"","Fuack","WA"],
  ["005B",5,"B","Fuack Ignis","WA|FI"],
  ["006",6,"","Vixy","NE"],
  ["007",7,"","Celaray","WA"],
  ["007B",7,"B","Celaray Lux","WA|EL"],
  ["008",8,"","Cremis","NE"],
  ["009",9,"","Croajiro","WA"],
  ["009B",9,"B","Croajiro Noct","WA|DA"],
  ["010",10,"","Herbil","GR|NE"],
  ["011",11,"","Teafant","WA"],
  ["012",12,"","Gumoss","GR|GD"],
  ["013",13,"","Pupperai","GD"],
  ["014",14,"","Clovee","GR|NE"],
  ["015",15,"","Jolthog","EL"],
  ["015B",15,"B","Jolthog Cryst","IC"],
  ["016",16,"","Depresso","DA"],
  ["017",17,"","Pengullet","WA|IC"],
  ["017B",17,"B","Pengullet Lux","WA|EL"],
  ["018",18,"","Penking","WA|IC"],
  ["018B",18,"B","Penking Lux","WA|EL"],
  ["019",19,"","Hoocrates","DA"],
  ["020",20,"","Melpaca","NE"],
  ["021",21,"","Kingpaca","NE"],
  ["021B",21,"B","Kingpaca Cryst","IC"],
  ["022",22,"","Daedream","DA"],
  ["023",23,"","Tanzee","GR"],
  ["023B",23,"B","Tanzee Ignis","FI"],
  ["024",24,"","Nox","DA"],
  ["025",25,"","Flambelle","FI"],
  ["026",26,"","Rooby","FI"],
  ["027",27,"","Mau","DA"],
  ["027B",27,"B","Mau Cryst","IC"],
  ["028",28,"","Rushoar","GD"],
  ["029",29,"","Foxparks","FI"],
  ["029B",29,"B","Foxparks Cryst","IC"],
  ["030",30,"","Killamari","DA|WA"],
  ["030B",30,"B","Killamari Primo","NE|WA"],
  ["031",31,"","Fuddler","GD"],
  ["032",32,"","Eikthyrdeer","NE"],
  ["032B",32,"B","Eikthyrdeer Terra","GD"],
  ["033",33,"","Direhowl","NE"],
  ["034",34,"","Caprity","GR"],
  ["034B",34,"B","Caprity Noct","DA"],
  ["035",35,"","Swee","IC"],
  ["036",36,"","Sweepa","IC"],
  ["037",37,"","Turtacle","WA"],
  ["037B",37,"B","Turtacle Terra","WA|GD"],
  ["038",38,"","Hangyu","GD"],
  ["038B",38,"B","Hangyu Cryst","IC"],
  ["039",39,"","Woolipop","NE"],
  ["039B",39,"B","Woolipop Terra","GD"],
  ["040",40,"","Mozzarina","NE"],
  ["041",41,"","Azurobe","WA|DR"],
  ["041B",41,"B","Azurobe Cryst","IC|DR"],
  ["042",42,"","Sparkit","EL"],
  ["043",43,"","Kelpsea","WA"],
  ["043B",43,"B","Kelpsea Ignis","FI"],
  ["044",44,"","Ribbuny","NE"],
  ["044B",44,"B","Ribbuny Botan","GR"],
  ["045",45,"","Jelliette","WA"],
  ["046",46,"","Jellroy","WA|DA"],
  ["047",47,"","Amione","WA"],
  ["048",48,"","Gloopie","WA|DA"],
  ["048B",48,"B","Gloopie Primo","WA|NE"],
  ["049",49,"","Galeclaw","NE"],
  ["050",50,"","Wispaw","DA"],
  ["051",51,"","Nitewing","NE"],
  ["052",52,"","Tombat","DA"],
  ["053",53,"","Tocotoco","NE"],
  ["054",54,"","Univolt","EL"],
  ["054B",54,"B","Univolt Cryst","IC"],
  ["055",55,"","Gobfin","WA"],
  ["055B",55,"B","Gobfin Ignis","FI"],
  ["056",56,"","Loupmoon","DA"],
  ["056B",56,"B","Loupmoon Cryst","IC"],
  ["057",57,"","Cawgnito","DA"],
  ["058",58,"","Arsox","FI"],
  ["059",59,"","Muffly","IC"],
  ["060",60,"","Bristla","GR"],
  ["061",61,"","Cinnamoth","GR"],
  ["062",62,"","Puffolt","EL"],
  ["063",63,"","Elphidran","DR"],
  ["063B",63,"B","Elphidran Aqua","DR|WA"],
  ["064",64,"","Vanwyrm","FI|DA"],
  ["064B",64,"B","Vanwyrm Cryst","IC|DA"],
  ["065",65,"","Felbat","DA"],
  ["066",66,"","Vaelet","GR"],
  ["067",67,"","Beegarde","GR"],
  ["068",68,"","Elizabee","GR"],
  ["069",69,"","Lovander","DA"],
  ["070",70,"","Grintale","NE"],
  ["071",71,"","Tarantriss","DA"],
  ["072",72,"","Polapup","IC|WA"],
  ["072B",72,"B","Polapup Terra","IC|GD"],
  ["073",73,"","Leezpunk","DA"],
  ["073B",73,"B","Leezpunk Ignis","FI"],
  ["074",74,"","Gorirat","NE"],
  ["074B",74,"B","Gorirat Terra","GD"],
  ["075",75,"","Surfent","WA"],
  ["075B",75,"B","Surfent Terra","GD"],
  ["076",76,"","Robinquill","GR"],
  ["076B",76,"B","Robinquill Terra","GR|GD"],
  ["077",77,"","Flopie","GR"],
  ["078",78,"","Wixen","FI"],
  ["078B",78,"B","Wixen Noct","FI|DA"],
  ["079",79,"","Katress","DA"],
  ["079B",79,"B","Katress Ignis","DA|FI"],
  ["080",80,"","Helzephyr","DA"],
  ["080B",80,"B","Helzephyr Lux","DA|EL"],
  ["081",81,"","Elgrove","GR"],
  ["081B",81,"B","Elgrove Cryst","IC"],
  ["082",82,"","Lunaris","NE"],
  ["083",83,"","Fenglope","NE"],
  ["083B",83,"B","Fenglope Lux","EL"],
  ["084",84,"","Dinossom","GR|DR"],
  ["084B",84,"B","Dinossom Lux","EL|DR"],
  ["085",85,"","Bushi","FI"],
  ["085B",85,"B","Bushi Noct","FI|DA"],
  ["086",86,"","Munchill","IC|WA"],
  ["087",87,"","Mammorest","GR|GD"],
  ["087B",87,"B","Mammorest Cryst","IC|GD"],
  ["088",88,"","Finsider","WA"],
  ["088B",88,"B","Finsider Ignis","WA|FI"],
  ["089",89,"","Petallia","GR"],
  ["089B",89,"B","Petallia Ignis","GR|FI"],
  ["090",90,"","Leafan","GR"],
  ["091",91,"","Incineram","FI|DA"],
  ["091B",91,"B","Incineram Noct","DA"],
  ["092",92,"","Dazzi","EL"],
  ["092B",92,"B","Dazzi Noct","DA|EL"],
  ["093",93,"","Pyrin","FI"],
  ["093B",93,"B","Pyrin Noct","FI|DA"],
  ["094",94,"","Relaxaurus","DR|WA"],
  ["094B",94,"B","Relaxaurus Lux","DR|EL"],
  ["095",95,"","Foxcicle","IC"],
  ["096",96,"","Beakon","EL"],
  ["096B",96,"B","Beakon Cryst","IC"],
  ["097",97,"","Ghangler","DA|WA"],
  ["097B",97,"B","Ghangler Ignis","FI|WA"],
  ["098",98,"","Rayhound","EL"],
  ["098B",98,"B","Rayhound Cryst","IC"],
  ["099",99,"","Menasting","DA|GD"],
  ["099B",99,"B","Menasting Terra","GD"],
  ["100",100,"","Needoll","GR"],
  ["100B",100,"B","Needoll Noct","DA|GR"],
  ["101",101,"","Reindrix","IC"],
  ["102",102,"","Mossanda","GR"],
  ["102B",102,"B","Mossanda Lux","EL"],
  ["103",103,"","Chillet","IC|DR"],
  ["103B",103,"B","Chillet Ignis","FI|DR"],
  ["104",104,"","Ragnahawk","FI"],
  ["105",105,"","Moldron","FI|GD"],
  ["105B",105,"B","Moldron Cryst","IC|GD"],
  ["106",106,"","Palumba","GR"],
  ["107",107,"","Digtoise","GD"],
  ["108",108,"","Broncherry","GR"],
  ["108B",108,"B","Broncherry Aqua","GR|WA"],
  ["109",109,"","Dumud","GD|WA"],
  ["109B",109,"B","Dumud Gild","GD|WA"],
  ["110",110,"","Braloha","GR|GD"],
  ["111",111,"","Kitsun","FI"],
  ["111B",111,"B","Kitsun Noct","DA"],
  ["112",112,"","Blazehowl","FI"],
  ["112B",112,"B","Blazehowl Noct","FI|DA"],
  ["113",113,"","Warsect","GD|GR"],
  ["113B",113,"B","Warsect Terra","GD"],
  ["114",114,"","Frostplume","IC"],
  ["115",115,"","Majex","DA|FI"],
  ["116",116,"","Sibelyx","IC"],
  ["116B",116,"B","Sibelyx Primo","NE"],
  ["117",117,"","Maraith","DA"],
  ["118",118,"","Shroomer","GR"],
  ["118B",118,"B","Shroomer Noct","GR|DA"],
  ["119",119,"","Icelyn","IC"],
  ["120",120,"","Gildra","DA|GD"],
  ["121",121,"","Jormuntide","DR|WA"],
  ["121B",121,"B","Jormuntide Ignis","DR|FI"],
  ["122",122,"","Suzaku","FI"],
  ["122B",122,"B","Suzaku Aqua","WA"],
  ["123",123,"","Dazemu","GD"],
  ["124",124,"","Quivern","DR"],
  ["124B",124,"B","Quivern Botan","DR|GR"],
  ["125",125,"","Lullu","GR"],
  ["126",126,"","Kikit","GD"],
  ["127",127,"","Yakumo","NE"],
  ["128",128,"","Skutlass","WA"],
  ["128B",128,"B","Skutlass Ignis","WA|FI"],
  ["129",129,"","Reptyro","FI|GD"],
  ["129B",129,"B","Reptyro Cryst","IC|GD"],
  ["130",130,"","Starryon","DA"],
  ["130B",130,"B","Starryon Primo","NE"],
  ["131",131,"","Pierdon","GD"],
  ["131B",131,"B","Pierdon Cryst","IC"],
  ["132",132,"","Cryolinx","IC"],
  ["132B",132,"B","Cryolinx Terra","GD"],
  ["133",133,"","Snugloo","IC"],
  ["134",134,"","Wumpo","IC"],
  ["134B",134,"B","Wumpo Botan","GR"],
  ["135",135,"","Sootseer","DA|FI"],
  ["136",136,"","Carnibora","GR"],
  ["137",137,"","Blazamut","FI"],
  ["137B",137,"B","Blazamut Ryu","DR|FI"],
  ["138",138,"","Dualith","GD|GR"],
  ["138B",138,"B","Dualith Noct","GD|DA"],
  ["139",139,"","Anubis","GD"],
  ["140",140,"","Sekhmet","GD"],
  ["141",141,"","Prixter","DA|GD"],
  ["141B",141,"B","Prixter Lux","EL|GD"],
  ["142",142,"","Tetroise","GD"],
  ["142B",142,"B","Tetroise Primo","NE"],
  ["143",143,"","Nyafia","DA"],
  ["144",144,"","Mimog","NE"],
  ["145",145,"","Xenovader","DA"],
  ["146",146,"","Xenogard","DR"],
  ["147",147,"","Prunelia","GR|DA"],
  ["148",148,"","Nitemary","DA"],
  ["148B",148,"B","Nitemary Botan","GR"],
  ["149",149,"","Smokie","DA"],
  ["149B",149,"B","Smokie Cryst","DA|IC"],
  ["150",150,"","Omascul","DA"],
  ["151",151,"","Whalaska","IC|WA"],
  ["151B",151,"B","Whalaska Ignis","IC|FI"],
  ["152",152,"","Verdash","GR"],
  ["153",153,"","Splatterina","DA"],
  ["154",154,"","Gildane","GD"],
  ["155",155,"","Dogen","NE"],
  ["156",156,"","Bulldosu","GD"],
  ["157",157,"","Celesdir","NE"],
  ["157B",157,"B","Celesdir Noct","DA"],
  ["158",158,"","Astegon","DR|DA"],
  ["159",159,"","Knocklem","GD"],
  ["159B",159,"B","Knocklem Ignis","FI"],
  ["160",160,"","Silvegis","DR"],
  ["161",161,"","Azurmane","EL"],
  ["162",162,"","Valentail","NE"],
  ["163",163,"","Snock","EL"],
  ["163B",163,"B","Snock Lux","EL|GD"],
  ["164",164,"","Souffline","GR"],
  ["165",165,"","Lapiron","GD"],
  ["166",166,"","Hoodle","DA"],
  ["167",167,"","Slowatt","EL"],
  ["168",168,"","Bakemi","DA"],
  ["169",169,"","Solmora","WA"],
  ["169B",169,"B","Solmora Lux","WA|EL"],
  ["170",170,"","Lapure","NE"],
  ["171",171,"","Eidrolon","DR|DA"],
  ["171B",171,"B","Eidrolon Ignis","DR|FI"],
  ["172",172,"","Dynamoff","EL"],
  ["173",173,"","Tropicaw","GR"],
  ["174",174,"","Flaracle","FI"],
  ["175",175,"","Ophydia","GR|WA"],
  ["176",176,"","Dupin","FI"],
  ["177",177,"","Roujay","DA"],
  ["178",178,"","Venusa","DA"],
  ["179",179,"","Mycora","GR"],
  ["180",180,"","Loomen","DA|FI"],
  ["181",181,"","Wistella","DA"],
  ["182",182,"","Solenne","DA|NE"],
  ["183",183,"","Renjishi","FI"],
  ["184",184,"","Aegidron","DR|GD"],
  ["185",185,"","Grizzbolt","EL"],
  ["186",186,"","Lyleen","GR"],
  ["186B",186,"B","Lyleen Noct","DA"],
  ["187",187,"","Orserk","DR|EL"],
  ["188",188,"","Faleris","FI"],
  ["188B",188,"B","Faleris Aqua","WA"],
  ["189",189,"","Shadowbeak","DA"],
  ["190",190,"","Selyne","DA|NE"],
  ["191",191,"","Bastigor","IC"],
  ["192",192,"","Shaolong","DR|WA"],
  ["195",195,"","Bellanoir","DA"],
  ["195B",195,"B","Bellanoir Libero","DA"],
  ["196",196,"","Xenolord","DA|DR"],
  ["197",197,"","Hartalis","NE"],
  ["198",198,"","Paladius","NE"],
  ["199",199,"","Necromus","DA"],
  ["200",200,"","Frostallion","IC"],
  ["200B",200,"B","Frostallion Noct","DA"],
  ["201",201,"","Neptilius","WA"],
  ["202",202,"","Jetragon","DR"]
];

var ACTIVE_SKILLS_SHEET_NAME = 'ActiveSkillsDB';
var ACTIVE_SKILLS_HEADERS = ['Name', 'Element', 'Power', 'CT', 'Notes'];

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

function checkSecret_(secret) {
  var expected = getSecret_();
  return !!expected && secret === expected;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- BreedingLog ---------- */
function getBreedingSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BREEDING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BREEDING_SHEET_NAME);
    sheet.appendRow(BREEDING_HEADERS);
  }
  return sheet;
}

function rowToEntry_(row) {
  return {
    id: row[0],
    createdAt: row[1],
    parentA: { palId: row[2], sex: row[3], passives: row[4] ? String(row[4]).split('|') : [], actives: row[5] ? String(row[5]).split('|') : [] },
    parentB: { palId: row[6], sex: row[7], passives: row[8] ? String(row[8]).split('|') : [], actives: row[9] ? String(row[9]).split('|') : [] },
    offspring: { palId: row[10], sex: row[11], passives: row[12] ? String(row[12]).split('|') : [], actives: row[13] ? String(row[13]).split('|') : [] },
    notes: row[14] || ''
  };
}

function entryToRow_(e) {
  var pa = e.parentA || {}, pb = e.parentB || {}, off = e.offspring || {};
  return [
    e.id, e.createdAt,
    pa.palId || '', pa.sex || '', (pa.passives || []).join('|'), (pa.actives || []).join('|'),
    pb.palId || '', pb.sex || '', (pb.passives || []).join('|'), (pb.actives || []).join('|'),
    off.palId || '', off.sex || '', (off.passives || []).join('|'), (off.actives || []).join('|'),
    e.notes || ''
  ];
}

function findRowIndexById_(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === id) return i + 1;
  }
  return -1;
}

/* ---------- PalsDB (seeded once from the app's built-in roster) ---------- */
function getPalsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PALS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PALS_SHEET_NAME);
    sheet.appendRow(PALS_HEADERS);
    var rows = PALS_SEED.map(function (p) { return [p[0], p[1], p[2], p[3], p[4], '']; });
    sheet.getRange(2, 1, rows.length, PALS_HEADERS.length).setValues(rows);
  }
  return sheet;
}

function readPals_() {
  var sheet = getPalsSheet_();
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;
    out.push({
      id: String(row[0]),
      number: row[1],
      suffix: row[2] || '',
      name: row[3] || '',
      types: row[4] ? String(row[4]).split('|') : [],
      imageUrl: row[5] || ''
    });
  }
  return out;
}

/* ---------- ActiveSkillsDB (left empty — the user pastes their own source) ---------- */
function getActiveSkillsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ACTIVE_SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACTIVE_SKILLS_SHEET_NAME);
    sheet.appendRow(ACTIVE_SKILLS_HEADERS);
  }
  return sheet;
}

// Matches header cells against a concept loosely, so a pasted source
// doesn't have to use our exact column names.
function findColumn_(headerRow, candidates) {
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i] || '').toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) {
      if (h === candidates[j] || h.indexOf(candidates[j]) !== -1) return i;
    }
  }
  return -1;
}

function readActiveSkills_() {
  var sheet = getActiveSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var nameCol = findColumn_(header, ['name', 'skill']);
  var elCol = findColumn_(header, ['element', 'type']);
  var powCol = findColumn_(header, ['power']);
  var ctCol = findColumn_(header, ['ct', 'cooldown']);
  var notesCol = findColumn_(header, ['notes', 'description']);
  if (nameCol === -1) return [];

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var name = row[nameCol];
    if (!name) continue;
    out.push({
      name: String(name),
      element: elCol !== -1 ? String(row[elCol] || '') : '',
      power: powCol !== -1 ? row[powCol] : '',
      ct: ctCol !== -1 ? row[ctCol] : '',
      notes: notesCol !== -1 ? String(row[notesCol] || '') : ''
    });
  }
  return out;
}

function doGet(e) {
  if (!checkSecret_(e.parameter.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized' });
  }
  var sheet = getBreedingSheet_();
  var values = sheet.getDataRange().getValues();
  var rows = values.slice(1).filter(function (r) { return r[0]; });
  var entries = rows.map(rowToEntry_);
  return jsonOut_({
    ok: true,
    entries: entries,
    pals: readPals_(),
    activeSkills: readActiveSkills_()
  });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Bad request' });
  }
  if (!checkSecret_(body.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized' });
  }
  var sheet = getBreedingSheet_();

  if (body.action === 'add') {
    sheet.appendRow(entryToRow_(body.payload));
    return jsonOut_({ ok: true });
  }

  if (body.action === 'update') {
    var idx = findRowIndexById_(sheet, body.payload.id);
    if (idx === -1) {
      sheet.appendRow(entryToRow_(body.payload));
    } else {
      var row = entryToRow_(body.payload);
      sheet.getRange(idx, 1, 1, row.length).setValues([row]);
    }
    return jsonOut_({ ok: true });
  }

  if (body.action === 'delete') {
    var delIdx = findRowIndexById_(sheet, body.payload.id);
    if (delIdx !== -1) sheet.deleteRow(delIdx);
    return jsonOut_({ ok: true });
  }

  return jsonOut_({ ok: false, error: 'Unknown action' });
}
