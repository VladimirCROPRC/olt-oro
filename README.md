# OLT ORO

Romanian web application for finding a site by code and viewing its OLT port lists. Static HTML, CSS and JavaScript, hosted by GitHub Pages.

## Data

- `google_2602.htm.html`: site code and description directory.
- `OLT_cleaned.xlsx`, sheet Optical Splitter, column Q: OLT name, board/port and speed. Column F supplies splitter function.
- Site codes are extracted from OLT names, including `BA0600OLT0002`, `olt1-CL0400`, `BA0708_OLT_1` and `OLT_1_CL0925`.
- An OLT with no identifiable site code remains accessible under “OLT fără cod”. No location is guessed.
- Comma-separated connections are imported individually. Repeated connections are grouped by OLT and board/port, with a reference count and all reported speeds.
- Only recorded ports are shown. There is no source information about free ports or total chassis capacity. `unset` is displayed as “nespecificat”. Empty OLT cells are counted in the import report.
- The original workbooks, splitter IDs, aliases and precise coordinates are not included in the web dataset.

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
