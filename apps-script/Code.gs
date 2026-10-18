/**
 * DSA 400 — Google Sheet API
 * Bound script: open your Sheet → Extensions → Apps Script → paste this file.
 *
 * Sheet tab "Problems" columns (row 1 headers):
 *   A..I  ID | Category | Problem | Difficulty | Source | Tag | Link | Status | Last Reviewed
 *   J     Page      — ARRAYFORMULA in J1. Never written by script; writing it breaks every link.
 *   K..N  Priority | Premium | Remarks | Revisit
 *
 * Read wide (A:N), write narrow: every write touches only the cells it is changing, so no
 * write ever carries a stale copy of a cell you might be editing. Progress writes touch H:I
 * (Status, Last Reviewed) and N (Revisit) and nothing else. Remarks are yours: the sync fills
 * one only when it is still empty -- re-checked at the moment of writing -- and nothing in
 * this file ever clears or overwrites a remark.
 */

const SHEET = "Problems";
const CONFIG = "Config";
const HEADERS = [
  "ID",
  "Category",
  "Problem",
  "Difficulty",
  "Source",
  "Tag",
  "Link",
  "Status",
  "Last Reviewed",
];
const META = ["Priority", "Premium", "Remarks", "Revisit"]; // K, L, M, N
const META_COL = 11; // K
const READ_COLS = 14; // A:N
const PRIORITIES = ["Must", "High", "Medium", "Stretch"];

/**
 * THE SCHEMA. Every write in this file goes through one of these rules, so what may be
 * overwritten is decided here and nowhere else.
 *
 *   A..I  core problem + progress   Status / Last Reviewed (H:I) by set / bulk / reset; the rest by
 *                                   sync on append only -- except Category (B), rewritten when the
 *                                   CSV moves a problem to another section (same ID, same title),
 *                                   and Difficulty (D), Tag (F) and Link (G), which the CSV owns,
 *                                   per the policy below. A blank CSV Link never clears a cell.
 *   J     Page                      ARRAYFORMULA. Never written. Writing it breaks every link.
 *   K..N  meta                      written per the policy below
 *   O..   yours                     outside the schema: never read, never written
 *
 *   replace  the CSV owns it — refreshed on every sync
 *   fill     you own it — the sync writes it only into a cell that is still empty
 *   never    you own it — the sync never changes it, the same as Status
 */
const SYNC_POLICY = {
  Difficulty: "replace", // D
  Tag: "replace", // F
  Link: "replace", // G
  Priority: "replace", // K
  Premium: "replace", // L
  Remarks: "fill", // M
  Revisit: "never", // N
};
const SYNC_COL = {
  Difficulty: 4,
  Tag: 6,
  Link: 7,
  Priority: 11,
  Premium: 12,
  Remarks: 13,
  Revisit: 14,
};
const METAI = { Priority: 0, Premium: 1, Remarks: 2, Revisit: 3 };
const CSV_URL =
  "https://raw.githubusercontent.com/AyusofAyush/DSA-Problems-400/main/problems.csv";
/** A category the Sheet has never seen is accepted only if this many CSV rows use it.
 *  A real new section arrives with a handful of problems; a typo arrives alone. */
const NEW_CATEGORY_MIN = 3;
/** Remarks matching this are you telling yourself to come back -- used by seedRevisitFromRemarks. */
const REVISIT_HINT =
  /revis|revisit|redo|rethink|deeper analysis|explore|research|must\s/i;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DSA 400")
    .addItem("Preview sync from CSV", "previewSync")
    .addItem("Sync from CSV", "syncFromCsv")
    .addSeparator()
    .addItem("Upgrade schema", "upgradeSchema")
    .addItem("Flag Revisit from Remarks", "seedRevisitFromRemarks")
    .addToUi();
}

