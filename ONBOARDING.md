# Adding problems

How to grow this list without breaking the progress you have already made.

The short version: **edit `problems.csv`, push, then run the sync from the Sheet menu.**
Everything below explains why that is safe and what to do when it is not.

---

## The one rule

**Rows are appended. Nothing is ever renumbered, reordered or rewritten.**

Your progress (`Status`, `Last Reviewed`, `Revisit`) and your `Remarks` are tied to a row.
`Remarks` in particular are tied to a row *position*, not to an ID — nothing in the Sheet
links the text "Revise Moore Voting Algo" to problem 12 except the fact that both sit on
row 13. So if anything ever rewrote the sheet in CSV order, every remark below the first
mismatch would silently reattach to the wrong problem.

That is why the sync only ever appends at the bottom and patches cells it has located by
matching the problem itself. Keep it that way.

**Moving a problem to another section is safe** — change its `Category` in the CSV and keep its
`ID`. The sync rewrites only that row's `Category` cell; the row, its progress and its Remarks
stay exactly where they are. Renaming a whole section is the same operation applied to every
row in it. That is how the `Union-Find (DSU)` section was carved out of the graph sections.

---

## Adding a problem

1. Add a row to `problems.csv`. The minimum is `Category` and `Problem`:

   ```csv
   ID,Category,Problem,Difficulty,Source,Tag,Link,Status,Last Reviewed,Page,Priority,Premium,Remarks,Revisit
   675,Greedy,Minimum Swaps to Group All 1's Together II,Medium,LeetCode,Core,,Missed,,,High,No,Window of size k over a circular array,
   ```

   - **ID** — use the next free number. Leave it blank and the sync assigns one above every ID
     in the Sheet *and* the CSV. Never reuse or renumber an existing ID: `#p-<ID>` deep links,
     all progress, and section moves are keyed on it.
   - **Category** — must match an existing section *exactly*, or be a genuinely new section
     (see below). `Arrays and Hashing` is not `Arrays & Hashing`.
   - **Link** — optional. Blank LeetCode rows get a link built from the title; blank GFG rows
     get a search URL.
   - **Status / Last Reviewed / Revisit** — leave blank. These are yours, and the sync never
     writes them on a row that already exists.
   - **Page** — always leave blank. The column exists only so the CSV's columns line up with the
     Sheet's `A`–`N` one for one; in the Sheet, the formula in `J1` fills it.

2. Push to `main`.

3. In the Sheet: **DSA 400 → Preview sync from CSV**. Read what it says it will do.

4. **DSA 400 → Sync from CSV**.

5. Regenerate the offline snapshot in `index.html` (see *The BUILTIN snapshot* below) and push again.

---

## Removing a problem

The sync never deletes a row. Delete it from `problems.csv` (never reuse its ID), push, then
delete the same row in the Sheet by hand — its Status, Remarks and Revisit go with it.
Regenerate BUILTIN so the offline copy agrees.

---

## What the sync will and will not touch

| Column | Who owns it | On sync |
| --- | --- | --- |
| `A` ID · `C` Problem · `E` Source | the CSV | written **only** when a new row is appended |
| `D` Difficulty · `G` Link | the CSV | replaced (a blank `Link` in the CSV never clears the cell) |
| `B` Category | the CSV | on an existing row, rewritten **only** when the CSV moves it (see below) |
| `F` Tag | the CSV | replaced (`Core` or blank) |
| `H` Status · `I` Last Reviewed | **you** | **never** — only the page's buttons write these |
| `J` Page | the formula | **never** — writing it breaks every "Open" link |
| `K` Priority | the CSV | replaced |
| `L` Premium | the CSV | replaced |
| `M` Remarks | **you** | filled **only if the cell is empty** — your text is never overwritten |
| `N` Revisit | **you** | **never** |

This table is not a description, it is the actual implementation: `SYNC_POLICY` at the top of
`apps-script/Code.gs` is what the code reads. Change the policy there, not in scattered `if`s.

Anything in column `O` or beyond is outside the schema and is never read or written.

Two rules make that table hold even while you are editing the Sheet during a sync:

- **Every write touches only the cells it is changing.** Nothing writes back a stale copy of a
  column, so a remark you type, or a Revisit box you tick, while a sync is running is never
  reverted. A remark is filled only after its cell is re-read and found empty at that instant.
- **Appends never write over anything.** Before appending, the sync checks that the rows below
  your last problem are empty. If a stray note is sitting there, the sync says
  `STOPPED — row N …` and writes nothing until you move it.

### How a CSV row finds its Sheet row

In this order, case- and space-insensitively:

1. **`Category|Problem`** — the normal case. Nothing about the row moves.
2. **Same `ID`, same `Problem`** — a deliberate move to another section. Only `Category` changes.
3. **A `Problem` title that appears exactly once in the Sheet** — also a move (covers a problem
   that was added in the Sheet by hand under a different ID).
4. **The `ID` belongs to a *different* problem in the Sheet** — a **conflict**. It is listed in the
   sync report and **nothing is written** for that row. Give one of them a new ID and re-sync.
5. Otherwise it is new, and appended.

A problem already in the Sheet is never appended again, so **re-running the sync is safe and
idempotent** — a second run reports `Append 0; move 0; update 0`.

This matters more than it sounds. When the Teradata prep list was first added, 13 of its
20 problems were already in the list under different framing. Appending them blind would
have created 13 duplicates on fresh IDs, and every "Got it" already earned would have stayed
on the old row. Always check before adding:

```bash
python3 -c "
import csv
t={r['Problem'].strip().lower() for r in csv.DictReader(open('problems.csv'))}
for p in ['Your New Problem','Another One']:
    print(('DUP  ' if p.strip().lower() in t else 'new  ')+p)"
```

