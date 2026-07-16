import { useEffect, useState } from "react"
import { callAi } from "../../lib/ai"
import { WC_DESC } from "../../lib/constants"
import { detectPlatform, platformLinks } from "../../lib/explore"
import { LS } from "../../lib/storage"
export function ExploreTab({
  trip,
  itinerary,
  weatherCity,
  setWeatherCity,
  weatherData,
  weatherLoading,
  fetchWeather,
  currFrom,
  setCurrFrom,
  currTo,
  setCurrTo,
  currAmount,
  setCurrAmount,
  currResult,
  convertCurrency,
  aiQuery,
  setAiQuery,
  aiResponse,
  aiLoading,
  getAiTip,
}) {
  // ── Visa state ───────────────────────────────────────────────────────────
  const [visaPassport, setVisaPassport] = useState(() => LS.get("tc_visa_passport", ""))
  const [visaDest, setVisaDest] = useState(trip.destination || "")
  const [visaResult, setVisaResult] = useState(() => {
    const p = LS.get("tc_visa_passport", "")
    const d = trip.destination || ""
    if (!p || !d) return null
    try {
      return LS.get(`tc_visa_${p}_${d}`, null)
    } catch {
      return null
    }
  })
  const [visaLoading, setVisaLoading] = useState(false)
  const [visaError, setVisaError] = useState("")
  const [visaCachedAt, setVisaCachedAt] = useState("")
  const [openSections, setOpenSections] = useState({ req: true, health: false, notes: false })
  const toggleSection = (k) => setOpenSections((p) => ({ ...p, [k]: !p[k] }))

  // Sync destination when trip changes
  useEffect(() => {
    if (trip.destination && !visaDest) setVisaDest(trip.destination)
  }, [trip.destination])

  // ── Booking links state ───────────────────────────────────────────────────
  const [bookingTab, setBookingTab] = useState("flight") // "flight" | "hotel"
  const [flightInput, setFlightInput] = useState("")
  const [hotelInput, setHotelInput] = useState("")
  const [bookingResult, setBookingResult] = useState(null)
  const [savedBookings, setSavedBookings] = useState(() => LS.get("tc_bookings", []))
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveLabel, setSaveLabel] = useState("")

  const saveBookmarks = (b) => {
    setSavedBookings(b)
    LS.set("tc_bookings", b)
  }

  // ── Discovery feed state ──────────────────────────────────────────────────
  const DISC_CACHE_MINS = 60 // regenerate at most once per hour per location
  const [disc, setDisc] = useState({
    step: "idle",
    items: [],
    location: "",
    coords: null,
    generatedAt: "",
  })
  // step: idle | locating | generating | ready | error

  const timeOfDayLabel = () => {
    const h = new Date().getHours()
    if (h < 6) return "early morning"
    if (h < 12) return "morning"
    if (h < 14) return "lunchtime"
    if (h < 17) return "afternoon"
    if (h < 20) return "evening"
    return "night"
  }

  const timeClass = () => {
    const h = new Date().getHours()
    if (h < 12) return "morning"
    if (h < 17) return "afternoon"
    if (h < 21) return "evening"
    return "night"
  }

  const tileClass = (type) => `disc-tile-${type || "practical"}`
  const badgeClass = (type) => `disc-badge-${type || "practical"}`

  const mapsUrl = (query, loc) =>
    `https://www.google.com/maps/search/${encodeURIComponent((query || "") + (loc ? " " + loc : ""))}`

  const fetchDiscovery = async (forceRefresh = false) => {
    // Try cache first
    const cacheKey = `tc_disc_${trip.destination || "unknown"}_${new Date().toISOString().slice(0, 13)}`
    if (!forceRefresh) {
      const cached = LS.get(cacheKey, null)
      if (cached?.items?.length) {
        setDisc({ step: "ready", ...cached })
        return
      }
    }

    setDisc((p) => ({ ...p, step: "locating", items: [] }))

    // Get GPS coords
    let coords = null,
      locationStr = trip.destination || ""
    try {
      coords = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
          rej,
          { timeout: 8000, maximumAge: 300000 },
        ),
      )
      // Reverse geocode for neighbourhood name
      const geo = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat.toFixed(4)}&lon=${coords.lng.toFixed(4)}&format=json`,
      ).then((r) => r.json())
      const a = geo.address || {}
      locationStr = [
        a.neighbourhood || a.suburb || a.quarter,
        a.city || a.town || a.village,
        a.country,
      ]
        .filter(Boolean)
        .join(", ")
    } catch {
      // GPS denied — fall back to trip destination
      if (!locationStr) {
        setDisc({
          step: "error",
          items: [],
          location: "",
          coords: null,
          generatedAt: "",
          errorMsg: "Allow location access or set a trip destination to get suggestions.",
        })
        return
      }
    }

    setDisc((p) => ({ ...p, step: "generating", location: locationStr, coords }))

    // Build context
    const tod = timeOfDayLabel()
    const dow = new Date().toLocaleDateString("en", { weekday: "long" })
    const weather =
      weatherData && !weatherData.error
        ? `${weatherData.icon} ${weatherData.temp}${weatherData.unit}, ${WC_DESC(weatherData.code)}`
        : "unknown"
    const doneActs = itinerary.flatMap((d) => d.activities.filter((a) => a.done).map((a) => a.text))
    const todoActs = itinerary.flatMap((d) =>
      d.activities.filter((a) => !a.done).map((a) => a.text),
    )

    try {
      const data = {
        content: [
          {
            text: await callAi({
              task: "tip",
              system: `You are a hyper-local travel guide. Based on context, suggest exactly 3 things to do RIGHT NOW. Return ONLY valid JSON — no markdown.

