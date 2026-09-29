/**
 * Japan Navi Journey — Nakasendo Walking Journey demo seed.
 * Source: Japan Navi Journey itinerary sheet (10 days, 25 Oct–3 Nov 2026).
 * Adjust BASELINE_DAYS / guestCount; budgetFromItinerary keeps tc_budget in sync.
 */

import { LS } from "../storage"
import { snapshotTrip } from "../trip"

export const DEMO_TRIP_ID = "demo_nakasendo"
export const DEMO_LOADED_KEY = "tc_demo_nakasendo_loaded"
export const GUIDE_CONTACT =
  "mailto:hello@japan-navi-journey.com?subject=Nakasendo%20Walking%20Journey"
export const ROUTE_BANNER =
  "Singapore → Narita → Shinjuku → Nagoya → Nakatsugawa → Magome & Tsumago → Kiso Valley → Narai-juku → Matsumoto → Shinjuku → Haneda → Singapore"

/** Illustrative package total (JPY, two guests) — new sheet has no price; keep for Budget demo. */
const BASE_PACKAGE = 365_000
const BASELINE_NIGHTS = 8
const BASELINE_WALK_DAYS = 6
const BASELINE_BREAKFASTS = 0
const BASELINE_DINNERS = 0
const BASELINE_HIGHWAY_BUSES = 2
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