### New sections

A `Category` the Sheet has never seen — whether a problem is being appended into it or moved
into it — is accepted **only if at least 3 CSV rows use it** —
a real new section arrives with a handful of problems, a typo arrives alone. A lone unknown
category is skipped and named in the sync report, so a misspelling can never quietly become
a new section on the page.

To add a section deliberately, add (or move) its problems in one go. Sections are ordered by the
first Sheet row that carries them: a section of brand-new problems appears at the bottom, while
one that existing problems move into appears where its lowest-numbered member sits — which is
why `Union-Find (DSU)` lands right after `Graphs: BFS / DFS`.

---

## Priority, and what the page does with it

`Priority` drives the **Review** filter, which is the point of the whole list:

| Value | Means |
| --- | --- |
| `Must` | revise before any interview, no exceptions |
| `High` | revise if you have a day |
| `Medium` | worth a pass |
| `Stretch` | only when you have real time |
| *(blank)* | in the list for completeness |

When a Review filter is on, the page groups by priority bucket instead of by category. Each
problem still renders in exactly one section, which is what keeps `#p-<ID>` anchors unique —
do not be tempted to also pin a duplicate "Must review" section at the top.

`Tag` is now just `Core` or blank. The old company-specific tag was retired; `fromSheet` still
reads a legacy `Teradata` value as `Core`, so an un-synced Sheet keeps working.

---

## Remarks and the Revisit flag

`Remarks` are yours and are edited **in the Sheet only**. They show up read-only under the
problem on the page. The CSV can seed a remark for a *new* problem, but it never overwrites one.

`Revisit` (`N`) is the ↻ **Revise** button on each row: your own "I did this but not well"
flag, filterable with **↻ Flagged**. It is progress, not content, so neither the CSV nor the
sync ever writes it.

If your remarks already say things like *"Must Revise Problem"*, run
**DSA 400 → Flag Revisit from Remarks** once. It ticks the box wherever a remark matches
`REVISIT_HINT`, never clears one, and never edits the remark itself.

---

## The BUILTIN snapshot

`index.html` carries an inlined copy of the whole list, used only when the Sheet is
unreachable. It goes stale the moment you add problems. Regenerate it after any change:

```bash
python3 - <<'EOF'
import csv, json, re, urllib.parse
H="index.html"; s=open(H,encoding="utf-8").read()
rows,topics,seen=[],[],{}
for x in csv.DictReader(open("problems.csv",newline="",encoding="utf-8")):
    if not x["Problem"].strip(): continue
    d={"e":"E","h":"H"}.get(x["Difficulty"][:1].lower(),"M")
    src={"g":"G","c":"X"}.get(x["Source"][:1].lower(),"L")
    slug=re.sub(r"(^-|-$)","",re.sub(r"[\s-]+","-",re.sub(r"[^a-z0-9 \-]","",x["Problem"].lower().replace("'",""))))
    u=x["Link"] or (f"https://leetcode.com/problems/{slug}/" if src=="L"
        else "https://www.google.com/search?q="+urllib.parse.quote_plus(("geeksforgeeks practice " if src=="G" else "")+x["Problem"]))
    k=x["Category"] or "Uncategorized"
    o={"id":int(x["ID"]),"t":x["Problem"],"d":d,"s":src,
       "g":"C" if x["Tag"][:1].lower() in ("c","t") else "","k":k,"u":u}
    if x["Priority"]: o["p"]=x["Priority"]
    if x["Premium"]=="Yes": o["pm"]="Yes"
    if x["Remarks"]: o["rm"]=x["Remarks"]
    rows.append(o)
    if k not in seen: seen[k]={"name":k,"count":0}; topics.append(seen[k])
    seen[k]["count"]+=1
blob=json.dumps({"rows":rows,"topics":topics},ensure_ascii=False)
s,n=re.subn(r"(const BUILTIN = )\{.*?\};\n",lambda m:m.group(1)+blob+";\n",s,count=1,flags=re.S)
assert n==1
open(H,"w",encoding="utf-8").write(s)
print(f"BUILTIN: {len(rows)} rows, {len(topics)} topics")
EOF
```

Note the `Revisit` column is deliberately absent from the snapshot — it is your state, and
offline state lives in `localStorage`.

---

## Checks worth running before you push

```bash
python3 - <<'EOF'
import csv, collections
r=list(csv.DictReader(open("problems.csv",newline="",encoding="utf-8")))
ids=[int(x["ID"]) for x in r]
assert len(set(ids))==len(ids), "duplicate ID"
assert ids==sorted(ids), "IDs out of order"
k=[(x["Category"].strip().lower(),x["Problem"].strip().lower()) for x in r]
assert len(set(k))==len(k), "duplicate Category|Problem"
assert all(x["Priority"] in ("","Must","High","Medium","Stretch") for x in r), "bad Priority"
assert all(x["Premium"] in ("Yes","No") for x in r), "bad Premium"
dupe=[t for t,c in collections.Counter(x["Problem"].strip().lower() for x in r).items() if c>1]
print("rows", len(r), "| same title in two categories:", dupe or "none")
print("by category:", dict(collections.Counter(x["Category"] for x in r)))
EOF
```

`problems.csv` has no embedded newlines, but three fields contain commas and are quoted —
`split(",")` will mangle them. Always use a real CSV parser.

---

## Editing the Apps Script

After changing `apps-script/Code.gs`:
**Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.**

This keeps the same URL. Creating a *new deployment* gives a new URL and silently breaks
`API_URL` in `index.html` — the page will fall back to `BUILTIN` and your progress will stop
saving.

After adding a column, run **DSA 400 → Upgrade schema** once to add the headers,
dropdowns and the Revisit checkbox.
