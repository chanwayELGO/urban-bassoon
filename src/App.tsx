import { Fragment, useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import { ShareModal } from "./components/shared/ShareModal"
import { TripDrawer } from "./components/shared/TripDrawer"
import { BudgetTab } from "./components/tabs/BudgetTab"
import { Dashboard } from "./components/tabs/Dashboard"
import { DocsTab } from "./components/tabs/DocsTab"
import { ExploreTab } from "./components/tabs/ExploreTab"
import { MemoriesTab } from "./components/tabs/MemoriesTab"
import { PackTab } from "./components/tabs/PackTab"
import { PlanTab } from "./components/tabs/PlanTab"
import { callAi } from "./lib/ai"
import { COUNTRY_CURRENCY, CURRENCIES, EXPENSE_CATS, WC_ICON, countryFlag } from "./lib/constants"
import { generateExportHTML } from "./lib/export"
import { LS } from "./lib/storage"
import { mergeById, mergeItinerary, mergePacking, mergePeople } from "./lib/sync"
import {
  buildDefaultPacking,
  isTripEmpty,
  restoreTrip,
  snapshotTrip,
  writeTripDefaults,
} from "./lib/trip"

const JSONBLOB = "https://jsonblob.com/api/jsonBlob"

const HASH_TABS = { home: 0, plan: 1, pack: 2, budget: 3, explore: 4, memories: 5, docs: 6 }

export default function App() {
  const [tab, setTab] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)

  // ── Sync state ────────────────────────────────────────────────────────────
  const [syncEnabled, setSyncEnabled] = useState(() => LS.get("tc_sync_enabled", false))
  const [syncStatus, setSyncStatus] = useState("idle")
  const [syncVersion, setSyncVersion] = useState(() => LS.get("tc_sync_version", 0))
  const [syncLastAt, setSyncLastAt] = useState(() => LS.get("tc_sync_last_at", ""))
  const [syncBanner, setSyncBanner] = useState(null)

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState(() => LS.get("tc_chat_msgs", []))
  const [chatAuthor, setChatAuthor] = useState(() => LS.get("tc_chat_author", ""))
  const [chatInput, setChatInput] = useState("")
  const [chatUnread, setChatUnread] = useState(0)
  const [chatSetupName, setChatSetupName] = useState("")
  const chatPollRef = useRef(null)
  const chatBottomRef = useRef(null)
  const chatLastCount = useRef(0)
  const syncInProgress = useRef(false)
  const syncPushTimer = useRef(null)
  const syncPullInterval = useRef(null)

  // ── Trip management ──────────────────────────────────────────────────────
  const [trips, setTrips] = useState(() => LS.get("tc_trips", []))
  const [activeTripId, setActiveTripId] = useState(() => LS.get("tc_active_trip", ""))
  const [quickExpense, setQuickExpense] = useState(null) // {act, day}
  const [quickMemoryCtx, setQuickMemoryCtx] = useState(null) // {act, day}
  const [copiedFlash, setCopiedFlash] = useState("")

  // ── Persistent state ──
  const [trip, setTrip] = useState(() =>
    LS.get("tc_trip", { name: "", destination: "", startDate: "", endDate: "" }),
  )
  const [itinerary, setItinerary] = useState(() => LS.get("tc_itin", []))
  const [packing, setPacking] = useState(() => LS.get("tc_pack", null) || buildDefaultPacking())
  const [totalBudget, setTotalBudget] = useState(() => LS.get("tc_budget", 2000))
  const [dailyBudget, setDailyBudget] = useState(() => LS.get("tc_daily_budget", 0))
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default",
  )
  const [nudge, setNudge] = useState(null)
  const [geoDetectEnabled, setGeoDetectEnabled] = useState(() => LS.get("tc_geo_enabled", true))
  const [geoPrompt, setGeoPrompt] = useState(null) // {country, currency, flag, cc}
  const [geoChecking, setGeoChecking] = useState(false)
  const nudgeTimer = useRef(null)
  const geoTimer = useRef(null)
  const [baseCurrency, setBaseCurrency] = useState(() => LS.get("tc_basecurr", "USD"))
  const [expenses, setExpenses] = useState(() => LS.get("tc_expenses", []))
  const [people, setPeople] = useState(() => LS.get("tc_people", []))
  const [memories, setMemories] = useState(() => LS.get("tc_memories", []))
  const [docs, setDocs] = useState(() => LS.get("tc_docs", []))

  // Explore
  const [weatherCity, setWeatherCity] = useState("")
  const [weatherData, setWeatherData] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [currFrom, setCurrFrom] = useState(baseCurrency)
  const [currTo, setCurrTo] = useState("SGD")
  const [currAmount, setCurrAmount] = useState("100")
  const [currResult, setCurrResult] = useState(null)
  const [aiQuery, setAiQuery] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [aiLoading, setAiLoading] = useState(false)

  // Quick expense form
  const [qeForm, setQeForm] = useState({
    desc: "",
    amount: "",
    currency: baseCurrency,
    cat: EXPENSE_CATS[0],
  })
  const [qeConverting, setQeConverting] = useState(false)
  const [qePreview, setQePreview] = useState(null)

  // ── Online/offline ──
  useEffect(() => {
    const on = () => setIsOnline(true),
      off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  // ── PWA install (defer until a destination exists) ──
  useEffect(() => {
    const h = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener("beforeinstallprompt", h)
    return () => window.removeEventListener("beforeinstallprompt", h)
  }, [])

  useEffect(() => {
    if (installPrompt && trip.destination && !installDismissed) setShowInstall(true)
    else if (!trip.destination) setShowInstall(false)
  }, [installPrompt, trip.destination, installDismissed])

  // ── Hash tab shortcuts (/#plan, /#pack, /#budget) ──
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase()
      if (h in HASH_TABS) setTab(HASH_TABS[h])
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
  }, [])

  // ── Deep-link on load (e.g. ?trip=blobId) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tripCode = params.get("trip")
    if (tripCode) {
      setShowShare(true)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setShowInstall(false)
    setInstallPrompt(null)
    setInstallDismissed(true)
  }

  // ── Persist helpers ──
  const saveTrip = (t) => {
    setTrip(t)
    LS.set("tc_trip", t)
    schedulePush()
  }
  const saveItinerary = (i) => {
    setItinerary(i)
    LS.set("tc_itin", i)
    schedulePush()
  }
  const savePacking = (p) => {
    setPacking(p)
    LS.set("tc_pack", p)
    schedulePush()
  }
  const saveBudget = (b) => {
    setTotalBudget(b)
    LS.set("tc_budget", b)
  }
  const saveDailyBudget = (b) => {
    setDailyBudget(b)
    LS.set("tc_daily_budget", b)
  }
  const saveBaseCurrency = (c) => {
    setBaseCurrency(c)
    LS.set("tc_basecurr", c)
  }
  const saveExpenses = (e) => {
    setExpenses(e)
    LS.set("tc_expenses", e)
    schedulePush()
  }
  const savePeople = (p) => {
    setPeople(p)
    LS.set("tc_people", p)
    schedulePush()
  }
  const saveMemories = (m) => {
    setMemories(m)
    LS.set("tc_memories", m)
    schedulePush()
  }
  const saveDocs = (d) => {
    setDocs(d)
    LS.set("tc_docs", d)
  }

  // ── Chat engine ───────────────────────────────────────────────────────────
  const saveChatAuthor = (name) => {
    setChatAuthor(name)
    LS.set("tc_chat_author", name)
  }
  const saveChatMsgs = (msgs) => {
    setChatMessages(msgs)
    LS.set("tc_chat_msgs", msgs)
  }

  const relTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric" })
  }

  const dateLabel = (ts) =>
    new Date(ts).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

  const sendChatMsg = async () => {
    const text = chatInput.trim()
    if (!text || text.length > 500) return
    const author = chatAuthor || "Me"
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      author,
      text,
      ts: new Date().toISOString(),
    }
    const updated = [...chatMessages, msg].slice(-200) // keep last 200
    saveChatMsgs(updated)
    setChatInput("")
    // Immediate push for chat responsiveness
    const blobId = LS.get("tc_share_blobid", "")
    if (blobId && syncEnabled) {
      try {
        const newV = syncVersion + 1
        await fetch(`${JSONBLOB}/${blobId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ...buildSyncPayload(newV), chat: updated }),
        })
        setSyncVersion(newV)
        LS.set("tc_sync_version", newV)
      } catch {}
    }
  }

  const pollChat = async () => {
    const blobId = LS.get("tc_share_blobid", "")
    if (!blobId || !syncEnabled) return
    try {
      const res = await fetch(`${JSONBLOB}/${blobId}`, { headers: { Accept: "application/json" } })
      if (!res.ok) return
      const data = await res.json()
      if (!data.chat?.length) return
      const remote = data.chat
      const ids = new Set(chatMessages.map((m) => m.id))
      const newMsgs = remote.filter((m) => !ids.has(m.id))
      if (!newMsgs.length) return
      const merged = [...chatMessages, ...newMsgs]
        .slice(-200)
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
      saveChatMsgs(merged)
      if (!chatOpen) setChatUnread((u) => u + newMsgs.length)
    } catch {}
  }

  // Start/stop chat polling based on open state
  useEffect(() => {
    clearInterval(chatPollRef.current)
    const interval = chatOpen ? 8000 : 60000
    chatPollRef.current = setInterval(pollChat, interval)
    return () => clearInterval(chatPollRef.current)
  }, [chatOpen, syncEnabled])

  // Scroll to bottom when messages change and panel is open
  useEffect(() => {
    if (chatOpen && chatBottomRef.current)
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages, chatOpen])

  // Clear unread when opening
  useEffect(() => {
    if (chatOpen) setChatUnread(0)
  }, [chatOpen])

  // ── Sync engine ───────────────────────────────────────────────────────────
  const saveSyncEnabled = (v) => {
    setSyncEnabled(v)
    LS.set("tc_sync_enabled", v)
  }

  const buildSyncPayload = (v) => ({
    v,
    syncType: "realtime",
    pushedAt: new Date().toISOString(),
    pushedBy: trip.name || "Traveller",
    trip,
    itinerary,
    packing,
    expenses: expenses.map((e) => ({ ...e, attachments: [] })),
    people,
    baseCurrency,
    totalBudget,
    memories: memories.map((m) => ({ ...m, photo: null })),
    chat: chatMessages,
  })

  const showSyncBanner = (by, counts) => {
    const parts = []
    if (counts.exp) parts.push(`${counts.exp} expense${counts.exp > 1 ? "s" : ""}`)
    if (counts.itin) parts.push(`${counts.itin} activit${counts.itin > 1 ? "ies" : "y"}`)
    if (counts.mem) parts.push(`${counts.mem} memor${counts.mem > 1 ? "ies" : "y"}`)
    if (counts.pack) parts.push(`${counts.pack} packing item${counts.pack > 1 ? "s" : ""}`)
    if (!parts.length) return
    setSyncBanner({ title: `✓ Synced from ${by || "team"}`, sub: parts.join(", ") + " added" })
    setTimeout(() => setSyncBanner(null), 5000)
  }

  const mergeFromRemote = (data) => {
    syncInProgress.current = true
    const counts = { exp: 0, itin: 0, mem: 0, pack: 0 }
    const newItin = mergeItinerary(itinerary, data.itinerary || [])
    const itinAdded =
      newItin.flatMap((d: { activities?: any[] }) => d.activities || []).length -
      itinerary.flatMap((d: { activities?: any[] }) => d.activities || []).length
    if (itinAdded > 0) {
      saveItinerary(newItin)
      counts.itin = itinAdded
    }
    const newExp = mergeById(expenses, data.expenses || [])
    if (newExp.length > expenses.length) {
      saveExpenses(newExp)
      counts.exp = newExp.length - expenses.length
    }
    const newMem = mergeById(memories, data.memories || [])
    if (newMem.length > memories.length) {
      saveMemories(newMem)
      counts.mem = newMem.length - memories.length
    }
    const newPack = mergePacking(packing, data.packing || {})
    const packAdded = Object.values(newPack).flat().length - Object.values(packing).flat().length
    if (packAdded > 0) {
      savePacking(newPack)
      counts.pack = packAdded
    }
    const newPeople = mergePeople(people, data.people || [])
    if (newPeople.length > people.length) savePeople(newPeople)
    // Merge chat messages
    if (data.chat?.length) {
      const ids = new Set(chatMessages.map((m) => m.id))
      const newMsgs = data.chat.filter((m) => !ids.has(m.id))
      if (newMsgs.length) {
        const merged = [...chatMessages, ...newMsgs]
          .slice(-200)
          .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
        saveChatMsgs(merged)
        if (!chatOpen) setChatUnread((u) => u + newMsgs.length)
      }
    }
    setSyncVersion(data.v)
    LS.set("tc_sync_version", data.v)
    setSyncLastAt(data.pushedAt || "")
    LS.set("tc_sync_last_at", data.pushedAt || "")
    showSyncBanner(data.pushedBy, counts)
    setTimeout(() => {
      syncInProgress.current = false
    }, 300)
  }

  const pushSync = async () => {
    const blobId = LS.get("tc_share_blobid", "")
    if (!blobId || !syncEnabled) return
    setSyncStatus("pushing")
    try {
      const newV = syncVersion + 1
      const res = await fetch(`${JSONBLOB}/${blobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildSyncPayload(newV)),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const now = new Date().toISOString()
      setSyncVersion(newV)
      LS.set("tc_sync_version", newV)
      setSyncLastAt(now)
      LS.set("tc_sync_last_at", now)
      setSyncStatus("synced")
      setTimeout(() => setSyncStatus("idle"), 3000)
    } catch {
      setSyncStatus("error")
      setTimeout(() => setSyncStatus("idle"), 5000)
    }
  }

  const pullSync = async () => {
    const blobId = LS.get("tc_share_blobid", "")
    if (!blobId || !syncEnabled) return
    setSyncStatus("pulling")
    try {
      const res = await fetch(`${JSONBLOB}/${blobId}`, { headers: { Accept: "application/json" } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!data.v || data.v <= syncVersion) {
        setSyncStatus("synced")
        setTimeout(() => setSyncStatus("idle"), 2000)
        return
      }
      mergeFromRemote(data)
      setSyncStatus("synced")
      setTimeout(() => setSyncStatus("idle"), 3000)
    } catch {
      setSyncStatus("error")
      setTimeout(() => setSyncStatus("idle"), 5000)
    }
  }

  const schedulePush = () => {
    if (!syncEnabled || !LS.get("tc_share_blobid", "")) return
    if (syncInProgress.current) return
    clearTimeout(syncPushTimer.current)
    syncPushTimer.current = setTimeout(pushSync, 3000)
  }

  const enableSync = (blobId) => {
    LS.set("tc_share_blobid", blobId)
    saveSyncEnabled(true)
  }

  const syncLabel = () => {
    const blobId = LS.get("tc_share_blobid", "")
    if (!blobId || !syncEnabled) return { dot: "disabled", text: "Sync off" }
    if (syncStatus === "pushing") return { dot: "pushing", text: "Pushing…" }
    if (syncStatus === "pulling") return { dot: "pulling", text: "Pulling…" }
    if (syncStatus === "synced") return { dot: "synced", text: "Synced" }
    if (syncStatus === "error") return { dot: "error", text: "Error" }
    if (syncLastAt)
      return {
        dot: "synced",
        text: new Date(syncLastAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
      }
    return { dot: "idle", text: "Ready" }
  }

  // Start/stop 30s polling when syncEnabled changes
  useEffect(() => {
    clearInterval(syncPullInterval.current)
    if (!syncEnabled) return
    const blobId = LS.get("tc_share_blobid", "")
    if (!blobId) return
    pullSync() // immediate pull on enable
    syncPullInterval.current = setInterval(pullSync, 30000)
    return () => clearInterval(syncPullInterval.current)
  }, [syncEnabled, activeTripId])

  // ── Trip management functions ─────────────────────────────────────────────

  // Keep trips metadata in sync when active trip's name/destination/dates change
  useEffect(() => {
    if (!activeTripId) return
    setTrips((prev) => {
      const updated = prev.map((t) =>
        t.id === activeTripId
          ? {
              ...t,
              name: trip.name || t.name,
              destination: trip.destination || t.destination,
              startDate: trip.startDate || t.startDate,
              endDate: trip.endDate || t.endDate,
            }
          : t,
      )
      LS.set("tc_trips", updated)
      return updated
    })
  }, [trip.name, trip.destination, trip.startDate, trip.endDate])

  // Migration: on first load, wrap existing data as the default trip
  useEffect(() => {
    let stored = LS.get("tc_trips", [])
    let activeId = LS.get("tc_active_trip", "")
    if (!stored.length) {
      const existingTrip = LS.get("tc_trip", {
        name: "",
        destination: "",
        startDate: "",
        endDate: "",
      })
      const defaultId = "trip_default"
      const defaultMeta = {
        id: defaultId,
        name: existingTrip.name || "My Trip",
        destination: existingTrip.destination || "",
        startDate: existingTrip.startDate || "",
        endDate: existingTrip.endDate || "",
        createdAt: new Date().toISOString(),
      }
      stored = [defaultMeta]
      activeId = defaultId
      LS.set("tc_trips", stored)
      LS.set("tc_active_trip", activeId)
      snapshotTrip(defaultId) // snapshot current flat keys under this ID
    }
    setTrips(stored)
    setActiveTripId(activeId)
  }, [])

  const applyTripFlats = () => {
    setTrip(LS.get("tc_trip", { name: "", destination: "", startDate: "", endDate: "" }))
    setItinerary(LS.get("tc_itin", []))
    setPacking(LS.get("tc_pack", null) || buildDefaultPacking())
    setTotalBudget(LS.get("tc_budget", 2000))
    setDailyBudget(LS.get("tc_daily_budget", 0))
    setBaseCurrency(LS.get("tc_basecurr", "USD"))
    setExpenses(LS.get("tc_expenses", []))
    setPeople(LS.get("tc_people", []))
    setMemories(LS.get("tc_memories", []))
    setDocs(LS.get("tc_docs", []))
    setSyncEnabled(LS.get("tc_sync_enabled", false))
    setSyncVersion(LS.get("tc_sync_version", 0))
    setSyncLastAt(LS.get("tc_sync_last_at", ""))
    setChatMessages(LS.get("tc_chat_msgs", []))
    setSyncStatus("idle")
  }

  const applyJoinPayload = (payload, joinName, joinIncludes) => {
    if (payload.trip) saveTrip(payload.trip)
    if (payload.baseCurrency) saveBaseCurrency(payload.baseCurrency)
    if (payload.totalBudget) saveBudget(payload.totalBudget)
    const incoming = payload.people || []
    const names = new Set(incoming.map((p) => p.name))
    const myEntry = joinName && !names.has(joinName) ? [{ id: Date.now() + 1, name: joinName }] : []
    savePeople([...incoming, ...myEntry])
    if (joinIncludes.itinerary && payload.itinerary) saveItinerary(payload.itinerary)
    if (joinIncludes.packing && payload.packing) savePacking(payload.packing)
    if (joinIncludes.budget && payload.expenses) saveExpenses(payload.expenses)
  }

  const importJoinedTrip = ({ payload, joinName, joinIncludes, blobId }) => {
    if (!isTripEmpty(trip, itinerary, expenses)) {
      snapshotTrip(activeTripId)
      const t = payload.trip || {}
      const newId = `trip_${Date.now()}`
      const newMeta = {
        id: newId,
        name: t.name || "Joined Trip",
        destination: t.destination || "",
        startDate: t.startDate || "",
        endDate: t.endDate || "",
        createdAt: new Date().toISOString(),
      }
      const updated = [...trips, newMeta]
      setTrips(updated)
      LS.set("tc_trips", updated)
      writeTripDefaults()
      applyTripFlats()
      setActiveTripId(newId)
      LS.set("tc_active_trip", newId)
    }
    applyJoinPayload(payload, joinName, joinIncludes)
    if (blobId) enableSync(blobId)
  }

  const switchTrip = (newId) => {
    if (newId === activeTripId) {
      setShowDrawer(false)
      return
    }
    // Snapshot current state to scoped keys
    snapshotTrip(activeTripId)
    restoreTrip(newId)
    applyTripFlats()
    setActiveTripId(newId)
    LS.set("tc_active_trip", newId)
    setShowDrawer(false)
    setTab(0) // return to dashboard on switch
  }

  const createTrip = () => {
    snapshotTrip(activeTripId)
    const newId = `trip_${Date.now()}`
    const newMeta = {
      id: newId,
      name: "New Trip",
      destination: "",
      startDate: "",
      endDate: "",
      createdAt: new Date().toISOString(),
    }
    const updated = [...trips, newMeta]
    writeTripDefaults()
    LS.set("tc_trip", { name: "New Trip", destination: "", startDate: "", endDate: "" })
    applyTripFlats()
    setTrips(updated)
    LS.set("tc_trips", updated)
    setActiveTripId(newId)
    LS.set("tc_active_trip", newId)
    setShowDrawer(false)
    setTab(1)
  }

  const deleteTrip = (id) => {
    const remaining = trips.filter((t) => t.id !== id)
    if (!remaining.length) {
      createTrip()
      return
    } // keep at least one trip
    const updated = remaining
    setTrips(updated)
    LS.set("tc_trips", updated)
    if (id === activeTripId) {
      const next = updated[0].id
      restoreTrip(next)
      applyTripFlats()
      setActiveTripId(next)
      LS.set("tc_active_trip", next)
    }
  }

  // ── Trip export ───────────────────────────────────────────────────────────
  const printTrip = (previewOnly = false) => {
    const html = generateExportHTML({
      trip,
      itinerary,
      expenses,
      memories,
      packing,
      baseCurrency,
      people,
    })
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    if (!previewOnly) setTimeout(() => win.print(), 600)
  }

  // ── Notification helpers ──────────────────────────────────────────────────
  // ── Geo currency detection ────────────────────────────────────────────────
  const saveGeoDetectEnabled = (v) => {
    setGeoDetectEnabled(v)
    LS.set("tc_geo_enabled", v)
  }

  const detectLocationCurrency = (manual = false) => {
    if (!navigator.geolocation) return
    const today = new Date().toISOString().split("T")[0]
    // Rate-limit: once per day unless manual
    if (!manual && LS.get("tc_geo_checked", "") === today) return
    setGeoChecking(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&format=json`,
          )
          const data = await res.json()
          const cc = data.address?.country_code?.toUpperCase()
          if (!cc) {
            setGeoChecking(false)
            return
          }
          const detectedCurrency = COUNTRY_CURRENCY[cc]
          LS.set("tc_geo_checked", today)
          LS.set("tc_geo_last_cc", cc)
          setGeoChecking(false)
          if (!detectedCurrency || detectedCurrency === baseCurrency) return
          const flag = countryFlag(cc)
          const country = data.address?.country || cc
          setGeoPrompt({ country, currency: detectedCurrency, flag, cc })
          clearTimeout(geoTimer.current)
          geoTimer.current = setTimeout(() => setGeoPrompt(null), 14000)
        } catch {
          setGeoChecking(false)
        }
      },
      () => setGeoChecking(false),
      { timeout: 9000, maximumAge: 300000 },
    )
  }

  const acceptGeoCurrency = () => {
    if (!geoPrompt) return
    saveBaseCurrency(geoPrompt.currency)
    clearTimeout(geoTimer.current)
    setGeoPrompt(null)
    flash(`✓ Switched to ${geoPrompt.currency}`)
  }

  // Auto-detect on first mount (2 s delay so app renders first)
  useEffect(() => {
    if (geoDetectEnabled) setTimeout(() => detectLocationCurrency(false), 2000)
  }, [])

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return
    const result = await Notification.requestPermission()
    setNotifPerm(result)
    return result
  }

  const sendPushNotification = (title, body, tag) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.showNotification(title, {
          body,
          tag,
          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='40' fill='%2307101F'/%3E%3Ctext y='130' x='96' text-anchor='middle' font-size='110'%3E%E2%9C%88%EF%B8%8F%3C/text%3E%3C/svg%3E",
          data: { url: "./index.html" },
        })
      })
      .catch(() => {})
  }

  const showNudge = (type, title, sub) => {
    setNudge({ type, title, sub })
    clearTimeout(nudgeTimer.current)
    nudgeTimer.current = setTimeout(() => setNudge(null), 6000)
  }

  const checkDailyLimit = (newExpenses) => {
    if (!dailyBudget || dailyBudget <= 0) return
    const todayISO = new Date().toISOString().split("T")[0]
    const todayExps = newExpenses.filter((e) => {
      if (e.dateISO) return e.dateISO === todayISO
      try {
        return new Date(e.date).toISOString().split("T")[0] === todayISO
      } catch {
        return false
      }
    })
    const todaySpent = todayExps.reduce((s, e) => s + (e.amtBase ?? Number(e.amount ?? 0)), 0)
    const pct = (todaySpent / dailyBudget) * 100
    const topCats = Object.entries(
      todayExps.reduce(
        (acc, e) => {
          const c = e.cat?.split(" ")[0] || ""
          acc[c] = (acc[c] || 0) + (e.amtBase ?? Number(e.amount ?? 0))
          return acc
        },
        {} as Record<string, number>,
      ),
    )
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([c]) => c)
      .join(" ")
    const spentStr = `${baseCurrency} ${todaySpent.toFixed(2)}`
    const limitStr = `${baseCurrency} ${Number(dailyBudget).toFixed(2)}`
    const key80 = `tc_notif_${todayISO}_80`
    const key100 = `tc_notif_${todayISO}_100`
    if (pct >= 100 && !LS.get(key100, "")) {
      LS.set(key100, "1")
      const t = "🚨 Daily limit reached",
        s = `${spentStr} spent today — hit your ${limitStr} limit${topCats ? " · " + topCats : ""}`
      sendPushNotification(t, s, "daily-100")
      showNudge("over", t, s)
    } else if (pct >= 80 && !LS.get(key80, "")) {
      LS.set(key80, "1")
      const t = "⚠️ 80% of daily budget used",
        s = `${spentStr} of ${limitStr} today${topCats ? " · " + topCats : ""}`
      sendPushNotification(t, s, "daily-80")
      showNudge("warn", t, s)
    }
  }

  useEffect(() => {
    if (dailyBudget > 0 && expenses.length > 0) checkDailyLimit(expenses)
  }, [expenses, dailyBudget])

  // ── Itinerary ──
  const addDay = () => {
    const n = itinerary.length + 1
    saveItinerary([...itinerary, { id: Date.now(), day: n, label: `Day ${n}`, activities: [] }])
  }
  const removeDay = (id) =>
    saveItinerary(
      itinerary
        .filter((d) => d.id !== id)
        .map((d, i) => ({ ...d, day: i + 1, label: `Day ${i + 1}` })),
    )
  const addActivity = (dayId, text) =>
    saveItinerary(
      itinerary.map((d) =>
        d.id === dayId
          ? { ...d, activities: [...d.activities, { id: Date.now(), text, done: false }] }
          : d,
      ),
    )
  const toggleActivity = (dayId, actId) =>
    saveItinerary(
      itinerary.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) => (a.id === actId ? { ...a, done: !a.done } : a)),
            }
          : d,
      ),
    )
  const removeActivity = (dayId, actId) =>
    saveItinerary(
      itinerary.map((d) =>
        d.id === dayId ? { ...d, activities: d.activities.filter((a) => a.id !== actId) } : d,
      ),
    )

  // ── Packing ──
  const togglePacking = (cat, id) =>
    savePacking({
      ...packing,
      [cat]: packing[cat].map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
    })
  const addPackingItem = (cat, name) =>
    savePacking({
      ...packing,
      [cat]: [...packing[cat], { id: `${cat}-${Date.now()}`, name, checked: false }],
    })

  // ── Memories ──
  const addMemory = (mem) => saveMemories([...memories, mem])
  const updateMemory = (mem) => saveMemories(memories.map((m) => (m.id === mem.id ? mem : m)))
  const deleteMemory = (id) => saveMemories(memories.filter((m) => m.id !== id))

  // ── Weather ──
  const fetchWeather = async (cityOverride) => {
    const city = (cityOverride || weatherCity || trip.destination || "").trim()
    if (!city) return
    setWeatherLoading(true)
    setWeatherData(null)
    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      ).then((r) => r.json())
      if (!geo.results?.length) {
        setWeatherData({ error: "City not found" })
        setWeatherLoading(false)
        return
      }
      const { latitude, longitude, name, country } = geo.results[0]
      const wd = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`,
      ).then((r) => r.json())
      const code = wd.current.weather_code
      setWeatherData({
        city: name,
        country,
        temp: Math.round(wd.current.temperature_2m),
        humidity: wd.current.relative_humidity_2m,
        wind: Math.round(wd.current.wind_speed_10m),
        code,
        icon: WC_ICON(code),
        unit: wd.current_units.temperature_2m,
      })
    } catch {
      setWeatherData({ error: "Failed to fetch" })
    }
    setWeatherLoading(false)
  }

  // ── Currency ──
  const convertCurrency = async () => {
    setCurrResult(null)
    try {
      const d = await fetch(
        `https://api.frankfurter.app/latest?from=${currFrom}&to=${currTo}&amount=${currAmount}`,
      ).then((r) => r.json())
      setCurrResult(d.rates[currTo])
    } catch {
      setCurrResult("Error")
    }
  }

  // ── AI ──
  const getAiTip = async () => {
    if (!aiQuery.trim()) return
    setAiLoading(true)
    setAiResponse("")
    try {
      const d = {
        content: [
          {
            text: await callAi({
              task: "tip",
              system:
                "You are a helpful travel expert. Give practical, concise, actionable travel tips. Use bullet points with • symbols. Keep responses under 200 words.",
              messages: [{ role: "user", content: aiQuery }],
              maxTokens: 1000,
            }),
          },
        ],
      }
      setAiResponse(d.content?.[0]?.text || "No response.")
    } catch {
      setAiResponse("⚠️ Failed. Check your connection.")
    }
    setAiLoading(false)
  }

  // ── Quick Expense (from activity) ──
  useEffect(() => {
    if (!quickExpense) return
    setQeForm({
      desc: quickExpense.act.text,
      amount: "",
      currency: baseCurrency,
      cat: EXPENSE_CATS[4],
    })
    setQePreview(null)
  }, [quickExpense])

  useEffect(() => {
    setQePreview(null)
    if (!qeForm.amount || qeForm.currency === baseCurrency) return
    let cancelled = false
    setQeConverting(true)
    fetch(`https://api.frankfurter.app/latest?from=${qeForm.currency}&to=${baseCurrency}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setQeConverting(false)
        const rate = d.rates[baseCurrency]
        if (rate) setQePreview({ rate, amtBase: Number(qeForm.amount) * rate })
      })
      .catch(() => setQeConverting(false))
    return () => {
      cancelled = true
    }
  }, [qeForm.amount, qeForm.currency])

  const submitQuickExpense = async () => {
    if (!qeForm.amount || !qeForm.desc) return
    const originalAmount = Number(qeForm.amount)
    let amtBase = originalAmount,
      usedRate = 1
    if (qeForm.currency !== baseCurrency) {
      const rate = qePreview?.rate
      if (rate) {
        amtBase = originalAmount * rate
        usedRate = rate
      }
    }
    saveExpenses([
      ...expenses,
      {
        id: Date.now(),
        desc: qeForm.desc,
        cat: qeForm.cat,
        originalAmount,
        currency: qeForm.currency,
        amtBase,
        usedRate,
        paidBy: "Me",
        splits: null,
        activityId: quickExpense.act.id,
        activityText: quickExpense.act.text,
        dayId: quickExpense.day.id,
        dayLabel: quickExpense.day.label,
        date: new Date().toLocaleDateString(),
        dateISO: new Date().toISOString().split("T")[0],
      },
    ])
    setQuickExpense(null)
    flash("💰 Expense logged!")
  }

  // ── Quick Memory (from activity) ──
  const onQuickMemory = (act, day) => {
    setQuickMemoryCtx({ act, day })
    setTab(5) // navigate to Memories tab — map handles pre-filling
  }

  const flash = (msg) => {
    setCopiedFlash(msg)
    setTimeout(() => setCopiedFlash(""), 2200)
  }

  // ── Navigate ──
  const navigateTo = (dest) => {
    if (dest === "share") {
      setShowShare(true)
      return
    }
    setTab(dest)
  }

  // ── Derived ──
  const packingItems = Object.values(packing).flat() as Array<{ checked?: boolean }>
  const packingTotal = packingItems.length
  const packingDone = packingItems.filter((i) => i.checked).length
  const subtitle =
    [trip.destination, trip.startDate && trip.endDate && `${trip.startDate} → ${trip.endDate}`]
      .filter(Boolean)
      .join("  ·  ") || "Where are you headed?"

  const TABS = [
    { label: "Home", icon: "🏠" },
    { label: "Plan", icon: "📋" },
    { label: "Pack", icon: "🧳" },
    { label: "Budget", icon: "💰" },
    { label: "Explore", icon: "🌍" },
    { label: "Memories", icon: "📸" },
    { label: "Docs", icon: "🗄️" },
  ]

  // ── Deep-link trip code ──
  const initialShareCode = (() => {
    try {
      return new URLSearchParams(window.location.search).get("trip") || ""
    } catch {
      return ""
    }
  })()

  return (
    <div className="app">
      {!isOnline && <div className="offline-toast">📡 Offline — saved data still available</div>}

      {showInstall && (
        <div className="install-banner">
          <span>✈️</span>
          <div className="ib-text">Install for offline packing and departure briefs</div>
          <button className="ib-btn" onClick={handleInstall}>
            Install
          </button>
          <button
            className="ib-close"
            onClick={() => {
              setShowInstall(false)
              setInstallDismissed(true)
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Nudge banner ── */}
      {nudge && (
        <div className={`nudge-banner ${nudge.type}`} onClick={() => setNudge(null)}>
          <div className="nudge-icon">{nudge.type === "over" ? "🚨" : "⚠️"}</div>
          <div className="nudge-body">
            <div className="nudge-title">{nudge.title}</div>
            <div className="nudge-sub">{nudge.sub}</div>
          </div>
          <button
            className="nudge-close"
            onClick={(e) => {
              e.stopPropagation()
              setNudge(null)
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Geo currency banner ── */}
      {geoPrompt && (
        <div className="geo-banner">
          <div className="geo-flag">{geoPrompt.flag}</div>
          <div className="geo-body">
            <div className="geo-title">You're in {geoPrompt.country}</div>
            <div className="geo-sub">Local currency is {geoPrompt.currency} — switch?</div>
          </div>
          <button className="geo-accept" onClick={acceptGeoCurrency}>
            Use {geoPrompt.currency}
          </button>
          <button className="geo-dismiss" onClick={() => setGeoPrompt(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="header">
        <div className="header-top">
          <button
            className="trip-switcher-btn"
            onClick={() => setShowDrawer(true)}
            title="Switch trip"
          >
            ⊞
          </button>
          <input
            className="trip-name-input flex-1"
            value={trip.name}
            onChange={(e) => saveTrip({ ...trip, name: e.target.value })}
            placeholder="✈️ Name Your Trip"
          />
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
            <div className="progress-pill">
              🧳 {packingDone}/{packingTotal}
            </div>
            {(syncEnabled || LS.get("tc_share_blobid", "")) &&
              (() => {
                const sl = syncLabel()
                return (
                  <div className="sync-indicator" onClick={pullSync} title="Tap to pull latest">
                    <div className={`sync-dot ${sl.dot}`} />
                    <span
                      style={{
                        color:
                          sl.dot === "synced"
                            ? "#4DB87A"
                            : sl.dot === "error"
                              ? "#FF5C5C"
                              : "var(--text-dim)",
                      }}
                    >
                      {sl.text}
                    </span>
                  </div>
                )
              })()}
            <button
              className="header-share-btn"
              onClick={() => setShowShare(true)}
              title="Share & Invite"
            >
              📤
            </button>
          </div>
        </div>
        <div className="header-sub">{subtitle}</div>
      </div>

      {/* Content */}
      <div className="content">
        <div className="content-inner">
          {tab === 0 && (
            <Dashboard
              key={activeTripId}
              trip={trip}
              itinerary={itinerary}
              packing={packing}
              expenses={expenses}
              baseCurrency={baseCurrency}
              memories={memories}
              weatherData={weatherData}
              fetchWeather={fetchWeather}
              navigateTo={navigateTo}
              toggleActivity={toggleActivity}
              removeActivity={removeActivity}
              onQuickExpense={(a, d) => setQuickExpense({ act: a, day: d })}
              onQuickMemory={onQuickMemory}
              saveTrip={saveTrip}
              hasInvite={syncEnabled || Boolean(LS.get("tc_share_blobid", ""))}
            />
          )}
          {tab === 1 && (
            <PlanTab
              trip={trip}
              saveTrip={saveTrip}
              itinerary={itinerary}
              addDay={addDay}
              addActivity={addActivity}
              toggleActivity={toggleActivity}
              removeDay={removeDay}
              removeActivity={removeActivity}
              expenses={expenses}
              baseCurrency={baseCurrency}
              memories={memories}
              navigateTo={navigateTo}
              onQuickExpense={(a, d) => setQuickExpense({ act: a, day: d })}
              onQuickMemory={onQuickMemory}
            />
          )}
          {tab === 2 && (
            <PackTab
              packing={packing}
              togglePacking={togglePacking}
              addPackingItem={addPackingItem}
              packingTotal={packingTotal}
              packingDone={packingDone}
              trip={trip}
              itinerary={itinerary}
            />
          )}
          {tab === 3 && (
            <BudgetTab
              totalBudget={totalBudget}
              saveBudget={saveBudget}
              baseCurrency={baseCurrency}
              saveBaseCurrency={saveBaseCurrency}
              expenses={expenses}
              saveExpenses={saveExpenses}
              people={people}
              savePeople={savePeople}
              docs={docs}
              saveDocs={saveDocs}
              dailyBudget={dailyBudget}
              saveDailyBudget={saveDailyBudget}
              notifPerm={notifPerm}
              requestNotifPermission={requestNotifPermission}
              geoDetectEnabled={geoDetectEnabled}
              saveGeoDetectEnabled={saveGeoDetectEnabled}
              geoChecking={geoChecking}
              onDetectNow={() => detectLocationCurrency(true)}
            />
          )}
          {tab === 4 && (
            <ExploreTab
              trip={trip}
              itinerary={itinerary}
              weatherCity={weatherCity}
              setWeatherCity={setWeatherCity}
              weatherData={weatherData}
              weatherLoading={weatherLoading}
              fetchWeather={fetchWeather}
              currFrom={currFrom}
              setCurrFrom={setCurrFrom}
              currTo={currTo}
              setCurrTo={setCurrTo}
              currAmount={currAmount}
              setCurrAmount={setCurrAmount}
              currResult={currResult}
              convertCurrency={convertCurrency}
              aiQuery={aiQuery}
              setAiQuery={setAiQuery}
              aiResponse={aiResponse}
              aiLoading={aiLoading}
              getAiTip={getAiTip}
            />
          )}
          {tab === 5 && (
            <MemoriesTab
              memories={memories}
              addMemory={addMemory}
              updateMemory={updateMemory}
              deleteMemory={deleteMemory}
              trip={trip}
              quickMemoryCtx={quickMemoryCtx}
              clearQuickMemory={() => setQuickMemoryCtx(null)}
            />
          )}
          {tab === 6 && (
            <DocsTab
              docs={docs}
              saveDocs={saveDocs}
              expenses={expenses}
              itinerary={itinerary}
              navigateTo={navigateTo}
              trip={trip}
              memories={memories}
              packing={packing}
              baseCurrency={baseCurrency}
              people={people}
              onExport={printTrip}
            />
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map((t, i) => (
          <button
            key={i}
            className={`tab-btn${tab === i ? " active" : ""}`}
            onClick={() => setTab(i)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Quick Expense Overlay ── */}
      {quickExpense && (
        <div
          className="pin-form-overlay"
          onClick={(e) => e.target === e.currentTarget && setQuickExpense(null)}
        >
          <div className="pin-form">
            <div className="pin-form-title">💰 Log Expense</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              📅 {quickExpense.day.label} · {quickExpense.act.text}
            </div>
            <div className="flex flex-col gap-8">
              <select
                className="input"
                value={qeForm.cat}
                onChange={(e) => setQeForm((f) => ({ ...f, cat: e.target.value }))}
              >
                {EXPENSE_CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Description"
                value={qeForm.desc}
                onChange={(e) => setQeForm((f) => ({ ...f, desc: e.target.value }))}
              />
              <div className="flex gap-8">
                <input
                  className="input flex-1"
                  type="number"
                  placeholder="Amount"
                  value={qeForm.amount}
                  onChange={(e) => setQeForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <select
                  className="input"
                  style={{ width: 86 }}
                  value={qeForm.currency}
                  onChange={(e) => setQeForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {qeForm.currency !== baseCurrency && qeForm.amount && (
                <div className="rate-note">
                  {qeConverting
                    ? "Fetching rate…"
                    : qePreview
                      ? `≈ ${baseCurrency} ${qePreview.amtBase.toFixed(2)}`
                      : "Could not fetch rate"}
                </div>
              )}
            </div>
            <div className="flex gap-8 mt-12">
              <button className="btn-ghost flex-1" onClick={() => setQuickExpense(null)}>
                Cancel
              </button>
              <button
                className="btn flex-1"
                onClick={submitQuickExpense}
                disabled={!qeForm.amount || !qeForm.desc || qeConverting}
              >
                Save 💰
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trip Drawer ── */}
      {showDrawer && (
        <TripDrawer
          trips={trips}
          activeTripId={activeTripId}
          onSwitch={switchTrip}
          onCreate={createTrip}
          onDelete={deleteTrip}
          onClose={() => setShowDrawer(false)}
        />
      )}

      {/* ── Chat FAB ── */}
      {(syncEnabled || LS.get("tc_share_blobid", "")) && (
        <div className="chat-fab" onClick={() => setChatOpen(true)}>
          💬
          {chatUnread > 0 && (
            <div className="chat-fab-badge">{chatUnread > 9 ? "9+" : chatUnread}</div>
          )}
        </div>
      )}

      {/* ── Chat Panel ── */}
      {chatOpen && (
        <div className="chat-overlay">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-icon">💬</div>
            <div className="chat-header-info">
              <div className="chat-header-title">Group Chat</div>
              <div className="chat-header-sub">
                {trip.name || "Your trip"}
                {people.length ? ` · ${people.length + 1} members` : ""}
                {syncEnabled && <span style={{ color: "#4DB87A", marginLeft: 6 }}>● live</span>}
              </div>
            </div>
            <button className="btn-del" style={{ fontSize: 22 }} onClick={() => setChatOpen(false)}>
              ✕
            </button>
          </div>

          {/* Author name setup */}
          {!chatAuthor && (
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                flexShrink: 0,
              }}
            >
              <div className="chat-setup-card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  👤 Set your display name
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                  So your team knows who's talking
                </div>
                <div className="flex gap-8">
                  <input
                    className="input flex-1"
                    placeholder="Your name e.g. Sarah"
                    value={chatSetupName}
                    onChange={(e) => setChatSetupName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      chatSetupName.trim() &&
                      saveChatAuthor(chatSetupName.trim())
                    }
                  />
                  <button
                    className="btn"
                    onClick={() => chatSetupName.trim() && saveChatAuthor(chatSetupName.trim())}
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No sync connected */}
          {!syncEnabled && !LS.get("tc_share_blobid", "") && (
            <div className="chat-sync-prompt">
              <div style={{ fontSize: 40 }}>🔗</div>
              <div
                style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: 16,
                  color: "var(--amber)",
                }}
              >
                Connect your team
              </div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
                Share your trip to enable the group chat. Open the Share modal (📤) to create a trip
                link.
              </div>
              <button
                className="btn"
                onClick={() => {
                  setChatOpen(false)
                  setShowShare(true)
                }}
              >
                Open Share →
              </button>
            </div>
          )}

          {/* Messages */}
          {(syncEnabled || chatMessages.length > 0) && (
            <div className="chat-messages" id="chat-msgs">
              {chatMessages.length === 0 && (
                <div
                  style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                    Say hello to your travel crew
                  </div>
                  <div style={{ fontSize: 12 }}>Messages sync every 8 seconds</div>
                </div>
              )}
              {chatMessages.map((msg, i) => {
                const isSelf = msg.author === (chatAuthor || "Me")
                const showSep = i === 0 || !sameDay(chatMessages[i - 1].ts, msg.ts)
                const showAuthor =
                  !isSelf && (i === 0 || chatMessages[i - 1].author !== msg.author || showSep)
                return (
                  <Fragment key={msg.id}>
                    {showSep && <div className="chat-date-sep">{dateLabel(msg.ts)}</div>}
                    <div className={`chat-msg-wrap ${isSelf ? "self" : "other"}`}>
                      {showAuthor && <div className="chat-msg-author">{msg.author}</div>}
                      <div
                        className={`chat-bubble ${isSelf ? "self" : msg.author === "system" ? "system" : "other"}`}
                      >
                        {msg.text}
                      </div>
                      <div className="chat-msg-time">{relTime(msg.ts)}</div>
                    </div>
                  </Fragment>
                )
              })}
              <div ref={chatBottomRef} />
            </div>
          )}

          {/* Input */}
          {(syncEnabled || chatMessages.length > 0) && (
            <div className="chat-input-area">
              <textarea
                className="chat-input"
                placeholder={chatAuthor ? `Message as ${chatAuthor}…` : "Set your name above…"}
                value={chatInput}
                disabled={!chatAuthor}
                rows={1}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendChatMsg()
                  }
                }}
              />
              <button
                className="chat-send-btn"
                disabled={!chatInput.trim() || !chatAuthor}
                onClick={sendChatMsg}
              >
                ➤
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sync banner ── */}
      {syncBanner && (
        <div className="sync-banner">
          <div className="sync-banner-icon">🔄</div>
          <div className="sync-banner-body">
            <div className="sync-banner-title">{syncBanner.title}</div>
            <div className="sync-banner-sub">{syncBanner.sub}</div>
          </div>
          <button className="sync-banner-close" onClick={() => setSyncBanner(null)}>
            ✕
          </button>
        </div>
      )}

      {/* ── Share Modal ── */}
      {showShare && (
        <ShareModal
          onClose={() => setShowShare(false)}
          trip={trip}
          itinerary={itinerary}
          packing={packing}
          expenses={expenses}
          people={people}
          baseCurrency={baseCurrency}
          totalBudget={totalBudget}
          memories={memories}
          saveTrip={saveTrip}
          saveItinerary={saveItinerary}
          savePacking={savePacking}
          saveExpenses={saveExpenses}
          savePeople={savePeople}
          saveBudget={saveBudget}
          saveBaseCurrency={saveBaseCurrency}
          initialCode={initialShareCode}
          onSyncEnable={enableSync}
          syncEnabled={syncEnabled}
          syncStatus={syncStatus}
          syncLastAt={syncLastAt}
          onPushNow={pushSync}
          onPullNow={pullSync}
          onJoinTrip={importJoinedTrip}
          currentTripEmpty={isTripEmpty(trip, itinerary, expenses)}
        />
      )}

      {copiedFlash && <div className="copied-flash">{copiedFlash}</div>}
    </div>
  )
}
