(() => {
  "use strict";
  const C = window.GERUCH_CONFIG || {};
  const DEMO = !C.apiUrl;
  const KEY = "gp_admin";
  const COLORS = { 1: "#84cc16", 2: "#eab308", 3: "#f97316", 4: "#ef4444", 5: "#9f1239" };
  const LABELS = { 1: "leicht", 2: "deutlich", 3: "stark", 4: "sehr stark", 5: "unerträglich" };
  const DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  let all = [];

  async function fetchRows(code) {
    if (DEMO) return JSON.parse(localStorage.getItem("gp_demo_rows") || "[]");
    const r = await fetch(`${C.apiUrl}?action=list&code=${encodeURIComponent(code)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error === "code" ? "Admin-Code stimmt nicht." : "Fehler beim Laden.");
    return j.rows;
  }

  function filtered() {
    const days = +$("range").value;
    if (!days) return all;
    const from = Date.now() - days * 86400000;
    return all.filter((r) => new Date(r.time).getTime() >= from);
  }

  // Stunden-Schlüssel in lokaler Zeit (Europe/Berlin, Browserzeit)
  function hourKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}`; }
  function odourHours(rows) {
    const set = new Set();
    for (const r of rows) {
      const d = new Date(r.time);
      set.add(hourKey(d));
      if (r.duration === "1 Std. oder länger") set.add(hourKey(new Date(d.getTime() - 3600000)));
    }
    return set;
  }

  function render() {
    const rows = filtered().slice().sort((a, b) => new Date(b.time) - new Date(a.time));
    const hours = odourHours(rows);
    const houses = new Set(rows.map((r) => String(r.house).trim().toLowerCase()).filter(Boolean));
    const days = new Set(rows.map((r) => new Date(r.time).toDateString()));
    const avg = rows.length ? (rows.reduce((s, r) => s + (+r.strength || 0), 0) / rows.length).toFixed(1) : "–";

    $("asOf").textContent = new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    $("kpis").innerHTML = [
      [rows.length, "Meldungen"],
      [hours.size, "Geruchsstunden (geschätzt)"],
      [days.size, "Tage mit Geruch"],
      [houses.size, "beteiligte Haushalte"],
      [avg, "Ø Stärke (1–5)"],
    ].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");

    // Geruchsstunden pro Monat
    const months = {};
    for (const k of hours) { const m = k.slice(0, 7); months[m] = (months[m] || 0) + 1; }
    const mKeys = Object.keys(months).sort().slice(-12);
    bars($("monthBars"), mKeys.map((m) => ({ v: months[m], l: new Date(m + "-01").toLocaleDateString("de-DE", { month: "short", year: "2-digit" }) })));

    // Uhrzeit
    const hc = Array(24).fill(0);
    for (const r of rows) hc[new Date(r.time).getHours()]++;
    bars($("hourBars"), hc.map((v, i) => ({ v, l: i % 3 === 0 ? `${i}h` : "" })), true);

    // Windrose
    const sec = Array(8).fill(0);
    for (const r of rows) {
      if (r.windDir === "" || r.windDir == null || isNaN(+r.windDir)) continue;
      sec[Math.round((+r.windDir % 360) / 45) % 8]++;
    }
    rose($("rose"), sec);

    // Tabelle
    $("table").querySelector("tbody").innerHTML = rows.map((r) => `<tr>
      <td>${esc(new Date(r.time).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }))}</td>
      <td>${esc(r.house)}${r.name ? `<br><small>${esc(r.name)}</small>` : ""}</td>
      <td><span class="pill" style="background:${COLORS[r.strength] || "#999"}">${esc(r.strength)}</span> ${esc(LABELS[r.strength] || "")}</td>
      <td>${esc(r.type)}</td><td>${esc(r.duration)}</td><td>${esc(r.place)}</td>
      <td>${r.windFrom ? `${esc(r.windFrom)} ${esc(r.windSpeed)} km/h` : "–"}</td>
      <td>${esc(r.note)}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Noch keine Meldungen.</td></tr>`;
  }

  function bars(el, data, compact) {
    const max = Math.max(1, ...data.map((d) => d.v));
    if (!data.length || data.every((d) => !d.v)) { el.innerHTML = `<div class="empty">Noch keine Daten</div>`; return; }
    el.innerHTML = data.map((d) => `<div class="b"><em>${d.v || (compact ? "" : "0")}</em><i style="height:${(d.v / max) * 100}%"></i><small>${esc(d.l)}</small></div>`).join("");
  }

  function rose(el, sec) {
    const max = Math.max(1, ...sec), R = 100, cx = 130, cy = 130;
    if (!sec.some(Boolean)) { el.innerHTML = `<div class="empty">Noch keine Winddaten</div>`; return; }
    let s = `<svg viewBox="0 0 260 260" role="img" aria-label="Windrose">`;
    for (const f of [0.33, 0.66, 1]) s += `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="var(--line)"/>`;
    sec.forEach((v, i) => {
      const r = (v / max) * R, a0 = ((i * 45 - 20) - 90) * Math.PI / 180, a1 = ((i * 45 + 20) - 90) * Math.PI / 180;
      if (v) s += `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 0,1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="var(--accent)" opacity=".85"/>`;
      const la = (i * 45 - 90) * Math.PI / 180;
      s += `<text x="${cx + (R + 18) * Math.cos(la)}" y="${cy + (R + 18) * Math.sin(la) + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">${DIRS[i]}</text>`;
      if (v) s += `<text x="${cx + (r + 10) * Math.cos(la) * 0.75}" y="${cy + (r + 10) * Math.sin(la) * 0.75 + 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${v}</text>`;
    });
    el.innerHTML = s + `</svg>`;
  }

  function csv() {
    const rows = filtered().slice().sort((a, b) => new Date(a.time) - new Date(b.time));
    const head = ["Datum", "Uhrzeit", "Hausnummer", "Name", "Stärke (1-5)", "Geruchsart", "Dauer", "Ort", "Wind aus", "Wind aus (°)", "Wind km/h", "Böen km/h", "Temperatur °C", "Notiz"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => {
      const d = new Date(r.time);
      return [d.toLocaleDateString("de-DE"), d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), r.house, r.name, r.strength, r.type, r.duration, r.place, r.windFrom, r.windDir, r.windSpeed, r.gusts, r.temp, r.note].map(q).join(";");
    });
    const blob = new Blob(["\ufeff" + [head.map(q).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `geruchsprotokoll-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
  }

  async function login(code) {
    $("loginBtn").disabled = true;
    $("loginError").hidden = true;
    try {
      all = await fetchRows(code);
      localStorage.setItem(KEY, code);
      $("viewLogin").hidden = true;
      $("viewDash").hidden = false;
      render();
    } catch (e) {
      localStorage.removeItem(KEY);
      $("viewLogin").hidden = false;
      $("viewDash").hidden = true;
      $("loginError").textContent = e.message.includes("Code") ? e.message : "Keine Verbindung.";
      $("loginError").hidden = false;
    } finally {
      $("loginBtn").disabled = false;
    }
  }

  $("loginForm").addEventListener("submit", (e) => { e.preventDefault(); login($("adminCode").value.trim()); });
  $("range").addEventListener("change", render);
  $("csvBtn").addEventListener("click", csv);
  $("printBtn").addEventListener("click", () => window.print());
  $("logoutBtn").addEventListener("click", () => { localStorage.removeItem(KEY); location.reload(); });

  document.querySelectorAll(".js-subtitle").forEach((el) => (el.textContent = C.subtitle || ""));
  $("demoBanner").hidden = !DEMO;
  const saved = localStorage.getItem(KEY);
  if (DEMO) login("demo");
  else if (saved) login(saved);
  else $("viewLogin").hidden = false;
})();