/** Run once from the editor after importing problems.csv. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0].setName(SHEET);
  sh.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight("bold");
  sh.setFrozenRows(1);

  // Config tab: your deployed page URL (GitHub Pages / Cloudflare Pages).
  let cfg = ss.getSheetByName(CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(CONFIG);
    cfg
      .getRange("A1:B1")
      .setValues([["Page URL", "https://YOUR-USERNAME.github.io/dsa-400/"]]);
    cfg.getRange("A1").setFontWeight("bold");
  }

  // Page column: "Open" link to each problem on the page. Auto-extends to new rows.
  sh.getRange("J1").setFormula(
    '={"Page"; ARRAYFORMULA(IF(A2:A="",, HYPERLINK(Config!$B$1 & "#p-" & A2:A, "Open")))}',
  );

  // Dropdowns
  const n = sh.getMaxRows() - 1;
  const dv = (vals) =>
    SpreadsheetApp.newDataValidation()
      .requireValueInList(vals, true)
      .setAllowInvalid(false)
      .build();
  sh.getRange(2, 4, n).setDataValidation(dv(["Easy", "Medium", "Hard"]));
  sh.getRange(2, 5, n).setDataValidation(dv(["LeetCode", "GFG"]));
  sh.getRange(2, 6, n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["Core"], true)
      .setAllowInvalid(true)
      .build(),
  );
  sh.getRange(2, 8, n).setDataValidation(dv(["Done", "Missed"]));

  // Colour Status cells
  const st = sh.getRange(2, 8, n);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Done")
      .setBackground("#e3f3e9")
      .setFontColor("#1d7a46")
      .setRanges([st])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($H2="Missed",$I2<>"")')
      .setBackground("#f8e6e1")
      .setFontColor("#b8432c")
      .setRanges([st])
      .build(),
  ]);

  fillDefaults_(sh);
  upgradeSchema();

  // Write key for saving progress from the page.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("WRITE_KEY"))
    props.setProperty("WRITE_KEY", Utilities.getUuid().slice(0, 12));
  Logger.log("WRITE_KEY = " + props.getProperty("WRITE_KEY"));
}

/** Adds the K..N headers, dropdowns and the Revisit checkbox rule. Changes no cell values. */
function upgradeSchema() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const head = sh.getRange(1, META_COL, 1, META.length);
  if (head.getValues()[0].join("|") !== META.join("|"))
    head.setValues([META]).setFontWeight("bold");
  const n = sh.getMaxRows() - 1;
  sh.getRange(2, META_COL, n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(PRIORITIES, true)
      .setAllowInvalid(true)
      .build(),
  );
  sh.getRange(2, META_COL + 1, n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["Yes", "No"], true)
      .setAllowInvalid(true)
      .build(),
  );
  // Revisit: a checkbox *validation rule* only. Never insertCheckboxes(): it sets every cell in
  // the range to FALSE, which would untick all your Revisit flags each time this runs.
  sh.getRange(2, META_COL + 3, n).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build(),
  );
  SpreadsheetApp.getActive().toast(
    "Priority / Premium / Remarks / Revisit ready.",
    "DSA 400",
    5,
  );
}

/** Blank Status -> Missed, blank ID -> next number. Runs on setup and on every read. */
function fillDefaults_(sh) {
  const last = lastDataRow_(sh);
  if (last < 2) return;
  const v = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  let maxId = v.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
  const ids = {},
    statuses = {};
  v.forEach((r, i) => {
    if (!String(r[2]).trim()) return; // no problem name: skip
    if (!r[0]) ids[i] = ++maxId;
    if (!r[7]) statuses[i] = "Missed";
  });
  writeCells_(sh, 1, ids);
  writeCells_(sh, 8, statuses);
}

/**
 * Write only the given cells of one column, grouped into contiguous runs, so a write never
 * carries a stale copy of a cell it isn't changing. `cells` maps a 0-based data index
 * (sheet row = index + 2) to its new value.
 */
function writeCells_(sh, col, cells) {
  const idx = Object.keys(cells)
    .map(Number)
    .sort((a, b) => a - b);
  for (let s = 0; s < idx.length; ) {
    let e = s;
    while (e + 1 < idx.length && idx[e + 1] === idx[e] + 1) e++;
    sh.getRange(idx[s] + 2, col, e - s + 1, 1).setValues(
      idx.slice(s, e + 1).map((i) => [cells[i]]),
    );
    s = e + 1;
  }
}

/**
 * Last row holding a real problem, found from column C.
 * getLastRow() is unreliable here: the J1 ARRAYFORMULA spans the whole column.
 */
function lastDataRow_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const col = sh.getRange(2, 3, n - 1, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--)
    if (String(col[i][0]).trim()) return i + 2;
  return 1;
}

