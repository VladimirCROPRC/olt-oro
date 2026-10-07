# OLT ORO

Romanian web application for finding a site by code and viewing its OLT port lists. Static HTML, CSS and JavaScript, hosted by GitHub Pages.

## Data

- `google_2602.htm.html`: site code and description directory.
- `OLT_ORO_merged.xlsx`, column M: OLT name, board/port and speed. Column E supplies splitter function; B supplies aliases and I/J coordinates. The importer also supports the previous column-Q layout.
- Site codes are extracted from OLT names, including `BA0600OLT0002`, `olt1-CL0400`, `BA0708_OLT_1` and `OLT_1_CL0925`.
- An OLT with no identifiable site code remains accessible under “OLT fără cod”. No location is guessed.
- Comma-separated connections are imported individually. Repeated connections are grouped by OLT and board/port, with a reference count and all reported speeds.
- Only recorded ports are shown. There is no source information about free ports or total chassis capacity. `unset` is displayed as “nespecificat”. Empty OLT cells are counted in the import report.
- SPL-1 supplies DP map points. SPL-2 supplies ODB map points. Both are associated directly with the OLT connection in column M; rows without that connection cannot be assigned to a port. Points at identical coordinates are grouped. TV records do not supply map points.
- Select one or more OLTs to display their DP points. Tick a port’s ODB checkbox to show its SPL-2 points as squares independently of the OLT DP selection; selecting DOWN also enables that port’s ODBs. ODB colours inherit the port alarm state; this does not identify which individual ODB or ONT is faulty. Local NCE alarms and manual DOWN selections determine port colours.
- Map backgrounds: OpenStreetMap (default) and Esri World Imagery.
- The selected site is blue, using coordinates from the HTML directory. DP labels include only DP numbers found in column B aliases. Missing site coordinates or DP numbers are not guessed.
- FO Orange and optional FO OROC cables load directly from https://oro.proconect.online/layers.json and its compressed shards, using CORS. Original cable colours are preserved. Only visible-area shards load at zoom 11 or greater. No KMZ is used by this application.
- The original workbook is not published. ODB identifiers, aliases and coordinates are included in the web dataset.

## Refresh

Requires Python and lxml. Run:

```sh
python import_data.py /path/to/OLT_ORO_merged.xlsx /path/to/google_2602.htm.html
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

Verificarea TLS este activă implicit. O excepție explicită numai pentru NCE se poate activa cu `./Start-Alarme.ps1 -AllowUnverifiedNce`; redirecturile sunt refuzate, iar alte destinații HTTPS sunt respinse de cititor. Dacă certificatul NCE nu este acceptat, solicitați CA-ul intern în format PEM administratorului și porniți `./Start-Alarme.ps1 -Ca C:/cale/ca-intern.pem`. Nu dezactivați verificarea certificatului.

Importul inițial din HAR reprezintă numai ultima pagină capturată și este etichetat LISTĂ PARȚIALĂ. Preluarea citește jobul curent cu comanda 1103, în pagini de 55, maximum 200 pagini per apăsare. Limita este explicită; totalul citit și totalul raportat de NCE sunt afișate. Filtrul jobului este cel din NCE. Pentru volum mic, selectați în NCE doar LOS/LOSi/LOBi înainte de captură. Semantica paginării multi-page trebuie confirmată pe serviciul real; schimbarea totalului în timpul citirii anulează actualizarea. Nu avem încă autentificare API independentă sau filtrare server-side verificată.

Sunt păstrate alarmele cu ID 772907009 și 772874247, inclusiv cele șterse pentru afișarea Cleared On. Numai alarmele active influențează starea portului. Porturile cu LOS sau cel puțin două ONT-uri distincte afectate sunt DOWN; o alarmă pentru un singur ONT, fără LOS de port, este întotdeauna portocalie, indiferent de vechime. Dacă cea mai recentă alarmă activă a portului este mai veche de 72 ore, DP-ul este albastru, cu excepția alarmelor pentru un singur ONT. Marcarea manuală DOWN rămâne roșie. Într-un punct comun mai multor porturi, roșu are prioritate față de albastru și portocaliu. Datele sunt afișate în Europe/Bucharest; Last occurred și Cleared On reprezintă cele mai recente valori din alarmele portului. Asocierea folosește numele exact al OLT-ului, fără diferențiere majuscule/minuscule, și Slot/Port (Frame=0 pentru porturi cu două componente). Numele diferite între NCE și Excel nu sunt ghicite. Selecțiile DOWN manuale se păstrează separat.


## Agent browser, fără export HAR

Rulați `./Start-Alarme.ps1` fără parametri pentru pornire în modul agent. Instalați manual extensia din `nce-agent` în Edge/Chrome (Developer mode, Load unpacked). Pachetul ZIP și pașii sunt disponibili la http://127.0.0.1:8765/agent.html. Reîncărcați tabul NCE după instalare, autentificați-vă manual, deschideți filtrul de fibră Current Alarms și porniți agentul din popup. Browserul și serviciul trebuie să fie pe același PC.

Actualizare la 30 secunde din tabul NCE selectat; OLT ORO verifică snapshotul la 3 secunde. Extensia nu exportă cookie-uri sau parole; numai câmpurile alarmelor de fibră sunt transmise loopback. Opțiunea de excepție TLS a cititorului Python nu este necesară în acest mod. Browserul gestionează conexiunea și autentificarea NCE. Instalarea în browserul real și testul NCE sunt pași manuali necesari. Logica de citire, filtrare și transmitere a fost verificată cu răspunsuri simulate; acestea nu confirmă compatibilitatea finală cu NCE.
