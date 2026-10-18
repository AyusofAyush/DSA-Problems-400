# DSA 400

A category-wise DSA revision sheet: **674 problems across 24 sections**, built for the last
week before interviews. A static page (`index.html`) backed by a Google Sheet that stores the
problem list and your progress. No build step, no dependencies, no server.

- **128 problems marked `Must`** — the canon you revise first.
- **Priority filter** groups the page into Must / High / Medium / Stretch instead of categories.
- **Remarks** from the Sheet show under each problem; **↻ Revise** flags anything you want another pass at.
- **Complete against the standard lists**: Blind 75, NeetCode 150, Grind 169 and Striver's SDE sheet
  are each covered 100%, plus the problems Meta, Google, Amazon and Microsoft ask most.
- Covers all 11 DP pattern families (linear, grid, knapsack, LCS/LIS, interval, trees, bitmask,
  strings, state machine, digit, probability), a dedicated Union-Find (DSU) section, segment trees and
  Fenwick trees, 77 LeetCode Premium problems, 109 GFG problems, and the algorithms interviews assume rather than ask (sorts, sieve, GCD, KMP, Rabin-Karp).

- **Sheet = source of truth.** Add a row in the Sheet and it shows up on the page. The page
  always reads the Sheet live; `problems.csv` is the seed and the sync source, never read by
  the browser.
- **Priority, Premium and Remarks.** `Priority` (`Must`/`High`/`Medium`/`Stretch`) drives the
  **Review** filter on the page; `Remarks` show as a note under the problem. Both are read-only
  on the page — the Sheet is where you edit them.
- **Status defaults to `Missed`.** Marking *Got it* on the page sets `Done`. An empty `Last Reviewed` date means not reviewed yet.
- **Each Sheet row links to the page** (`Page` column → `…/#p-<ID>`), which scrolls to and highlights that problem.
- **Works without the Sheet too.** If `API_URL` is empty or unreachable, progress saves in the browser.

```
dsa-400/
├── index.html            # the page (deploy this)
├── problems.csv          # the 674 problems — the source for the Sheet
├── apps-script/Code.gs   # Sheet API + CSV sync (paste into Apps Script)
└── ONBOARDING.md         # how to add problems without breaking progress
```

### The Sheet's columns

| | Column | Owner | Notes |
| --- | --- | --- | --- |
| A–G | ID … Link | the CSV | `Category` and `Tag` follow the CSV, so problems can move sections safely |
| H–I | Status, Last Reviewed | **you** | your progress — only the page's buttons write these |
| J | Page | a formula | `#p-<ID>` link back to the page — never edit |
| K | Priority | the CSV | `Must` / `High` / `Medium` / `Stretch` |
| L | Premium | the CSV | needs LeetCode Premium |
| M | **Remarks** | **you** | shown on the page; the sync never overwrites these |
| N | **Revisit** | **you** | the ↻ Revise checkbox |

## Setup (about 10 minutes)

### 0. Fork it
Fork this repo, or download it, so you have your own `problems.csv` to point the sync at.
If you fork, update `CSV_URL` at the top of `apps-script/Code.gs` to your own repo.

### 1. Create the Sheet
1. Create a new Google Sheet named **DSA 400**.
2. **File → Import → Upload** `problems.csv` → *Replace current sheet*.
   The CSV's columns match the Sheet's `A`–`N` exactly (its `Page` column is left empty for the
   formula), so everything lands in the right place.
   **Only ever do this for a brand-new Sheet** — on an existing one it replaces your progress
   and remarks. Existing Sheets get new problems through **DSA 400 → Sync from CSV**.

### 2. Add the API
1. In the Sheet: **Extensions → Apps Script**. Replace the default code with `apps-script/Code.gs`. Save.
2. Choose `setup` in the function dropdown → **Run** → approve the permissions.
   This creates the headers, the dropdowns, the `Page` formula and the Revisit checkboxes.
3. Open **Executions** (or View → Logs) and copy the printed **WRITE_KEY**.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the **Web app URL** (ends in `/exec`).

### 3. Deploy the page
1. In `index.html`, set `const API_URL = "https://script.google.com/macros/s/…/exec";`
2. Push to a GitHub repo, then enable **Settings → Pages → Deploy from branch (main, /root)**.
   Or connect the repo to **Cloudflare Pages** (no build command, output dir `/`).
3. Put the final page URL in the Sheet's **Config** tab, cell **B1** (for example `https://YOUR-USERNAME.github.io/dsa-400/`). The `Page` column links update automatically.

### 4. Enable saving on each device
Open the page once as `https://…/dsa-400/?key=YOUR_WRITE_KEY`. The key is stored in that browser and removed from the address bar. Without it the page is read-only.

## Adding problems later

Two ways.

**From `problems.csv` (preferred).** Add a row — at least `Category` and `Problem` — push to
GitHub, then in the Sheet use **DSA 400 → Preview sync from CSV** to see what it would do, and
**DSA 400 → Sync from CSV** to apply it. The sync:

- appends only problems whose `Category|Problem` is not already in the Sheet, so re-running it
  is safe and never duplicates;
- refreshes `Priority` and `Premium` on existing rows, matched by problem, never by row number;
- fills `Remarks` only where the cell is still empty, so anything you typed is never overwritten;
- skips rows whose `Category` is not one of the existing ones, rather than silently creating a
  new section from a typo;
- never touches `Status`, `Last Reviewed` or the `Page` formula.

**Straight in the Sheet.** Add a row with at least **Category** and **Problem**.
- `ID` and `Status` (`Missed`) fill in automatically on the next page load.
- `Link` is optional: LeetCode links are built from the title, and GFG opens a search.
- A new Category value creates a new section on the page.
- Keep IDs unique and don't renumber them, because progress and page links are keyed by ID.

## Using the page

- **✓ Got it / ✗ Missed** record a review and stamp `Last Reviewed`.
- **↻ Revise** flags a problem you got through but want another pass at. Filter to them with **↻ Flagged**.
- **Review** filter regroups the page by priority — start at *Must review*.
- **Core only** hides the long tail; **Hide premium** hides the 77 problems needing LeetCode Premium.
- **Reset progress** asks for an explicit acknowledgement before clearing anything, and never
  touches your Remarks or Priorities.

## Notes
- **After editing `Code.gs`:** use **Deploy → Manage deployments → Edit → New version**. This keeps the same URL.
- **Anyone with the page can read your list.** Writes need the key. To rotate it: Apps Script → Project Settings → Script properties → `WRITE_KEY`.
- **Moving existing progress:** progress already made in a browser moves into the Sheet automatically, the first time you connect with the key while the Sheet has no reviews yet.
- **Your Remarks are safe.** The sync fills a Remark only when the cell is empty, and never
  writes the Revisit column at all. `SYNC_POLICY` at the top of `Code.gs` is the single place
  that decides this. See [ONBOARDING.md](ONBOARDING.md).
- **Upgrading from an older copy?** Nothing breaks. A Sheet without the `K`–`N` columns still
  loads (the page just shows no chips), and a legacy `Teradata` tag reads as `Core`. Run
  **DSA 400 → Upgrade schema** once to add the new columns.
