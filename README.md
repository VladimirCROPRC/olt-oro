# OLT ORO

Romanian web application for finding a site by code and viewing its OLT port lists. Static HTML, CSS and JavaScript, hosted by GitHub Pages.

## Data

- `google_2602.htm.html`: site code and description directory.
- `OLT_cleaned.xlsx`, sheet Optical Splitter, column Q: OLT name, board/port and speed. Column F supplies splitter function.
- Site codes are extracted from OLT names, including `BA0600OLT0002`, `olt1-CL0400`, `BA0708_OLT_1` and `OLT_1_CL0925`.
- An OLT with no identifiable site code remains accessible under “OLT fără cod”. No location is guessed.
- Comma-separated connections are imported individually. Repeated connections are grouped by OLT and board/port, with a reference count and all reported speeds.
- Only recorded ports are shown. There is no source information about free ports or total chassis capacity. `unset` is displayed as “nespecificat”. Empty OLT cells are counted in the import report.
- Level-1 splitters are identified by column F = SPL-1. Their column B aliases and column K/L coordinates are included on the map, grouped at identical coordinates. SPL-2 and TV records do not supply map points.
- Select one or more OLTs to display their DP points in green. Select DOWN ports to turn associated points red. Status is selected manually, not read from live monitoring. Stop blink keeps affected points solid red.
- Map backgrounds: OpenStreetMap (default) and Esri World Imagery.
- The selected site is blue, using coordinates from the HTML directory. DP labels include only DP numbers found in column B aliases. Missing site coordinates or DP numbers are not guessed.
- FO Orange and optional FO OROC cables load directly from https://oro.proconect.online/layers.json and its compressed shards, using CORS. Original cable colours are preserved. Only visible-area shards load at zoom 11 or greater. No KMZ is used by this application.
- The original workbooks and splitter IDs are not included in the web dataset.

## Refresh

Requires Python and lxml. Run:

```sh
python import_data.py /path/to/OLT_cleaned.xlsx /path/to/google_2602.htm.html
```

Review `import-report.json`, then commit the updated `dist` data. The deployment workflow publishes `dist` on each push to main.

## Local preview

```sh
python -m http.server 8080 --directory dist
```

Cable taps show owner, status, route type, both endpoint structures and cable attributes, with Google Maps and Street View links for the tapped position. A shared Canvas renderer keeps point popups working when FO layers are toggled; cables have enlarged touch targets.
