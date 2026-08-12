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

1. Open the **Palpedia Field Tracker Data** spreadsheet (or create your
   own, any name — the three tabs below are created automatically the
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

## The three tabs

Nothing needs to be created by hand — the script makes all three the
first time it runs (the very first "Save & test" in the app is enough):

- **BreedingLog** — your logged breeding entries. Fully owned by the
  app; don't hand-edit the columns, just use the Breeding Log tab.
- **PalsDB** — seeded *once* with the app's built-in 284-Pal roster
  (`PalId`, `Number`, `Suffix`, `Name`, `Types`, and a blank
  `ImageUrl`). Paste a picture URL into the `ImageUrl` column for any
  row and the app shows that picture for that Pal everywhere — it
  looks the Pal up by `PalId` (e.g. `044` for Lamball, `044B` for a
  variant). This only seeds once: if the tab already exists, the
  script leaves it exactly as you last edited it. A picture you also
  set manually in the app (per-browser, via "Add a picture" on a card)
  always takes priority over the sheet's.
- **ActiveSkillsDB** — created **empty** (just the header row: `Name`,
  `Element`, `Power`, `CT`, `Notes`). We didn't ship a built-in active
  skills list because we couldn't fetch/verify one against a real
  source in this environment — paste your own from wherever you trust
  (wiki export, spreadsheet, etc.), in any column order; extra
  columns are ignored, and only `Name` is required for the app to use
  a row. Once there are rows here, the Breeding Log's "Active skills"
  field switches from free-typing to a search-as-you-type list, live,
  without needing to reload the app.

## Notes

- Nothing here calls any external Anthropic/Claude API — this is a
  first-party Apps Script talking only to the sheet it's bound to.
- Breeding entries, Pal pictures, and active skill names are all
  cached in the browser's `localStorage` too, so the app keeps working
  from your last successful sync if the Sheet is temporarily
  unreachable.
