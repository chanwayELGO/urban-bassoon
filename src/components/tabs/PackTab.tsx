import { useState } from "react"
import { callAi } from "../../lib/ai"
import { DEFAULT_PACKING, WC_DESC, WC_ICON } from "../../lib/constants"
import { LS } from "../../lib/storage"
export function PackTab({
  packing,
  togglePacking,
  addPackingItem,
  packingTotal,
  packingDone,
  trip,
  itinerary,
}) {
  const [newItems, setNewItems] = useState({})
  const [collapsed, setCollapsed] = useState({})
  const [showCal, setShowCal] = useState(false)
  const pct = packingTotal ? Math.round((packingDone / packingTotal) * 100) : 0

  // ── Re-check state ────────────────────────────────────────────────────────
  const [recheck, setRecheck] = useState({ step: "idle", forecast: null, result: null, error: "" })
  // step: idle | fetching | analyzing | ready | error
  const [rcAdded, setRcAdded] = useState({}) // {itemName: true}
  const [rcDismissed, setRcDismissed] = useState(() => LS.get("tc_rc_dismissed", ""))

  // Days until departure
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const depDate = trip.startDate ? new Date(trip.startDate) : null
  const daysUntil = depDate ? Math.ceil((depDate - today) / 86400000) : null
  const showAlert =
    daysUntil !== null &&
    daysUntil >= -1 &&
    daysUntil <= 3 &&
    trip.destination &&
    rcDismissed !== trip.startDate
  const alertLabel =
    daysUntil === 0
      ? "Departure day"
      : daysUntil < 0
        ? "Trip underway"
        : `${daysUntil} day${daysUntil !== 1 ? "s" : ""} to go`

  // ── Fetch multi-day forecast + run Claude re-check ────────────────────────
  const runRecheck = async () => {
    if (!trip.destination) return
    setRecheck({ step: "fetching", forecast: null, result: null, error: "" })
    setRcAdded({})

    try {
      // 1. Geocode destination
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trip.destination)}&count=1`,
      ).then((r) => r.json())
      if (!geo.results?.length) throw new Error(`"${trip.destination}" not found`)
      const { latitude, longitude, name, country } = geo.results[0]

      // 2. Fetch 7-day daily forecast starting from departure (or today)
      const startDate = trip.startDate
        ? depDate < today
          ? today.toISOString().split("T")[0]
          : trip.startDate
        : today.toISOString().split("T")[0]
      const fRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max` +
          `&timezone=auto&forecast_days=7&start_date=${startDate}`,
      ).then((r) => r.json())

      const d = fRes.daily
      const days = d.time.map((date, i) => ({
        date,
        icon: WC_ICON(d.weathercode[i]),
        maxT: Math.round(d.temperature_2m_max[i]),
        minT: Math.round(d.temperature_2m_min[i]),
        rain: d.precipitation_sum[i] ?? 0,
        rainPct: d.precipitation_probability_max[i] ?? 0,
        wind: Math.round(d.windspeed_10m_max[i]),
        code: d.weathercode[i],
      }))

      const forecastSummary = {
        city: `${name}, ${country}`,
        days,
        avgMaxTemp: Math.round(days.reduce((s, d) => s + d.maxT, 0) / days.length),
        avgMinTemp: Math.round(days.reduce((s, d) => s + d.minT, 0) / days.length),
        rainyDays: days.filter((d) => d.rain > 2).length,
        windyDays: days.filter((d) => d.wind > 40).length,
        unit: fRes.daily_units?.temperature_2m_max || "°C",
        conditions: [...new Set(days.map((d) => WC_DESC(d.code)))].join(", "),
      }
      setRecheck((p) => ({ ...p, step: "analyzing", forecast: days }))

      // 3. Build packing list text
      const packingText = Object.entries(packing)
        .map(
          ([cat, items]) =>
            `${cat}:\n` +
            items.map((i) => `  - ${i.name}${i.checked ? " ✓ (packed)" : ""}`).join("\n"),
        )
        .join("\n\n")

      const tripDuration =
        trip.startDate && trip.endDate
          ? Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / 86400000) + 1
          : "unknown"
      const activities = itinerary.flatMap((d) => d.activities.map((a) => a.text)).filter(Boolean)

      // 4. Claude analysis
      const data = {
        content: [
          {
            text: await callAi({
              task: "tip",
              system: `You are a meticulous travel packing advisor. Compare the traveller's packing list against the actual weather forecast and return ONLY valid JSON — no markdown, no extra text.

Shape:
{
  "weather_summary": "2 sentences describing forecast conditions and what they mean for packing",
  "gaps": [
    {"item": "item name (be specific, e.g. 'compact folding umbrella')", "reason": "why needed, citing specific forecast data", "category": "which packing category it belongs to e.g. 🧴 Toiletries"}
  ],
  "overkill": [
    {"item": "existing item in list that seems unnecessary", "reason": "why, citing forecast e.g. 'avg 28°C forecast, heavy winter coat unnecessary'"}
  ],
  "confirmed": ["item already in list that forecast confirms as essential"],
  "overall": "1-line verdict: ready | minor gaps | needs attention"
}

Rules:
- gaps: only flag genuinely weather-driven gaps (rain gear if rainy, sunscreen if hot, layers if temp swing >10°C). Max 8.
- overkill: only flag items clearly wrong for the weather. Be conservative. Max 4.
- confirmed: flag 3–6 items already packed that are exactly right for this forecast.
- Match item names to existing list items where possible for overkill.
- Return ONLY the JSON.`,
              messages: [
                {
                  role: "user",
                  content: `Destination: ${forecastSummary.city}
Trip duration: ${tripDuration} days
Planned activities: ${activities.length ? activities.join(", ") : "general sightseeing"}

WEATHER FORECAST (${forecastSummary.days.length} days from ${startDate}):
- Avg high: ${forecastSummary.avgMaxTemp}${forecastSummary.unit}, avg low: ${forecastSummary.avgMinTemp}${forecastSummary.unit}
- Rainy days: ${forecastSummary.rainyDays}/${forecastSummary.days.length}
- Windy days (>40km/h): ${forecastSummary.windyDays}/${forecastSummary.days.length}
- Conditions: ${forecastSummary.conditions}
- Day-by-day: ${days.map((d) => `${d.date}: ${d.icon} ${d.maxT}/${d.minT}${forecastSummary.unit}, rain ${d.rain}mm (${d.rainPct}%), wind ${d.wind}km/h`).join(" | ")}

CURRENT PACKING LIST:
${packingText}

Analyse this and return the JSON re-check report.`,
                },
              ],
              maxTokens: 1200,
            }),
          },
        ],
      }
      const raw = data.content?.[0]?.text || ""
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim())
      setRecheck({ step: "ready", forecast: days, result: parsed, error: "" })
    } catch (e) {
      setRecheck({
        step: "error",
        forecast: null,
        result: null,
        error: e.message.includes("not found")
          ? e.message
          : "Re-check failed — check connection and try again.",
      })
    }
  }

  const addGapItem = (item, category) => {
    const cats = Object.keys(packing)
    const matched =
      cats.find((c) =>
        c.toLowerCase().includes(
          (category || "")
            .toLowerCase()
            .replace(/^[\p{Emoji}\s]+/u, "")
            .split(" ")[0]
            .toLowerCase(),
        ),
      ) || cats[0]
    addPackingItem(matched, item)
    setRcAdded((p) => ({ ...p, [item]: true }))
  }

  const dismissAlert = () => {
    setRcDismissed(trip.startDate)
    LS.set("tc_rc_dismissed", trip.startDate)
  }

  const verdictColor = (v) =>
    v === "ready" ? "#4DB87A" : v === "minor gaps" ? "#FFA828" : "#FF5C5C"
  const verdictIcon = (v) => (v === "ready" ? "✅" : v === "minor gaps" ? "⚠️" : "🚨")

  // ── Templates library state ───────────────────────────────────────────────
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null) // template id
  const [importMode, setImportMode] = useState("merge") // "merge" | "replace"
  const [importedIds, setImportedIds] = useState(() => LS.get("tc_imported_templates", []))
  const [importFlash, setImportFlash] = useState("")

  const saveImportedIds = (ids) => {
    setImportedIds(ids)
    LS.set("tc_imported_templates", ids)
  }

  // Count how many items from a template are already in the packing list
  const countAlready = (tpl) => {
    const allItems = Object.values(packing)
      .flat()
      .map((i) => i.name.toLowerCase())
    return Object.values(tpl.items)
      .flat()
      .filter((name) => allItems.includes(name.toLowerCase())).length
  }

  const totalItems = (tpl) => Object.values(tpl.items).flat().length

  const importTemplate = (tpl, mode) => {
    const existing = Object.values(packing)
      .flat()
      .map((i) => i.name.toLowerCase())
    const cats = Object.keys(packing)

    if (mode === "replace") {
      const fresh = {}
      Object.entries(DEFAULT_PACKING).forEach(([cat, items]) => {
        fresh[cat] = items.map((name, i) => ({ id: `${cat}-${i}`, name, checked: false }))
      })
      // Add template items on top
      Object.entries(tpl.items).forEach(([cat, items]) => {
        const matched =
          cats.find((c) => c === cat) ||
          cats.find((c) => c.includes(cat.split(" ").slice(1, 2)[0] || "")) ||
          cats[0]
        if (!fresh[matched]) fresh[matched] = []
        items.forEach((name, i) => {
          fresh[matched].push({ id: `tpl_${tpl.id}_${i}_${Date.now()}`, name, checked: false })
        })
      })
      addPackingItem && savePacking && savePacking(fresh)
    } else {
      // Merge: add items not already present
      const newPack = JSON.parse(JSON.stringify(packing))
      Object.entries(tpl.items).forEach(([cat, items]) => {
        const matched =
          cats.find((c) => c === cat) ||
          cats.find((c) => c.includes(cat.split(" ").slice(1, 2)[0] || "")) ||
          cats[0]
        if (!newPack[matched]) newPack[matched] = []
        items.forEach((name, i) => {
          if (!newPack[matched].some((x) => x.name.toLowerCase() === name.toLowerCase())) {
            newPack[matched].push({
              id: `tpl_${tpl.id}_${i}_${Date.now() + i}`,
              name,
              checked: false,
            })
          }
        })
      })
      savePacking(newPack)
    }

    saveImportedIds([...new Set([...importedIds, tpl.id])])
    setSelectedTemplate(null)
    setImportFlash(tpl.name)
    setTimeout(() => setImportFlash(""), 2500)
  }

  // Smart Pack state
  const [occasions, setOccasions] = useState([])
  const [extraNotes, setExtraNotes] = useState("")
  const [suggestions, setSuggestions] = useState(null) // [{category, reason, items:[]}]
  const [contextSummary, setContextSummary] = useState("")
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [addedItems, setAddedItems] = useState({}) // {itemText: true}
  const [showPanel, setShowPanel] = useState(false)

  const OCCASIONS = [
    { id: "beach", label: "🏖️ Beach" },
    { id: "hiking", label: "🥾 Hiking" },
    { id: "skiing", label: "⛷️ Skiing" },
    { id: "business", label: "💼 Business" },
    { id: "wedding", label: "💍 Wedding/Formal" },
    { id: "safari", label: "🦁 Safari" },
    { id: "camping", label: "⛺ Camping" },
    { id: "cruise", label: "🚢 Cruise" },
    { id: "backpack", label: "🎒 Backpacking" },
    { id: "family", label: "👨‍👩‍👧 Family/Kids" },
    { id: "festival", label: "🎉 Festival" },
    { id: "religious", label: "🕌 Religious Sites" },
  ]

  const toggleOccasion = (id) =>
    setOccasions((p) => (p.includes(id) ? p.filter((o) => o !== id) : [...p, id]))

  // Build trip context for the AI
  const buildContext = () => {
    const lines = []
    if (trip.destination) lines.push(`Destination: ${trip.destination}`)
    if (trip.startDate && trip.endDate) {
      const days = Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / 86400000) + 1
      lines.push(`Dates: ${trip.startDate} to ${trip.endDate} (${days} days)`)
      // infer season from month
      const month = new Date(trip.startDate).getMonth()
      const season =
        month < 2 || month === 11
          ? "winter"
          : month < 5
            ? "spring"
            : month < 8
              ? "summer"
              : "autumn"
      lines.push(`Season (in Northern Hemisphere): ${season}`)
    }
    if (itinerary.length > 0) {
      const allActs = itinerary.flatMap((d) => d.activities.map((a) => a.text)).filter(Boolean)
      if (allActs.length) lines.push(`Planned activities: ${allActs.join(", ")}`)
    }
    if (occasions.length > 0) {
      const labels = occasions
        .map((id) => OCCASIONS.find((o) => o.id === id)?.label || id)
        .join(", ")
      lines.push(`Occasion/type of trip: ${labels}`)
    }
    if (extraNotes.trim()) lines.push(`Additional notes: ${extraNotes.trim()}`)
    return lines.join("\n")
  }

  // Get all existing item names for dedup
  const existingNames = new Set(
    Object.values(packing)
      .flat()
      .map((i) => i.name.toLowerCase()),
  )

  const generateSuggestions = async () => {
    if (!trip.destination && occasions.length === 0 && !extraNotes.trim()) return
    setLoadingSuggest(true)
    setSuggestions(null)
    setAddedItems({})
    const context = buildContext()
    try {
      const data = {
        content: [
          {
            text: await callAi({
              task: "tip",
              system: `You are a world-class travel packing expert. Analyze the trip details and return ONLY valid JSON — no markdown, no extra text.
Return this exact shape:
{
  "context_summary": "1–2 sentence summary of what makes this trip unique from a packing perspective",
  "suggestions": [
    {
      "category": "emoji + category name (e.g. 👕 Clothing)",
      "reason": "brief reason why these items matter for this specific trip",
      "items": ["item1", "item2", "item3"]
    }
  ]
}
Rules:
- 4–7 categories. Each with 3–8 items.
- Items must be SPECIFIC to the trip (e.g. not just "shoes" but "waterproof trail runners for Mt Fuji hike").
- Do NOT repeat items that are obvious universals like passport or phone charger unless context makes them noteworthy.
- Consider destination climate, cultural norms, planned activities, trip length, and occasions.
- Keep item names concise (under 8 words each).
- Return ONLY the JSON object.`,
              messages: [{ role: "user", content: "" }],
              maxTokens: 1200,
            }),
          },
        ],
      }
      const raw = data.content?.[0]?.text || "{}"
      const cleaned = raw.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      setSuggestions(parsed.suggestions || [])
      setContextSummary(parsed.context_summary || "")
    } catch (e) {
      setSuggestions([])
      setContextSummary("⚠️ Could not generate suggestions. Check your connection.")
    }
    setLoadingSuggest(false)
  }

  const handleAddChip = (item, cat) => {
    // Find best matching existing category or use the suggestion category
    const existingCats = Object.keys(packing)
    const sugCatName = cat.replace(/^[\p{Emoji}\s]+/u, "").trim()
    const match = existingCats.find((c) =>
      c.toLowerCase().includes(sugCatName.toLowerCase().split(" ")[0]),
    )
    const targetCat = match || existingCats[0]
    addPackingItem(targetCat, item)
    setAddedItems((p) => ({ ...p, [item]: true }))
  }

  const handleAddAll = () => {
    if (!suggestions) return
    suggestions.forEach((group) => {
      group.items.forEach((item) => {
        if (!addedItems[item] && !existingNames.has(item.toLowerCase())) {
          handleAddChip(item, group.category)
        }
      })
    })
  }

  const handleAdd = (cat) => {
    const n = (newItems[cat] || "").trim()
    if (!n) return
    addPackingItem(cat, n)
    setNewItems((p) => ({ ...p, [cat]: "" }))
  }

  const totalSuggestCount = suggestions ? suggestions.reduce((s, g) => s + g.items.length, 0) : 0
  const newCount = suggestions
    ? suggestions.reduce(
        (s, g) =>
          s + g.items.filter((i) => !existingNames.has(i.toLowerCase()) && !addedItems[i]).length,
        0,
      )
    : 0

  return (
    <div>
      {/* Progress */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="card-title" style={{ marginBottom: 0 }}>
            🧳 Packing List
          </div>
          <div className="progress-pill">
            {packingDone}/{packingTotal} packed
          </div>
        </div>
        <div className="prog-track">
          <div className="prog-fill" style={{ width: `${pct}%` }} />
        </div>
        <div
          style={{
            textAlign: "right",
            fontSize: 11,
            color: "rgba(230,217,194,0.35)",
            marginTop: 5,
          }}
        >
          {pct}% complete
        </div>
      </div>

      {/* ── Weather Re-check Card ── */}
      <div className="recheck-card">
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: showAlert || recheck.step !== "idle" ? 12 : 0 }}
        >
          <div className="card-title" style={{ marginBottom: 0, fontSize: 14, color: "#5BA4FF" }}>
            🌤️ Weather Re-check
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {recheck.step === "ready" && recheck.result && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: verdictColor(recheck.result.overall),
                }}
              >
                {verdictIcon(recheck.result.overall)} {recheck.result.overall}
              </span>
            )}
            {recheck.step !== "fetching" && recheck.step !== "analyzing" && (
              <button
                className="btn-ghost"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderColor: "rgba(91,164,255,0.3)",
                  color: "#5BA4FF",
                }}
                onClick={runRecheck}
                disabled={!trip.destination}
              >
                {recheck.step === "idle" ? "Run check" : "↺ Re-run"}
              </button>
            )}
            {(recheck.step === "fetching" || recheck.step === "analyzing") && (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(91,164,255,0.7)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span className="dots">
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </span>
                {recheck.step === "fetching" ? "Fetching forecast" : "Analysing list"}
              </div>
            )}
          </div>
        </div>

        {/* Auto-trigger alert */}
        {showAlert && recheck.step === "idle" && (
          <div className="recheck-alert" onClick={runRecheck}>
            <div className="recheck-alert-icon">⏰</div>
            <div className="recheck-alert-text">
              <div className="recheck-alert-title">
                {alertLabel} — run your packing weather check
              </div>
              <div className="recheck-alert-sub">
                Claude will compare the forecast for {trip.destination} against your list
              </div>
            </div>
            <div style={{ fontSize: 20, color: "rgba(91,164,255,.5)" }}>›</div>
          </div>
        )}

        {/* No destination */}
        {!trip.destination && recheck.step === "idle" && (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Add a destination in the Plan tab to enable weather re-check.
          </div>
        )}

        {/* Idle with destination, no alert */}
        {trip.destination && recheck.step === "idle" && !showAlert && (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Check your packing list against the {trip.destination} forecast any time.
          </div>
        )}

        {/* Loading shimmer */}
        {(recheck.step === "fetching" || recheck.step === "analyzing") && (
          <div className="recheck-loading">
            <div className="recheck-shimmer" style={{ height: 60 }} />
            <div className="recheck-shimmer" style={{ height: 80, opacity: 0.7 }} />
            <div className="recheck-shimmer" style={{ height: 50, opacity: 0.4 }} />
          </div>
        )}

        {/* Error */}
        {recheck.step === "error" && (
          <div className="ocr-error" style={{ marginTop: 8 }}>
            ⚠️ {recheck.error}
          </div>
        )}

        {/* Results */}
        {recheck.step === "ready" && recheck.result && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            {/* Weather summary */}
            <div className="weather-summary-box">🌡️ {recheck.result.weather_summary}</div>

            {/* Forecast mini-strip */}
            {recheck.forecast && (
              <div className="forecast-strip">
                {recheck.forecast.map((day, i) => (
                  <div key={day.date} className={`forecast-day${i === 0 ? " today" : ""}`}>
                    <div className="forecast-day-label">
                      {i === 0
                        ? "Today"
                        : new Date(day.date + "T12:00").toLocaleDateString("en", {
                            weekday: "short",
                          })}
                    </div>
                    <div className="forecast-day-icon">{day.icon}</div>
                    <div className="forecast-day-temp">{day.maxT}°</div>
                    <div className="forecast-day-rain">
                      {day.rainPct > 0 ? `${day.rainPct}%` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gaps */}
            {recheck.result.gaps?.length > 0 && (
              <div className="recheck-section">
                <div className="recheck-section-hdr" style={{ color: "#FF5C5C" }}>
                  <span>🚨</span> {recheck.result.gaps.length} gap
                  {recheck.result.gaps.length !== 1 ? "s" : ""} — consider adding
                </div>
                {recheck.result.gaps.map((g, i) => (
                  <div key={i} className="recheck-item recheck-item-gap">
                    <div className="recheck-item-icon">➕</div>
                    <div className="recheck-item-body">
                      <div className="recheck-item-name">{g.item}</div>
                      <div className="recheck-item-reason">{g.reason}</div>
                    </div>
                    <button
                      className={`recheck-add-btn${rcAdded[g.item] ? " added" : ""}`}
                      onClick={() => !rcAdded[g.item] && addGapItem(g.item, g.category)}
                    >
                      {rcAdded[g.item] ? "✓ Added" : "+ Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Overkill */}
            {recheck.result.overkill?.length > 0 && (
              <div className="recheck-section">
                <div className="recheck-section-hdr" style={{ color: "var(--text-dim)" }}>
                  <span>🤔</span> May not need
                </div>
                {recheck.result.overkill.map((o, i) => (
                  <div key={i} className="recheck-item recheck-item-overkill">
                    <div className="recheck-item-icon">📦</div>
                    <div className="recheck-item-body">
                      <div
                        className="recheck-item-name"
                        style={{ textDecoration: "line-through", color: "var(--text-dim)" }}
                      >
                        {o.item}
                      </div>
                      <div className="recheck-item-reason">{o.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Confirmed */}
            {recheck.result.confirmed?.length > 0 && (
              <div className="recheck-section">
                <div className="recheck-section-hdr" style={{ color: "#4DB87A" }}>
                  <span>✅</span> Already covered
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {recheck.result.confirmed.map((c, i) => (
                    <div
                      key={i}
                      className="recheck-item recheck-item-ok"
                      style={{
                        padding: "5px 11px",
                        marginBottom: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>✓</span>
                      <span style={{ fontSize: 12, color: "#4DB87A", fontWeight: 500 }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add-all gaps shortcut */}
            {recheck.result.gaps?.filter((g) => !rcAdded[g.item]).length > 1 && (
              <button
                className="btn-ghost"
                style={{
                  width: "100%",
                  marginTop: 4,
                  borderColor: "rgba(255,92,92,0.3)",
                  color: "#FF5C5C",
                }}
                onClick={() =>
                  recheck.result.gaps
                    .filter((g) => !rcAdded[g.item])
                    .forEach((g) => addGapItem(g.item, g.category))
                }
              >
                + Add all {recheck.result.gaps.filter((g) => !rcAdded[g.item]).length} missing items
              </button>
            )}
          </div>
        )}

        {/* Dismiss auto-alert */}
        {showAlert && recheck.step === "idle" && (
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button
              className="btn-del"
              style={{ fontSize: 11, color: "var(--text-dim)" }}
              onClick={dismissAlert}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* ── Templates Library Card ── */}
      {importFlash && (
        <div
          style={{
            background: "rgba(77,184,122,0.1)",
            border: "1px solid rgba(77,184,122,0.25)",
            borderRadius: 12,
            padding: "9px 14px",
            marginBottom: 10,
            fontSize: 13,
            color: "#4DB87A",
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "fadeUp .25s ease",
          }}
        >
          ✓ <strong>{importFlash}</strong> template imported to your packing list
        </div>
      )}

      <div className="templates-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 0, fontSize: 14, color: "#AA88FF" }}>
            📚 Trip Templates
          </div>
          <button
            className="btn-ghost"
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderColor: "rgba(120,80,255,0.3)",
              color: "#AA88FF",
            }}
            onClick={() => setShowTemplates((s) => !s)}
          >
            {showTemplates ? "Hide" : "Browse"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {importedIds.length > 0
            ? `${importedIds.length} template${importedIds.length > 1 ? "s" : ""} imported · tap to add more`
            : "One-tap packing lists for dive trips, ski, business travel and more"}
        </div>

        {showTemplates && (
          <div className="template-grid">
            {PACKING_TEMPLATES.map((tpl) => {
              const already = countAlready(tpl)
              const total = totalItems(tpl)
              const imported = importedIds.includes(tpl.id)
              return (
                <div
                  key={tpl.id}
                  className={`template-tile${imported ? " imported" : ""}`}
                  onClick={() => setSelectedTemplate(tpl.id)}
                >
                  {imported && <div className="template-tile-check">✓</div>}
                  <div className="template-tile-emoji">{tpl.emoji}</div>
                  <div className="template-tile-name">{tpl.name}</div>
                  <div className="template-tile-count">{total} items</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Template Preview Sheet ── */}
      {selectedTemplate &&
        (() => {
          const tpl = PACKING_TEMPLATES.find((t) => t.id === selectedTemplate)
          if (!tpl) return null
          const allItems = Object.values(packing)
            .flat()
            .map((i) => i.name.toLowerCase())
          const newCount = Object.values(tpl.items)
            .flat()
            .filter((n) => !allItems.includes(n.toLowerCase())).length
          const alreadyCount = totalItems(tpl) - newCount

          return (
            <div
              className="template-sheet-overlay"
              onClick={(e) => e.target === e.currentTarget && setSelectedTemplate(null)}
            >
              <div className="template-sheet">
                {/* Header */}
                <div className="template-sheet-hdr">
                  <div className="template-sheet-emoji">{tpl.emoji}</div>
                  <div className="template-sheet-info">
                    <div className="template-sheet-name">{tpl.name}</div>
                    <div className="template-sheet-desc">{tpl.desc}</div>
                    <div className="template-stats">
                      <div className="template-stat-chip">{totalItems(tpl)} items</div>
                      {newCount > 0 && (
                        <div
                          className="template-stat-chip"
                          style={{
                            background: "rgba(77,184,122,0.1)",
                            borderColor: "rgba(77,184,122,0.25)",
                            color: "#4DB87A",
                          }}
                        >
                          +{newCount} new
                        </div>
                      )}
                      {alreadyCount > 0 && (
                        <div
                          className="template-stat-chip"
                          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-dim)" }}
                        >
                          {alreadyCount} already packed
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-del"
                    style={{ fontSize: 20 }}
                    onClick={() => setSelectedTemplate(null)}
                  >
                    ✕
                  </button>
                </div>

                {/* Item preview */}
                <div className="template-sheet-body">
                  {Object.entries(tpl.items).map(([cat, items]) => (
                    <div key={cat} className="template-cat-block">
                      <div className="template-cat-label">{cat}</div>
                      <div>
                        {items.map((name, i) => {
                          const has = allItems.includes(name.toLowerCase())
                          return (
                            <span key={i} className={`template-item-chip${has ? " already" : ""}`}>
                              {has && <span style={{ fontSize: 10 }}>✓</span>}
                              {name}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Import mode toggle */}
                <div className="import-mode-row">
                  <button
                    className={`import-mode-btn${importMode === "merge" ? " on" : ""}`}
                    onClick={() => setImportMode("merge")}
                  >
                    ➕ Merge with list
                  </button>
                  <button
                    className={`import-mode-btn${importMode === "replace" ? " on" : ""}`}
                    onClick={() => setImportMode("replace")}
                  >
                    🔄 Replace list
                  </button>
                </div>
                <div
                  style={{
                    paddingLeft: 20,
                    paddingRight: 20,
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginBottom: 8,
                  }}
                >
                  {importMode === "merge"
                    ? `Adds ${newCount} new items to your existing list. Items you already have are skipped.`
                    : "Clears your current list and builds fresh from this template. Cannot be undone."}
                </div>

                {/* Import button */}
                <div className="template-sheet-footer">
                  <button
                    className="btn btn-full"
                    onClick={() => importTemplate(tpl, importMode)}
                    style={{
                      background:
                        importMode === "replace"
                          ? "linear-gradient(135deg,#FF5C5C,#C93030)"
                          : undefined,
                    }}
                  >
                    {importMode === "merge"
                      ? `Add ${newCount} item${newCount !== 1 ? "s" : ""} to my list`
                      : `Replace list with ${tpl.name}`}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {/* ── Smart Pack Card ── */}
      <div className="smart-pack-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 0, fontSize: 14 }}>
            ✨ AI Smart Packing
          </div>
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => setShowPanel((p) => !p)}
          >
            {showPanel ? "▲ Hide" : "▼ Customise"}
          </button>
        </div>

        {/* Context tags — always visible */}
        <div style={{ marginBottom: 8 }}>
          {trip.destination && <span className="context-tag">📍 {trip.destination}</span>}
          {trip.startDate &&
            trip.endDate &&
            (() => {
              const d =
                Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / 86400000) + 1
              return <span className="context-tag">🗓️ {d} days</span>
            })()}
          {itinerary.flatMap((d) => d.activities).length > 0 && (
            <span className="context-tag">
              📅 {itinerary.flatMap((d) => d.activities).length} activities
            </span>
          )}
          {occasions.map((id) => (
            <span
              key={id}
              className="context-tag"
              style={{ color: "var(--amber)", borderColor: "rgba(255,168,40,0.2)" }}
            >
              {OCCASIONS.find((o) => o.id === id)?.label}
            </span>
          ))}
        </div>

        {/* Expandable panel */}
        {showPanel && (
          <div style={{ animation: "fadeUp 0.2s ease" }}>
            <div className="card-title-small" style={{ marginTop: 8 }}>
              Trip type / occasion
            </div>
            <div className="occasion-chips">
              {OCCASIONS.map((o) => (
                <div
                  key={o.id}
                  className={`occ-chip${occasions.includes(o.id) ? " on" : ""}`}
                  onClick={() => toggleOccasion(o.id)}
                >
                  {o.label}
                </div>
              ))}
            </div>
            <div className="card-title-small" style={{ marginTop: 12 }}>
              Extra context
            </div>
            <textarea
              className="input"
              style={{ minHeight: 56, fontSize: 12, lineHeight: 1.5 }}
              placeholder="e.g. monsoon season · vegetarian · attending a wedding · cold hotel rooms · travelling with a toddler…"
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
            />
          </div>
        )}

        <button
          className="btn btn-full mt-10"
          onClick={generateSuggestions}
          disabled={
            loadingSuggest || (!trip.destination && occasions.length === 0 && !extraNotes.trim())
          }
        >
          {loadingSuggest ? (
            <span className="dots">
              <span>·</span>
              <span>·</span>
              <span>·</span>
            </span>
          ) : (
            "✨ Generate Smart Suggestions"
          )}
        </button>
        {!trip.destination && occasions.length === 0 && !extraNotes.trim() && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "rgba(230,217,194,0.3)",
              marginTop: 6,
            }}
          >
            Add a destination in Plan tab or pick an occasion above to get started
          </div>
        )}

        {/* Loading shimmer */}
        {loadingSuggest && (
          <div className="suggest-panel">
            <div className="loading-shimmer" />
            <div className="loading-shimmer" style={{ height: 60, opacity: 0.6 }} />
            <div className="loading-shimmer" style={{ height: 45, opacity: 0.35 }} />
          </div>
        )}

        {/* Suggestions results */}
        {suggestions && !loadingSuggest && (
          <div className="suggest-panel">
            {contextSummary && <div className="suggest-context-summary">💡 {contextSummary}</div>}

            {suggestions.length > 0 && (
              <div className="add-all-row">
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {newCount > 0
                    ? `${newCount} new item${newCount !== 1 ? "s" : ""} to add`
                    : "All items already in your list!"}
                </span>
                {newCount > 0 && (
                  <button className="btn btn-sm" onClick={handleAddAll}>
                    + Add all new
                  </button>
                )}
              </div>
            )}

            {suggestions.length === 0 && (
              <div className="empty" style={{ padding: "16px 0 0" }}>
                <div className="empty-msg">
                  No suggestions returned. Try adding more trip details.
                </div>
              </div>
            )}

            {suggestions.map((group, gi) => (
              <div key={gi} className="suggest-group">
                <div className="suggest-group-hdr">
                  <div className="suggest-group-title">{group.category}</div>
                </div>
                {group.reason && <div className="suggest-reason">{group.reason}</div>}
                <div className="suggest-items">
                  {group.items.map((item, ii) => {
                    const alreadyIn = existingNames.has(item.toLowerCase())
                    const justAdded = addedItems[item]
                    const done = alreadyIn || justAdded
                    return (
                      <div
                        key={ii}
                        className={`suggest-chip${done ? " added" : ""}`}
                        onClick={() => !done && handleAddChip(item, group.category)}
                        title={
                          alreadyIn ? "Already in your list" : justAdded ? "Added!" : "Tap to add"
                        }
                      >
                        <span className="chip-icon">{done ? "✓" : "+"}</span>
                        <span>{item}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Existing packing categories */}
      {Object.entries(packing).map(([cat, items]) => {
        const catDone = items.filter((i) => i.checked).length
        const isCol = collapsed[cat]
        return (
          <div key={cat} className="card" style={{ padding: "14px 16px" }}>
            <div
              className="flex items-center justify-between"
              style={{ cursor: "pointer", marginBottom: isCol ? 0 : 10 }}
              onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 15,
                    fontFamily: "'Playfair Display',serif",
                    color: "var(--amber)",
                  }}
                >
                  {cat}
                </span>
                <span style={{ fontSize: 11, color: "rgba(230,217,194,0.35)" }}>
                  {catDone}/{items.length}
                </span>
              </div>
              <span style={{ color: "rgba(230,217,194,0.3)", fontSize: 11 }}>
                {isCol ? "▼" : "▲"}
              </span>
            </div>
            {!isCol && (
              <>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="check-item"
                    onClick={() => togglePacking(cat, item.id)}
                  >
                    <div className={`check-box${item.checked ? " on" : ""}`} />
                    <span className={`check-text${item.checked ? " done" : ""}`}>{item.name}</span>
                  </div>
                ))}
                <div className="flex gap-8 mt-8">
                  <input
                    className="input flex-1"
                    style={{ padding: "7px 11px", fontSize: 12 }}
                    placeholder="Add item…"
                    value={newItems[cat] || ""}
                    onChange={(e) => setNewItems((p) => ({ ...p, [cat]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd(cat)}
                  />
                  <button className="btn-ghost" onClick={() => handleAdd(cat)}>
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── SHARE MODAL ──────────────────────────────────────────────────────────── */
export const JSONBLOB = "https://jsonblob.com/api/jsonBlob"
