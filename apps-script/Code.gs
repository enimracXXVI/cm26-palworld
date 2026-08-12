/**
 * Palpedia Field Tracker — Breeding Log bridge.
 *
 * Paste this into Extensions -> Apps Script on a Google Sheet, add a
 * Script Property named SECRET (Project Settings -> Script Properties),
 * then Deploy -> New deployment -> Web app (Execute as: Me, Who has
 * access: Anyone). Paste the resulting URL and your SECRET into the
 * app's "Google Sheet sync" settings.
 *
 * Rows are keyed by an id generated client-side; the sheet is created
 * automatically on first use if it doesn't already exist.
 */
var SHEET_NAME = 'BreedingLog';
var HEADERS = [
  'id', 'createdAt',
  'parentA_palId', 'parentA_sex', 'parentA_passives', 'parentA_actives',
  'parentB_palId', 'parentB_sex', 'parentB_passives', 'parentB_actives',
  'offspring_palId', 'offspring_sex', 'offspring_passives', 'offspring_actives',
  'notes'
];

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

function checkSecret_(secret) {
  var expected = getSecret_();
  return !!expected && secret === expected;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

function doGet(e) {
  if (!checkSecret_(e.parameter.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized' });
  }
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var rows = values.slice(1).filter(function (r) { return r[0]; });
  var entries = rows.map(rowToEntry_);
  return jsonOut_({ ok: true, entries: entries });
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
  var sheet = getSheet_();

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
