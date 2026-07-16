import { LS } from './storage';
import { countryFlag } from './constants';
export const generateExportHTML = ({ trip, itinerary, expenses, memories, packing, baseCurrency, people }) => {
  const fmt = (n) => `${baseCurrency} ${Number(n||0).toFixed(2)}`;
  const totalSpent = expenses.reduce((s,e)=>s+(e.amtBase??Number(e.amount??0)),0);
  const doneActs   = itinerary.flatMap(d=>d.activities).filter(a=>a.done).length;
  const allActs    = itinerary.flatMap(d=>d.activities).length;
  const packDone   = Object.values(packing).flat().filter(i=>i.checked).length;
  const packTotal  = Object.values(packing).flat().length;

  const catTotals = {};
  expenses.forEach(e=>{
    const c = e.cat||"Other"; catTotals[c]=(catTotals[c]||0)+(e.amtBase??Number(e.amount??0));
  });
  const topCats = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);

  const escHtml = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const itinHTML = itinerary.map(day=>`
    <div class="day-block">
      <div class="day-label">${escHtml(day.label)}</div>
      ${day.activities.length===0
        ? '<div class="act-empty">No activities planned</div>'
        : day.activities.map(a=>`
        <div class="act-row">
          <span class="act-check">${a.done?'✓':'○'}</span>
          <span class="act-text${a.done?' done':''}">${escHtml(a.text)}</span>
        </div>`).join("")}
    </div>`).join("");

  const expHTML = expenses.length===0
    ? '<p class="empty-note">No expenses recorded.</p>'
    : `<table class="exp-table">
        <thead><tr><th>Category</th><th>Description</th><th>Date</th><th class="amt">Amount</th></tr></thead>
        <tbody>
        ${[...expenses].reverse().map(e=>`
          <tr>
            <td>${escHtml(e.cat?.split(" ")[0]||"")} ${escHtml(e.cat?.split(" ").slice(1).join(" ")||"")}</td>
            <td>${escHtml(e.desc)}</td>
            <td>${escHtml(e.date||"")}</td>
            <td class="amt">${fmt(e.amtBase??e.amount)}</td>
          </tr>`).join("")}
        <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="amt"><strong>${fmt(totalSpent)}</strong></td></tr>
        </tbody>
      </table>`;

  const catBarHTML = topCats.slice(0,6).map(([cat,total])=>{
    const pct = totalSpent>0 ? Math.round((total/totalSpent)*100) : 0;
    return `<div class="cat-bar-row">
      <div class="cat-bar-label">${escHtml(cat)}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      <div class="cat-bar-amt">${fmt(total)}</div>
    </div>`;
  }).join("");

  const memHTML = memories.length===0
    ? '<p class="empty-note">No memories recorded yet.</p>'
    : memories.map(m=>`
      <div class="mem-card">
        ${m.photo?`<img src="${m.photo}" class="mem-photo" alt="${escHtml(m.title)}" />`:""}
        <div class="mem-body">
          <div class="mem-title">${escHtml(m.mood||"")} ${escHtml(m.title)}</div>
          ${m.locationName?`<div class="mem-loc">📍 ${escHtml(m.locationName)}</div>`:""}
          ${m.date?`<div class="mem-date">${escHtml(m.date)}</div>`:""}
          ${m.notes?`<div class="mem-notes">${escHtml(m.notes)}</div>`:""}
        </div>
      </div>`).join("");

  const packHTML = Object.entries(packing).map(([cat,items])=>`
    <div class="pack-cat">
      <div class="pack-cat-label">${escHtml(cat)}</div>
      <div class="pack-items">
        ${items.map(i=>`<span class="pack-item${i.checked?" checked":""}">${i.checked?"✓ ":"○ "}${escHtml(i.name)}</span>`).join("")}
      </div>
    </div>`).join("");

  const duration = trip.startDate&&trip.endDate
    ? Math.round((new Date(trip.endDate)-new Date(trip.startDate))/86400000)+1+" days"
    : trip.startDate||"";
  const travellers = people.length ? people.map(p=>escHtml(p.name)).join(", ") : "Solo";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(trip.name||"My Trip")} — TravelPal Export</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;background:#fff;font-size:14px;line-height:1.6}
  .page{max-width:780px;margin:0 auto;padding:32px 24px}

  /* Hero */
  .hero{background:linear-gradient(135deg,#1a365d,#0d2240);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:28px;position:relative;overflow:hidden}
  .hero::after{content:'✈️';position:absolute;right:28px;top:18px;font-size:48px;opacity:.15}
  .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,200,100,.7);margin-bottom:8px;font-family:Arial,sans-serif}
  .hero-title{font-size:28px;font-weight:700;color:#fff;margin-bottom:4px}
  .hero-dest{font-size:15px;color:rgba(255,255,255,.65);margin-bottom:16px}
  .hero-stats{display:flex;gap:20px;flex-wrap:wrap}
  .hero-stat{text-align:center;background:rgba(255,255,255,.08);border-radius:10px;padding:10px 18px}
  .hero-stat-val{font-size:20px;font-weight:700;color:#ffa828;display:block}
  .hero-stat-lbl{font-size:10px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.8px;font-family:Arial,sans-serif}
  .meta-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:rgba(255,255,255,.5);font-family:Arial,sans-serif}

  /* Section headers */
  .section{margin-bottom:32px}
  .section-hdr{display:flex;align-items:center;gap:10px;border-bottom:2px solid #1a365d;padding-bottom:8px;margin-bottom:16px}
  .section-icon{font-size:18px}
  .section-title{font-size:18px;font-weight:700;color:#1a365d;font-family:Arial,sans-serif}

  /* Itinerary */
  .day-block{margin-bottom:18px;padding-left:16px;border-left:3px solid #ffa828}
  .day-label{font-size:13px;font-weight:700;color:#1a365d;margin-bottom:6px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.6px}
  .act-row{display:flex;align-items:flex-start;gap:8px;padding:3px 0}
  .act-check{font-size:12px;color:#4DB87A;flex-shrink:0;margin-top:2px;font-family:Arial,sans-serif}
  .act-text{font-size:13px;color:#2d3748}
  .act-text.done{text-decoration:line-through;color:#a0aec0}
  .act-empty{font-size:12px;color:#a0aec0;font-style:italic;font-family:Arial,sans-serif}

  /* Budget */
  .cat-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
  .cat-bar-label{font-size:12px;width:140px;flex-shrink:0;font-family:Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cat-bar-track{flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden}
  .cat-bar-fill{height:100%;background:linear-gradient(90deg,#1a365d,#2a52a0);border-radius:4px}
  .cat-bar-amt{font-size:12px;width:90px;text-align:right;font-family:Arial,sans-serif;color:#4a5568}
  .exp-table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;font-family:Arial,sans-serif}
  .exp-table th{background:#1a365d;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  .exp-table td{padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748}
  .exp-table .amt{text-align:right}
  .total-row td{background:#f7fafc;font-weight:700;color:#1a365d}
  .budget-summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .budget-chip{background:#f7fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;text-align:center}
  .budget-chip-val{font-size:18px;font-weight:700;color:#1a365d;display:block}
  .budget-chip-lbl{font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.5px;font-family:Arial,sans-serif}

  /* Memories */
  .mem-card{display:flex;gap:16px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;break-inside:avoid}
  .mem-card:last-child{border-bottom:none}
  .mem-photo{width:140px;height:105px;object-fit:cover;border-radius:10px;flex-shrink:0}
  .mem-body{flex:1}
  .mem-title{font-size:15px;font-weight:700;color:#1a365d;margin-bottom:4px}
  .mem-loc{font-size:11px;color:#718096;margin-bottom:2px;font-family:Arial,sans-serif}
  .mem-date{font-size:11px;color:#a0aec0;margin-bottom:6px;font-family:Arial,sans-serif}
  .mem-notes{font-size:13px;color:#4a5568;line-height:1.6;font-style:italic}

  /* Packing */
  .pack-cat{margin-bottom:16px}
  .pack-cat-label{font-size:12px;font-weight:700;color:#1a365d;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;font-family:Arial,sans-serif}
  .pack-items{display:flex;flex-wrap:wrap;gap:6px}
  .pack-item{font-size:11px;background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 9px;color:#4a5568;font-family:Arial,sans-serif}
  .pack-item.checked{background:#f0fff4;border-color:#c6f6d5;color:#276749}

  /* Footer */
  .footer{margin-top:40px;padding-top:16px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#a0aec0;font-family:Arial,sans-serif}

  .empty-note{font-style:italic;color:#a0aec0;font-size:13px;font-family:Arial,sans-serif}
  .people-row{font-size:13px;color:rgba(255,255,255,.6);margin-top:6px;font-family:Arial,sans-serif}

  /* Print */
  @media print{
    body{font-size:12px}
    .hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .exp-table th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .cat-bar-fill{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .section{page-break-inside:avoid}
    .day-block{page-break-inside:avoid}
    .mem-card{page-break-inside:avoid}
    .no-print{display:none}
  }
</style>
</head>
<body>
<div class="page">

  <!-- Print button (hidden on print) -->
  <div class="no-print" style="text-align:right;margin-bottom:16px">
    <button onclick="window.print()" style="background:#1a365d;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:13px;cursor:pointer;font-family:Arial,sans-serif">🖨️ Print / Save as PDF</button>
  </div>

  <!-- Hero -->
  <div class="hero">
    <div class="hero-eyebrow">TravelPal · Trip Export</div>
    <div class="hero-title">${escHtml(trip.name||"My Trip")}</div>
    <div class="hero-dest">${trip.destination?`📍 ${escHtml(trip.destination)}`:""}</div>
    <div class="hero-stats">
      <div class="hero-stat"><span class="hero-stat-val">${fmt(totalSpent)}</span><span class="hero-stat-lbl">Spent</span></div>
      <div class="hero-stat"><span class="hero-stat-val">${doneActs}/${allActs}</span><span class="hero-stat-lbl">Activities</span></div>
      <div class="hero-stat"><span class="hero-stat-val">${memories.length}</span><span class="hero-stat-lbl">Memories</span></div>
      <div class="hero-stat"><span class="hero-stat-val">${packDone}/${packTotal}</span><span class="hero-stat-lbl">Packed</span></div>
    </div>
    <div class="meta-row">
      ${trip.startDate?`<span>📅 ${escHtml(trip.startDate)}${trip.endDate?" → "+escHtml(trip.endDate):""}</span>`:""}
      ${duration?`<span>⏱ ${escHtml(duration)}</span>`:""}
      ${people.length?`<span>👥 ${escHtml(travellers)}</span>`:""}
    </div>
  </div>

  <!-- Itinerary -->
  <div class="section">
    <div class="section-hdr"><span class="section-icon">📅</span><span class="section-title">Itinerary</span></div>
    ${itinerary.length===0?'<p class="empty-note">No itinerary planned.</p>':itinHTML}
  </div>

  <!-- Budget -->
  <div class="section">
    <div class="section-hdr"><span class="section-icon">💰</span><span class="section-title">Budget &amp; Expenses</span></div>
    <div class="budget-summary">
      <div class="budget-chip"><span class="budget-chip-val">${fmt(totalSpent)}</span><span class="budget-chip-lbl">Total Spent</span></div>
      <div class="budget-chip"><span class="budget-chip-val">${expenses.length}</span><span class="budget-chip-lbl">Transactions</span></div>
      ${people.length?`<div class="budget-chip"><span class="budget-chip-val">${people.length+1}</span><span class="budget-chip-lbl">Travellers</span></div>`:""}
    </div>
    ${topCats.length>0?`<div style="margin-bottom:20px">${catBarHTML}</div>`:""}
    ${expHTML}
  </div>

  <!-- Memories -->
  <div class="section">
    <div class="section-hdr"><span class="section-icon">📸</span><span class="section-title">Memories</span></div>
    ${memHTML}
  </div>

  <!-- Packing -->
  <div class="section">
    <div class="section-hdr"><span class="section-icon">🧳</span><span class="section-title">Packing Checklist</span></div>
    ${packHTML}
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Generated by TravelPal</span>
    <span>Exported ${new Date().toLocaleDateString("en",{day:"numeric",month:"long",year:"numeric"})}</span>
  </div>

</div>
</body>
</html>`;
};