function doGet() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    fillDefaults_(sh);
  } finally {
    lock.releaseLock();
  }
  const last = lastDataRow_(sh);
  const v = last < 2 ? [] : sh.getRange(2, 1, last - 1, READ_COLS).getValues();
  const rows = v
    .filter((r) => String(r[2]).trim())
    .map((r) => ({
      id: Number(r[0]),
      category: String(r[1]),
      problem: String(r[2]),
      difficulty: String(r[3]),
      source: String(r[4]),
      tag: String(r[5]),
      link: String(r[6]),
      status: String(r[7]),
      reviewed: r[8] ? new Date(r[8]).toISOString() : "",
      priority: String(r[10] || ""),
      premium: String(r[11] || ""),
      remarks: String(r[12] || ""),
      revisit:
        r[13] === true || /^(yes|true|y|1)$/i.test(String(r[13] || ""))
          ? "Yes"
          : "",
    }));
  return json_({ ok: true, rows });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "Bad request" });
  }
  const key = PropertiesService.getScriptProperties().getProperty("WRITE_KEY");
  if (!key || body.key !== key)
    return json_({
      ok: false,
      error: "Wrong write key. Open the page with ?key=YOUR_KEY.",
    });

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const last = lastDataRow_(sh);
    if (last < 2) return json_({ ok: true });
    const v = sh.getRange(2, 1, last - 1, HEADERS.length).getValues(); // read only
    const byId = {};
    v.forEach((r, i) => (byId[Number(r[0])] = i));
    const now = new Date();
    const status = {},
      reviewed = {}; // H and I -- the only progress columns written here
    const apply = (id, s) => {
      const i = byId[Number(id)];
      if (i === undefined) return;
      const reviewedNow = s === "Done" || s === "Missed";
      status[i] = reviewedNow ? s : "Missed"; // "Clear" = back to default, not reviewed
      reviewed[i] = reviewedNow ? now : "";
    };
    if (body.action === "revisit") {
      const i = byId[Number(body.id)];
      if (i === undefined)
        return json_({ ok: false, error: "Unknown problem id" });
      sh.getRange(i + 2, META_COL + METAI.Revisit).setValue(!!body.value); // N, this one cell
      return json_({ ok: true });
    }
    if (body.action === "set") apply(body.id, body.status);
    else if (body.action === "bulk")
      (body.items || []).forEach((x) => apply(x.id, x.status));
    else if (body.action === "reset") {
      const off = {};
      v.forEach((r, i) => {
        if (!String(r[2]).trim()) return;
        status[i] = "Missed";
        reviewed[i] = "";
        off[i] = false;
      });
      // progress includes the revisit flags
      if (body.scope !== "status")
        writeCells_(sh, META_COL + METAI.Revisit, off);
    } else return json_({ ok: false, error: "Unknown action" });
    writeCells_(sh, 8, status);
    writeCells_(sh, 9, reviewed);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

/**
 * One-time helper: tick Revisit for any problem whose Remark says you meant to come back.
 * Run it from the DSA 400 menu. It only ever sets the box, never clears one, and it reads
 * your Remarks without writing them.
 */
