(() => {
  "use strict";

  const C = window.GERUCH_CONFIG || {};
  const DEMO = !C.apiUrl;
  const LAT = 49.866, LON = 10.842; // Stegaurach

  const LS = { profile: "gp_profile", queue: "gp_queue", history: "gp_history", demoRows: "gp_demo_rows" };

  const STRENGTHS = [
    { v: 1, emo: "😐", label: "leicht", c: "var(--s1)" },
    { v: 2, emo: "😕", label: "deutlich", c: "var(--s2)" },
    { v: 3, emo: "😣", label: "stark", c: "var(--s3)" },
    { v: 4, emo: "🤢", label: "sehr stark", c: "var(--s4)" },
    { v: 5, emo: "🤮", label: "unerträglich", c: "var(--s5)" },
  ];
  const CHOICES = {
    type: ["Frittierfett", "Fleisch / Räucherei", "Verbrannt / Rauch", "Gülle / Fäkal", "Chemisch", "Sonstiges"],
    duration: ["gerade eben", "ca. 30 Min", "1 Std. oder länger"],
    place: ["draußen", "im Haus", "auf der Straße"],
  };

  const $ = (id) => document.getElementById(id);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtTime = (iso) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  let selected = { strength: null, type: C.defaultType || CHOICES.type[0], duration: CHOICES.duration[0], place: CHOICES.place[0] };

  // ---------- API ----------
  async function api(payload) {
    if (DEMO) return demoApi(payload);
    const res = await fetch(C.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // "simple request": kein CORS-Preflight
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function demoApi(p) {
    await new Promise((r) => setTimeout(r, 350));
    if (p.action === "check") return { ok: true };
    const wind = await fetchWindClient().catch(() => null);
    const rows = load(LS.demoRows, []);
    if (!rows.some((r) => r.id === p.entry.id)) rows.push({ ...p.entry, time: p.entry.clientTime, ...(wind || {}) });
    save(LS.demoRows, rows);
    return { ok: true, wind };
  }

  async function fetchWindClient() {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=wind_speed_10m,wind_direction_10m,temperature_2m&timezone=Europe%2FBerlin`;
    const j = await (await fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined })).json();
    const d = j.current.wind_direction_10m;
    return { windDir: d, windFrom: compass(d), windSpeed: Math.round(j.current.wind_speed_10m), temp: j.current.temperature_2m };
  }
  function compass(deg) {
    return ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(((deg % 360) / 45)) % 8];
  }

  // ---------- Warteschlange (offline-fest) ----------
  async function flushQueue() {
    const queue = load(LS.queue, []);
    if (!queue.length) return { sent: 0, last: null };
    const profile = load(LS.profile, null);
    let sent = 0, last = null;
    for (const entry of [...queue]) {
      let res;
      try {
        res = await api({ action: "report", code: profile && profile.code, entry });
      } catch (e) {
        break; // offline / Server nicht erreichbar → später erneut
      }
      if (res && res.ok) {
        sent++; last = res;
        removeFromQueue(entry.id);
        markHistory(entry.id, "sent");
      } else if (res && res.error === "code") {
        localStorage.removeItem(LS.profile);
        showSetup("Der Zugangscode hat sich geändert. Bitte neu eingeben.");
        break;
      } else {
        removeFromQueue(entry.id); // ungültiger Eintrag – nicht endlos wiederholen
        markHistory(entry.id, "error");
      }
    }
    renderHistory();
    return { sent, last };
  }
  function removeFromQueue(id) { save(LS.queue, load(LS.queue, []).filter((e) => e.id !== id)); }
  function markHistory(id, status) {
    const h = load(LS.history, []);
    const it = h.find((x) => x.id === id);
    if (it) { it.status = status; save(LS.history, h); }
  }

  // ---------- Ansichten ----------
  function show(id) {
    for (const v of ["viewSetup", "viewMain", "viewDone"]) $(v).hidden = v !== id;
    window.scrollTo(0, 0);
  }

  function showSetup(msg) {
    const p = load(LS.profile, null);
    if (p) { $("setupHouse").value = p.house || ""; $("setupName").value = p.name || ""; }
    $("setupError").hidden = !msg;
    $("setupError").textContent = msg || "";
    show("viewSetup");
  }

  function showMain() {
    const p = load(LS.profile, null);
    $("houseLabel").textContent = p.house;
    resetSelection();
    renderHistory();
    show("viewMain");
  }

  function resetSelection() {
    selected.strength = null;
    $("note").value = "";
    $("details").hidden = true;
    renderStrengths();
  }

  function renderStrengths() {
    const wrap = $("strengths");
    wrap.innerHTML = "";
    wrap.classList.toggle("has-sel", selected.strength !== null);
    for (const s of STRENGTHS) {
      const b = document.createElement("button");
      b.className = "strength" + (selected.strength === s.v ? " sel" : "");
      b.style.setProperty("--c", s.c);
      b.type = "button";
      b.innerHTML = `<span class="emo">${s.emo}</span><span>${s.label}</span><span class="bar">${STRENGTHS.map((x) => `<i class="${x.v <= s.v ? "on" : ""}"></i>`).join("")}</span>`;
      b.addEventListener("click", () => {
        selected.strength = s.v;
        renderStrengths();
        $("details").hidden = false;
        requestAnimationFrame(() => $("details").scrollIntoView({ behavior: "smooth", block: "start" }));
      });
      wrap.appendChild(b);
    }
  }

  function renderChips() {
    document.querySelectorAll(".chips").forEach((el) => {
      const name = el.dataset.name;
      el.innerHTML = "";
      for (const opt of CHOICES[name]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (selected[name] === opt ? " sel" : "");
        b.textContent = opt;
        b.addEventListener("click", () => { selected[name] = opt; renderChips(); });
        el.appendChild(b);
      }
    });
  }

  function renderHistory() {
    const h = load(LS.history, []).slice(-8).reverse();
    $("historyWrap").hidden = !h.length;
    $("history").innerHTML = h.map((e) => {
      const s = STRENGTHS.find((x) => x.v === e.strength) || STRENGTHS[0];
      const st = e.status === "sent" ? "✓ gesendet" : e.status === "error" ? "⚠ Fehler" : "⏳ wartet";
      return `<li><span class="dot" style="background:${s.c}"></span><span>${fmtTime(e.clientTime)} · ${s.label}</span><span class="st">${st}</span></li>`;
    }).join("");
  }

  function showDone(entry, res) {
    const ok = res && res.sent > 0;
    $("doneIcon").textContent = ok ? "✓" : "⏳";
    $("doneIcon").className = "check" + (ok ? "" : " wait");
    $("doneTitle").textContent = ok ? "Danke, ist eingetragen!" : "Gespeichert";
    $("doneText").textContent = ok
      ? fmtTime(entry.clientTime) + " Uhr"
      : "Keine Verbindung – wird automatisch gesendet, sobald du wieder online bist.";
    const w = ok && res.last && res.last.wind;
    $("doneWind").textContent = w && w.windFrom ? `Wind aus ${w.windFrom}, ${w.windSpeed} km/h` : "";
    show("viewDone");
    clearTimeout(showDone.t);
    showDone.t = setTimeout(() => { if (!$("viewDone").hidden) showMain(); }, 6000);
  }

  // ---------- Events ----------
  $("setupForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = $("setupCode").value.trim();
    const house = $("setupHouse").value.trim();
    const name = $("setupName").value.trim();
    if (!code || !house) return;
    $("setupBtn").disabled = true;
    $("setupBtn").textContent = "Prüfe …";
    $("setupError").hidden = true;
    try {
      const res = await api({ action: "check", code });
      if (!res.ok) throw new Error(res.error === "code" ? "Der Zugangscode stimmt nicht." : "Unbekannter Fehler.");
      save(LS.profile, { code, house, name });
      showMain();
      flushQueue();
    } catch (e) {
      $("setupError").textContent = e.message.startsWith("Der") || e.message.startsWith("Unbekannt") ? e.message : "Keine Verbindung. Bitte später nochmal versuchen.";
      $("setupError").hidden = false;
    } finally {
      $("setupBtn").disabled = false;
      $("setupBtn").textContent = "Los geht's";
    }
  });

  $("submitBtn").addEventListener("click", async () => {
    if (!selected.strength) return;
    const p = load(LS.profile, {});
    const entry = {
      id: uid(),
      clientTime: new Date().toISOString(),
      house: p.house,
      name: p.name || "",
      strength: selected.strength,
      type: selected.type,
      duration: selected.duration,
      place: selected.place,
      note: $("note").value.trim(),
    };
    save(LS.queue, [...load(LS.queue, []), entry]);
    save(LS.history, [...load(LS.history, []), { ...entry, status: "queued" }].slice(-50));
    $("submitBtn").disabled = true;
    $("submitBtn").textContent = "Sende …";
    const res = await flushQueue();
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "Eintragen";
    showDone(entry, res);
  });

  $("cancelBtn").addEventListener("click", resetSelection);
  $("doneBtn").addEventListener("click", showMain);
  $("editProfile").addEventListener("click", () => {
    const p = load(LS.profile, {});
    $("setupCode").value = p.code || "";
    showSetup();
  });
  window.addEventListener("online", flushQueue);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) flushQueue(); });

  // ---------- Start ----------
  document.querySelectorAll(".js-title").forEach((el) => (el.textContent = C.title || "Geruchsprotokoll"));
  document.querySelectorAll(".js-subtitle").forEach((el) => (el.textContent = C.subtitle || ""));
  document.title = C.title || "Geruchsprotokoll";
  $("demoBanner").hidden = !DEMO;
  renderChips();

  // Zugangscode per Link vorbelegen: ...?code=XYZ
  const urlCode = new URLSearchParams(location.search).get("code");
  if (urlCode) {
    $("setupCode").value = urlCode;
    history.replaceState(null, "", location.pathname);
  }

  if (load(LS.profile, null)) { showMain(); flushQueue(); }
  else showSetup();
})();
