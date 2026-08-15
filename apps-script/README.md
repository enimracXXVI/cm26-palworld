# Google Sheet bridge

This lets the app store data in a Google Sheet you own, instead of (or
in addition to) your browser's local storage. The same setup steps
are also shown inside the app (Breeding Log tab → "Google Sheet
sync" button, which also has a "Copy the Apps Script code" button so
you don't need to open this file directly).

A spreadsheet already exists for this project: **Palpedia Field
Tracker Data** in your Google Drive. Open it and follow the setup
steps below on that file.

## Setup

1. Open the **Palpedia Field Tracker Data** spreadsheet (or use your
   own, any name).
2. Open **Extensions → Apps Script**, delete the placeholder `Code.gs`
   content, and paste in [`Code.gs`](./Code.gs) from this folder.
3. In the Apps Script editor: **Project Settings** (gear icon) →
   **Script Properties** → add a property named `SECRET` with any
   password you choose. This is what stops a stranger who somehow
   guesses your Web app URL from reading or writing your sheet.
4. **Deploy → New deployment** → type **Web app** → Execute as **Me**,
   Who has access **Anyone** → **Deploy**, then authorize it with your
   Google account when prompted.
5. Copy the Web app URL it gives you (ends in `/exec`). In the app,
   open the Breeding Log tab → "Google Sheet sync" → paste the URL and
   the same `SECRET` value → Save & test.

If you ever change the `SECRET` in Script Properties, update it in the
app's settings too, or requests will start failing with "Unauthorized".

**Updating an existing connection to a newer `Code.gs`?** Pasting new
code into the script editor does *not* change what your already-live
Web app URL runs. Go to **Deploy → Manage deployments** → pencil icon
on your deployment → **Version: New version** → **Deploy**. (Making a
brand new deployment instead works too, but gives you a different URL
you'll need to re-paste into the app.) Forgetting this step is the
most common reason the app says it can't connect, or behaves like an
older version, even though the sheet's tabs look right.

## Schema

Every read and write looks columns up **by name**, never by position —
reorder your columns, add your own extra ones, whatever you like, and
the app keeps working. A tab that doesn't exist yet is created with
sensible defaults; a tab that already exists is **never** restructured
or renamed by this script, with a handful of narrow, purpose-built
exceptions described below (`pals.discovered`/`imageUrl`/`base`/
`party`, `passiveSkills.unlocked`).

- **breedingLog** — `id, createdAt, parentA_palId, parentA_sex,
  parentA_passives, parentA_actives, parentB_palId, parentB_sex,
  parentB_passives, parentB_actives, offspring_palId, offspring_sex,
  offspring_passives, offspring_actives, notes`. Fully owned by the
  app; don't hand-edit it.
- **pals** — `id, palId, name, type, imageUrl, discovered, base,
  party`, plus 12 Work Suitability columns: `Kindling, Watering,
  Planting, Generating Electricity, Handiwork, Gathering, Lumbering,
  Mining, Medicine Production, Cooling, Transporting, Farming`. **Not
  pre-seeded** — a row appears the first time you interact with that
  Pal (discover it, assign Base/Party, add a picture), pre-filled with
  its name/type at that moment. `type` is pipe-separated when the app
  writes it. The app writes `imageUrl` (when you add a picture through
  the app itself, not just when you paste one into the sheet),
  `discovered` (when you tick a Pal off), and `base`/`party` (when you
  toggle those on a Pal's card) as real `TRUE`/`FALSE` boolean values —
  any of `TRUE`/`Yes`/`1`/`x` still counts as true if you'd rather edit
  by hand. All three sync both ways: the sheet's set merges into your
  local progress on every connect (never un-assigning anything
  locally), and anything set locally but missing from the sheet gets
  pushed up. "Reset Palpedia progress" in the app clears all three
  columns, and un-discovering a Pal also clears its `base`/`party`.
  `base`/`party` and the 12 Work Suitability columns are added
  automatically (appended, nothing else touched) the first time the
  app connects to a `pals` tab that doesn't have them yet — same as
  the `passiveSkills.unlocked` migration below. The app never writes
  into the Work Suitability columns itself; they're there for you to
  fill in from a source you trust.
- **partnerSkills** — its own tab: `id, palId, palName, name,
  description`. One row per Pal, joined to `pals` by `palId`. Not
  pre-seeded — populate it yourself.
- **activeSkills** — `id, name, element, power, ct, exclusive,
  description, notes`. You populate this yourself — only `name` is
  required for a row to be used. Once there are rows here, the
  Breeding Log's "Active skills" field switches from free-typing to a
  search-as-you-type list, live, without reloading the app.
- **elements** — `id, code, name, imageUrl` — the 9 Palworld types.
  Paste a picture URL per type and the app shows that image instead of
  a colored pill wherever a Pal's types are listed (both on cards and
  in the type filter chips).
- **passiveSkills** — `id, name, rank, surgery, effects, category,
  unlocked`. `effects` may be comma- or pipe-separated; `surgery`/
  `unlocked` are real `TRUE`/`FALSE` boolean values (`TRUE`/`Yes`/`1`/
  `x` all count as true if you edit by hand). `category` is left blank
  — there's no official Palworld categorization to seed it with, so
  it's there for you to fill in however you'd like to group/filter
  skills (Attack, Defense, Work, ...). The Passive Skills tab in the
  app reads whatever distinct category values actually exist and shows
  them as filter chips automatically — no code change needed, the
  filter row just doesn't appear until the column has something in it.
  `category` and `unlocked` are the two columns this script adds to an
  existing tab if they're missing — appended at the end, nothing else
  touched — because the app tracks which passives you've discovered
  here too, the same way it tracks `pals.discovered`. The Passive
  Skills tab and the Breeding Log's passive-skill suggestions both read
  this whole tab live, so a rename, correction, or added row shows up
  on the next sync — a locked (not-yet-unlocked) passive shows
  only its name and rank, not its effects or whether it needs Surgery.

### Multi-value columns: comma vs. pipe

If a column is a Sheets **multi-select dropdown**, Sheets auto-joins
selections with `, ` — there's no way to make a dropdown emit `|`
instead. Rows the app writes itself (breedingLog's passives/actives
lists) use `|`, since that's not going through a dropdown and avoids
any ambiguity with commas that might appear inside free text. Every
read in this script accepts **either** separator, so it doesn't matter
which one produced a given cell — you don't need to standardize your
existing columns.

## Notes

- Nothing here calls any external Anthropic/Claude API — this is a
  first-party Apps Script talking only to the sheet it's bound to.
- Every reference dataset (pals, partner skills, active skills,
  elements, passive skills) is cached in the browser's `localStorage`
  too, so the app keeps working from your last successful sync if the
  Sheet is temporarily unreachable.
- **`*_palId` columns are read tolerantly, never rewritten.** A palId
  cell can be the text `"001"` or the real number `1` (e.g. shown
  zero-padded via a custom number format like `000`) — either is
  normalized to `"001"` in memory when the app reads it. The script
  never calls `setNumberFormat`/`setValues` to change a palId cell's
  type or format, so it can't fight with however you've set that
  column up — including a Sheets "column type" (right-click header →
  Column type), which used to make this throw
  `Exception: You can't set the number format of cells in a typed
  column.` in earlier versions of this script.
