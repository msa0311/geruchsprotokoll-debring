/**
 * Geruchsprotokoll – Backend als Google Apps Script.
 * Wird an die Google-Tabelle gebunden (Erweiterungen → Apps Script) und als Web-App bereitgestellt.
 *
 * Nur diese beiden Zeilen anpassen:
 */
const ACCESS_CODE = 'HIER-ZUGANGSCODE-FUER-NACHBARN';  // bekommen alle Nachbarn
const ADMIN_CODE  = 'HIER-ADMIN-CODE-NUR-FUER-DICH';   // für die Auswertungsseite

// ---------------------------------------------------------------------------
const LAT = 49.866, LON = 10.842; // Stegaurach
const HEADERS = ['ID', 'Zeitpunkt', 'Eingegangen', 'Hausnummer', 'Name', 'Stärke (1-5)', 'Geruchsart',
  'Dauer', 'Ort', 'Notiz', 'Wind aus (°)', 'Wind aus', 'Wind km/h', 'Böen km/h', 'Temperatur °C'];
const TYPES = ['Frittierfett', 'Verbrannt / Rauch', 'Gülle / Fäkal', 'Chemisch', 'Sonstiges'];
const DURATIONS = ['gerade eben', 'ca. 30 Min', '1 Std. oder länger'];
const PLACES = ['draußen', 'im Haus', 'auf der Straße'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data || data.code !== ACCESS_CODE) return json({ ok: false, error: 'code' });
    if (data.action === 'check') return json({ ok: true });
    if (data.action === 'report') return json(addReport(data.entry || {}));
    return json({ ok: false, error: 'action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'list') {
    if (p.code !== ADMIN_CODE) return json({ ok: false, error: 'code' });
    return json({ ok: true, rows: listRows() });
  }
  return json({ ok: true, service: 'geruchsprotokoll' });
}

function addReport(en) {
  const strength = parseInt(en.strength, 10);
  if (!(strength >= 1 && strength <= 5)) return { ok: false, error: 'strength' };
  const house = clean(en.house, 20);
  if (!house) return { ok: false, error: 'house' };
  const id = clean(en.id, 64) || Utilities.getUuid();

  const now = new Date();
  let when = new Date(en.clientTime);
  // Offline gespeicherte Meldungen behalten ihren Zeitpunkt (max. 72 h zurück, nicht in der Zukunft)
  if (isNaN(when) || when > new Date(now.getTime() + 5 * 60000) || when < new Date(now.getTime() - 72 * 3600000)) when = now;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet();
    if (isDuplicate(sh, id)) return { ok: true, duplicate: true };
    const w = weatherAt(when) || {};
    sh.appendRow([
      id, when, now, house, clean(en.name, 40), strength,
      pick(en.type, TYPES), pick(en.duration, DURATIONS), pick(en.place, PLACES), clean(en.note, 300),
      w.windDir == null ? '' : w.windDir, w.windFrom || '', w.windSpeed == null ? '' : w.windSpeed,
      w.gusts == null ? '' : w.gusts, w.temp == null ? '' : w.temp,
    ]);
    return { ok: true, wind: w };
  } finally {
    lock.releaseLock();
  }
}

function listRows() {
  const sh = sheet();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, HEADERS.length).getValues();
  return vals.map(function (r) {
    return {
      id: r[0], time: toIso(r[1]), received: toIso(r[2]), house: String(r[3]), name: r[4], strength: r[5],
      type: r[6], duration: r[7], place: r[8], note: r[9], windDir: r[10], windFrom: r[11],
      windSpeed: r[12], gusts: r[13], temp: r[14],
    };
  });
}

// ---------- Hilfsfunktionen ----------
function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== 'ID') {
    sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function isDuplicate(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return false;
  const start = Math.max(2, last - 300);
  const ids = sh.getRange(start, 1, last - start + 1, 1).getValues();
  return ids.some(function (r) { return r[0] === id; });
}

function weatherAt(when) {
  try {
    const fresh = (new Date() - when) < 20 * 60000;
    const base = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&timezone=Europe%2FBerlin';
    if (fresh) {
      const j = JSON.parse(UrlFetchApp.fetch(base + '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m').getContentText());
      return fmtWeather(j.current.wind_direction_10m, j.current.wind_speed_10m, j.current.wind_gusts_10m, j.current.temperature_2m);
    }
    const j = JSON.parse(UrlFetchApp.fetch(base + '&past_days=3&forecast_days=1&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m').getContentText());
    const key = Utilities.formatDate(when, 'Europe/Berlin', "yyyy-MM-dd'T'HH:00");
    const i = j.hourly.time.indexOf(key);
    if (i < 0) return null;
    return fmtWeather(j.hourly.wind_direction_10m[i], j.hourly.wind_speed_10m[i], j.hourly.wind_gusts_10m[i], j.hourly.temperature_2m[i]);
  } catch (err) {
    return null;
  }
}

function fmtWeather(dir, speed, gusts, temp) {
  return {
    windDir: Math.round(dir),
    windFrom: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((dir % 360) / 45) % 8],
    windSpeed: Math.round(speed),
    gusts: gusts == null ? null : Math.round(gusts),
    temp: temp,
  };
}

function clean(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keine Formeln in der Tabelle
  return s;
}
function pick(v, allowed) { return allowed.indexOf(v) >= 0 ? v : ''; }
function toIso(d) { return d instanceof Date ? d.toISOString() : String(d || ''); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Einmal im Editor ausführen, um die Berechtigungen (Tabelle + Wetterabruf) freizugeben. */
function testEinrichtung() {
  sheet();
  Logger.log(JSON.stringify(weatherAt(new Date())));
}
