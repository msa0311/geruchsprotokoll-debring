# Geruchsprotokoll

Mini-Web-App, mit der Nachbarn Geruchsbelästigungen in Sekunden melden können.
Datum, Uhrzeit und Wind (Open-Meteo) werden automatisch erfasst, die Daten landen in einer Google-Tabelle.

- `index.html`: Melde-App für die Nachbarn (Zugangscode und Hausnummer einmalig, dann 2 Tipps pro Meldung, offline-fest)
- `admin.html`: Auswertung (Geruchsstunden, Windrose, Uhrzeiten, Tabelle, CSV, Druck/PDF)
- `apps-script/Code.gs`: Backend (Google Apps Script, an die Tabelle gebunden)
- `config.js`: `apiUrl` eintragen; solange es leer ist, läuft alles im Demo-Modus

## Einrichtung

1. Google-Tabelle öffnen → **Erweiterungen → Apps Script**.
2. Inhalt von `apps-script/Code.gs` einfügen, `ACCESS_CODE` und `ADMIN_CODE` oben setzen, speichern.
3. Funktion `testEinrichtung` auswählen → **Ausführen** → Berechtigungen erlauben.
4. **Bereitstellen → Neue Bereitstellung → Typ: Web-App**
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   - Die Web-App-URL (endet auf `/exec`) kopieren.
5. URL in `config.js` bei `apiUrl` eintragen.
6. GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.

Link für Nachbarn: `https://msa0311.github.io/geruchsprotokoll-debring/?code=ZUGANGSCODE` (füllt den Code automatisch aus).

Der Zugangscode wird nur im Apps Script geprüft und steht nicht in diesem Repo.
Bei Änderungen am Script: **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version**, sonst bleibt die alte Version aktiv.
