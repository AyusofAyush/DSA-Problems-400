# DSA 400 — project context

A single-page DSA revision checklist — **767 problems in 24 sections** — served as a static page
and backed by a Google Sheet that holds both the problem list and the user's review progress.
The name stays "DSA 400" (repo, domain, Sheet) regardless of the count.
Live at `dsa400.skutirx.com` (`CNAME`); repo `AyusofAyush/DSA-Problems-400` (**public**), branch `main`.

## Layout

```
index.html            # the whole app: HTML + CSS + JS, no build step, no dependencies
problems.csv          # the 767 problems: seed for a new Sheet, sync source for an existing one
apps-script/Code.gs   # Google Apps Script bound to the Sheet: JSON API + CSV sync + menu
ONBOARDING.md         # how to add / move problems safely — read before touching problems.csv
README.md             # setup guide for anyone building their own copy
CNAME                 # custom domain for the static host
```

No package.json, bundler or test suite in the repo. Pushing `index.html` is the whole page deploy.

## The Sheet schema — who owns which column

`Problems` tab. The CSV's header is these same 14 columns in the same order, so a fresh
*File → Import* of `problems.csv` lands cell-for-cell (the CSV's `Page` column is always empty).

| Col | Field | Owner | Written by |
|---|---|---|---|
| A | ID | CSV | append only. Primary key for progress, `#p-<ID>` links and section moves. Never renumber. |
| B | Category | CSV | append; rewritten in place when the CSV moves a problem (same ID + title) |
| C, E | Problem, Source | CSV | append only. Renaming a title in the CSV makes its ID a **conflict** — keep the old title |
| D | Difficulty | CSV | `replace` |
| F | Tag | CSV | `replace` on sync — `Core` or blank |
| G | Link | CSV | `replace` — a blank CSV link never clears the cell (the page derives one) |
| H–I | Status, Last Reviewed | **user** | only the page's `set` / `bulk` / `reset` |
| J | Page | formula in J1 | **never** — `={"Page"; ARRAYFORMULA(… Config!$B$1 & "#p-" & A2:A …)}` |
| K | Priority | CSV | `replace` — `Must` / `High` / `Medium` / `Stretch` |
| L | Premium | CSV | `replace` — `Yes` / `No` |
| M | Remarks | **user** | `fill`: sync writes only into a cell still empty at that instant |
| N | Revisit | **user** | page's `revisit` / `reset`, menu's *Flag Revisit from Remarks*. Sync: `never` |
| O… | — | user | outside the schema: never read, never written (user keeps 6 notes in O) |

`SYNC_POLICY` + `SYNC_COL` at the top of `Code.gs` are the single source of truth for the
replace / fill / never rules. Change ownership there, not in scattered `if`s.

## Write discipline (Code.gs) — the invariants everything else relies on

- **Every write touches only the cells it changes.** `writeCells_(sh, col, {dataIndex: value})`
  groups changed cells into contiguous runs. Nothing writes back a snapshot of a whole column,
  because a snapshot reverts anything the user edits in the Sheet between the read and the write.
- **Remarks are only ever filled, never cleared or overwritten** — each fill re-reads its cell
  first (`getValue`) and skips it if the user typed something meanwhile.
- **Never call `insertCheckboxes()`.** Per Google's docs it sets every cell in the range to FALSE —
  run on column N it unticks every Revisit flag. Use
  `setDataValidation(newDataValidation().requireCheckbox().build())`, which changes no values.
  Revisit cells hold real booleans; empty reads as unchecked.
- **Appends never overwrite.** The sync checks the rows below the last problem are empty
  (ignoring J and FALSE) before appending; otherwise it reports `STOPPED — row N` and writes nothing.
- `upgradeSchema()` writes the K1:N1 headers only if they differ, and the sync re-runs it only
  after appending — so a sync with nothing to do makes zero writes.
- The Sheet's zone is `TZ` (`Asia/Kolkata`, IST). Date-time cells store zone-less wall-clock time,
  so `useTimeZone_` (called by `upgradeSchema`) reads Last Reviewed as instants, switches the zone,
  and writes those instants back — once; on `TZ` it is a no-op. Never just flip the zone setting.
- `lastDataRow_` scans column C; `getLastRow()` is unreliable under the J1 formula and checkboxes.
- All writers take `LockService.getScriptLock()`.

## The sync (`DSA 400` menu → Preview / Sync from CSV)

Pulls `problems.csv` from `CSV_URL` (raw.githubusercontent.com — public repo, so no secret).
For each CSV row, the match order is:

1. `Category|Problem` (normalised) → existing row, nothing moves.
2. Same ID **and** same title → a deliberate **move**: only column B changes.
3. Title that appears exactly once in the Sheet → also a move.
4. ID owned by a *different* problem → **conflict**: reported, nothing written.
5. Otherwise → append, using the CSV's ID (or, if blank, one above every ID in Sheet *and* CSV).

A category the Sheet doesn't know — for an append *or* a move — is accepted only if at least
`NEW_CATEGORY_MIN` (3) CSV rows use it; a lone one is a typo and is skipped. Sections are ordered
by the first Sheet row carrying them, which is why `Union-Find (DSU)` (first member: ID 246)
sits right after `Graphs: BFS / DFS`. Re-running is idempotent: `Append 0; move 0; update 0`.

Other menu items: **Upgrade schema** (headers + dropdowns + checkbox rule, no values) and
**Flag Revisit from Remarks** (ticks N where M matches `REVISIT_HINT`; only ticks, only N).

## API (web app, `API_URL` in index.html)

- `doGet` → `{ok, rows}` with `priority, premium, remarks, revisit` (`true`/"Yes" → `'Yes'`).
  It runs `fillDefaults_` first (blank ID → next number, blank Status → `Missed`).
- `doPost` (needs `body.key === WRITE_KEY` script property): `set`, `bulk` → H:I of those rows;
  `revisit` → one N cell; `reset` → H:I and N for all rows. Page writes can't reach M by construction.
- `Status` is `Done`/`Missed`; the page's "Clear" = `Missed` with empty Last Reviewed (never reviewed).

## Page (index.html)

- `fromSheet` maps rows to `{id, t, d:E|M|H, s:L|G|X (Custom), g:C|"", k, u, st, at, p, pm, rm, rv}`.
  A legacy `Teradata` tag reads as `C` so an un-synced Sheet still works; the tag is retired.
- `groups()`: sections are categories normally, priority buckets while a Review filter is on —
  each problem renders in exactly one section, so `#p-<id>` stays unique. `refreshRow` falls back
  to `render()` whenever any filter is active.
- Row classes via one list: `got`/`miss` (Status), `mustdo` (a `Must` with no mark — `--must`
  violet, defined in all three theme blocks), `flag` (Revisit).
- Filters: scope (All / Core only / Hide premium), status (… / ↻ Flagged), review priority.
- Reset is a modal; the destructive button stays disabled until an acknowledgement is ticked.
- Remarks are read-only on the page, rendered through `esc()`.

## Offline / degraded behaviour (deliberate — keep it working)

- `BUILTIN`: the whole list inlined as one JSON line. Fallback when the Sheet is unreachable.
  **Regenerate it from `problems.csv` after every list change** (script in ONBOARDING.md); the
  live Sheet and BUILTIN must agree section by section. It carries no Revisit (that's user state).
- localStorage: `td400:v1` (offline progress — legacy prefix), `dsa400:sheet-cache`,
  `dsa400:write-key` (captured once from `?key=…`, then stripped from the URL). All via `lsGet`/`lsSet`.
- An old deployed `doGet` (9 columns) still renders, just without chips; ↻ Revise against an old
  `doPost` keeps the flag locally and toasts the error.

## Conventions

- Vanilla JS in one `<script>`; terse helpers (`$`, `esc`, `slugOf`, `lcSlug`); sparse comments.
- `Code.gs` is Prettier-formatted (double quotes, trailing commas) — the user's editor formats on save.
- CSS tokens live on `:root`; the page is one reading column with a sticky toolbar.
- Missing links are derived: LeetCode from the title slug, GFG as a Google search URL.
- Every Must/High problem is tagged `Core`; every coding section has at least one `Must`.
- `Must` = the trick *is* the solution and is easy to forget (Median of Two Sorted Arrays, Trapping
  Rain Water, Copy List with Random Pointer, Boyer-Moore, reservoir sampling …) plus the core
  canon. **SQL is never `Must`** — the user wants the Must list to be coding problems only.
- Links are checked against `https://leetcode.com/api/problems/all/` (title, slug, difficulty,
  `paid_only`). LeetCode renames problems (596 → "Classes With at Least 5 Students", 627 →
  "Swap Sex of Employees"); fix the `Link`, keep our title.

## Gotchas

- After editing `Code.gs`: **Deploy → Manage deployments → Edit → New version**. A *new
  deployment* changes the URL, `API_URL` stops resolving, and the page silently falls back to BUILTIN.
  Menu functions run the saved code immediately; only the web app needs the new version.
- **Never commit `*.xlsx`.** The user exports their Sheet as a workbook for review; it contains
  their remarks and progress, and the repo is public.
- `problems.csv` quotes three fields that contain commas — use a real CSV parser, never `split(",")`.
- Check `Category|Problem` *and* the bare title before adding: 13 of one 20-problem list were already
  present, and a duplicate on a fresh ID silently splits progress.
- To restructure sections, change Category in the CSV and **keep the ID** — that's how
  `Union-Find (DSU)` was carved out (246, 247, 259–263 moved in) and the old
  "Topo Sort, Union-Find & Shortest Path" became "Topo Sort, Shortest Path & MST".

## Verification standard

Coverage is verified, not asserted: Blind 75, NeetCode 150, Grind 169, Striver's SDE sheet and a
52-problem FAANG-favourites list are each 100% present. algotracker.in (pure JSON: `dsaWithId-problems.json`,
`{maang,blind75,leetcode150,sql}-problems.json`; its "Blind75" tab is really LeetCode 75) was audited
2026-10-18: every Top Interview 150 problem is in except Length of Last Word, Average of Levels and
N-Queens II (trivial / duplicate); LeetCode 75 is in except its trivial Easies. **No school-level or
pattern-printing problems** (the user's rule) — GCD stays on purpose (recursion drill); Palindrome
Number was removed. Single-company MAANG entries are mostly recent contest problems and were skipped. and all 11 DP families (linear, grid,
knapsack, LCS/LIS, interval, trees, bitmask, strings, state machine, digit, probability) have their
canonical problems. Re-run such an audit before calling the list complete again.

Sync changes were verified by executing the real `Code.gs` in node against a mock Sheet seeded
cell-for-cell from the user's workbook, with Google APIs modelled on their documented behaviour
(including `insertCheckboxes` → FALSE). Do the same for any future change to a write path —
including the user editing the Sheet mid-sync, and a fresh Import + `setup()`.

## State as of 2026-10-18

- Live Sheet: 674 problems (synced), 333 remarks in M, 43 Revisit flags, 6 notes in O. Sheet A:N
  matched `problems.csv` cell-for-cell before this change.
- Pending (not yet pushed / pasted): 94 new problems (675–768), 62 promotions to `Must`, SQL
  demoted out of `Must`, dead links 467 / 468 / 559 fixed, Difficulty 423 / 501 and Premium 407
  corrected, `Code.gs` now `replace`s Difficulty + Link, and ID 604 Palindrome Number removed from
  the CSV (school level). With the new `Code.gs` pasted, *Preview sync* should read exactly:
  `Append 94 new problem(s); move 0 to another section; update 113 cell(s).`
  (Priority 67, Remarks 33 fills, Tag 7, Link 3, Difficulty 2, Premium 1); a re-run reads 0/0/0.
  The sync never deletes, so Sheet row 605 (ID 604) must be deleted by hand for Sheet = CSV.
- `dsa 400 problems_v1.xlsx` was committed in 745de94 and is public on GitHub — see Gotchas.
