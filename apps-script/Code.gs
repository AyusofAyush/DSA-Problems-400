/**
 * DSA 400 — Google Sheet API
 * Bound script: open your Sheet → Extensions → Apps Script → paste this file.
 *
 * Sheet tab "Problems" columns (row 1 headers):
 *   ID | Category | Problem | Difficulty | Source | Tag | Link | Status | Last Reviewed | Page
 * Status is "Done" or "Missed" (default Missed). "Last Reviewed" empty = not reviewed yet.
 */

const SHEET = 'Problems';
const CONFIG = 'Config';
const HEADERS = ['ID', 'Category', 'Problem', 'Difficulty', 'Source', 'Tag', 'Link', 'Status', 'Last Reviewed'];

/** Run once from the editor after importing problems.csv. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0].setName(SHEET);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);

  // Config tab: your deployed page URL (GitHub Pages / Cloudflare Pages).
  let cfg = ss.getSheetByName(CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(CONFIG);
    cfg.getRange('A1:B1').setValues([['Page URL', 'https://YOUR-USERNAME.github.io/dsa-400/']]);
    cfg.getRange('A1').setFontWeight('bold');
  }

  // Page column: "Open" link to each problem on the page. Auto-extends to new rows.
  sh.getRange('J1').setFormula(
    '={"Page"; ARRAYFORMULA(IF(A2:A="",, HYPERLINK(Config!$B$1 & "#p-" & A2:A, "Open")))}'
  );

  // Dropdowns
  const n = sh.getMaxRows() - 1;
  const dv = (vals) => SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(false).build();
  sh.getRange(2, 4, n).setDataValidation(dv(['Easy', 'Medium', 'Hard']));
  sh.getRange(2, 5, n).setDataValidation(dv(['LeetCode', 'GFG']));
  sh.getRange(2, 6, n).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Teradata', 'Core'], true).setAllowInvalid(true).build());
  sh.getRange(2, 8, n).setDataValidation(dv(['Done', 'Missed']));

  // Colour Status cells
  const st = sh.getRange(2, 8, n);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Done').setBackground('#e3f3e9').setFontColor('#1d7a46').setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($H2="Missed",$I2<>"")').setBackground('#f8e6e1').setFontColor('#b8432c').setRanges([st]).build(),
  ]);

  fillDefaults_(sh);

  // Write key for saving progress from the page.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WRITE_KEY')) props.setProperty('WRITE_KEY', Utilities.getUuid().slice(0, 12));
  Logger.log('WRITE_KEY = ' + props.getProperty('WRITE_KEY'));
}

/** Blank Status -> Missed, blank ID -> next number. Runs on setup and on every read. */
function fillDefaults_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const rng = sh.getRange(2, 1, last - 1, HEADERS.length);
  const v = rng.getValues();
  let maxId = v.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
  let changed = false;
  v.forEach(r => {
    if (!String(r[2]).trim()) return;           // no problem name: skip
    if (!r[0]) { r[0] = ++maxId; changed = true; }
    if (!r[7]) { r[7] = 'Missed'; changed = true; }
  });
  if (changed) rng.setValues(v);
}

function doGet() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { fillDefaults_(sh); } finally { lock.releaseLock(); }
  const last = sh.getLastRow();
  const v = last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const rows = v.filter(r => String(r[2]).trim()).map(r => ({
    id: Number(r[0]), category: String(r[1]), problem: String(r[2]), difficulty: String(r[3]),
    source: String(r[4]), tag: String(r[5]), link: String(r[6]), status: String(r[7]),
    reviewed: r[8] ? new Date(r[8]).toISOString() : ''
  }));
  return json_({ ok: true, rows });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  const key = PropertiesService.getScriptProperties().getProperty('WRITE_KEY');
  if (!key || body.key !== key) return json_({ ok: false, error: 'Wrong write key. Open the page with ?key=YOUR_KEY.' });

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const last = sh.getLastRow();
    if (last < 2) return json_({ ok: true });
    const rng = sh.getRange(2, 1, last - 1, HEADERS.length);
    const v = rng.getValues();
    const byId = {};
    v.forEach((r, i) => byId[Number(r[0])] = i);
    const now = new Date();
    const apply = (id, status) => {
      const i = byId[Number(id)];
      if (i === undefined) return;
      if (status === 'Done' || status === 'Missed') { v[i][7] = status; v[i][8] = now; }
      else { v[i][7] = 'Missed'; v[i][8] = ''; }        // "Clear" = back to default, not reviewed
    };
    if (body.action === 'set') apply(body.id, body.status);
    else if (body.action === 'bulk') (body.items || []).forEach(x => apply(x.id, x.status));
    else if (body.action === 'reset') v.forEach(r => { if (String(r[2]).trim()) { r[7] = 'Missed'; r[8] = ''; } });
    else return json_({ ok: false, error: 'Unknown action' });
    rng.setValues(v);
  } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
