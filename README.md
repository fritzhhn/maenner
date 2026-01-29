# Berlin Map Notes (MapLibre)

Simple website:
- shows a MapLibre map centered on Berlin
- click the map → a note popup opens
- click **Save pin** → a new pin is added
- click a pin → your text shows in a popup
- pins persist in your browser (localStorage)

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
- `app.js`: geocoding + pin storage/rendering

## Notes
- No address input needed — pins are placed exactly where you click.
