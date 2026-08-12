# Google Sheet bridge

This lets the app store data in a Google Sheet you own, instead of (or
in addition to) your browser's local storage. The same setup steps
are also shown inside the app (Breeding Log tab → "Google Sheet
sync" button, which also has a "Copy the Apps Script code" button so
you don't need to open this file directly).

A blank spreadsheet has already been created for this project:
**Palpedia Field Tracker Data** in your Google Drive. Open it and
follow the setup steps below on that file — you don't need to create
a new one.

## Setup

1. Open the **Palpedia Field Tracker Data** spreadsheet (or use your
   own, any name — the four tabs below are created automatically the
   first time the app talks to it).
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
most common reason the app says it can't connect even though the
sheet's tabs look right — the tabs were created by whichever version
of the script *did* run at some point, which can be older than what
you're now looking at in the editor.

## The four tabs

Nothing needs to be created by hand — the script makes all four the
first time it runs, and additively migrates a tab that already exists
(only ever appending a missing column, never touching what's there):

- **BreedingLog** — your logged breeding entries. Fully owned by the
  app; don't hand-edit the columns, just use the Breeding Log tab.
- **PalsDB** — seeded *once* with the app's built-in 284-Pal roster:
  `PalId`, `Number`, `Suffix`, `Name`, `Types`, a blank `ImageUrl`, a
  blank `Discovered`, and `PartnerSkill` / `PartnerSkillDesc`
  backfilled from the app's own data where known.
  - Paste a picture URL into `ImageUrl` for any row and the app shows
    it for that Pal everywhere, looked up by `PalId` (e.g. `044` for
    Lamball, `044B` for a variant). A picture set manually in the app
    itself (per-browser, "Add a picture" on a card) always overrides
    the sheet's.
  - `Discovered` is written by the app when you tick a Pal off (any of
    `Yes`/`TRUE`/`1`/`x` counts as discovered if you'd rather edit it
    by hand). It syncs both ways: the sheet's discovered Pals merge
    into your local progress on every connect (never un-discovering
    anything locally), and anything discovered locally but missing
    from the sheet gets pushed up. "Reset Palpedia progress" in the
    app clears this column too.
  - If a tab from before this column set already exists, the script
    adds `Discovered`/`PartnerSkill`/`PartnerSkillDesc` next time it
    runs — nothing is deleted or reordered.
- **ActiveSkillsDB** — created **empty** (just the header row: `Name`,
  `Element`, `Power`, `CT`, `Notes`). We didn't ship a built-in active
  skills list because we couldn't fetch/verify one against a real
  source in this environment — paste your own from wherever you trust
  (wiki export, spreadsheet, etc.), in any column order; extra
  columns are ignored, and only `Name` is required for the app to use
  a row. Once there are rows here, the Breeding Log's "Active skills"
  field switches from free-typing to a search-as-you-type list, live,
  without needing to reload the app.
- **ElementsDB** — seeded *once* with the 9 Palworld types
  (`TypeCode`, `Name`, blank `ImageUrl`). Paste a picture URL per type
  and the app shows that image instead of a colored pill wherever a
  Pal's types are listed.

## Troubleshooting "can't connect"

The tabs being created proves *some* request from the app reached the
script successfully at some point — so if it's failing now, check
these in order:

1. **Did you redeploy after the last script change?** See the note
   above — this is the single most common cause.
2. **"Who has access" on the deployment is "Anyone"** — not "Anyone
   with Google account". The latter requires the visitor to be signed
   in, which a plain background request from the app can't do, and
   you'll get a Google sign-in page back instead of data.
3. **You're using the `/exec` URL**, not a `/dev` test URL from the
   Apps Script editor's "Run" button — `/dev` also requires you to be
   signed in as the script's owner in that browser tab.
4. **The `SECRET` matches exactly** between the app's settings and the
   Script Property — no extra spaces, same case.

The app's connection-status line now shows the actual failure instead
of a generic message (e.g. it'll say when the response wasn't JSON at
all, which almost always points to #2 or #3 above).

## Notes

- Nothing here calls any external Anthropic/Claude API — this is a
  first-party Apps Script talking only to the sheet it's bound to.
- Breeding entries, Pal pictures, partner skills, element pictures,
  and active skill names are all cached in the browser's
  `localStorage` too, so the app keeps working from your last
  successful sync if the Sheet is temporarily unreachable.