function seedRevisitFromRemarks() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let n = 0;
  try {
    const last = lastDataRow_(sh);
    if (last < 2) return;
    // M and N are read together; only N is ever written, and only the boxes being ticked.
    const v = sh
      .getRange(2, META_COL + METAI.Remarks, last - 1, 2)
      .getValues();
    const tick = {};
    v.forEach((r, i) => {
      const already =
        r[1] === true || /^(yes|true|y|1)$/i.test(String(r[1] || ""));
      if (!already && REVISIT_HINT.test(String(r[0] || ""))) {
        tick[i] = true;
        n++;
      }
    });
    writeCells_(sh, META_COL + METAI.Revisit, tick);
  } finally {
    lock.releaseLock();
  }
  const msg =
    "Flagged " +
    n +
    " problem(s) for revision, from what your Remarks already said.";
  try {
    SpreadsheetApp.getUi().alert(
      "Revisit flags",
      msg,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    Logger.log(msg);
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/* ===== CSV sync =====================================================
 * Pull model: reads problems.csv straight from GitHub, so there is no key to
 * keep anywhere. Append-only for rows; Tag/Priority/Premium refreshed in place;
 * Remarks filled only where the cell is still empty; Revisit never touched; a
 * problem the CSV puts in another section has only its Category cell rewritten. Rows are never
 * reordered, renumbered or rewritten from CSV order — that is what would
 * silently detach your Remarks from their problems. An ID the CSV gives to a
 * different problem than the Sheet has is a conflict: reported, never written.
 */

function previewSync() {
  syncCsv_(true);
}
function syncFromCsv() {
  syncCsv_(false);
}

const norm_ = (s) =>
  String(s == null ? "" : s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function syncCsv_(dryRun) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET);
  const ui = (() => {
    try {
      return SpreadsheetApp.getUi();
    } catch (e) {
      return null;
    }
  })();

  const text = UrlFetchApp.fetch(CSV_URL, {
    muteHttpExceptions: true,
  }).getContentText();
  const table = Utilities.parseCsv(text);
  if (!table.length) throw new Error("CSV is empty or unreachable.");
  const head = table[0].map((h) => String(h).trim());
  const col = {};
  head.forEach((h, i) => (col[h] = i));
  ["ID", "Category", "Problem"].forEach((h) => {
    if (col[h] === undefined)
      throw new Error("CSV is missing the " + h + " column.");
  });
  const cell = (r, h) =>
    col[h] === undefined
      ? ""
      : String(r[col[h]] == null ? "" : r[col[h]]).trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const last = lastDataRow_(sh);
    const sheetRows =
      last < 2 ? [] : sh.getRange(2, 1, last - 1, READ_COLS).getValues();

    // Index the Sheet three ways. Category|Problem is the normal match; the same ID holding the
    // same title, or a title that appears exactly once, means the CSV moved it to another section.
    const byKey = {},
      byId = {},
      byTitle = {},
      known = {},
      used = {};
    let spare = 0;
    sheetRows.forEach((r, i) => {
      const id = Number(r[0]) || 0;
      if (id) {
        used[id] = 1;
        spare = Math.max(spare, id);
      }
      if (!String(r[2]).trim()) return;
      const t = norm_(r[2]);
      byKey[norm_(r[1]) + "|" + t] = i;
      if (id) byId[id] = i;
      byTitle[t] = byTitle[t] === undefined ? i : -1; // -1: ambiguous, never matched on
      known[norm_(r[1])] = String(r[1]);
    });
    // New rows without an ID get numbers above everything in the Sheet *and* the CSV.
    table.slice(1).forEach((r) => {
      spare = Math.max(spare, Number(cell(r, "ID")) || 0);
    });

    // Count how many CSV rows use each category, so a new section can be told from a typo.
    const csvCatCount = {};
    table.slice(1).forEach((r) => {
      const c = norm_(cell(r, "Category"));
      if (c && cell(r, "Problem")) csvCatCount[c] = (csvCatCount[c] || 0) + 1;
    });
    const acceptCat = (c) =>
      !!known[norm_(c)] || (csvCatCount[norm_(c)] || 0) >= NEW_CATEGORY_MIN;

    const match = (r) => {
      const p = norm_(cell(r, "Problem")),
        c = norm_(cell(r, "Category")),
        id = Number(cell(r, "ID")) || 0;
      let i = byKey[c + "|" + p];
      if (i !== undefined) return { i: i, moved: false };
      i = byId[id];
      if (i !== undefined && norm_(sheetRows[i][2]) === p)
        return { i: i, moved: true };
      i = byTitle[p];
      if (i !== undefined && i >= 0) return { i: i, moved: true };
      if (id && used[id]) return { conflict: true }; // that ID belongs to a different problem
      return null;
    };

    const adds = [],
      badCat = [],
      newCats = {},
      notes = [],
      moves = {},
      conflicts = [];
    // What the sync will change, cell by cell. Nothing else on an existing row is written.
    const cats = {}; // B: rows that move section
    // D, F, G, K, L: CSV-owned cells that differ
    const changes = {
      Difficulty: {},
      Tag: {},
      Link: {},
      Priority: {},
      Premium: {},
    };
    const fills = []; // M: remarks for cells that are empty -- re-checked when written
    const countNew = (c) => {
      if (!known[norm_(c)]) newCats[c] = (newCats[c] || 0) + 1;
    };

    table.slice(1).forEach((r) => {
      const problem = cell(r, "Problem");
      if (!problem) return;
      const category = cell(r, "Category");
      const pri = cell(r, "Priority"),
        prem = cell(r, "Premium"),
        rem = cell(r, "Remarks");
      const m = match(r);
      if (m && m.conflict) {
        conflicts.push(
          "ID " +
            cell(r, "ID") +
            ': CSV says "' +
            problem +
            '", the Sheet has a different problem',
        );
        return;
      }
      if (!m) {
        if (!acceptCat(category)) {
          badCat.push(category + " — " + problem);
          return;
        }
        let id = Number(cell(r, "ID")) || 0;
        if (!id) id = ++spare;
        used[id] = 1;
        countNew(category);
        adds.push({ r: r, id: id, pri: pri, prem: prem, rem: rem });
        return;
      }
      const i = m.i;
      if (m.moved) {
        if (!acceptCat(category)) {
          badCat.push(category + " — " + problem + " (move skipped)");
          return;
        }
        const label = String(sheetRows[i][1]) + "  →  " + category;
        moves[label] = (moves[label] || 0) + 1;
        cats[i] = category; // only column B changes: the row, its progress and Remarks stay put
        countNew(category);
      }
      // Every column the sync may touch on an existing row is decided by SYNC_POLICY.
      const put = (name, val) => {
        const raw = sheetRows[i][SYNC_COL[name] - 1],
          cur = String(raw == null ? "" : raw).trim();
        if (SYNC_POLICY[name] === "never" || !val || cur === val) return;
        if (SYNC_POLICY[name] === "fill") {
          if (cur) return; // yours, already written -- leave it
          fills.push({ i: i, val: val });
        } else changes[name][i] = val;
        notes.push(name.toLowerCase() + ": " + problem);
      };
      put("Difficulty", cell(r, "Difficulty"));
      put("Tag", cell(r, "Tag"));
      put("Link", cell(r, "Link"));
      put("Priority", pri);
      put("Premium", prem);
      put("Remarks", rem);
    });

    const nMoves = Object.keys(moves).reduce((a, k) => a + moves[k], 0);

    // The rows an append will use must be empty: never write over anything below your data.
    // (FALSE is an empty checkbox, not data.)
    let blocker = "";
    const room = Math.min(adds.length, sh.getMaxRows() - last);
    if (room > 0) {
      const below = sh.getRange(last + 1, 1, room, READ_COLS).getValues();
      const k = below.findIndex((r) =>
        r.some((x, j) => j !== 9 && x !== false && String(x).trim() !== ""),
      );
      if (k >= 0)
        blocker =
          "STOPPED — row " +
          (last + 1 + k) +
          " is below your last problem but is not empty, and new problems would be " +
          "written over it. Nothing was synced. Move or clear that row, then sync again.\n\n";
    }

    const msg =
      blocker +
      "Append " +
      adds.length +
      " new problem(s); move " +
      nMoves +
      " to another section; update " +
      notes.length +
      " cell(s)." +
      (Object.keys(newCats).length
        ? "\n\nNEW SECTION(S):\n• " +
          Object.keys(newCats)
            .map((c) => c + " (" + newCats[c] + " problems)")
            .join("\n• ")
        : "") +
      (nMoves
        ? "\n\nMoved (same row and ID — progress, Remarks and Revisit stay with the problem):\n• " +
          Object.keys(moves)
            .map((k) => k + " (" + moves[k] + ")")
            .join("\n• ")
        : "") +
      (conflicts.length
        ? "\n\nCONFLICTS — skipped, nothing written. Give one of them a new ID:\n• " +
          conflicts.join("\n• ")
        : "") +
      (badCat.length
        ? "\n\nSkipped — unknown Category, and too few rows to be a new section\n(looks like a typo; fix the CSV or add the row by hand):\n• " +
          badCat.join("\n• ")
        : "") +
      (adds.length
        ? "\n\nNew:\n• " + adds.map((a) => cell(a.r, "Problem")).join("\n• ")
        : "");

    if (dryRun || blocker) {
      if (ui) ui.alert(blocker ? "Sync stopped" : "Sync preview", msg, ui.ButtonSet.OK);
      else Logger.log(msg);
      return;
    }

    // 1) Append new rows: A:I, then K:N. Column J is left to its ARRAYFORMULA.
    if (adds.length) {
      const need = last + adds.length;
      if (need > sh.getMaxRows())
        sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
      const core = adds.map((a) => {
        return [
          a.id,
          cell(a.r, "Category"),
          cell(a.r, "Problem"),
          cell(a.r, "Difficulty"),
          cell(a.r, "Source"),
          cell(a.r, "Tag"),
          cell(a.r, "Link"),
          cell(a.r, "Status") || "Missed",
          "",
        ];
      });
      sh.getRange(last + 1, 1, core.length, HEADERS.length).setValues(core);
      sh.getRange(last + 1, META_COL, core.length, META.length).setValues(
        adds.map((a) => [a.pri, a.prem, a.rem, ""]),
      );
    }

    // 2) Existing rows: only the cells that change. Nothing is reordered; N is never written.
    writeCells_(sh, 2, cats);
    Object.keys(changes).forEach((name) =>
      writeCells_(sh, SYNC_COL[name], changes[name]),
    );

    // 3) Remarks: re-read each target cell first, so a remark you typed while the sync was
    //    running is never overwritten.
    fills.forEach((f) => {
      const c = sh.getRange(f.i + 2, SYNC_COL.Remarks);
      if (!String(c.getValue()).trim()) c.setValue(f.val);
    });

    if (adds.length) upgradeSchema(); // new rows need the dropdowns and the Revisit checkbox rule
    if (ui) ui.alert("Sync done", msg, ui.ButtonSet.OK);
    else Logger.log(msg);
  } finally {
    lock.releaseLock();
  }
}
