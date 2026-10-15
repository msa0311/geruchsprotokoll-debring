#!/usr/bin/env python3
"""Erzeugt den 1-seitigen, anonymisierten Bericht "Geruchsprotokoll – Zwischenstand" als PDF.

Eingabe: JSON-Liste mit einer Meldung pro Eintrag, wie sie die Admin-Schnittstelle
(action=list) liefert. Verwendete Felder: time, house, strength, type, duration, calm,
stationFrom, stationDir, stationSpeed, stationGusts. Freitexte und Namen werden nicht
verwendet; der Bericht enthält nur Summen und Verteilungen.

Aufruf:  python3 make_pdf.py [rows.json] [out.pdf]
         (Defaults: ./rows.json und ./geruchsprotokoll-auswertung.pdf)

Benötigt Python 3.9+ und Chromium. Das Binary wird über die Umgebungsvariable CHROMIUM
angegeben, sonst automatisch gesucht (chromium, chromium-browser, google-chrome).
"""
import json, sys, subprocess, tempfile, os, html, shutil
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")
args = sys.argv[1:]
if args and args[0].startswith("http"):
    sys.exit("Nur Dateien werden unterstützt (keine URLs, damit keine Codes in der Shell-History landen).")
src = args[0] if len(args) > 0 else "rows.json"
out = args[1] if len(args) > 1 else "geruchsprotokoll-auswertung.pdf"
chromium = os.environ.get("CHROMIUM") or next(
    (p for p in map(shutil.which, ("chromium", "chromium-browser", "google-chrome")) if p), None)
if not chromium:
    sys.exit("Chromium nicht gefunden – Umgebungsvariable CHROMIUM setzen.")
with open(src, encoding="utf-8") as f:
    rows = json.load(f)
if isinstance(rows, dict):  # komplette Antwort der Web-App {ok, rows}
    rows = rows.get("rows", [])
for r in rows:
    r["dt"] = datetime.fromisoformat(r["time"].replace("Z", "+00:00")).astimezone(BERLIN)
n = len(rows)
fmt1 = lambda x: f"{x:.1f}".replace(".", ",")
pct = lambda a, b: f"{round(100 * a / b)} %"

# Geruchsstunden (absolute Stunden, damit DST/Tageswechsel stimmen)
hours = set()
for r in rows:
    h = r["dt"].astimezone(ZoneInfo("UTC")).replace(minute=0, second=0, microsecond=0)
    hours.add(h)
    d = r.get("duration") or ""
    if d.startswith("4 Std"): back = 4
    elif d.startswith("1 Std"): back = 1
    else: back = 0
    for k in range(1, back + 1): hours.add(h - timedelta(hours=k))
houses = len({r["house"] for r in rows})
avg = sum(r["strength"] for r in rows) / n
first, last = min(r["dt"] for r in rows), max(r["dt"] for r in rows)
now = datetime.now(BERLIN)

types = Counter(r["type"] for r in rows).most_common()
BLOCKS = [(0, 5), (5, 6), (6, 7), (7, 8), (8, 9), (9, 12), (12, 18), (18, 24)]
blk = []
for a, b in BLOCKS:
    sel = [r for r in rows if a <= r["dt"].hour < b]
    blk.append((f"{a}–{b} Uhr", sel))
top_l, top_sel = max(blk, key=lambda x: len(x[1]))
top_days = len({r["dt"].date() for r in top_sel})
top_h = len({r["house"] for r in top_sel})
ta, tb = top_l.replace(" Uhr", "").split("–")
top_avg = sum(r["strength"] for r in top_sel) / len(top_sel)

