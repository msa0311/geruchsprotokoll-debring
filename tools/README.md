# tools/make_pdf.py

Erzeugt aus den Meldungen den 1-seitigen, anonymisierten PDF-Bericht
„Geruchsprotokoll – Zwischenstand“ (nur Summen und Verteilungen, keine Namen,
Hausnummern oder Freitexte).

## Voraussetzungen

- Python 3.9+ (nur Standardbibliothek)
- Chromium (`chromium`, `chromium-browser` oder `google-chrome`); anderes Binary über
  die Umgebungsvariable `CHROMIUM` angeben
- Schrift „Liberation Sans“ (sonst weicht die Darstellung leicht ab)

## rows.json besorgen

Die Datei ist die Antwort der Web-App auf `action=list` (komplette Antwort `{ok, rows}` oder nur die Liste `rows`). Mit dem eigenen
Admin-Code (Platzhalter ersetzen, Code nicht ins Repo oder in Skripte schreiben):

```sh
read -rs ADMIN_CODE && export ADMIN_CODE   # Eingabe ohne Anzeige und ohne History
curl -sL "<WEB_APP_URL>?action=list&code=$ADMIN_CODE" -o rows.json
```

Alternativ die Antwort der Admin-Seite (eingeloggt) als `rows.json` speichern.
`rows.json` enthält personenbezogene Daten und gehört nicht ins Repo.

## Aufruf

```sh
python3 tools/make_pdf.py [rows.json] [out.pdf]
```

Defaults: `./rows.json` und `./geruchsprotokoll-auswertung.pdf`. URLs werden bewusst
nicht unterstützt, nur Dateien.
