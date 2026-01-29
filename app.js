/* ALFM GFunds Tracker (PWA)
   - Snapshots parsed from pasted GCash text
   - Events: deposits, dividends (cash/reinvest)
   - Local storage + export/import + CSV export
   - Charts: NAVPU, Value, Units
*/

const STORAGE_KEY = "alfm_gfunds_tracker_v1";

const $ = (id) => document.getElementById(id);

// ---------- Utilities ----------
function fmtMoney(n){
  if (n == null || Number.isNaN(n)) return "—";
  return "₱ " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n, digits=4){
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n){
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2) + "%";
}
function parseMoneyLike(s){
  // Accept: "PHP 6,329.87" or "6,329.87" or "P 6,329.87"
  if (!s) return null;
  const cleaned = String(s).replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  // remove thousands separators
  const normalized = cleaned.replace(/,/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
function parsePercentLike(s){
  if (!s) return null;
  const m = String(s).match(/(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
function pad2(x){ return String(x).padStart(2,"0"); }
function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function fromISODate(s){
  // expects YYYY-MM-DD
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function niceDate(d){
  return d.toLocaleDateString("en-PH", { year:"numeric", month:"short", day:"2-digit" });
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

// ---------- Data Model ----------
/*
state = {
  fundName: string,
  snapshots: [
    { id, asOfISO, navpu, units, value, oneYearReturn, pendingBuy, pendingSell, rawText }
  ],
  events: [
    { id, type:'deposit'|'dividend', dateISO, amount, note, dividendType?:'cash'|'reinvest', navOverride?:number }
  ],
  ui: { sortKey, sortDir, rangeDays }
}
*/

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function defaultState(){
  return {
    fundName: "ALFM Global Multi-Asset Income Fund Inc - PHP",
    snapshots: [],
    events: [],
    ui: { sortKey: "date", sortDir: "desc", rangeDays: "all" }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // minimal migration safety
    return {
      ...defaultState(),
      ...parsed,
      ui: { ...defaultState().ui, ...(parsed.ui || {}) },
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  }catch{
    return defaultState();
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ---------- Parsing GCash Paste ----------
function parseSnapshotFromText(text){
  const t = (text || "").replace(/\r/g, "");
  const lower = t.toLowerCase();

  // As of date: "as of Jan 27, 2026" OR "as of Dec 29, 2025"
  const dateMatch = t.match(/as of\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i);
  let asOf = null;
  if(dateMatch){
    asOf = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
  }

  // 1-year return: "3.0700% 1 yr" (some have 4 decimals)
  const oneYrMatch = t.match(/(\d+(?:\.\d+)?)%\s*1\s*yr/i);
  const oneYearReturn = oneYrMatch ? Number(oneYrMatch[1]) : null;

  // Total Investment Value: find line containing it then next number
  // Works with formats where number appears after label.
  const value = (() => {
    // Try: "Total Investment Value ... PHP 6,329.87"
    const m = t.match(/Total\s+Investment\s+Value[\s\S]{0,80}?(PHP|P)?\s*([\d,]+(?:\.\d+)?)/i);
    if(m) return parseMoneyLike(m[2]);
    // fallback: maybe in separate lines
    const m2 = t.match(/Total\s+Investment\s+Value[\s\S]{0,120}?([\d,]+(?:\.\d+)?)/i);
    return m2 ? parseMoneyLike(m2[1]) : null;
  })();

  const units = (() => {
    const m = t.match(/Total\s+Units[\s\S]{0,60}?([\d,]+(?:\.\d+)?)/i);
    return m ? parseMoneyLike(m[1]) : null;
  })();

  const navpu = (() => {
    const m = t.match(/NAVPU[\s\S]{0,60}?(PHP|P)?\s*([\d,]+(?:\.\d+)?)/i);
    return m ? parseMoneyLike(m[2]) : null;
  })();

  const pendingBuy = (() => {
    const m = t.match(/Pending\s+Buy\s+Orders?[\s\S]{0,60}?(PHP|P)?\s*([\d,]+(?:\.\d+)?)/i);
    return m ? parseMoneyLike(m[2]) : 0;
  })();

  const pendingSell = (() => {
    const m = t.match(/Pending\s+Sell\s+Orders?[\s\S]{0,60}?(PHP|P)?\s*([\d,]+(?:\.\d+)?)/i);
    return m ? parseMoneyLike(m[2]) : 0;
  })();

  // Fund name: keep fixed to ALFM; still parse if present
  const fundName = (() => {
    const m = t.match(/ALFM\s+Global[\s\S]{0,80}?Fund[\s\S]{0,80}?-?\s*PHP/i);
    if(m) return "ALFM Global Multi-Asset Income Fund Inc - PHP";
    return state.fundName || "ALFM Global Multi-Asset Income Fund Inc - PHP";
  })();

  const problems = [];
  if(!asOf) problems.push("Missing “as of” date");
  if(value == null) problems.push("Missing Total Investment Value");
  if(units == null) problems.push("Missing Total Units");
  if(navpu == null) problems.push("Missing NAVPU");
  if(oneYearReturn == null) problems.push("Missing 1-year return");

  return {
    ok: problems.length === 0,
    problems,
    snapshot: {
      id: uid(),
      fundName,
      asOfISO: asOf ? toISODate(asOf) : null,
      navpu,
      units,
      value,
      oneYearReturn,
      pendingBuy: pendingBuy ?? 0,
      pendingSell: pendingSell ?? 0,
      rawText: t.trim()
    }
  };
}

// ---------- Events ----------
function addDeposit(dateISO, amount, note){
  state.events.push({
    id: uid(),
    type: "deposit",
    dateISO,
    amount,
    note: note || ""
  });
  saveState();
  render();
}
function addDividend(dateISO, amount, dividendType, navOverride, note){
  state.events.push({
    id: uid(),
    type: "dividend",
    dateISO,
    amount,
    dividendType,
    navOverride: navOverride ?? null,
    note: note || ""
  });
  saveState();
  render();
}

// ---------- Derived & Analysis ----------
function sortSnapshots(snapshots){
  return [...snapshots].sort((a,b)=> a.asOfISO.localeCompare(b.asOfISO));
}
function sortEvents(events){
  return [...events].sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
}

function getRangeFilteredSnapshots(){
  const snaps = sortSnapshots(state.snapshots);
  const range = state.ui.rangeDays;
  if(range === "all") return snaps;
  const days = Number(range);
  if(!Number.isFinite(days)) return snaps;
  const last = snaps[snaps.length - 1];
  if(!last) return snaps;
  const lastD = fromISODate(last.asOfISO);
  const minD = new Date(lastD);
  minD.setDate(minD.getDate() - days);
  const minISO = toISODate(minD);
  return snaps.filter(s => s.asOfISO >= minISO);
}

function nearestSnapshotNav(dateISO){
  // choose snapshot with asOf closest <= event date, else earliest after
  const snaps = sortSnapshots(state.snapshots);
  if(snaps.length === 0) return null;
  let best = null;
  for(const s of snaps){
    if(s.asOfISO <= dateISO) best = s;
  }
  if(best) return best.navpu;
  return snaps[0].navpu;
}

function eventsBetween(aISO, bISO){
  // (a, b] interval
  return state.events.filter(e => e.dateISO > aISO && e.dateISO <= bISO);
}

function computeIntervalBreakdown(prev, curr){
  // Returns explanation for how value changed between snapshots.
  const deltaValue = curr.value - prev.value;
  const deltaUnits = curr.units - prev.units;
  const deltaNav = curr.navpu - prev.navpu;

  // Estimate cashflow implied by unit change at current NAV
  const impliedCashflow = deltaUnits * curr.navpu; // includes deposits or reinvested dividends
  const marketEffect = (prev.units * curr.navpu) - (prev.units * prev.navpu); // effect if units stayed

  // Sum logged cashflows in interval
  const evs = eventsBetween(prev.asOfISO, curr.asOfISO);
  let deposits = 0;
  let divCash = 0;
  let divReinvest = 0;
  let reinvestUnits = 0;

  for(const e of evs){
    if(e.type === "deposit") deposits += e.amount;
    if(e.type === "dividend"){
      if(e.dividendType === "cash") divCash += e.amount;
      else{
        divReinvest += e.amount;
        const nav = (e.navOverride && Number.isFinite(e.navOverride)) ? e.navOverride : (nearestSnapshotNav(e.dateISO) ?? curr.navpu);
        if(nav && nav > 0) reinvestUnits += (e.amount / nav);
      }
    }
  }

  // Tag inference
  let tag = "Market move";
  if(Math.abs(deltaUnits) > 1e-9 && deposits > 0) tag = "Deposit executed";
  else if(Math.abs(deltaUnits) > 1e-9 && divReinvest > 0) tag = "Dividend reinvested";
  else if(Math.abs(deltaUnits) < 1e-9 && divCash > 0) tag = "Dividend cash payout";
  else if(Math.abs(deltaUnits) > 1e-9) tag = "Units changed (unlogged cashflow)";

  const notes = [];
  notes.push(`ΔValue ${fmtMoney(deltaValue)} | ΔUnits ${fmtNum(deltaUnits,4)} | ΔNAV ${fmtMoney(deltaNav)}`);
  notes.push(`Implied cashflow from unit change ≈ ${fmtMoney(impliedCashflow)}`);
  if(deposits) notes.push(`Logged deposits in range: ${fmtMoney(deposits)}`);
  if(divCash) notes.push(`Cash dividends in range: ${fmtMoney(divCash)}`);
  if(divReinvest) notes.push(`Reinvest dividends in range: ${fmtMoney(divReinvest)} (≈ ${fmtNum(reinvestUnits,4)} units)`);
  notes.push(`Market effect estimate (units constant): ≈ ${fmtMoney(marketEffect)}`);

  // Explain differences between implied and logged
  const loggedCashflow = deposits + divReinvest;
  const gap = impliedCashflow - loggedCashflow;
  const gapAbs = Math.abs(gap);
  if(gapAbs > 2){ // tolerance
    notes.push(`Unmatched cashflow estimate: ≈ ${fmtMoney(gap)} (could be execution timing, NAV differences, or missing event logs)`);
  }

  return { tag, notes, deposits, divCash, divReinvest, impliedCashflow, marketEffect };
}

function latestInsight(){
  const snaps = sortSnapshots(state.snapshots);
  if(snaps.length < 2) return "Add at least 2 snapshots to see insights.";
  const prev = snaps[snaps.length - 2];
  const curr = snaps[snaps.length - 1];
  const br = computeIntervalBreakdown(prev, curr);

  const direction = (curr.value - prev.value) >= 0 ? "up" : "down";
  const delta = curr.value - prev.value;
  const line1 = `Since ${niceDate(fromISODate(prev.asOfISO))}, your value is ${direction} by ${fmtMoney(delta)}.`;
  const line2 = `Auto tag: ${br.tag}.`;
  return `${line1} ${line2}`;
}

// ---------- Rendering ----------
function setDefaultDates(){
  const today = new Date();
  const iso = toISODate(today);
  if(!$("depDate").value) $("depDate").value = iso;
  if(!$("divDate").value) $("divDate").value = iso;
}

function renderKPIs(){
  const snaps = sortSnapshots(state.snapshots);
  const last = snaps[snaps.length - 1];
  const prev = snaps[snaps.length - 2] || null;

  $("fundNamePill").textContent = "ALFM Global Multi-Asset Income Fund (PHP)";

  if(!last){
    $("currentAsOf").textContent = "No snapshots yet";
    $("kpiValue").textContent = "₱ —";
    $("kpiUnits").textContent = "—";
    $("kpiNav").textContent = "₱ —";
    $("kpi1y").textContent = "—";
    $("kpiValueDelta").textContent = "—";
    $("kpiUnitsDelta").textContent = "—";
    $("kpiNavDelta").textContent = "—";
    $("kpi1yDelta").textContent = "—";
    $("latestInsight").textContent = latestInsight();
    $("cashflowSummary").textContent = "Add snapshots and events to see breakdown.";
    return;
  }

  $("currentAsOf").textContent = `As of ${niceDate(fromISODate(last.asOfISO))}`;
  $("kpiValue").textContent = fmtMoney(last.value);
  $("kpiUnits").textContent = fmtNum(last.units, 4);
  $("kpiNav").textContent = fmtMoney(last.navpu);
  $("kpi1y").textContent = fmtPct(last.oneYearReturn);

  const deltas = (prev) ? {
    value: last.value - prev.value,
    units: last.units - prev.units,
    nav: last.navpu - prev.navpu,
    oneYear: last.oneYearReturn - prev.oneYearReturn
  } : { value:null, units:null, nav:null, oneYear:null };

  $("kpiValueDelta").textContent = prev ? `Δ ${fmtMoney(deltas.value)}` : "—";
  $("kpiUnitsDelta").textContent = prev ? `Δ ${fmtNum(deltas.units,4)}` : "—";
  $("kpiNavDelta").textContent = prev ? `Δ ${fmtMoney(deltas.nav)}` : "—";
  $("kpi1yDelta").textContent = prev ? `Δ ${fmtPct(deltas.oneYear)}` : "—";

  $("latestInsight").textContent = latestInsight();

  // cashflow summary for selected range
  const rangeSnaps = getRangeFilteredSnapshots();
  if(rangeSnaps.length >= 2){
    const first = rangeSnaps[0];
    const lastR = rangeSnaps[rangeSnaps.length - 1];
    const evs = state.events.filter(e => e.dateISO >= first.asOfISO && e.dateISO <= lastR.asOfISO);

    let deposits = 0, divCash = 0, divReinvest = 0;
    for(const e of evs){
      if(e.type === "deposit") deposits += e.amount;
      if(e.type === "dividend"){
        if(e.dividendType === "cash") divCash += e.amount;
        else divReinvest += e.amount;
      }
    }

    const startValue = first.value;
    const endValue = lastR.value;
    const delta = endValue - startValue;

    const text = [
      `Range: ${niceDate(fromISODate(first.asOfISO))} → ${niceDate(fromISODate(lastR.asOfISO))}`,
      `Deposits: ${fmtMoney(deposits)}`,
      `Dividends (cash): ${fmtMoney(divCash)} | (reinvest): ${fmtMoney(divReinvest)}`,
      `Value change: ${fmtMoney(delta)} (from ${fmtMoney(startValue)} to ${fmtMoney(endValue)})`
    ].join(" • ");

    $("cashflowSummary").textContent = text;
  }else{
    $("cashflowSummary").textContent = "Add more snapshots to compute a range breakdown.";
  }
}

function badgeForChange(n){
  if(n == null || Number.isNaN(n)) return { cls:"badge", text:"—" };
  if(n > 0) return { cls:"badge good", text:"UP" };
  if(n < 0) return { cls:"badge bad", text:"DOWN" };
  return { cls:"badge", text:"FLAT" };
}

function renderTimeline(){
  const timeline = $("timeline");
  timeline.innerHTML = "";

  const snaps = sortSnapshots(state.snapshots);
  const evs = sortEvents(state.events);

  // merge into one list by date
  const combined = [];
  for(const s of snaps){
    combined.push({ kind:"snapshot", dateISO: s.asOfISO, data: s });
  }
  for(const e of evs){
    combined.push({ kind:"event", dateISO: e.dateISO, data: e });
  }
  combined.sort((a,b)=> b.dateISO.localeCompare(a.dateISO)); // desc

  if(combined.length === 0){
    timeline.innerHTML = `<div class="mini-note">No records yet. Paste a snapshot or add an event.</div>`;
    return;
  }

  const snapMap = new Map(snaps.map(s => [s.id, s]));
  const snapByDate = new Map(snaps.map(s => [s.asOfISO, s]));

  combined.forEach((item)=>{
    const wrap = document.createElement("div");
    wrap.className = "item";

    if(item.kind === "snapshot"){
      const s = item.data;

      // compute comparison to previous snapshot
      const idx = snaps.findIndex(x => x.id === s.id);
      const prev = idx > 0 ? snaps[idx - 1] : null;
      const delta = prev ? (s.value - prev.value) : null;
      const b = badgeForChange(delta);

      let auto = "First snapshot";
      if(prev){
        const br = computeIntervalBreakdown(prev, s);
        auto = br.tag;
      }

      wrap.innerHTML = `
        <div class="item-head">
          <div>
            <div class="item-title">Snapshot • ${niceDate(fromISODate(s.asOfISO))}</div>
            <div class="item-sub mono">NAVPU ${fmtMoney(s.navpu)} • Units ${fmtNum(s.units,4)} • Value ${fmtMoney(s.value)} • 1Y ${fmtPct(s.oneYearReturn)}</div>
            <div class="item-sub">Auto: ${auto}</div>
          </div>
          <div class="${b.cls}">${b.text}</div>
        </div>
        <div class="item-grid">
          <div>Pending Buy: ${fmtMoney(s.pendingBuy || 0)}</div>
          <div>Pending Sell: ${fmtMoney(s.pendingSell || 0)}</div>
        </div>
      `;
    } else {
      const e = item.data;
      const d = niceDate(fromISODate(e.dateISO));
      if(e.type === "deposit"){
        wrap.innerHTML = `
          <div class="item-head">
            <div>
              <div class="item-title">Deposit • ${d}</div>
              <div class="item-sub mono">${fmtMoney(e.amount)} • ${e.note ? e.note : ""}</div>
            </div>
            <div class="badge warn">CASHFLOW</div>
          </div>
        `;
      } else {
        const typeLabel = e.dividendType === "reinvest" ? "Dividend (Reinvest)" : "Dividend (Cash)";
        const navText = (e.dividendType === "reinvest" && e.navOverride) ? ` • NAV ${fmtMoney(e.navOverride)}` : "";
        wrap.innerHTML = `
          <div class="item-head">
            <div>
              <div class="item-title">${typeLabel} • ${d}</div>
              <div class="item-sub mono">${fmtMoney(e.amount)}${navText}${e.note ? " • " + e.note : ""}</div>
            </div>
            <div class="badge warn">INCOME</div>
          </div>
        `;
      }
    }

    timeline.appendChild(wrap);
  });
}

function getSortedFilteredTableSnapshots(){
  const snaps = [...state.snapshots];

  // filter by search
  const q = ($("searchBox").value || "").trim().toLowerCase();
  let filtered = snaps;
  if(q){
    filtered = snaps.filter(s => {
      const date = s.asOfISO || "";
      const raw = (s.rawText || "").toLowerCase();
      return date.includes(q) || raw.includes(q);
    });
  }

  // sorting
  const key = state.ui.sortKey;
  const dir = state.ui.sortDir === "asc" ? 1 : -1;

  filtered.sort((a,b)=>{
    const av = getSortVal(a, key);
    const bv = getSortVal(b, key);
    if(av < bv) return -1 * dir;
    if(av > bv) return  1 * dir;
    return 0;
  });

  return filtered;
}

function getSortVal(s, key){
  switch(key){
    case "date": return s.asOfISO;
    case "value": return s.value ?? -Infinity;
    case "units": return s.units ?? -Infinity;
    case "nav": return s.navpu ?? -Infinity;
    case "oneYear": return s.oneYearReturn ?? -Infinity;
    default: return s.asOfISO;
  }
}

function renderTable(){
  const tbody = $("recordsTbody");
  tbody.innerHTML = "";

  const snapsAsc = sortSnapshots(state.snapshots);
  const byId = new Map(snapsAsc.map(s => [s.id, s]));

  const snaps = getSortedFilteredTableSnapshots();
  if(snaps.length === 0){
    tbody.innerHTML = `<tr><td colspan="8" class="analysis">No snapshots found.</td></tr>`;
    return;
  }

  snaps.forEach((s)=>{
    // compute prev snapshot for this record (by date asc)
    const idx = snapsAsc.findIndex(x => x.id === s.id);
    const prev = idx > 0 ? snapsAsc[idx - 1] : null;

    let analysis = "First snapshot";
    if(prev){
      const br = computeIntervalBreakdown(prev, s);
      analysis = `${br.tag}. ${br.notes[0]}`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${s.asOfISO}</td>
      <td class="mono">${fmtMoney(s.value)}</td>
      <td class="mono">${fmtNum(s.units,4)}</td>
      <td class="mono">${fmtMoney(s.navpu)}</td>
      <td class="mono">${fmtPct(s.oneYearReturn)}</td>
      <td class="mono">${fmtMoney(s.pendingBuy || 0)}</td>
      <td class="mono">${fmtMoney(s.pendingSell || 0)}</td>
      <td class="analysis">${analysis}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Charts (Vanilla Canvas) ----------
function drawLineChart(canvas, points, yLabel){
  const ctx = canvas.getContext("2d");
  const W = canvas.width = canvas.clientWidth * devicePixelRatio;
  const H = canvas.height = canvas.getAttribute("height") * devicePixelRatio;

  ctx.clearRect(0,0,W,H);

  // background grid
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1 * devicePixelRatio;

  const pad = 18 * devicePixelRatio;
  const padTop = 18 * devicePixelRatio;
  const padBottom = 24 * devicePixelRatio;

  // title
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `${12*devicePixelRatio}px system-ui`;
  ctx.fillText(yLabel, pad, padTop);

  if(points.length < 2){
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `${12*devicePixelRatio}px system-ui`;
    ctx.fillText("Not enough data", pad, padTop + 18*devicePixelRatio);
    return;
  }

  const ys = points.map(p=>p.y);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if(minY === maxY){
    minY -= 1; maxY += 1;
  }
  const left = pad, right = W - pad;
  const top = padTop + 18*devicePixelRatio, bottom = H - padBottom;

  // grid lines
  for(let i=0;i<=4;i++){
    const y = top + (i*(bottom-top)/4);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // map points
  const xStep = (right-left) / (points.length - 1);
  const mapY = (v)=> bottom - ((v - minY)/(maxY - minY))*(bottom-top);

  // line
  ctx.strokeStyle = "rgba(124,92,255,0.9)";
  ctx.lineWidth = 2.2 * devicePixelRatio;
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x = left + i*xStep;
    const y = mapY(p.y);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(34,195,255,0.9)";
  points.forEach((p,i)=>{
    const x = left + i*xStep;
    const y = mapY(p.y);
    ctx.beginPath();
    ctx.arc(x, y, 2.6*devicePixelRatio, 0, Math.PI*2);
    ctx.fill();
  });

  // min/max labels
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `${11*devicePixelRatio}px ui-monospace`;
  ctx.fillText(minY.toFixed(2), left, bottom + 16*devicePixelRatio);
  ctx.fillText(maxY.toFixed(2), left, top - 6*devicePixelRatio);
}

function renderCharts(){
  const snaps = getRangeFilteredSnapshots();
  const pointsNav = snaps.map(s => ({ x:s.asOfISO, y: s.navpu }));
  const pointsValue = snaps.map(s => ({ x:s.asOfISO, y: s.value }));
  const pointsUnits = snaps.map(s => ({ x:s.asOfISO, y: s.units }));

  drawLineChart($("chartNav"), pointsNav, "NAVPU (PHP)");
  drawLineChart($("chartValue"), pointsValue, "Total Value (PHP)");
  drawLineChart($("chartUnits"), pointsUnits, "Units");
}

// ---------- Export / Import ----------
function downloadText(filename, text){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportJSON(){
  const out = {
    exportedAt: new Date().toISOString(),
    app: "ALFM GFunds Tracker",
    data: state
  };
  downloadText(`alfm-gfunds-tracker-${toISODate(new Date())}.json`, JSON.stringify(out, null, 2));
}

function exportCSV(){
  const snaps = sortSnapshots(state.snapshots);
  const header = ["asOf","totalValue","units","navpu","oneYearReturn","pendingBuy","pendingSell"].join(",");
  const lines = snaps.map(s => [
    s.asOfISO,
    (s.value ?? "").toString(),
    (s.units ?? "").toString(),
    (s.navpu ?? "").toString(),
    (s.oneYearReturn ?? "").toString(),
    (s.pendingBuy ?? 0).toString(),
    (s.pendingSell ?? 0).toString()
  ].join(","));
  const csv = [header, ...lines].join("\n");
  downloadText(`alfm-snapshots-${toISODate(new Date())}.csv`, csv);
}

function importJSONFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const obj = JSON.parse(reader.result);
      const incoming = obj.data || obj; // allow raw state
      if(!incoming || !incoming.snapshots || !incoming.events) throw new Error("Invalid file format.");
      state = {
        ...defaultState(),
        ...incoming,
        ui: { ...defaultState().ui, ...(incoming.ui || {}) }
      };
      saveState();
      render();
      alert("Import successful.");
    }catch(err){
      alert("Import failed: " + (err?.message || "Invalid JSON"));
    }
  };
  reader.readAsText(file);
}

// ---------- Actions ----------
function addSnapshot(snapshot){
  // de-dup by asOf date (if same date exists, replace it)
  const existingIndex = state.snapshots.findIndex(s => s.asOfISO === snapshot.asOfISO);
  if(existingIndex >= 0){
    state.snapshots[existingIndex] = { ...snapshot, id: state.snapshots[existingIndex].id };
  } else {
    state.snapshots.push(snapshot);
  }
  saveState();
  render();
}

function deleteLastSnapshot(){
  const snaps = sortSnapshots(state.snapshots);
  if(snaps.length === 0) return;
  const last = snaps[snaps.length - 1];
  state.snapshots = state.snapshots.filter(s => s.id !== last.id);
  saveState();
  render();
}

function resetAll(){
  if(!confirm("Reset everything? This deletes all snapshots and events.")) return;
  state = defaultState();
  saveState();
  render();
}

// ---------- Tabs ----------
function setupTabs(){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      btn.classList.add("active");
      const name = btn.dataset.tab;
      $("tabDeposit").classList.toggle("show", name==="deposit");
      $("tabDividend").classList.toggle("show", name==="dividend");
    });
  });
}

// ---------- Sort handling ----------
function setupSort(){
  document.querySelectorAll("#recordsTable th[data-sort]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.sort;
      if(state.ui.sortKey === key){
        state.ui.sortDir = (state.ui.sortDir === "asc") ? "desc" : "asc";
      } else {
        state.ui.sortKey = key;
        state.ui.sortDir = "desc";
      }
      saveState();
      renderTable();
    });
  });
}

// ---------- PWA Install + Service Worker ----------
let deferredPrompt = null;

function setupPWA(){
  // SW
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    $("btnInstall").style.display = "inline-flex";
  });

  $("btnInstall").addEventListener("click", async ()=>{
    if(!deferredPrompt){
      alert("If you don’t see install prompt: open this page in Chrome and try again (must be served over https or localhost).");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  // hide by default
  $("btnInstall").style.display = "none";
}

// ---------- Main render ----------
function render(){
  setDefaultDates();
  renderKPIs();
  renderTimeline();
  renderTable();
  renderCharts();
}

// ---------- Wire UI ----------
function setupUI(){
  $("btnParseSave").addEventListener("click", ()=>{
    const text = $("pasteBox").value.trim();
    if(!text){
      alert("Paste your GFunds text first.");
      return;
    }
    const parsed = parseSnapshotFromText(text);
    if(!parsed.ok){
      $("parsePreview").textContent = "Parse issues: " + parsed.problems.join(", ");
      alert("Could not fully parse:\n- " + parsed.problems.join("\n- "));
      return;
    }
    $("parsePreview").textContent = `Parsed OK. Saving snapshot for ${parsed.snapshot.asOfISO}.`;
    addSnapshot(parsed.snapshot);
    $("pasteBox").value = "";
  });

  $("btnClearPaste").addEventListener("click", ()=> $("pasteBox").value = "");

  $("btnAddDeposit").addEventListener("click", ()=>{
    const dateISO = $("depDate").value;
    const amount = parseMoneyLike($("depAmt").value);
    const note = $("depNote").value.trim();
    if(!dateISO) return alert("Choose a date for the deposit.");
    if(amount == null || amount <= 0) return alert("Enter a valid deposit amount.");
    addDeposit(dateISO, amount, note);
    $("depAmt").value = "";
    $("depNote").value = "";
  });

  $("btnAddDividend").addEventListener("click", ()=>{
    const dateISO = $("divDate").value;
    const amount = parseMoneyLike($("divAmt").value);
    const type = $("divType").value;
    const navOverride = parseMoneyLike($("divNavOverride").value);
    const note = $("divNote").value.trim();
    if(!dateISO) return alert("Choose a date for the dividend.");
    if(amount == null || amount <= 0) return alert("Enter a valid dividend amount.");
    addDividend(dateISO, amount, type, navOverride, note);
    $("divAmt").value = "";
    $("divNavOverride").value = "";
    $("divNote").value = "";
  });

  $("btnDeleteLast").addEventListener("click", ()=>{
    if(!confirm("Delete last snapshot?")) return;
    deleteLastSnapshot();
  });

  $("btnReset").addEventListener("click", resetAll);

  $("btnExport").addEventListener("click", exportJSON);
  $("btnCSV").addEventListener("click", exportCSV);

  $("btnImport").addEventListener("click", ()=> $("importFile").click());
  $("importFile").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSONFile(f);
    e.target.value = "";
  });

  $("searchBox").addEventListener("input", ()=> renderTable());

  $("rangeSelect").value = state.ui.rangeDays;
  $("rangeSelect").addEventListener("change", ()=>{
    state.ui.rangeDays = $("rangeSelect").value;
    saveState();
    render();
  });
}

// ---------- Init ----------
setupTabs();
setupSort();
setupUI();
setupPWA();
render();