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
or renamed by this script, with two narrow, purpose-built exceptions
described below (`pals.discovered`/`imageUrl`, `passiveSkills.unlocked`).

- **breedingLog** — `id, createdAt, parentA_palId, parentA_sex,
  parentA_passives, parentA_actives, parentB_palId, parentB_sex,
  parentB_passives, parentB_actives, offspring_palId, offspring_sex,
  offspring_passives, offspring_actives, notes`. Fully owned by the
  app; don't hand-edit it.
- **pals** — `id, palId, name, type, imageUrl, discovered`. `type` may
  be comma- or pipe-separated. The app writes `imageUrl` (when you add
  a picture through the app itself, not just when you paste one into
  the sheet) and `discovered` (when you tick a Pal off — any of
  `Yes`/`TRUE`/`1`/`x` counts if you'd rather edit it by hand).
  Discovery syncs both ways: the sheet's discovered Pals merge into
  your local progress on every connect (never un-discovering anything
  locally), and anything discovered locally but missing from the sheet
  gets pushed up. "Reset Palpedia progress" in the app clears this
  column too.
- **partnerSkills** — its own tab: `id, palId, palName, name,
  description`. One row per Pal, joined to `pals` by `palId`.
- **activeSkills** — `id, name, element, power, ct, exclusive,
  description, notes`. You populate this yourself — only `name` is
  required for a row to be used. Once there are rows here, the
  Breeding Log's "Active skills" field switches from free-typing to a
  search-as-you-type list, live, without reloading the app.
- **elements** — `id, code, name, imageUrl` — the 9 Palworld types.
  Paste a picture URL per type and the app shows that image instead of
  a colored pill wherever a Pal's types are listed (both on cards and
  in the type filter chips).
- **passiveSkills** — `id, name, rank, surgery, effects, unlocked`.
  `effects` may be comma- or pipe-separated. `unlocked` is the one
  column this script adds to an existing tab if it's missing —
  appended at the end, nothing else touched — because the app tracks
  which passives you've discovered here too, the same way it tracks
  `pals.discovered`. The Passive Skills modal and the Breeding Log's
  passive-skill suggestions both read this whole tab live, so a
  rename, correction, or added row shows up on the next sync — a
  locked (not-yet-unlocked) passive shows only its name and rank, not
  its effects or whether it needs Surgery.

### Multi-value columns: comma vs. pipe

If a column is a Sheets **multi-select dropdown**, Sheets auto-joins
selections with `, ` — there's no way to make a dropdown emit `|`
instead. Rows the app writes itself (breedingLog's passives/actives
lists) use `|`, since that's not going through a dropdown and avoids
any ambiguity with commas that might appear inside free text. Every
read in this script accepts **either** separator, so it doesn't matter
which one produced a given cell — you don't need to standardize your
existing columns.

## Known data gap

`partnerSkills` only has real data through Pal `109B`; palId `110`
onward are present as rows but with blank `name`/`description`. We
don't have a verified source for the rest and didn't want to guess and
have the app show made-up game data as fact — paste in real data for
those rows yourself if you find a source you trust, and the app will
pick it up automatically (no code change needed).

## Notes

- Nothing here calls any external Anthropic/Claude API — this is a
  first-party Apps Script talking only to the sheet it's bound to.
- Every reference dataset (pals, partner skills, active skills,
  elements, passive skills) is cached in the browser's `localStorage`
  too, so the app keeps working from your last successful sync if the
  Sheet is temporarily unreachable.
- **Every `*_palId` value is forced to plain-text format before
  writing, and self-repaired on read.** Google Sheets silently turns a
  numeric-looking string like `"001"` into the number `1` otherwise —
  this bit both `pals.palId` and `breedingLog`'s three palId columns
  in earlier versions of this script, which is why a breeding entry
  could show a Pal's number instead of its name and picture after a
  page reload. If you're updating from an older script version, just
  redeploy (see above) and the next sync repairs any already-corrupted
  cells automatically.
- **If a palId column has a Sheets "column type" applied** (right-click
  the column header → Column type → anything other than the default),
  forcing it to plain-text format throws
  `Exception: You can't set the number format of cells in a typed
  column.` The script catches this so it no longer crashes the whole
  request, but that column loses the auto-repair described above —
  clear its column type (Column type → remove/reset) if you hit this,
  so palIds there stay reliable.
