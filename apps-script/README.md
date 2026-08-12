# Breeding Log — Google Sheet bridge

This lets the Breeding Log tab in `index.html` store your entries in a
Google Sheet you own, instead of (or in addition to) your browser's
local storage. The same setup steps are also shown inside the app
(Breeding Log tab → "Google Sheet sync" button).

## Setup

1. Create a new Google Sheet (any name — a `BreedingLog` tab is created
   automatically the first time the app talks to it).
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

## Notes

- Nothing here calls any external Anthropic/Claude API — this is a
  first-party Apps Script talking only to the sheet it's bound to.
- Breeding entries are still cached in the browser's `localStorage` as
  a fallback, so the app keeps working (read + add, without
  cross-device sync) if the Sheet is unreachable.
