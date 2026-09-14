# Talk To Me

A small, private Progressive Web App for logging your thoughts and feelings. Built as a journaling companion for therapy.

- **Private by design.** Entries are stored in your browser's IndexedDB on your device. Nothing is sent to a server.
- **Works offline.** A service worker caches the app so it opens without a connection.
- **Installable.** Add it to your home screen on iOS, Android, or desktop.
- **No build step, no dependencies.** Plain HTML, CSS, and JavaScript.

## What you can log

Each entry has:

- The thought itself
- Mood (awful → great) and intensity (1–10)
- Feelings as free-form tags (with suggestions from your past entries)
- Optional "go deeper" fields based on the classic CBT thought record: what was happening, evidence for and against the thought, and a more balanced way to see it

The History tab lets you search, filter by mood, edit, and delete entries. Settings lets you export everything as JSON (for backup or re-import) or plain text (for sharing with a therapist), import a previous export, or wipe the device.

## Running it

Service workers require HTTPS or `localhost`, so open it through a local server rather than as a `file://` URL:

```bash
cd Talk-To-Me
python3 -m http.server 8080
# then open http://localhost:8080
```

## Hosting it

Any static host works: GitHub Pages, Netlify, Cloudflare Pages, etc. All paths are relative, so it can live in a subfolder.

For GitHub Pages: Settings → Pages → deploy from the `main` branch root. Then open the site on your phone and use "Add to Home Screen" (Safari share sheet on iOS; the Install button in Settings on Android/Chrome).

## Updating

When you change any file, bump `CACHE` in `sw.js` (e.g. `talk-to-me-v2`) so installed copies pick up the new version.

## A note

This is a personal journaling tool, not a substitute for professional care. If you are in crisis, contact local emergency services or a crisis line.