Shape:
{
  "headline": "short punchy headline for what to do (max 6 words, e.g. 'Golden hour in the old quarter')",
  "items": [
    {
      "name": "specific place or activity name",
      "type": "food | attraction | experience | shopping | nature | nightlife | practical",
      "emoji": "single best-fit emoji",
      "why": "1 sentence on why this is perfect RIGHT NOW — cite time/weather/itinerary if relevant",
      "tip": "1 practical insider tip — opening hours, what to order, where to sit, etc.",
      "google_maps_query": "best search term to find this on Google Maps"
    }
  ]
}

Rules:
- Be SPECIFIC — name actual places or types of places, not generic activities.
- why must reference the context (time of day, weather, what they've already done).
- tip must be actionable and specific to this place/activity.
- Mix types — don't suggest 3 of the same category.
- Return ONLY the JSON.`,
              messages: [
                {
                  role: "user",
                  content: `Location: ${locationStr}
Time: ${tod} on ${dow}
Weather: ${weather}
Trip destination: ${trip.destination || "unknown"}
Already done today: ${doneActs.length ? doneActs.join(", ") : "nothing yet"}
Still on itinerary: ${todoActs.length ? todoActs.slice(0, 5).join(", ") : "nothing planned"}

Suggest 3 things to do right now.`,
                },
              ],
              maxTokens: 900,
            }),
          },
        ],
      }
      const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(raw)
      if (!parsed.items?.length) throw new Error("No items")
      const result = {
        step: "ready",
        items: parsed.items.slice(0, 3),
        headline: parsed.headline || "Nearby right now",
        location: locationStr,
        coords,
        generatedAt: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
      }
      LS.set(cacheKey, result)
      setDisc(result)
    } catch {
      setDisc({
        step: "error",
        items: [],
        location: locationStr,
        coords,
        generatedAt: "",
        errorMsg: "Could not generate suggestions. Check your connection.",
      })
    }
  }

  const searchBooking = () => {
    const raw = (bookingTab === "flight" ? flightInput : hotelInput).trim().toUpperCase()
    if (!raw) return
    if (bookingTab === "flight") {
      const m = raw.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/)
      if (m) {
        const [, code, num] = m
        const airline = AIRLINES[code] || { name: code + " (Unknown airline)", web: null }
        setBookingResult({
          type: "flight",
          raw,
          airline,
          code,
          links: [
            {
              label: "FlightAware",
              url: `https://flightaware.com/live/flight/${raw}`,
              icon: "📡",
              sub: "Live tracking",
            },
            {
              label: "Flightradar24",
              url: `https://www.flightradar24.com/${raw}`,
              icon: "🔴",
              sub: "Real-time map",
            },
            {
              label: "Google Flights",
              url: `https://www.google.com/travel/flights?q=${encodeURIComponent(raw)}`,
              icon: "🔎",
              sub: "Flight info",
            },
            ...(airline.web
              ? [{ label: airline.name, url: airline.web, icon: "✈️", sub: "Manage booking" }]
              : []),
          ],
        })
      } else {
        setBookingResult({ type: "flight_invalid", raw })
      }
    } else {
      const platform = detectPlatform(raw)
      setBookingResult({
        type: "hotel",
        raw,
        platform,
        links: platformLinks(raw, platform),
      })
    }
  }

  const addBookmark = () => {
    const raw = (bookingTab === "flight" ? flightInput : hotelInput).trim().toUpperCase()
    if (!raw || !saveLabel.trim()) return
    const b = [
      { id: Date.now(), type: bookingTab, ref: raw, label: saveLabel.trim() },
      ...savedBookings,
    ].slice(0, 20)
    saveBookmarks(b)
    setShowSaveForm(false)
    setSaveLabel("")
  }

  const removeBookmark = (id) => saveBookmarks(savedBookings.filter((b) => b.id !== id))

  const loadBookmark = (b) => {
    setBookingTab(b.type)
    if (b.type === "flight") setFlightInput(b.ref)
    else setHotelInput(b.ref)
    setBookingResult(null)
    setTimeout(searchBooking, 50)
  }

  // ── Check visa requirements via Claude ───────────────────────────────────
  const checkVisa = async () => {
    const passport = visaPassport.trim()
    const dest = visaDest.trim()
    if (!passport || !dest) return

    // Check cache first
    const cacheKey = `tc_visa_${passport.toLowerCase()}_${dest.toLowerCase()}`
    const cached = LS.get(cacheKey, null)
    const cachedAt = LS.get(cacheKey + "_at", "")
    if (cached) {
      setVisaResult(cached)
      setVisaCachedAt(cachedAt)
      setVisaError("")
      return
    }

    setVisaLoading(true)
    setVisaResult(null)
    setVisaError("")

    try {
      const data = {
        content: [
          {
            text: await callAi({
              task: "tip",
              system: `You are a visa and travel requirements expert. Return ONLY valid JSON — no markdown, no extra text.

Shape:
{
  "status": "visa_free | visa_on_arrival | evisa | visa_required",
  "status_label": "Visa Free" | "Visa on Arrival" | "eVisa Available" | "Visa Required",
  "stay_duration": "e.g. 90 days | 30 days | varies",
  "cost": "e.g. Free | ~USD 35 | ~USD 50–80",
  "validity": "e.g. Multiple entry, 10 years | Single entry, 3 months",
  "how_to_apply": "concise 1–2 sentence instruction — where/how to apply",
  "requirements": ["list of 4–8 specific document or condition requirements"],
  "health_rules": ["list of 2–5 health/vaccination/insurance entry rules — say 'None currently required' if not applicable"],
  "important_notes": ["1–4 noteworthy conditions: dual nationality, passport validity rule, restricted nationalities, etc."],
  "apply_url_hint": "name of official portal or ministry, e.g. 'evisa.example.gov' or 'Embassy of X'",
  "confidence": "high | medium | low"
}

Rules:
- Base answer on your best knowledge. Be specific but acknowledge if uncertain.
- If passport nationality has no formal treaty info, give a conservative 'visa_required' answer.
- Keep requirements as short bullet-point phrases.
- Never invent specific URLs — only describe where to apply.`,
              messages: [
                {
                  role: "user",
                  content: `Passport nationality: ${passport}
Destination country: ${dest}
Provide the current visa and entry requirements.`,
                },
              ],
              maxTokens: 1200,
            }),
          },
        ],
      }
      const raw = data.content?.[0]?.text || "{}"
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim())
      if (!parsed.status) throw new Error("Invalid response")

      const checkedAt = new Date().toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      LS.set(cacheKey, parsed)
      LS.set(cacheKey + "_at", checkedAt)
      LS.set("tc_visa_passport", passport)
      setVisaResult(parsed)
      setVisaCachedAt(checkedAt)
    } catch (e) {
      setVisaError("Could not retrieve requirements. Check your connection and try again.")
    }
    setVisaLoading(false)
  }

  const clearVisa = () => {
    const cacheKey = `tc_visa_${visaPassport.trim().toLowerCase()}_${visaDest.trim().toLowerCase()}`
    LS.set(cacheKey, null)
    LS.set(cacheKey + "_at", "")
    setVisaResult(null)
    setVisaCachedAt("")
  }

  // Status → badge class + icon
  const statusClass = (s) =>
    s === "visa_free"
      ? "free"
      : s === "visa_on_arrival"
        ? "arrival"
        : s === "evisa"
          ? "evisa"
          : "required"
  const statusIcon = (s) =>
    s === "visa_free" ? "✅" : s === "visa_on_arrival" ? "🛬" : s === "evisa" ? "💻" : "🏛️"

  // ── Common data ─────────────────────────────────────────────────────────
  const PHRASES = [
    { en: "Hello", tr: "你好 / Bonjour / Hola / こんにちは" },
    { en: "Thank you", tr: "谢谢 / Merci / Gracias / ありがとう" },
    { en: "Where is…?", tr: "在哪里? / Où est? / ¿Dónde? / どこ?" },
    { en: "How much?", tr: "多少钱? / Combien? / ¿Cuánto? / いくら?" },
    { en: "Help!", tr: "救命! / Au secours! / ¡Ayuda! / 助けて!" },
    { en: "Excuse me", tr: "对不起 / Excusez-moi / Disculpe / すみません" },
    { en: "I don't understand", tr: "我不明白 / Je ne comprends pas" },
  ]
  const EMERGENCY = [
    { c: "🇸🇬 Singapore", p: "999", a: "995" },
    { c: "🇺🇸 USA", p: "911", a: "911" },
    { c: "🇬🇧 UK", p: "999", a: "999" },
    { c: "🇯🇵 Japan", p: "110", a: "119" },
    { c: "🇦🇺 Australia", p: "000", a: "000" },
    { c: "🇹🇭 Thailand", p: "191", a: "1669" },
    { c: "🇫🇷 France", p: "17", a: "15" },
    { c: "🇩🇪 Germany", p: "110", a: "112" },
  ]

  const NATIONALITIES = [
    "Afghan",
    "Albanian",
    "Algerian",
    "American",
    "Andorran",
    "Angolan",
    "Argentine",
    "Armenian",
    "Australian",
    "Austrian",
    "Azerbaijani",
    "Bahamian",
    "Bahraini",
    "Bangladeshi",
    "Barbadian",
    "Belarusian",
    "Belgian",
    "Belizean",
    "Beninese",
    "Bhutanese",
    "Bolivian",
    "Bosnian",
    "Botswanan",
    "Brazilian",
    "British",
    "Bruneian",
    "Bulgarian",
    "Burkinabe",
    "Burmese",
    "Burundian",
    "Cambodian",
    "Cameroonian",
    "Canadian",
    "Cape Verdean",
    "Central African",
    "Chadian",
    "Chilean",
    "Chinese",
    "Colombian",
    "Congolese",
    "Costa Rican",
    "Croatian",
    "Cuban",
    "Cypriot",
    "Czech",
    "Danish",
    "Djiboutian",
    "Dominican",
    "Dutch",
    "Ecuadorian",
    "Egyptian",
    "Emirati",
    "Estonian",
    "Ethiopian",
    "Fijian",
    "Finnish",
    "French",
    "Gabonese",
    "Gambian",
    "Georgian",
    "German",
    "Ghanaian",
    "Greek",
    "Grenadian",
    "Guatemalan",
    "Guinean",
    "Guyanese",
    "Haitian",
    "Honduran",
    "Hungarian",
    "Icelandic",
    "Indian",
    "Indonesian",
    "Iranian",
    "Iraqi",
    "Irish",
    "Israeli",
    "Italian",
    "Ivorian",
    "Jamaican",
    "Japanese",
    "Jordanian",
    "Kazakhstani",
    "Kenyan",
    "Korean (South)",
    "Kuwaiti",
    "Kyrgyzstani",
    "Laotian",
    "Latvian",
    "Lebanese",
    "Liberian",
    "Libyan",
    "Liechtenstein",
    "Lithuanian",
    "Luxembourgish",
    "Macedonian",
    "Malagasy",
    "Malawian",
    "Malaysian",
    "Maldivian",
    "Malian",
    "Maltese",
    "Mauritanian",
    "Mauritian",
    "Mexican",
    "Moldovan",
    "Monegasque",
    "Mongolian",
    "Montenegrin",
    "Moroccan",
    "Mozambican",
    "Namibian",
    "Nepalese",
    "New Zealander",
    "Nicaraguan",
    "Nigerian",
    "Norwegian",
    "Omani",
    "Pakistani",
    "Panamanian",
    "Paraguayan",
    "Peruvian",
    "Filipino",
    "Polish",
    "Portuguese",
    "Qatari",
    "Romanian",
    "Russian",
    "Rwandan",
    "Saudi",
    "Senegalese",
    "Serbian",
    "Singaporean",
    "Slovak",
    "Slovenian",
    "Somali",
    "South African",
    "Spanish",
    "Sri Lankan",
    "Sudanese",
    "Swazi",
    "Swedish",
    "Swiss",
    "Syrian",
    "Taiwanese",
    "Tajik",
    "Tanzanian",
    "Thai",
    "Togolese",
    "Trinidadian",
    "Tunisian",
    "Turkish",
    "Turkmen",
    "Ugandan",
    "Ukrainian",
    "Uruguayan",
    "Uzbekistani",
    "Venezuelan",
    "Vietnamese",
    "Yemeni",
    "Zambian",
    "Zimbabwean",
  ]

  return (
    <div>
      {/* ── Visa & Entry Requirements ── */}
      <div className="visa-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0, color: "#5BA4FF" }}>
            🛂 Visa &amp; Entry Check
          </div>
          {visaResult && (
            <div className="visa-cached-badge" onClick={clearVisa} title="Tap to refresh">
              ✓ Checked {visaCachedAt} · ↺
            </div>
          )}
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-8">
          <div>
            <div className="card-title-small">Your passport / nationality</div>
            <input
              className="input"
              list="nationalities-list"
              placeholder="e.g. Singaporean, British, American…"
              value={visaPassport}
              onChange={(e) => {
                setVisaPassport(e.target.value)
                setVisaResult(null)
              }}
            />
            <datalist id="nationalities-list">
              {NATIONALITIES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <div className="card-title-small">Destination country</div>
            <input
              className="input"
              placeholder="e.g. Japan, Thailand, France…"
              value={visaDest}
              onChange={(e) => {
                setVisaDest(e.target.value)
                setVisaResult(null)
              }}
            />
          </div>
          <button
            className="btn btn-full"
            onClick={checkVisa}
            disabled={visaLoading || !visaPassport.trim() || !visaDest.trim()}
          >
            {visaLoading ? (
              <span className="dots">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>
            ) : (
              "🔍 Check Requirements"
            )}
          </button>
        </div>

        {/* Loading shimmer */}
        {visaLoading && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="visa-shimmer" style={{ height: 56 }} />
            <div className="visa-shimmer" style={{ height: 80, opacity: 0.7 }} />
            <div className="visa-shimmer" style={{ height: 50, opacity: 0.45 }} />
          </div>
        )}

        {/* Error */}
        {visaError && !visaLoading && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(255,92,92,.07)",
              border: "1px solid rgba(255,92,92,.2)",
              borderRadius: 12,
              fontSize: 13,
              color: "rgba(255,92,92,.8)",
            }}
          >
            ⚠️ {visaError}
          </div>
        )}

        {/* ── Results ── */}
        {visaResult &&
          !visaLoading &&
          (() => {
            const r = visaResult
            const sc = statusClass(r.status)
            return (
              <div style={{ animation: "fadeUp .3s ease" }}>
                {/* Status badge */}
                <div className={`visa-status-badge ${sc}`}>
                  <div className="visa-status-icon">{statusIcon(r.status)}</div>
                  <div style={{ flex: 1 }}>
                    <div className={`visa-status-label ${sc}`}>{r.status_label}</div>
                    <div className="visa-status-sub">
                      {visaPassport} passport → {visaDest}
                    </div>
                  </div>
                  {r.confidence === "low" && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-dim)",
                        background: "rgba(255,255,255,.05)",
                        borderRadius: 6,
                        padding: "3px 7px",
                      }}
                    >
                      ⚠️ low confidence
                    </div>
                  )}
                </div>

                {/* Meta chips */}
                <div className="visa-meta-row">
                  {r.stay_duration && (
                    <div className="visa-meta-chip">
                      <div className="visa-meta-chip-val">{r.stay_duration}</div>
                      <div className="visa-meta-chip-lbl">Max stay</div>
                    </div>
                  )}
                  {r.cost && (
                    <div className="visa-meta-chip">
                      <div className="visa-meta-chip-val">{r.cost}</div>
                      <div className="visa-meta-chip-lbl">Fee</div>
                    </div>
                  )}
                  {r.validity && (
                    <div className="visa-meta-chip" style={{ flex: 2 }}>
                      <div className="visa-meta-chip-val" style={{ fontSize: 12 }}>
                        {r.validity}
                      </div>
                      <div className="visa-meta-chip-lbl">Validity</div>
                    </div>
                  )}
                </div>

                {/* How to apply */}
                {r.how_to_apply && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(230,217,194,.75)",
                      marginBottom: 12,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid rgba(255,255,255,.06)",
                      borderRadius: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>How to apply: </span>
                    {r.how_to_apply}
                    {r.apply_url_hint && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#5BA4FF" }}>
                        → {r.apply_url_hint}
                      </div>
                    )}
                  </div>
                )}

                {/* Requirements */}
                {r.requirements?.length > 0 && (
                  <div className="visa-section">
                    <div className="visa-section-hdr" onClick={() => toggleSection("req")}>
                      <div className="visa-section-icon">📋</div>
                      <div className="visa-section-title">
                        Requirements ({r.requirements.length})
                      </div>
                      <div className={`visa-section-arrow${openSections.req ? " open" : ""}`}>
                        ▼
                      </div>
                    </div>
                    {openSections.req && (
                      <div className="visa-section-body">
                        {r.requirements.map((req, i) => (
                          <div key={i} className="visa-req-item">
                            <div className="visa-req-dot">▸</div>
                            <div>{req}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Health rules */}
                {r.health_rules?.length > 0 && (
                  <div className="visa-section">
                    <div className="visa-section-hdr" onClick={() => toggleSection("health")}>
                      <div className="visa-section-icon">🏥</div>
                      <div className="visa-section-title">Health &amp; Entry Rules</div>
                      <div className={`visa-section-arrow${openSections.health ? " open" : ""}`}>
                        ▼
                      </div>
                    </div>
                    {openSections.health && (
                      <div className="visa-section-body">
                        {r.health_rules.map((rule, i) => (
                          <div key={i} className="visa-req-item">
                            <div className="visa-req-dot">▸</div>
                            <div>{rule}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Important notes */}
                {r.important_notes?.length > 0 && (
                  <div className="visa-section">
                    <div className="visa-section-hdr" onClick={() => toggleSection("notes")}>
                      <div className="visa-section-icon">⚠️</div>
                      <div className="visa-section-title">Important Notes</div>
                      <div className={`visa-section-arrow${openSections.notes ? " open" : ""}`}>
                        ▼
                      </div>
                    </div>
                    {openSections.notes && (
                      <div className="visa-section-body">
                        {r.important_notes.map((note, i) => (
                          <div key={i} className="visa-req-item">
                            <div className="visa-req-dot" style={{ color: "#FFA828" }}>
                              !
                            </div>
                            <div>{note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Disclaimer */}
                <div className="visa-disclaimer">
                  <span style={{ flexShrink: 0 }}>⚠️</span>
                  <span>
                    Visa rules change frequently. Always verify with the official embassy or
                    government website before travel. This is informational only and not legal
                    advice.
                  </span>
                </div>
              </div>
            )
          })()}
      </div>

      {/* Weather */}
      <div className="card">
        <div className="card-title">🌤️ Weather</div>
        <div className="flex gap-8">
          <input
            className="input flex-1"
            placeholder={trip.destination || "Enter city…"}
            value={weatherCity}
            onChange={(e) => setWeatherCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchWeather()}
          />
          <button
            className="btn"
            onClick={() => fetchWeather(weatherCity || undefined)}
            disabled={weatherLoading}
          >
            {weatherLoading ? (
              <span className="dots">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>
            ) : (
              "Check"
            )}
          </button>
        </div>
        {weatherData && !weatherData.error && (
          <div className="weather-big">
            <div className="weather-icon">{weatherData.icon}</div>
            <div className="weather-temp">
              {weatherData.temp}
              {weatherData.unit}
            </div>
            <div className="weather-desc">{WC_DESC(weatherData.code)}</div>
            <div className="weather-city">
              {weatherData.city}, {weatherData.country}
            </div>
            <div className="weather-details">
              <div className="weather-detail-item">
                <span>💧</span>
                <span className="weather-detail-val">{weatherData.humidity}%</span>
                <span>Humidity</span>
              </div>
              <div className="weather-detail-item">
                <span>💨</span>
                <span className="weather-detail-val">{weatherData.wind} km/h</span>
                <span>Wind</span>
              </div>
            </div>
          </div>
        )}
        {weatherData?.error && (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255,92,92,0.7)",
              fontSize: 13,
              marginTop: 10,
            }}
          >
            ⚠️ {weatherData.error}
          </div>
        )}
      </div>

      {/* ── Flight & Hotel Booking Links ── */}
      <div className="booking-card">
        <div className="card-title" style={{ marginBottom: 10, color: "#9B9BFF" }}>
          ✈️ Booking Quick Links
        </div>

        {/* Type tabs */}
        <div className="booking-type-tabs">
          <div
            className={`booking-type-tab${bookingTab === "flight" ? " on" : ""}`}
            onClick={() => {
              setBookingTab("flight")
              setBookingResult(null)
            }}
          >
            ✈️ Flight
          </div>
          <div
            className={`booking-type-tab${bookingTab === "hotel" ? " on" : ""}`}
            onClick={() => {
              setBookingTab("hotel")
              setBookingResult(null)
            }}
          >
            🏨 Hotel / Booking
          </div>
        </div>

        {/* Input row */}
        <div className="flex gap-8">
          <input
            className="input flex-1"
            placeholder={
              bookingTab === "flight"
                ? "Flight number e.g. SQ321, BA117…"
                : "Booking reference e.g. BKG123456…"
            }
            value={bookingTab === "flight" ? flightInput : hotelInput}
            onChange={(e) => {
              bookingTab === "flight"
                ? setFlightInput(e.target.value)
                : setHotelInput(e.target.value)
              setBookingResult(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && searchBooking()}
          />
          <button
            className="btn"
            onClick={searchBooking}
            disabled={!(bookingTab === "flight" ? flightInput : hotelInput).trim()}
          >
            Go
          </button>
        </div>
        <div className="nat-hint" style={{ marginTop: 5 }}>
          {bookingTab === "flight"
            ? "Enter 2–3 letter airline code + flight number"
            : "Enter your booking reference from the confirmation email"}
        </div>

        {/* ── Flight result ── */}
        {bookingResult?.type === "flight" && (
          <div className="booking-result">
            <div className="airline-badge">
              <div className="airline-badge-icon">✈️</div>
              <div>
                <div className="airline-badge-name">{bookingResult.airline.name}</div>
                <div className="airline-badge-code">Flight {bookingResult.raw}</div>
              </div>
            </div>
            <div className="booking-links-grid">
              {bookingResult.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="booking-link-btn"
                >
                  <div className="blb-icon">{l.icon}</div>
                  <div>
                    <div className="blb-label">{l.label}</div>
                    <div className="blb-sub">{l.sub}</div>
                  </div>
                </a>
              ))}
            </div>
            <button
              className="btn-ghost"
              style={{ width: "100%", marginTop: 10, fontSize: 12 }}
              onClick={() => setShowSaveForm((s) => !s)}
            >
              {showSaveForm ? "Cancel" : "📌 Save this booking"}
            </button>
          </div>
        )}

        {/* Invalid flight number */}
        {bookingResult?.type === "flight_invalid" && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: "rgba(255,92,92,0.8)",
              padding: "8px 12px",
              background: "rgba(255,92,92,0.07)",
              border: "1px solid rgba(255,92,92,0.2)",
              borderRadius: 10,
            }}
          >
            ⚠️ "{bookingResult.raw}" doesn't look like a flight number. Try formats like SQ321,
            BA117, AA1234.
          </div>
        )}

        {/* ── Hotel / booking result ── */}
        {bookingResult?.type === "hotel" && (
          <div className="booking-result">
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Ref:{" "}
                <span style={{ fontFamily: "monospace", color: "#9B9BFF" }}>
                  {bookingResult.raw}
                </span>
              </div>
              {bookingResult.platform !== "generic" && (
                <div className="booking-platform-badge">
                  {bookingResult.platform === "airbnb"
                    ? "🏠 Airbnb"
                    : bookingResult.platform === "booking"
                      ? "🏨 Booking.com"
                      : bookingResult.platform === "expedia"
                        ? "✈️ Expedia"
                        : bookingResult.platform === "pnr"
                          ? "✈️ PNR"
                          : "🏨 Hotel"}
                </div>
              )}
            </div>
            <div className="booking-links-grid">
              {bookingResult.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="booking-link-btn"
                >
                  <div className="blb-icon">{l.icon}</div>
                  <div>
                    <div className="blb-label">{l.label}</div>
                    <div className="blb-sub">{l.sub}</div>
                  </div>
                </a>
              ))}
            </div>
            <button
              className="btn-ghost"
              style={{ width: "100%", marginTop: 10, fontSize: 12 }}
              onClick={() => setShowSaveForm((s) => !s)}
            >
              {showSaveForm ? "Cancel" : "📌 Save this booking"}
            </button>
          </div>
        )}

        {/* Save form */}
        {showSaveForm && (
          <div className="save-form">
            <input
              className="input"
              placeholder='Label e.g. "Return flight" or "Hotel Tokyo"'
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBookmark()}
            />
            <button className="btn btn-full" onClick={addBookmark} disabled={!saveLabel.trim()}>
              Save Bookmark
            </button>
          </div>
        )}

        {/* Saved bookings */}
        {savedBookings.length > 0 && (
          <div className="saved-bookings">
            <div className="saved-bookings-hdr">
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: ".6px",
                }}
              >
                📌 Saved ({savedBookings.length})
              </div>
            </div>
            {savedBookings.map((b) => (
              <div key={b.id} className="saved-bookmark">
                <div className="saved-bm-icon">{b.type === "flight" ? "✈️" : "🏨"}</div>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => loadBookmark(b)}>
                  <div className="saved-bm-label">{b.label}</div>
                  <div className="saved-bm-ref">{b.ref}</div>
                </div>
                <button
                  className="btn-del"
                  style={{ fontSize: 13 }}
                  onClick={() => removeBookmark(b.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Local Discovery Feed ── */}
      {(() => {
        const tc = timeClass()
        const isLoading = disc.step === "locating" || disc.step === "generating"
        return (
          <div className={`discovery-card ${tc}`}>
            <div className="discovery-hdr">
              <div className="discovery-title-block">
                <div className="discovery-eyebrow">
                  {disc.step === "locating"
                    ? "Finding you…"
                    : disc.step === "generating"
                      ? "Asking Claude…"
                      : disc.step === "ready"
                        ? `📍 ${disc.location || "Nearby"}`
                        : "📍 What's nearby"}
                </div>
                <div className="discovery-heading">
                  {disc.step === "ready"
                    ? disc.headline || "Nearby right now"
                    : `${timeOfDayLabel().charAt(0).toUpperCase() + timeOfDayLabel().slice(1)} discoveries`}
                </div>
                {disc.step === "ready" && disc.generatedAt && (
                  <div className="discovery-sub">Updated {disc.generatedAt}</div>
                )}
              </div>
              <button
                className="discovery-refresh-btn"
                disabled={isLoading}
                onClick={() => fetchDiscovery(disc.step === "ready")}
              >
                {isLoading ? (
                  <span className="dots">
                    <span>·</span>
                    <span>·</span>
                    <span>·</span>
                  </span>
                ) : disc.step === "ready" ? (
                  "↺ Refresh"
                ) : (
                  "✨ Discover"
                )}
              </button>
            </div>

            {/* Idle — prompt to discover */}
            {disc.step === "idle" && (
              <div className="disc-locate-btn" onClick={() => fetchDiscovery(false)}>
                <span style={{ fontSize: 22 }}>🔍</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    Discover what's nearby
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    Claude suggests 3 things based on your location, time &amp; itinerary
                  </div>
                </div>
              </div>
            )}

            {/* Loading shimmer */}
            {isLoading && (
              <div>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="disc-shimmer-item">
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        flexShrink: 0,
                        background: "rgba(255,255,255,0.04)",
                        animation: "shimmer 1.4s infinite",
                        backgroundSize: "200% 100%",
                        backgroundImage:
                          "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,200,100,0.07) 50%,rgba(255,255,255,0.04) 75%)",
                      }}
                    />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                      {[70, 50, 85].map((w, j) => (
                        <div
                          key={j}
                          style={{
                            height: 10,
                            borderRadius: 5,
                            width: `${w}%`,
                            background: "rgba(255,255,255,0.05)",
                            animation: "shimmer 1.4s infinite",
                            backgroundSize: "200% 100%",
                            animationDelay: `${j * 0.15}s`,
                            backgroundImage:
                              "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,200,100,0.07) 50%,rgba(255,255,255,0.04) 75%)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  {disc.step === "locating"
                    ? "Getting your location…"
                    : "Claude is curating suggestions…"}
                </div>
              </div>
            )}

            {/* Error */}
            {disc.step === "error" && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(255,92,92,0.8)",
                    padding: "10px 12px",
                    background: "rgba(255,92,92,0.07)",
                    border: "1px solid rgba(255,92,92,0.2)",
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                >
                  ⚠️ {disc.errorMsg || "Could not get suggestions"}
                </div>
                <button
                  className="btn-ghost"
                  style={{ width: "100%", fontSize: 12 }}
                  onClick={() => fetchDiscovery(true)}
                >
                  Try again
                </button>
              </div>
            )}

            {/* Results */}
            {disc.step === "ready" &&
              disc.items.map((item, i) => (
                <div key={i} className="disc-item">
                  <div className={`disc-emoji-tile ${tileClass(item.type)}`}>
                    {item.emoji || "📍"}
                  </div>
                  <div className="disc-body">
                    <div className="disc-title-row">
                      <div className="disc-name">{item.name}</div>
                      {item.type && (
                        <div className={`disc-type-badge ${badgeClass(item.type)}`}>
                          {item.type}
                        </div>
                      )}
                    </div>
                    {item.why && <div className="disc-why">{item.why}</div>}
                    {item.tip && <div className="disc-tip">💡 {item.tip}</div>}
                    <a
                      className="disc-maps-btn"
                      href={mapsUrl(item.google_maps_query, disc.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📍 Find on Maps
                    </a>
                  </div>
                </div>
              ))}
          </div>
        )
      })()}

      {/* Currency Converter */}
      <div className="card">
        <div className="card-title">💱 Currency Converter</div>
        <div className="flex gap-8">
          <select
            className="input flex-1"
            value={currFrom}
            onChange={(e) => setCurrFrom(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div
            style={{
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              color: "rgba(230,217,194,0.3)",
              flexShrink: 0,
            }}
          >
            ⇌
          </div>
          <select
            className="input flex-1"
            value={currTo}
            onChange={(e) => setCurrTo(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-8 mt-8">
          <input
            className="input flex-1"
            type="number"
            placeholder="Amount"
            value={currAmount}
            onChange={(e) => setCurrAmount(e.target.value)}
          />
          <button className="btn" onClick={convertCurrency}>
            Convert
          </button>
        </div>
        {currResult !== null && (
          <div
            style={{ textAlign: "center", marginTop: 14, fontFamily: "'Playfair Display',serif" }}
          >
            <span style={{ fontSize: 13, color: "rgba(230,217,194,0.45)" }}>
              {currAmount} {currFrom} =
            </span>
            <div style={{ fontSize: 30, color: "var(--amber)", fontWeight: 700 }}>
              {typeof currResult === "number" ? currResult.toFixed(2) : currResult} {currTo}
            </div>
          </div>
        )}
      </div>

      {/* AI Assistant */}
      <div className="card">
        <div className="card-title">🤖 AI Travel Assistant</div>
        <textarea
          className="input"
          placeholder={`Ask anything about ${trip.destination || "your destination"}…\ne.g. "Best street food in Bangkok" or "Tips for first-time solo traveller"`}
          value={aiQuery}
          onChange={(e) => setAiQuery(e.target.value)}
        />
        <button className="btn btn-full mt-8" onClick={getAiTip} disabled={aiLoading}>
          {aiLoading ? (
            <span className="dots">
              <span>·</span>
              <span>·</span>
              <span>·</span>
            </span>
          ) : (
            "✨ Ask AI"
          )}
        </button>
        {aiResponse && <div className="ai-box">{aiResponse}</div>}
      </div>

      {/* Phrases */}
      <div className="card">
        <div className="card-title">💬 Useful Phrases</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>
          Common translations (ZH / FR / ES / JA)
        </div>
        {PHRASES.map((p, i) => (
          <div key={i} className="phrase-row">
            <div className="phrase-en">{p.en}</div>
            <div className="phrase-tr">{p.tr}</div>
          </div>
        ))}
      </div>

      {/* Emergency */}
      <div className="card">
        <div className="card-title">🚨 Emergency Numbers</div>
        <div className="grid-2">
          {EMERGENCY.map((e) => (
            <div key={e.c} className="emg-card">
              <div className="emg-country">{e.c}</div>
              <div className="emg-nums">
                👮 {e.p} &nbsp; 🚑 {e.a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── MEMORIES Tab ─────────────────────────────────────────────────────────── */