/** Editable itinerary baseline — change this array to adjust the demo package. */
export const BASELINE_DAYS: DemoDay[] = [
  {
    id: nid(),
    day: 1,
    label: "Day 1 · Singapore → Nagoya",
    date: "2026-10-25",
    activities: [
      {
        id: nid(),
        text: "Flight NH804 Singapore → Narita (00:55 – 08:40)",
        done: false,
        time: "00:55",
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Arrive Narita Airport 08:40 · train to Shinjuku",
        done: false,
        time: "08:40",
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Daytime highway bus Shinjuku → Nagoya",
        done: false,
        kind: "transfer",
        highwayBus: true,
        included: true,
      },
      {
        id: nid(),
        text: "Check in and rest · Nagoya (mainly a travel day)",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 2,
    label: "Day 2 · Nakatsugawa-juku",
    date: "2026-10-26",
    activities: [
      {
        id: nid(),
        text: "Train Nagoya → Nakatsugawa",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Explore Nakatsugawa-juku and surrounding area (~2–4 km, 1–2 hours)",
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
    date: "2026-10-27",
    activities: [
      {
        id: nid(),
        text: "Bus to Magome · begin Nakasendo walk",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Walk Magome → Tsumago (~8 km, about 3 hours)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Public transport further north in the Kiso Valley",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Stay Kiso Valley — Japanese-style lodging",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 4,
    label: "Day 4 · Scenic Kiso Valley",
    date: "2026-10-28",
    activities: [
      {
        id: nid(),
        text: "Train/bus to a suitable Nakasendo starting point",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Walk selected Nakasendo section (~5–7 km, 2–3 hours; shorten if needed)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Public transport back to overnight area · stay Kiso Valley",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 5,
    label: "Day 5 · Narai-juku",
    date: "2026-10-29",
    activities: [
      {
        id: nid(),
        text: "Continue north through the Kiso Valley (train + walk)",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Selected Nakasendo walking sections (~5–7 km, 2–3 hours)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Finish around Narai-juku · traditional guesthouse stay",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 6,
    label: "Day 6 · Torii Pass area → Matsumoto",
    date: "2026-10-30",
    activities: [
      {
        id: nid(),
        text: "Explore Narai-juku; optional Torii Pass area walk (~4–7 km, can be shortened)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Train to Matsumoto",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Stay Matsumoto",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 7,
    label: "Day 7 · Matsumoto Castle",
    date: "2026-10-31",
    activities: [
      {
        id: nid(),
        text: "Explore Matsumoto Castle and old town (~3–5 km; recovery / rest day)",
        done: false,
        kind: "walk",
      },
      {
        id: nid(),
        text: "Stay Matsumoto — no major Nakasendo hike planned",
        done: false,
        kind: "stay",
        lodging: true,
        included: true,
      },
    ],
  },
  {
    id: nid(),
    day: 8,
    label: "Day 8 · Back to Tokyo",
    date: "2026-11-01",
    activities: [
      {
        id: nid(),
        text: "Daytime highway bus Matsumoto → Shinjuku",
        done: false,
        kind: "transfer",
        highwayBus: true,
        included: true,
      },
      {
        id: nid(),
        text: "Easy travel day · stay Shinjuku city hotel",
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
    label: "Day 9 · Free Tokyo · Haneda",
    date: "2026-11-02",
    activities: [
      {
        id: nid(),
        text: "Free time in Tokyo (walk as you like)",
        done: false,
        kind: "note",
      },
      {
        id: nid(),
        text: "Evening transfer to Haneda Airport for late-night flight",
        done: false,
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Note: walking distances are estimates; sections can be shortened. Best walks combine with trains/buses (not continuous Nakatsugawa→Narai).",
        done: false,
        kind: "note",
      },
    ],
  },
  {
    id: nid(),
    day: 10,
    label: "Day 10 · Haneda → Singapore",
    date: "2026-11-03",
    activities: [
      {
        id: nid(),
        text: "Flight NH843 Haneda → Singapore (00:25 – 06:55)",
        done: false,
        time: "00:25",
        kind: "transfer",
      },
      {
        id: nid(),
        text: "Arrive Singapore 06:55 · have a safe flight",
        done: false,
        time: "06:55",
        kind: "note",
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

function countHighwayBuses(days: DemoDay[]) {
  return days.reduce((n, d) => n + d.activities.filter((a) => a.highwayBus).length, 0)
}

function isFullBaseline(days: DemoDay[], guestCount: number) {
  if (guestCount !== 2 || days.length !== BASELINE_DAYS.length) return false
  if (countLodgingNights(days) !== BASELINE_NIGHTS) return false
  if (countWalkDays(days) !== BASELINE_WALK_DAYS) return false
  if (countMeals(days, "B") !== BASELINE_BREAKFASTS) return false
  if (countMeals(days, "D") !== BASELINE_DINNERS) return false
  if (countHighwayBuses(days) !== BASELINE_HIGHWAY_BUSES) return false
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
  if (countHighwayBuses(days) === 0) total -= BUS_TICKET_SLICE
  total = total * (guestCount / 2)
  return Math.max(0, Math.round(total / 500) * 500)
}

export function buildPacking() {
  const cats: Record<string, string[]> = {
    "📄 Documents": [
      "Passport",
      "Travel insurance",
      "E-tickets / boarding passes (NH804 · NH843)",
      "Japan Navi Journey itinerary (offline)",
      "Ryokan / hotel confirmations",
      "Highway bus tickets (Shinjuku↔Nagoya / Matsumoto→Shinjuku)",
    ],
    "👕 Clothing": [
      "Trail shoes / broken-in walking shoes",
      "Rain jacket / packable shell",
      "Warm layer for late Oct / early Nov evenings",
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

function listHighwayBusLabels(days: DemoDay[]) {
  const labels: string[] = []
  for (const d of days) {
    for (const a of d.activities) {
      if (a.highwayBus) labels.push(a.text.replace(/^Daytime highway bus /, ""))
    }
  }
  return labels
}

export function buildDocs(days: DemoDay[], totalBudget: number) {
  const nights = countLodgingNights(days)
  const breakfasts = countMeals(days, "B")
  const dinners = countMeals(days, "D")
  const busLabels = listHighwayBusLabels(days)
  const buses = busLabels.length ? busLabels.join("; ") : ""

  return [
    noteDoc(
      "demo-doc-inclusions",
      "Package inclusions",
      "ticket",
      [
        `Japan Navi Journey · Nakasendo Walking Journey`,
        `Package total: JPY ${totalBudget.toLocaleString()} (for two · illustrative unless Japan Navi supplies a new quote)`,
        ``,
        `Included:`,
        `· ${nights} overnight stay(s) as listed in Plan (Nakatsugawa · Kiso Valley · Narai-juku · Matsumoto · Shinjuku / Nagoya)`,
        breakfasts || dinners
          ? `· Meals: ${breakfasts} breakfast(s), ${dinners} dinner(s) marked included`
          : `· Meals: not pre-marked on this itinerary sheet — confirm with Japan Navi Journey`,
        buses
          ? `· Daytime highway bus tickets: ${buses}`
          : `· Bus tickets: (adjusted — check Plan)`,
        `· Personalized itinerary & self-guided walking info`,
        `· Pre-trip support from Japan Navi Journey`,
        ``,
        `Walking notes: distances are estimates (typically max ~5–8 km walking days).`,
        `Walks combine with trains/buses — not continuous from Nakatsugawa to Narai.`,
      ].join("\n"),
    ),
    noteDoc(
      "demo-doc-exclusions",
      "Not included",
      "other",
      [
        `· International flights (NH804 Singapore→Narita · NH843 Haneda→Singapore) — shown on Plan as guest flights`,
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
        `Interview discount (full baseline package only): JPY 361,350 — confirm if still offered.`,
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
  const startDate = days[0]?.date || "2026-10-25"
  const endDate = days[days.length - 1]?.date || "2026-11-03"
  return {
    name: "Nakasendo Walking Journey",
    destination: "Nakasendo / Kiso Valley / Matsumoto",
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
