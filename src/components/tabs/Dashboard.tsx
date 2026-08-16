import { useEffect, useState } from "react"
import { callAi } from "../../lib/ai"
import { WC_DESC, WC_ICON } from "../../lib/constants"
import { LS } from "../../lib/storage"
import { SwipeableActivity } from "../shared/SwipeableActivity"
export function Dashboard({
  trip,
  itinerary,
  packing,
  expenses,
  baseCurrency,
  memories,
  weatherData,
  fetchWeather,
  navigateTo,
  toggleActivity,
  removeActivity,
  onQuickExpense,
  onQuickMemory,
  saveTrip,
  hasInvite,
}) {
  const today = new Date()

  // ── Timing ────────────────────────────────────────────────────────────────
  const daysUntil = trip.startDate
    ? Math.ceil((new Date(trip.startDate).getTime() - today.getTime()) / 86400000)
    : null
  const isDepartureDay = daysUntil === 0
  const isDayBefore = daysUntil === 1
  const isOnTrip =
    daysUntil !== null && daysUntil <= 0 && (!trip.endDate || new Date(trip.endDate) >= today)
  const tripOver = trip.endDate && new Date(trip.endDate) < today
  const currentDayIdx = trip.startDate
    ? Math.floor((today.getTime() - new Date(trip.startDate).getTime()) / 86400000)
    : -1
  const todayDay =
    currentDayIdx >= 0 && currentDayIdx < itinerary.length ? itinerary[currentDayIdx] : null
  const todayISO = today.toISOString().split("T")[0]
  const briefCacheKey = `tc_brief_${trip.startDate}_${todayISO}`
  const briefSeenKey = `tc_brief_seen_${trip.startDate}_${todayISO}`

  // ── Stats ─────────────────────────────────────────────────────────────────
  const packingItems = Object.values(packing).flat() as Array<{
    name?: string
    checked?: boolean
  }>
  const packingTotal = packingItems.length
  const packingDone = packingItems.filter((i) => i.checked).length
  const packingPct = packingTotal ? Math.round((packingDone / packingTotal) * 100) : 0
  const spent = expenses.reduce((s, e) => s + (e.amtBase ?? Number(e.amount ?? 0)), 0)
  const totalBudget = LS.get("tc_budget", 2000)
  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round((spent / totalBudget) * 100)) : 0
  const allActs = itinerary.flatMap((d) => d.activities)
  const doneActs = allActs.filter((a) => a.done).length

  // ── Brief state ───────────────────────────────────────────────────────────
  const [setup, setSetup] = useState({
    destination: trip.destination || "",
    startDate: trip.startDate || "",
    endDate: trip.endDate || "",
    name: trip.name || "",
  })
  const [activationDismissed, setActivationDismissed] = useState(() =>
    LS.get("tc_activation_dismissed", false),
  )

  const [brief, setBrief] = useState(() => {
    try {
      const c = LS.get(briefCacheKey, null)
      return c ? { step: "ready", data: c, error: "" } : { step: "idle", data: null, error: "" }
    } catch {
      return { step: "idle", data: null, error: "" }
    }
  })
  const [showModal, setShowModal] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(null)

  // ── Auto-fetch weather ────────────────────────────────────────────────────
  useEffect(() => {
    if (trip.destination && !weatherData) fetchWeather(trip.destination)
  }, [trip.destination])

  // ── Auto-show modal on departure day (once per day) ───────────────────────
  useEffect(() => {
    if (!trip.destination || !trip.startDate) return
    if (!(isDepartureDay || isDayBefore || (isOnTrip && currentDayIdx === 0))) return
    const alreadySeen = LS.get(briefSeenKey, "")
    if (brief.step === "ready" && !alreadySeen) {
      setShowModal(true)
      return
    }
    if (brief.step === "idle") generateBrief()
  }, [trip.startDate, trip.destination, isDepartureDay])

  // ── Generate brief ────────────────────────────────────────────────────────
  const generateBrief = async () => {
    if (!trip.destination || brief.step === "loading") return
    setBrief({ step: "loading", data: null, error: "" })

    try {
      // 1. Geocode + fetch forecast (re-use pattern from recheck)
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trip.destination)}&count=1`,
      ).then((r) => r.json())
      const loc = geo.results?.[0]
      let forecastDesc = "Weather data unavailable"
      let todayWeather = weatherData
      if (loc) {
        const fw = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max&current=temperature_2m,weather_code,relative_humidity_2m&timezone=auto&forecast_days=4`,
        ).then((r) => r.json())
        const d = fw.daily
        const curr = fw.current
        forecastDesc = d.time
          .slice(0, 4)
          .map(
            (date, i) =>
              `${date}: ${WC_ICON(d.weathercode[i])} ${WC_DESC(d.weathercode[i])}, ${Math.round(d.temperature_2m_max[i])}/${Math.round(d.temperature_2m_min[i])}°C, rain ${d.precipitation_probability_max[i] || 0}%`,
          )
          .join(" | ")
        if (curr && !todayWeather) {
          todayWeather = {
            temp: Math.round(curr.temperature_2m),
            icon: WC_ICON(curr.weather_code),
            unit: "°C",
            humidity: curr.relative_humidity_2m,
          }
        }
      }

      // 2. Fetch exchange rate
      let rateText = ""
      try {
        const destCurrMap = {
          Japan: "JPY",
          Thailand: "THB",
          UK: "GBP",
          France: "EUR",
          Germany: "EUR",
          Spain: "EUR",
          Italy: "EUR",
          Australia: "AUD",
          Singapore: "SGD",
          Malaysia: "MYR",
          Indonesia: "IDR",
          Vietnam: "VND",
          "South Korea": "KRW",
          China: "CNY",
          India: "INR",
          UAE: "AED",
          Canada: "CAD",
          Mexico: "MXN",
          Brazil: "BRL",
          "South Africa": "ZAR",
        }
        const localCurr =
          Object.entries(destCurrMap).find(([c]) =>
            trip.destination.toLowerCase().includes(c.toLowerCase()),
          )?.[1] || "USD"
        if (localCurr !== baseCurrency) {
          const rd = await fetch(
            `https://api.frankfurter.app/latest?from=${baseCurrency}&to=${localCurr}`,
          ).then((r) => r.json())
          const rate = rd.rates[localCurr]
          if (rate) {
            rateText = `1 ${baseCurrency} = ${Number(rate).toFixed(2)} ${localCurr}`
            setExchangeRate({ from: baseCurrency, to: localCurr, rate })
          }
        }
      } catch {}

      // 3. Build activities context
      const day1Acts = itinerary[0]?.activities.map((a) => a.text).join(", ") || "none planned yet"
      const unpackedCritical = packingItems
        .filter(
          (i) =>
            !i.checked &&
            ["Passport", "Travel insurance", "Flight tickets"].some((k) =>
              (i.name || "").includes(k),
            ),
        )
        .map((i) => i.name)

      // 4. Call Claude
      const data = {
        content: [
          {
            text: await callAi({
              task: "brief",
              system: `You are a world-class travel concierge generating a personalised departure day brief. Return ONLY valid JSON — no markdown.

Shape:
{
  "greeting": "warm, exciting 1-sentence opener personalised to destination (mention city name)",
  "weather": {
    "today_summary": "1 sentence on today's conditions",
    "wear_tip": "specific clothing tip for today based on forecast",
    "days_ahead": "1 sentence pattern for next 3 days"
  },
  "customs": [
    {"emoji":"…","title":"short title","detail":"1-2 sentence practical tip"}
  ],
  "currency": {
    "practical_tip": "1-2 sentences on best way to get/use local currency, avoid common tourist traps",
    "atm_tip": "brief ATM/payment tip"
  },
  "first_hours": [
    {"step":1,"action":"first thing to do on arrival","detail":"specific, practical detail"}
  ],
  "local_phrase": {"phrase":"most useful phrase in local language","pronunciation":"phonetic guide","meaning":"English meaning"},
  "insider_tip": "single powerful insider tip most first-timers miss — be very specific to destination"
}

Rules:
- customs: 3 items, specific and actionable (not generic "be respectful")
- first_hours: 3–4 steps covering transport, SIM, cash, first meal/check-in
- All tips must be specific to the destination, not generic travel advice
- Return ONLY the JSON`,
              messages: [
                {
                  role: "user",
                  content: `Destination: ${trip.destination}
Departure: ${trip.startDate}${trip.endDate ? " → " + trip.endDate : ""}
Trip duration: ${trip.startDate && trip.endDate ? Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1 : "unknown"} days
Traveller's base currency: ${baseCurrency}${rateText ? " (" + rateText + ")" : ""}
Today's weather at destination: ${todayWeather ? `${todayWeather.icon} ${todayWeather.temp}${todayWeather.unit}, humidity ${todayWeather.humidity || "?"}%` : "unavailable"}
4-day forecast: ${forecastDesc}
Day 1 planned activities: ${day1Acts}
Unpacked critical items: ${unpackedCritical.length ? unpackedCritical.join(", ") : "all clear"}

Generate the departure day brief.`,
                },
              ],
              maxTokens: 1400,
            }),
          },
        ],
      }
      const parsed = JSON.parse(
        (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim(),
      )
      if (!parsed.greeting) throw new Error("Empty response")

      LS.set(briefCacheKey, parsed)
      setBrief({ step: "ready", data: parsed, error: "" })
      setShowModal(true)
    } catch (e) {
      setBrief({ step: "error", data: null, error: e.message })
    }
  }

  const dismissModal = () => {
    setShowModal(false)
    LS.set(briefSeenKey, "1")
  }

  const submitSetup = () => {
    const destination = setup.destination.trim()
    if (!destination) return
    const name = (setup.name.trim() || trip.name || destination).trim()
    saveTrip({
      ...trip,
      destination,
      startDate: setup.startDate,
      endDate: setup.endDate,
      name,
    })
  }

  const dismissActivation = () => {
    setActivationDismissed(true)
    LS.set("tc_activation_dismissed", true)
  }

  const hasDates = Boolean(trip.startDate)
  const hasPlanOrPack = itinerary.length > 0 || LS.get("tc_imported_templates", []).length > 0
  const activationItems = [
    { key: "dest", label: "Set destination", done: Boolean(trip.destination), tab: 1 },
    { key: "dates", label: "Add travel dates", done: hasDates, tab: 1 },
    {
      key: "plan",
      label: "Add a day or packing template",
      done: hasPlanOrPack,
      tab: itinerary.length ? 2 : 1,
    },
    { key: "invite", label: "Invite your crew", done: Boolean(hasInvite), action: "share" },
  ]
  const activationDone = activationItems.filter((i) => i.done).length
  const showActivation = Boolean(trip.destination) && !activationDismissed && activationDone < 3

  // ── Ring SVG ───────────────────────────────────────────────────────────────
  const Ring = ({ pct, color, size = 64, stroke = 6 }) => {
    const r = (size - stroke * 2) / 2,
      circ = 2 * Math.PI * r
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
    )
  }

  // ── Brief Modal ───────────────────────────────────────────────────────────
  const BriefModal = () => {
    const d = brief.data
    return (
      <div className="brief-modal-overlay">
        {/* Loading state */}
        {brief.step === "loading" && (
          <div className="brief-loading-hero">
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,168,40,.5)",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Preparing your brief…
            </div>
            <div className="brief-loading-shimmer" style={{ height: 36, width: "70%" }} />
            <div
              className="brief-loading-shimmer"
              style={{ height: 18, width: "50%", opacity: 0.6 }}
            />
            <div
              style={{
                marginTop: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "0 0 20px",
              }}
            >
              {[90, 70, 80, 60].map((w, i) => (
                <div
                  key={i}
                  className="brief-loading-shimmer"
                  style={{ height: 14, width: `${w}%`, opacity: 0.4 - i * 0.07 }}
                />
              ))}
            </div>
            <div
              style={{
                textAlign: "center",
                padding: "20px 0",
                color: "rgba(255,168,40,.4)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span className="dots">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>{" "}
              Claude is writing your trip brief
            </div>
          </div>
        )}

        {/* Error */}
        {brief.step === "error" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ color: "rgba(255,92,92,.8)", fontSize: 14, marginBottom: 20 }}>
              {brief.error || "Could not generate brief"}
            </div>
            <button className="btn" onClick={generateBrief}>
              Try Again
            </button>
            <br />
            <button className="brief-regen-btn" style={{ marginTop: 12 }} onClick={dismissModal}>
              Skip for now
            </button>
          </div>
        )}

        {/* Ready */}
        {brief.step === "ready" && d && (
          <>
            {/* Hero */}
            <div className="brief-hero">
              <div className="brief-hero-eyebrow">
                {isDepartureDay ? "✈️ Departure Day" : "🌅 Departure Tomorrow"}
              </div>
              <div className="brief-hero-title">{d.greeting}</div>
              <div className="brief-hero-dest">📍 {trip.destination}</div>
              {weatherData && !weatherData.error && (
                <div className="brief-hero-weather">
                  <div className="brief-hero-weather-icon">{weatherData.icon}</div>
                  <div className="brief-hero-weather-temp">
                    {weatherData.temp}
                    {weatherData.unit}
                  </div>
                </div>
              )}
            </div>

            <div className="brief-body">
              {/* Weather */}
              {d.weather && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">🌤️</div>
                    <div className="brief-section-title">Today's Weather</div>
                  </div>
                  {weatherData && !weatherData.error && (
                    <div className="brief-weather-row">
                      <div className="brief-weather-chip">
                        <div className="brief-weather-chip-val">
                          {weatherData.temp}
                          {weatherData.unit}
                        </div>
                        <div className="brief-weather-chip-lbl">Now</div>
                      </div>
                      {weatherData.humidity && (
                        <div className="brief-weather-chip">
                          <div className="brief-weather-chip-val">{weatherData.humidity}%</div>
                          <div className="brief-weather-chip-lbl">Humidity</div>
                        </div>
                      )}
                      <div className="brief-weather-chip">
                        <div className="brief-weather-chip-val">{weatherData.wind}km/h</div>
                        <div className="brief-weather-chip-lbl">Wind</div>
                      </div>
                    </div>
                  )}
                  <div className="brief-weather-tip">👕 {d.weather.wear_tip}</div>
                  {d.weather.days_ahead && (
                    <div className="brief-weather-tip" style={{ marginTop: 6 }}>
                      📅 {d.weather.days_ahead}
                    </div>
                  )}
                </div>
              )}

              {/* Customs */}
              {d.customs?.length > 0 && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">🎎</div>
                    <div className="brief-section-title">Local Customs</div>
                  </div>
                  {d.customs.map((c, i) => (
                    <div key={i} className="brief-custom-item">
                      <div className="brief-custom-emoji">{c.emoji}</div>
                      <div>
                        <div className="brief-custom-title">{c.title}</div>
                        <div className="brief-custom-detail">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Currency */}
              {d.currency && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">💱</div>
                    <div className="brief-section-title">Currency</div>
                  </div>
                  {exchangeRate && (
                    <div className="brief-currency-rate">
                      1 {exchangeRate.from} = {Number(exchangeRate.rate).toFixed(2)}{" "}
                      {exchangeRate.to}
                    </div>
                  )}
                  <div className="brief-currency-tip">{d.currency.practical_tip}</div>
                  {d.currency.atm_tip && (
                    <div className="brief-currency-tip" style={{ marginTop: 6 }}>
                      🏧 {d.currency.atm_tip}
                    </div>
                  )}
                </div>
              )}

              {/* First hours */}
              {d.first_hours?.length > 0 && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">🚀</div>
                    <div className="brief-section-title">First Hours</div>
                  </div>
                  {d.first_hours.map((s, i) => (
                    <div key={i} className="brief-step">
                      <div className="brief-step-num">{s.step || i + 1}</div>
                      <div>
                        <div className="brief-step-action">{s.action}</div>
                        <div className="brief-step-detail">{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Local phrase */}
              {d.local_phrase && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">💬</div>
                    <div className="brief-section-title">Useful Phrase</div>
                  </div>
                  <div className="brief-phrase-box">
                    <div className="brief-phrase-text">{d.local_phrase.phrase}</div>
                    <div className="brief-phrase-pronunc">{d.local_phrase.pronunciation}</div>
                    <div className="brief-phrase-meaning">"{d.local_phrase.meaning}"</div>
                  </div>
                </div>
              )}

              {/* Insider tip */}
              {d.insider_tip && (
                <div className="brief-section">
                  <div className="brief-section-hdr">
                    <div className="brief-section-icon">💡</div>
                    <div className="brief-section-title">Insider Tip</div>
                  </div>
                  <div className="brief-insider">{d.insider_tip}</div>
                </div>
              )}
            </div>

            <div className="brief-footer">
              <button className="brief-dismiss-btn" onClick={dismissModal}>
                Let's go! ✈️
              </button>
              <button
                className="brief-regen-btn"
                onClick={() => {
                  LS.set(briefCacheKey, "")
                  generateBrief()
                }}
              >
                ↺ Regenerate brief
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Brief modal */}
      {showModal &&
        (brief.step === "loading" || brief.step === "ready" || brief.step === "error") && (
          <BriefModal />
        )}

      {/* ── Compact brief card (when modal dismissed) ── */}
      {!showModal &&
        brief.step === "ready" &&
        brief.data &&
        (isDepartureDay || isDayBefore || isOnTrip) && (
          <div className="brief-dash-card" onClick={() => setShowModal(true)}>
            <div className="brief-dash-hdr">
              <div className="brief-dash-icon">{isDepartureDay ? "✈️" : "🌅"}</div>
              <div className="brief-dash-title">
                {isDepartureDay ? "Your Departure Brief" : "Day-before Brief"} — {trip.destination}
              </div>
              <div style={{ fontSize: 18, color: "rgba(255,168,40,.4)" }}>›</div>
            </div>
            <div className="brief-dash-chips">
              {brief.data.weather && <div className="brief-dash-chip">🌤️ Weather</div>}
              {brief.data.customs && <div className="brief-dash-chip">🎎 Customs</div>}
              {brief.data.currency && <div className="brief-dash-chip">💱 Currency</div>}
              {brief.data.first_hours && <div className="brief-dash-chip">🚀 First hours</div>}
              {brief.data.insider_tip && <div className="brief-dash-chip">💡 Insider tip</div>}
            </div>
          </div>
        )}

      {/* Generate brief button — when conditions met but not yet generated */}
      {!showModal &&
        brief.step === "idle" &&
        (isDepartureDay || isDayBefore) &&
        trip.destination && (
          <div className="brief-dash-card" onClick={generateBrief} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✈️</div>
            <div
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: 16,
                color: "var(--amber)",
                marginBottom: 4,
              }}
            >
              {isDepartureDay ? "Today's the day!" : "Departure tomorrow"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
              Tap to generate your personalised trip brief for {trip.destination}
            </div>
            <button className="btn" style={{ width: "100%" }}>
              Generate Trip Brief ✨
            </button>
          </div>
        )}

      {/* ── First-run setup ── */}
      {!trip.destination && (
        <div className="setup-card">
          <div className="setup-eyebrow">Start your trip</div>
          <div className="setup-title">Where are you going?</div>
          <div className="setup-sub">
            Destination and dates unlock your countdown, packing, and crew invite.
          </div>
          <input
            className="input"
            placeholder="Destination (e.g. Tokyo, Japan)"
            value={setup.destination}
            onChange={(e) => setSetup((s) => ({ ...s, destination: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && submitSetup()}
          />
          <input
            className="input"
            placeholder="Trip name (optional)"
            value={setup.name}
            onChange={(e) => setSetup((s) => ({ ...s, name: e.target.value }))}
          />
          <div className="grid-2">
            <div>
              <div className="card-title-small">Depart</div>
              <input
                type="date"
                className="input"
                value={setup.startDate}
                onChange={(e) => setSetup((s) => ({ ...s, startDate: e.target.value }))}
              />
            </div>
            <div>
              <div className="card-title-small">Return</div>
              <input
                type="date"
                className="input"
                value={setup.endDate}
                onChange={(e) => setSetup((s) => ({ ...s, endDate: e.target.value }))}
              />
            </div>
          </div>
          <button
            className="btn btn-full"
            disabled={!setup.destination.trim()}
            onClick={submitSetup}
          >
            Start planning
          </button>
          <button className="btn-ghost btn-full" onClick={() => navigateTo("share")}>
            I have a join code
          </button>
        </div>
      )}

      {/* ── Activation checklist ── */}
      {showActivation && (
        <div className="activation-card">
          <div className="activation-hdr">
            <div>
              <div className="activation-title">Finish setting up</div>
              <div className="activation-sub">
                {activationDone} of {activationItems.length} done
              </div>
            </div>
            <button
              className="btn-del"
              type="button"
              onClick={dismissActivation}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          {activationItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`activation-row${item.done ? " done" : ""}`}
              onClick={() =>
                item.done
                  ? null
                  : item.action === "share"
                    ? navigateTo("share")
                    : navigateTo(item.tab)
              }
            >
              <span className={`activation-check${item.done ? " on" : ""}`}>
                {item.done ? "✓" : ""}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Countdown / Status Banner ── */}
      {trip.destination && (
        <div className="countdown-banner">
          <div>
            {tripOver ? (
              <div className="countdown-num">✈️</div>
            ) : isOnTrip ? (
              <div className="countdown-num" style={{ fontSize: 28 }}>
                🌍
              </div>
            ) : (
              <div className="countdown-num">{daysUntil}</div>
            )}
          </div>
          <div className="countdown-info">
            <div className="countdown-label">
              {tripOver
                ? "Trip completed"
                : isOnTrip
                  ? "You're on your trip!"
                  : "days until departure"}
            </div>
            <div className="countdown-dest">📍 {trip.destination}</div>
            {trip.startDate && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                {trip.startDate}
                {trip.endDate ? " → " + trip.endDate : ""}
              </div>
            )}
          </div>
          {weatherData && !weatherData.error && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>{weatherData.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--amber)" }}>
                {weatherData.temp}
                {weatherData.unit}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Today's Activities ── */}
      {todayDay && (
        <div className="today-card">
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0, fontSize: 14 }}>
              📅 {todayDay.label} — Today
            </div>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: "3px 9px" }}
              onClick={() => navigateTo(1)}
            >
              Full plan
            </button>
          </div>
          {todayDay.activities.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              No activities planned for today
            </div>
          ) : (
            <div>
              {todayDay.activities.map((act, i) => (
                <SwipeableActivity
                  key={act.id}
                  act={act}
                  dayId={todayDay.id}
                  onToggle={() => toggleActivity(todayDay.id, act.id)}
                  onDelete={() => removeActivity(todayDay.id, act.id)}
                  onExpense={() => onQuickExpense(act, todayDay)}
                  onMemory={() => onQuickMemory(act, todayDay)}
                  isFirst={i === 0}
                />
              ))}
              <div className="swipe-hint">← swipe to delete · swipe to complete →</div>
            </div>
          )}
        </div>
      )}

      {/* ── Stats Grid ── */}
      {trip.destination && (
        <div className="dash-grid">
          <div className="dash-card" onClick={() => navigateTo(3)}>
            <div className="dash-ring-wrap">
              <Ring pct={budgetPct} color={budgetPct > 85 ? "#FF5C5C" : "#FFA828"} />
              <div className="dash-ring-center">
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>
                  {budgetPct}%
                </div>
              </div>
            </div>
            <div className="dash-card-label">Budget Used</div>
            <div className="dash-card-sub">
              {baseCurrency} {spent.toFixed(0)} of {totalBudget}
            </div>
          </div>
          <div className="dash-card" onClick={() => navigateTo(2)}>
            <div className="dash-ring-wrap">
              <Ring pct={packingPct} color="#4DB87A" />
              <div className="dash-ring-center">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#4DB87A" }}>{packingPct}%</div>
              </div>
            </div>
            <div className="dash-card-label">Packed</div>
            <div className="dash-card-sub">
              {packingDone} of {packingTotal} items
            </div>
          </div>
          <div className="dash-card" onClick={() => navigateTo(1)}>
            <div className="dash-card-icon">📅</div>
            <div className="dash-card-val">
              {doneActs}/{allActs.length}
            </div>
            <div className="dash-card-label">Activities Done</div>
          </div>
          <div className="dash-card" onClick={() => navigateTo(5)}>
            <div className="dash-card-icon">📸</div>
            <div className="dash-card-val">{memories.length}</div>
            <div className="dash-card-label">Memories</div>
            {memories.length > 0 && (
              <div className="dash-card-sub">{memories[memories.length - 1].title}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      {trip.destination && (
        <div className="quick-actions">
          {[
            { icon: "✈️", label: "Trip Details", sub: "Dates & destination", tab: 1 },
            { icon: "🧳", label: "Smart Pack", sub: "AI packing list", tab: 2 },
            { icon: "💰", label: "Log Expense", sub: "Track spending", tab: 3 },
            { icon: "🌍", label: "Explore", sub: "Weather & tips", tab: 4 },
            { icon: "📸", label: "Add Memory", sub: "Drop a pin", tab: 5 },
            { icon: "📤", label: "Share Trip", sub: "Invite travellers", action: "share" },
          ].map((qa, i) => (
            <div
              key={i}
              className="quick-action-btn"
              onClick={() => (qa.action === "share" ? navigateTo("share") : navigateTo(qa.tab))}
            >
              <span className="qa-icon">{qa.icon}</span>
              <div>
                <div className="qa-label">{qa.label}</div>
                <div className="qa-sub">{qa.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent Memories Strip ── */}
      {memories.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0, fontSize: 14 }}>
              📸 Recent Memories
            </div>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: "3px 9px" }}
              onClick={() => navigateTo(5)}
            >
              See all
            </button>
          </div>
          <div className="mem-mini-strip">
            {[...memories]
              .reverse()
              .slice(0, 8)
              .map((mem) => (
                <div key={mem.id} className="mem-mini-card" onClick={() => navigateTo(5)}>
                  <div className="mem-mini-mood">{mem.mood}</div>
                  <div className="mem-mini-title">{mem.title}</div>
                  {mem.photo && (
                    <img
                      src={mem.photo}
                      style={{
                        width: 74,
                        height: 50,
                        objectFit: "cover",
                        borderRadius: 8,
                        marginTop: 6,
                      }}
                      alt=""
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Recent Expenses ── */}
      {expenses.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0, fontSize: 14 }}>
              💳 Recent Expenses
            </div>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: "3px 9px" }}
              onClick={() => navigateTo(3)}
            >
              See all
            </button>
          </div>
          {[...expenses]
            .reverse()
            .slice(0, 4)
            .map((exp) => (
              <div key={exp.id} className="exp-row" style={{ padding: "8px 0" }}>
                <div className="exp-cat" style={{ fontSize: 18 }}>
                  {exp.cat.split(" ")[0]}
                </div>
                <div className="exp-info">
                  <div className="exp-desc" style={{ fontSize: 12 }}>
                    {exp.desc}
                  </div>
                  {exp.activityText && (
                    <div className="linked-badge">📅 {exp.activityText.slice(0, 20)}</div>
                  )}
                </div>
                <div className="exp-amt" style={{ fontSize: 12 }}>
                  {baseCurrency} {Number(exp.amtBase ?? exp.amount).toFixed(2)}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/* ── PLAN Tab ─────────────────────────────────────────────────────────────── */
// ── Calendar sync helpers ─────────────────────────────────────────────────────

// Escape special chars for ICS
export const escICS = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")

// ICS date string from a Date (all-day: just DATE, no time)
export const icsDate = (d) => d.toISOString().split("T")[0].replace(/-/g, "")

// Add N days to a date string YYYY-MM-DD
