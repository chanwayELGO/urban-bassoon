/**
 * Japan Navi Journey — Nakasendo Walking Journey demo seed.
 * Source: Japan Navi Journey proposal (9 days / 8 nights, 24 Oct–1 Nov 2026).
 * Adjust BASELINE_DAYS / guestCount; budgetFromItinerary keeps tc_budget in sync.
 */

import { LS } from "../storage"
import { snapshotTrip } from "../trip"

export const DEMO_TRIP_ID = "demo_nakasendo"
export const DEMO_LOADED_KEY = "tc_demo_nakasendo_loaded"
export const GUIDE_CONTACT =
  "mailto:hello@japan-navi-journey.com?subject=Nakasendo%20Walking%20Journey"
export const ROUTE_BANNER =
  "Narita → Tokyo/Shinjuku → Nagoya → Nakatsugawa → Magome & Tsumago → Kiso Valley → Narai-juku → Suwa & Shimosuwa → Shinjuku (~40–50 km walking)"

const BASE_PACKAGE = 365_000
const BASELINE_NIGHTS = 8
const BASELINE_WALK_DAYS = 6
const BASELINE_BREAKFASTS = 4
const BASELINE_DINNERS = 4
const NIGHT_UNIT = BASE_PACKAGE / BASELINE_NIGHTS
const WALK_SLICE = BASE_PACKAGE * 0.04
const DINNER_UNIT = 4_000
const BREAKFAST_UNIT = 2_500
const BUS_TICKET_SLICE = BASE_PACKAGE * 0.06

export type DemoMeal = "B" | "D" | "BD"
export type DemoActKind = "walk" | "stay" | "transfer" | "meal" | "note"

export interface DemoActivity {
  id: number
  text: string
  done: boolean
  time?: string
  kind?: DemoActKind
  meal?: DemoMeal
  included?: boolean
  lodging?: boolean
  overnightBus?: boolean
  highwayBus?: boolean
}

export interface DemoDay {
  id: number
  day: number
  label: string
  date: string
  activities: DemoActivity[]
}

let _id = 1
const nid = () => _id++

