import { DEFAULT_PACKING } from "./constants"
import { LS } from "./storage"
export const buildDefaultPacking = () => {
  const p = {}
  Object.entries(DEFAULT_PACKING).forEach(([cat, items]) => {
    p[cat] = items.map((name, i) => ({ id: `${cat}-${i}`, name, checked: false }))
  })
  return p
}

// ── All flat localStorage keys that belong to a trip ──────────────────────
export const TRIP_KEYS = [
  { flat: "tc_trip", def: () => ({ name: "", destination: "", startDate: "", endDate: "" }) },
  { flat: "tc_itin", def: () => [] },
  { flat: "tc_pack", def: () => buildDefaultPacking() },
  { flat: "tc_budget", def: () => 2000 },
  { flat: "tc_daily_budget", def: () => 0 },
  { flat: "tc_basecurr", def: () => "USD" },
  { flat: "tc_expenses", def: () => [] },
  { flat: "tc_people", def: () => [] },
  { flat: "tc_memories", def: () => [] },
  { flat: "tc_docs", def: () => [] },
  { flat: "tc_share_blobid", def: () => "" },
  { flat: "tc_sync_enabled", def: () => false },
  { flat: "tc_sync_version", def: () => 0 },
  { flat: "tc_sync_last_at", def: () => "" },
  { flat: "tc_chat_msgs", def: () => [] },
  { flat: "tc_activation_dismissed", def: () => false },
]

export const isTripEmpty = (trip, itinerary, expenses) =>
  !trip?.destination && !itinerary?.length && !expenses?.length

export const writeTripDefaults = () => {
  TRIP_KEYS.forEach(({ flat, def }) => LS.set(flat, def()))
}

export const snapshotTrip = (tripId) => {
  if (!tripId) return
  TRIP_KEYS.forEach(({ flat }) => {
    const val = LS.get(flat, null)
    if (val !== null) LS.set(`tc_${tripId}_${flat}`, val)
  })
}

export const restoreTrip = (tripId) => {
  TRIP_KEYS.forEach(({ flat, def }) => {
    const val = LS.get(`tc_${tripId}_${flat}`, null)
    LS.set(flat, val !== null ? val : def())
  })
}

/* ── TRIP DRAWER ──────────────────────────────────────────────────────────── */
