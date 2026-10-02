# Geruchsprotokoll

Mini-Web-App, mit der Nachbarn Geruchsbelästigungen in Sekunden melden können.
Datum, Uhrzeit und Wind (Open-Meteo) werden automatisch erfasst, die Daten landen in einer Google-Tabelle.

- `index.html`: Melde-App für die Nachbarn (Zugangscode und Hausnummer einmalig, dann 2 Tipps pro Meldung, offline-fest)
- `admin.html`: Auswertung (Geruchsstunden, Windrose, Uhrzeiten, Tabelle, CSV, Druck/PDF)
- `config.js`: `apiUrl` der Backend-Web-App; solange es leer ist, läuft alles im Demo-Modus

## Backend

Das Backend ist ein Google Apps Script, das direkt an die Google-Tabelle gebunden ist
(Erweiterungen → Apps Script) und als Web-App bereitgestellt wird (Ausführen als: Ich, Zugriff: Jeder).
Der Quelltext liegt bewusst nicht in diesem öffentlichen Repo, damit nie versehentlich Zugangscodes
eingecheckt werden. Der Zugangscode wird ausschließlich im Script geprüft.

Link für Nachbarn: `https://msa0311.github.io/geruchsprotokoll-debring/?code=ZUGANGSCODE`
(füllt den Code automatisch aus).

Bei Änderungen am Script: **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version**,
sonst bleibt die alte Version aktiv.