# Wind (Station): Tabelle deckt alle Meldungen ab (Summe == n)
calm = [r for r in rows if r.get("calm") == "ja"]
windy = [r for r in rows if r.get("calm") != "ja"]
DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
def sector(deg): return DIRS[int(((float(deg) % 360) + 22.5) // 45) % 8]
has_dir = lambda r: r.get("stationDir") not in ("", None)
dc = Counter(sector(r["stationDir"]) for r in windy if has_dir(r))
nomeas = len(windy) - sum(dc.values())
wind_rows = [("windstill (unter 1 km/h)", len(calm))] + [(k, dc.get(k, 0)) for k in DIRS]
if nomeas: wind_rows.append(("ohne Messwert", nomeas))
assert sum(c for _, c in wind_rows) == n, "Windtabelle summiert nicht auf n"
def shares(counts, total):
    """Prozentwerte (ganzzahlig) nach Largest-Remainder, Summe ergibt exakt 100."""
    base = [100 * c // total for c in counts]
    order = sorted(range(len(counts)), key=lambda i: -(100 * counts[i] % total))
    for i in order[:100 - sum(base)]: base[i] += 1
    return base
wind_pct = shares([c for _, c in wind_rows], n)
speeds = [float(r["stationSpeed"]) for r in windy if r.get("stationSpeed") not in ("", None)]
gusts = [float(r["stationGusts"]) for r in windy if r.get("stationGusts") not in ("", None)]

def bar(w, color): return f'<div class="trk"><div class="bar" style="width:{w:.1f}%;background:{color}"></div></div>'
G, B = "#2e7164", "#3a6ea5"
def rowh(label, cnt, mx, color, pc=None, extra=None, cls=""):
    w = 100 * cnt / mx if mx else 0
    right = extra if extra is not None else pc
    return f'<div class="r {cls}"><span class="l">{label}</span>{bar(w, color)}<b>{cnt}</b><i>{right}</i></div>'

tyh = "".join(rowh(html.escape(t), c, types[0][1], G, pct(c, n), cls="wide") for t, c in types)
mxb = max(len(s) for _, s in blk)
blh = "".join(rowh(l, len(s), mxb, G, extra=("Ø " + fmt1(sum(x["strength"] for x in s) / len(s))) if s else "Ø –") for l, s in blk)
mxw = max(c for _, c in wind_rows) or 1
wdh = "".join(rowh(html.escape(l), c, mxw, B, f"{p} %", cls="wide") for (l, c), p in zip(wind_rows, wind_pct))
wdh += f'<div class="r wide sum"><span class="l">Summe</span><span class="trk" style="background:none"></span><b>{n}</b><i>100 %</i></div>'
if speeds:
    sp_txt = (f"Bei Windstille gibt es keine Windrichtung. Bei messbarem Wind lag die Geschwindigkeit zwischen "
              f"{fmt1(min(speeds))} und {fmt1(max(speeds))} km/h"
              + (f" (Böen bis {fmt1(max(gusts))} km/h)" if gusts else "") + ".")
else:
    sp_txt = "Bei Windstille gibt es keine Windrichtung."

page = f"""<!doctype html><html lang="de"><meta charset="utf-8"><style>
@page {{ size: A4; margin: 0 }}
* {{ box-sizing: border-box; margin: 0; padding: 0 }}
body {{ font-family: "Liberation Sans", Arial, sans-serif; color: #1f2a37; font-size: 9.6pt; line-height: 1.3; width: 210mm; height: 296mm; overflow: hidden }}
header {{ background: #2e7164; color: #fff; padding: 7mm 14mm 4.5mm }}
h1 {{ font-size: 20pt; margin-bottom: 2mm }} header p {{ font-size: 10.5pt; line-height: 1.4 }}
main {{ padding: 0 14mm }}
.kpis {{ display: flex; gap: 4mm; margin: 4.5mm 0 2.5mm }}
.k {{ flex: 1; background: #e6efec; border-radius: 3mm; padding: 3mm 4mm }}
.k .v {{ font-size: 20pt; font-weight: bold; color: #2e7164; line-height: 1.1 }}
.k b {{ display: block; font-size: 10.5pt; margin-top: 1mm }} .k small {{ font-size: 7pt; color: #5b6572 }}
h2 {{ font-size: 12pt; margin: 3.8mm 0 1mm }} .sub {{ font-size: 7.6pt; font-style: italic; color: #5b6572; margin-bottom: 2mm }}
.r {{ display: flex; align-items: center; height: 4.7mm; margin-bottom: 0.8mm; font-size: 8.7pt }}
.r .l {{ width: 31mm; white-space: nowrap }} .r.wide .l {{ width: 40mm }}
.trk {{ flex: 1; height: 4mm; background: #eceff1; border-radius: 1.5mm; overflow: hidden }}
.bar {{ height: 100%; border-radius: 1.5mm }} .r b {{ width: 9mm; text-align: right; font-size: 8.7pt }}
.r i {{ width: 13mm; text-align: right; font-style: normal; font-size: 7.6pt; color: #5b6572 }}
.two {{ display: flex; gap: 8mm }} .two > div {{ flex: 1 }}
.sum {{ border-top: 0.3mm solid #cfd4d9; color: #5b6572; height: 4.2mm; margin-top: 1mm; font-size: 8.2pt }}
.note {{ font-size: 8.7pt; margin-top: 2mm }} .hint {{ font-size: 7.6pt; font-style: italic; color: #5b6572 }}
.box {{ background: #f1f3f5; border-radius: 3mm; padding: 3.5mm 5mm; margin-top: 3.5mm }}
.box h3 {{ font-size: 12pt; margin-bottom: 2mm }}
.box ul {{ list-style: none }} .box li {{ position: relative; padding-left: 6mm; margin-bottom: 1.2mm; font-size: 8.8pt }}
.box li:before {{ content: ""; position: absolute; left: 1mm; top: 1.3mm; width: 2mm; height: 2mm; border-radius: 50%; background: #2e7164 }}
.thx {{ background: #fdf3e1; border-radius: 3mm; padding: 3mm 5mm; margin-top: 3.5mm }}
.thx h3 {{ font-size: 12pt; color: #9a5b00; margin-bottom: 1mm }} .thx p {{ font-size: 9pt }}
footer {{ text-align: center; font-size: 7pt; color: #5b6572; margin-top: 1.5mm }}
</style><body>
<header><h1>Geruchsprotokoll Debring – Zwischenstand</h1>
<p>Zeitraum: {first:%d.%m.%Y} bis {last:%d.%m.%Y}<br>Stand: {now:%d.%m.%Y, %H:%M} Uhr &nbsp;·&nbsp; anonymisierte Zusammenfassung</p></header>
<main>
<div class="kpis">
<div class="k"><div class="v">{n}</div><b>Meldungen</b><small>insgesamt</small></div>
<div class="k"><div class="v">{houses}</div><b>Haushalte</b><small>haben mitgemacht</small></div>
<div class="k"><div class="v">{fmt1(avg)}</div><b>Ø Geruchsstärke</b><small>Skala 1–5, Selbstangabe</small></div>
<div class="k"><div class="v">ca. {len(hours)}</div><b>Geruchsstunden</b><small>grobe Schätzung</small></div></div>
<h2>Welche Gerüche wurden gemeldet?</h2><div class="sub">Geruchsart nach eigener Angabe der Meldenden · Anzahl und Anteil der Meldungen</div>
{tyh}
<div class="two"><div>
<h2>Wann wurde der Geruch wahrgenommen?</h2><div class="sub">Ortszeit, in Zeitblöcken zusammengefasst · Anzahl der Meldungen und Ø Geruchsstärke</div>{blh}</div>
<div><h2>Wie war der Wind bei den Meldungen?</h2><div class="sub">Gemessen an einer privaten Wetterstation in Mutzershof (ca. 300 m entfernt), automatisch ergänzt – keine Eingabe der Meldenden</div>
{wdh}
<div class="hint" style="margin-top:1mm">{sp_txt}</div></div></div>
<p class="note">Am häufigsten wurde zwischen {ta} und {tb} Uhr gemeldet: {len(top_sel)} von {n} Meldungen ({pct(len(top_sel), n)}), Ø Stärke {fmt1(top_avg)}, aus {top_h} Haushalten an {top_days} verschiedenen Tagen.</p>
<p class="hint">Hinweis: Wann gemeldet wird, hängt auch davon ab, wann Menschen zu Hause und wach sind – nachts und tagsüber wird vermutlich seltener gemeldet. Die Verteilung zeigt wahrgenommene und gemeldete Zeiten, keine Messung. Frühere Auswertungen nutzten Wetter-Modelldaten (Open-Meteo); diese zeigten bei Windstille oft eine zufällige Richtung (z. B. Nord) und werden daher nicht mehr verwendet.</p>
<div class="box"><h3>Wie ist das einzuordnen?</h3><ul>
<li>Die Meldungen sind freiwillig und geben das persönliche Empfinden wieder. Sie sind keine repräsentative Umfrage und keine Messung des Geruchs.</li>
<li>Die Winddaten stammen von einer privaten Wetterstation (Weather Underground) in Mutzershof, nicht von den Meldenden. Sehr schwache Luftbewegungen unter ca. 1 km/h erfasst das Windrad nicht – „windstill“ heißt also „kein messbarer Wind“.</li>
<li>Mehrere Meldungen können sich auf dieselbe Geruchsepisode beziehen. Die Geruchsstunden sind deshalb nur eine grobe Schätzung.</li>
<li>Eine Auswertung zur Herkunft des Geruchs ist bisher nicht erfolgt. Sie kann später anhand weiterer Daten geprüft werden.</li></ul></div>
<div class="thx"><h3>Herzlichen Dank fürs Mitmachen!</h3><p>Jede Meldung hilft, ein klareres Bild zu bekommen. Bitte meldet weiterhin, wann immer ihr etwas riecht – auch kurze oder schwache Gerüche zählen.</p></div>
<footer>Anonymisiert: ohne Hausnummern, Namen, Freitexte oder einzelne Meldungen.</footer>
</main></body></html>"""

import threading, http.server, functools
with tempfile.TemporaryDirectory() as t:
    with open(os.path.join(t, "r.html"), "w", encoding="utf-8") as f:
        f.write(page)
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(H, directory=t)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        subprocess.run([chromium, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={out}", f"http://127.0.0.1:{srv.server_port}/r.html"],
                       check=True, capture_output=True)
    finally:
        srv.shutdown()
print(n, houses, fmt1(avg), len(hours), wind_rows, sp_txt)