/** Editable PDF baseline — change this array to adjust the demo package. */
export const BASELINE_DAYS: DemoDay[] = [
  {
    id: nid(),
    day: 1,
    label: "Day 1 · Arrival & overnight bus",
    date: "2026-10-24",
    activities: [
      {
        id: nid(),
        text: "Arrive Narita (NRT) 14:30",
        done: false,
        time: "14:30",
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Travel to Tokyo / Shinjuku",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Overnight highway bus Shinjuku → Nagoya",
        done: false,
        kind: "transfer",
        lodging: true,
        overnightBus: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 2,
    label: "Day 2 · Nakatsugawa walk",
    date: "2026-10-25",
    activities: [
      {
        id: nid(),
        text: "Nagoya → Nakatsugawa",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Walk Nakatsugawa-juku → Ochiai-juku (~5–7 km)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Stay Nakatsugawa — compact modern hotel",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 3,
    label: "Day 3 · Magome → Tsumago",
    date: "2026-10-26",
    activities: [
      {
        id: nid(),
        text: "Walk Magome-juku → Magome Pass → Tsumago-juku (~8 km)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Continue to Kiso Valley",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Dinner included · Kiso Valley Japanese-style stay",
        done: false,
        kind: "stay",
        lodging: true,
        meal: "D",
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 4,
    label: "Day 4 · Nojiri → Suhara",
    date: "2026-10-27",
    activities: [
      {
        id: nid(),
        text: "Walk Nojiri-juku → Suhara-juku (~7–8 km)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Breakfast & dinner included · Kiso Valley stay",
        done: false,
        kind: "stay",
        lodging: true,
        meal: "BD",
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 5,
    label: "Day 5 · Torii Pass → Narai",
    date: "2026-10-28",
    activities: [
      {
        id: nid(),
        text: "Walk Yabuhara-juku → Torii Pass → Narai-juku (~6–7 km)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Breakfast included · Narai-juku traditional guesthouse",
        done: false,
        kind: "stay",
        lodging: true,
        meal: "B",
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 6,
    label: "Day 6 · Narai → Suwa",
    date: "2026-10-29",
    activities: [
      {
        id: nid(),
        text: "Explore Narai-juku; walk toward Kiso-Hirasawa / Niekawa",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "JR train to Suwa",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Dinner included · Suwa Japanese-style stay",
        done: false,
        kind: "stay",
        lodging: true,
        meal: "D",
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 7,
    label: "Day 7 · Shiojiri Pass",
    date: "2026-10-30",
    activities: [
      {
        id: nid(),
        text: "Walk Shiojiri Pass → Shimosuwa-juku (up to 14–15 km)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Breakfast & dinner included · Suwa stay",
        done: false,
        kind: "stay",
        lodging: true,
        meal: "BD",
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 8,
    label: "Day 8 · Return to Shinjuku",
    date: "2026-10-31",
    activities: [
      {
        id: nid(),
        text: "Highway bus Kamisuwa → Shinjuku",
        done: false,
        kind: "transfer",
        highwayBus: true,
        included: true,
      },
      {
        id: nid(),
        text: "Breakfast included · Final Tokyo evening",
        done: false,
        kind: "meal",
        meal: "B",
        included: true,
      },
      {
        id: nid(),
        text: "Stay Shinjuku — standard city hotel",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 9,
    label: "Day 9 · Departure",
    date: "2026-11-01",
    activities: [
      {
        id: nid(),
        text: "Free morning in Tokyo",
        done: false,
        kind: "note",
      },
      {
        id: nid(),
        text: "Travel to NRT for 17:00 departure",
        done: false,
        time: "17:00",
        kind: "transfer",
      },
    ],
  },
]

export function buildItinerary(days: DemoDay[] = BASELINE_DAYS): DemoDay[] {
  return days.map((d, i) => ({
    ...d,
    day: i + 1,
    activities: d.activities.map((a) => ({ ...a })),
  }))
}

function countMeals(days: DemoDay[], which: "B" | "D") {
  let n = 0
  for (const d of days) {
    for (const a of d.activities) {
      if (!a.included || !a.meal) continue
      if (which === "B" && (a.meal === "B" || a.meal === "BD")) n++
      if (which === "D" && (a.meal === "D" || a.meal === "BD")) n++
    }
  }
  return n
}

function countLodgingNights(days: DemoDay[]) {
  return days.reduce((n, d) => n + d.activities.filter((a) => a.lodging && a.included).length, 0)
}

function countWalkDays(days: DemoDay[]) {
  return days.filter((d) => d.activities.some((a) => a.kind === "walk")).length
}

function hasOvernightBus(days: DemoDay[]) {
  return days.some((d) => d.activities.some((a) => a.overnightBus))
}

function hasHighwayBus(days: DemoDay[]) {
  return days.some((d) => d.activities.some((a) => a.highwayBus))
}

function isFullBaseline(days: DemoDay[], guestCount: number) {
  if (guestCount !== 2 || days.length !== BASELINE_DAYS.length) return false
  if (countLodgingNights(days) !== BASELINE_NIGHTS) return false
  if (countWalkDays(days) !== BASELINE_WALK_DAYS) return false
  if (countMeals(days, "B") !== BASELINE_BREAKFASTS) return false
  if (countMeals(days, "D") !== BASELINE_DINNERS) return false
  if (!hasOvernightBus(days) || !hasHighwayBus(days)) return false
  return days.every((d, i) => d.date === BASELINE_DAYS[i].date)
}

/** Translate itinerary adjustments into package total (JPY, two-guest baseline). */
export function budgetFromItinerary(days: DemoDay[], guestCount = 2): number {
  if (isFullBaseline(days, guestCount)) return BASE_PACKAGE

  let total = BASE_PACKAGE
  total += (countLodgingNights(days) - BASELINE_NIGHTS) * NIGHT_UNIT
  total += (countWalkDays(days) - BASELINE_WALK_DAYS) * WALK_SLICE
  total += (countMeals(days, "D") - BASELINE_DINNERS) * DINNER_UNIT
  total += (countMeals(days, "B") - BASELINE_BREAKFASTS) * BREAKFAST_UNIT
  if (!hasOvernightBus(days) && !hasHighwayBus(days)) total -= BUS_TICKET_SLICE
  total = total * (guestCount / 2)
  return Math.max(0, Math.round(total / 500) * 500)
}

export function buildPacking() {
  const cats: Record<string, string[]> = {
    "📄 Documents": [
      "Passport",
      "Travel insurance",
      "Japan Navi Journey itinerary (offline)",
      "Ryokan / hotel confirmations",
      "Highway & overnight bus tickets",
    ],
    "👕 Clothing": [
      "Trail shoes / broken-in walking shoes",
      "Rain jacket / packable shell",
      "Warm layer for late October evenings",
      "Quick-dry shirts",
      "Socks (extra pairs)",
      "Casual clothes for Tokyo evenings",
    ],
    "♨️ Onsen / ryokan": [
      "Yukata etiquette awareness (provided on-site)",
      "Small towel",
      "Toiletries (travel size)",
    ],
    "🎒 Daypack essentials": [
      "Daypack (20–30L)",
      "Water bottle",
      "Snacks / energy bars",
      "Cash for luggage delivery (not in package)",
      "Phone power bank",
      "Universal adapter",
    ],
    "💊 Health": ["Blister plasters", "Painkillers", "Prescription meds", "Hand sanitiser"],
  }
  const out: Record<string, Array<{ id: string; name: string; checked: boolean }>> = {}
  let checkedLeft = 4
  Object.entries(cats).forEach(([cat, items]) => {
    out[cat] = items.map((name, i) => {
      const checked = checkedLeft > 0 && i < 2
      if (checked) checkedLeft--
      return { id: `demo-${cat}-${i}`, name, checked }
    })
  })
  return out
}

function noteDoc(id: string, name: string, cat: string, body: string) {
  const data = `data:text/plain;charset=utf-8,${encodeURIComponent(body)}`
  return {
    id,
    name,
    cat,
    linkedTo: "none",
    linkedId: "",
    data,
    type: "text/plain",
    uploadedAt: new Date().toISOString(),
  }
}

export function buildDocs(days: DemoDay[], totalBudget: number) {
  const nights = countLodgingNights(days)
  const breakfasts = countMeals(days, "B")
  const dinners = countMeals(days, "D")
  const buses = [
    hasOvernightBus(days) && "overnight highway bus",
    hasHighwayBus(days) && "Kamisuwa → Shinjuku highway bus",
  ]
    .filter(Boolean)
    .join("; ")

  return [
    noteDoc(
      "demo-doc-inclusions",
      "Package inclusions",
      "ticket",
      [
        `Japan Navi Journey · Nakasendo Walking Journey`,
        `Package total: JPY ${totalBudget.toLocaleString()} (for two)`,
        ``,
        `Included:`,
        `· ${nights} overnight stay(s) as listed in Plan (hotel / guesthouse / overnight bus)`,
        `· Meals: ${breakfasts} breakfast(s), ${dinners} dinner(s) marked included`,
        buses ? `· Bus tickets: ${buses}` : `· Bus tickets: (adjusted — check Plan)`,
        `· Personalized itinerary & self-guided walking info`,
        `· Pre-trip support from Japan Navi Journey`,
      ].join("\n"),
    ),
    noteDoc(
      "demo-doc-exclusions",
      "Not included",
      "other",
      [
        `· International flights`,
        `· Local trains / buses / taxis not specified in the package`,
        `· Luggage delivery (arrange locally; budget separately)`,
        `· Unlisted meals and drinks`,
        `· Private on-trail guides`,
        `· Travel insurance`,
        ``,
        `Estimated separate budget for two: JPY 50,000–80,000`,
        `(local transport, airport transfers, luggage delivery, extra meals)`,
      ].join("\n"),
    ),
    noteDoc(
      "demo-doc-payment",
      "Payment notes",
      "other",
      [
        `Bank transfer preferred.`,
        `Card payments: 2% surcharge.`,
        `Interview discount (full baseline package only): JPY 361,350.`,
      ].join("\n"),
    ),
    noteDoc(
      "demo-doc-contact",
      "Contact Japan Navi Journey",
      "other",
      [
        `Your journey, your pace — with full support.`,
        `Tap “Contact Japan Navi Journey” on Home, or email hello@japan-navi-journey.com`,
        GUIDE_CONTACT,
      ].join("\n"),
    ),
  ]
}

export function buildPeople() {
  return [
    { id: 1, name: "Guest 1" },
    { id: 2, name: "Guest 2" },
    { id: 3, name: "Japan Navi Guide" },
  ]
}

export function buildTripMeta(days: DemoDay[]) {
  const startDate = days[0]?.date || "2026-10-24"
  const endDate = days[days.length - 1]?.date || "2026-11-01"
  return {
    name: "Nakasendo Walking Journey",
    destination: "Nakasendo / Kiso Valley",
    startDate,
    endDate,
  }
}

export type SeedResult = {
  trip: ReturnType<typeof buildTripMeta>
  itinerary: DemoDay[]
  packing: ReturnType<typeof buildPacking>
  docs: ReturnType<typeof buildDocs>
  people: ReturnType<typeof buildPeople>
  totalBudget: number
  baseCurrency: "JPY"
  routeBanner: string
}

/** Write demo flats + trip registry. Call applyTripFlats() in App after. */
export function seedNakasendoDemo(opts?: {
  days?: DemoDay[]
  guestCount?: number
  reset?: boolean
}): SeedResult {
  const days = buildItinerary(opts?.days ?? BASELINE_DAYS)
  const guestCount = opts?.guestCount ?? 2
  const totalBudget = budgetFromItinerary(days, guestCount)
  const trip = buildTripMeta(days)
  const packing = buildPacking()
  const docs = buildDocs(days, totalBudget)
  const people = buildPeople()

  const trips = LS.get<Array<Record<string, unknown>>>("tc_trips", [])
  const meta = {
    id: DEMO_TRIP_ID,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: new Date().toISOString(),
  }
  const without = trips.filter((t) => t.id !== DEMO_TRIP_ID)
  LS.set("tc_trips", [...without, meta])
  LS.set("tc_active_trip", DEMO_TRIP_ID)

  LS.set("tc_trip", trip)
  LS.set("tc_itin", days)
  LS.set("tc_pack", packing)
  LS.set("tc_budget", totalBudget)
  LS.set("tc_daily_budget", 0)
  LS.set("tc_basecurr", "JPY")
  LS.set("tc_expenses", [])
  LS.set("tc_people", people)
  LS.set("tc_memories", [])
  LS.set("tc_docs", docs)
  LS.set("tc_share_blobid", "")
  LS.set("tc_sync_enabled", false)
  LS.set("tc_sync_version", 0)
  LS.set("tc_sync_last_at", "")
  LS.set("tc_chat_msgs", [])
  LS.set("tc_activation_dismissed", true)

  snapshotTrip(DEMO_TRIP_ID)
  LS.set(DEMO_LOADED_KEY, true)

  return {
    trip,
    itinerary: days,
    packing,
    docs,
    people,
    totalBudget,
    baseCurrency: "JPY",
    routeBanner: ROUTE_BANNER,
  }
}

export function isJapanNaviDemoQuery() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "nakasendo"
  } catch {
    return false
  }
}

export function shouldResetDemo() {
  try {
    return new URLSearchParams(window.location.search).get("reset") === "1"
  } catch {
    return false
  }
}
