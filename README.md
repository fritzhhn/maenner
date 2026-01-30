# Berlin Map Notes (MapLibre)

Simple website:
- shows a MapLibre map centered on Berlin
- click the map → a note popup opens
- click **Save pin** → a new pin is added
- click a pin → your text shows in a popup
- pins are stored in a **database** (shared for all visitors); if the API is unavailable, pins fall back to localStorage

## Run

Because the page calls a geocoding API, you should run it from a local web server (not by double-clicking the HTML file).

From this folder:

```bash
python3 -m http.server 5173
```

Then open:
- `http://localhost:5173`

## Files
- `index.html`: UI + includes MapLibre
- `style.css`: minimal styling
- `app.js`: geocoding + pin storage/rendering + API (fetch notes, POST new note)
- `api/notes.php`: backend API (GET list, POST create) – needs MySQL and `api/config.php`
- `api/config.example.php`: copy to `api/config.php` and set DB credentials
- `schema.sql`: run in phpMyAdmin to create the `notes` table

## Hosting with a database (e.g. Hostinger)

See **[HOSTINGER.md](HOSTINGER.md)** for step-by-step: create MySQL database, run schema, set `api/config.php`, upload site. Pins are then shared for everyone who opens the site.

## Notes
- No address input needed — pins are placed exactly where you click.
