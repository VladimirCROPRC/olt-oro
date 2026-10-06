# Agent browser NCE

Instalare manuală prin Developer mode / Load unpacked în Edge sau Chrome. Folderul conține extensia MV3; nu conține credențiale sau date de producție. Reîncărcați NCE după instalare, autentificați-vă manual și deschideți filtrul Current Alarms. Din popup porniți agentul pentru tabul NCE curent.

`capture.js` rulează în contextul paginii și observă parametrii cererilor 1103 fără să schimbe răspunsurile aplicației. Reutilizează jobul filtrului activ și sesiunea browserului pentru citire periodică, maximum 200 pagini x 55. Folosește doar POST 1103, nu confirmă/șterge alarme și nu modifică filtrul. Nu urmează redirecturi. Schimbarea jobului abandonează rezultatul în curs; schimbarea totalului anulează snapshotul. Semantica paginării pe NCE real trebuie verificată după instalare.

`bridge.js` transmite către background numai snapshotul filtrat: CSN, alarmId, cleared, meName, moi, alarmName, latestOccurUtc. Headerul roarand și parametrii sesiunii rămân în tab; nu sunt păstrați în storage și nu sunt trimiși serviciului local. Browserul gestionează cookie-urile prin credentials same-origin.

Background acceptă date numai de la tabul NCE pornit din popup; trimite datele către endpointul loopback cu tokenul serviciului local. Storage păstrează doar ID-ul tabului activ și mesajul de stare. Opriți extensia înainte de a închide tabul, dacă nu mai este necesară.

Pornire serviciu local fără HAR: `python local_alarms.py` sau `./Start-Alarme.ps1`. Browserul și serviciul local trebuie să ruleze pe același PC.
