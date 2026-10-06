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

The OLT and DOWN port controls are in the left panel. The map ruler measures the summed geodesic distances between tapped points. Undo removes the last point, Clear resets the ruler, and Escape exits measurement mode. Measurements reset when selecting another site.


## Alarme NCE prin serviciul local

Rulați `./Start-Alarme.ps1` în PowerShell și selectați un HAR recent din NCE. Cu WireGuard conectat, deschideți http://127.0.0.1:8765/ și apăsați **Preia alarme fibra**. Închiderea consolei oprește serviciul. Aplicația locală include aceleași date și harta ca aplicația publică. Python 3 este necesar; nu sunt necesare pachete suplimentare.

HAR-ul rămâne local și poate conține cookie-uri de autentificare. Nu îl încărcați în repository și nu distribuiți sesiunea. Parola nu este folosită sau salvată. După expirarea sesiunii, selectați un HAR nou. Serviciul ascultă doar pe 127.0.0.1 și nu oferă CORS pentru alte site-uri.

Verificarea TLS este obligatorie. Dacă certificatul NCE nu este acceptat, solicitați CA-ul intern în format PEM administratorului și porniți `./Start-Alarme.ps1 -Ca C:/cale/ca-intern.pem`. Nu dezactivați verificarea certificatului.

Importul inițial din HAR reprezintă numai ultima pagină capturată și este etichetat LISTĂ PARȚIALĂ. Preluarea citește jobul curent cu comanda 1103, în pagini de 55, maximum 200 pagini per apăsare. Limita este explicită; totalul citit și totalul raportat de NCE sunt afișate. Filtrul jobului este cel din NCE. Pentru volum mic, selectați în NCE doar LOS/LOSi/LOBi înainte de captură. Semantica paginării multi-page trebuie confirmată pe serviciul real; schimbarea totalului în timpul citirii anulează actualizarea. Nu avem încă autentificare API independentă sau filtrare server-side verificată.

Sunt păstrate numai alarmele active (`cleared=0`) cu ID 772907009 și 772874247. LOS de alimentare marchează automat DOWN; LOSi/LOBi afișează numărul de ONT afectate în lista porturilor, fără a considera întregul port DOWN. Asocierea folosește numele exact al OLT-ului, fără diferențiere majuscule/minuscule, și Slot/Port (Frame=0 pentru porturi cu două componente). Numele diferite între NCE și Excel nu sunt ghicite. Selecțiile DOWN manuale se păstrează separat.
