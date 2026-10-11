# DSA 400

Category-wise DSA revision sheet. A static page (`index.html`) backed by a Google Sheet that stores the problem list and your progress.

- **Sheet = source of truth.** Add a row in the Sheet and it shows up on the page.
- **Status defaults to `Missed`.** Marking *Got it* on the page sets `Done`. An empty `Last Reviewed` date means not reviewed yet.
- **Each Sheet row links to the page** (`Page` column → `…/#p-<ID>`), which scrolls to and highlights that problem.
- **Works without the Sheet too.** If `API_URL` is empty or unreachable, progress saves in the browser.

```
dsa-400/
├── index.html            # the page (deploy this)
├── problems.csv          # 400 seed problems for the Sheet
└── apps-script/Code.gs   # Sheet API (paste into Apps Script)
```

## Setup (about 10 minutes)

### 1. Create the Sheet
1. Create a new Google Sheet named **DSA 400**.
2. **File → Import → Upload** `problems.csv` → *Replace current sheet*.

### 2. Add the API
1. In the Sheet: **Extensions → Apps Script**. Replace the default code with `apps-script/Code.gs`. Save.
2. Choose `setup` in the function dropdown → **Run** → approve the permissions.
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
Add a row in the Sheet with at least **Category** and **Problem**.
- `ID` and `Status` (`Missed`) fill in automatically on the next page load.
- `Link` is optional: LeetCode links are built from the title, and GFG opens a search.
- A new Category value creates a new section on the page.
- Keep IDs unique and don't renumber them, because progress and page links are keyed by ID.

## Notes
- **After editing `Code.gs`:** use **Deploy → Manage deployments → Edit → New version**. This keeps the same URL.
- **Anyone with the page can read your list.** Writes need the key. To rotate it: Apps Script → Project Settings → Script properties → `WRITE_KEY`.
- **Moving existing progress:** progress already made in a browser moves into the Sheet automatically, the first time you connect with the key while the Sheet has no reviews yet.
