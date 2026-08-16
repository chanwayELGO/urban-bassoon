import { useEffect, useState } from "react"
import { LS } from "../../lib/storage"

const JSONBLOB = "https://jsonblob.com/api/jsonBlob"
export function ShareModal({
  onClose,
  trip,
  itinerary,
  packing,
  expenses,
  people,
  baseCurrency,
  totalBudget,
  memories,
  saveTrip,
  saveItinerary,
  savePacking,
  saveExpenses,
  savePeople,
  saveBudget,
  saveBaseCurrency,
  initialCode = "",
  onSyncEnable,
  syncEnabled,
  syncStatus,
  syncLastAt,
  onPushNow,
  onPullNow,
  onJoinTrip,
  currentTripEmpty = true,
}) {
  const [activeTab, setActiveTab] = useState(initialCode ? "join" : "share")
  const [includes, setIncludes] = useState({
    itinerary: true,
    packing: true,
    budget: true,
    memories: false,
  })
  const [shareState, setShareState] = useState({ step: "idle", code: "", blobId: "", error: "" }) // idle | creating | ready | updating | error
  const [joinCode, setJoinCode] = useState(initialCode)
  const [joinState, setJoinState] = useState({ step: "idle", preview: null, error: "", blobId: "" }) // idle | fetching | preview | importing | done | error
  const [joinName, setJoinName] = useState("")
  const [joinIncludes, setJoinIncludes] = useState({
    itinerary: true,
    packing: true,
    budget: false,
  })
  const [copiedMsg, setCopiedMsg] = useState("")

  const toggleInclude = (k) => setIncludes((p) => ({ ...p, [k]: !p[k] }))
  const toggleJoinInclude = (k) => setJoinIncludes((p) => ({ ...p, [k]: !p[k] }))

  // ── Build shareable payload ──────────────────────────────────────────────
  const buildPayload = () => {
    const payload = {
      v: 2,
      createdAt: new Date().toISOString(),
      trip,
      people,
      baseCurrency,
      totalBudget,
      ...(includes.itinerary && { itinerary }),
      ...(includes.packing && { packing }),
      ...(includes.budget && { expenses }),
      ...(includes.memories && {
        memories: memories.map((m) => ({ ...m, photo: null })),
      }),
    }
    return payload
  }

  // ── Create link ──────────────────────────────────────────────────────────
  const createLink = async () => {
    setShareState({ step: "creating", code: "", blobId: "", error: "" })
    try {
      const res = await fetch(JSONBLOB, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      // JSONBlob returns the blob ID in the Location header OR response URL
      const location = res.headers.get("X-id") || res.headers.get("Location") || res.url || ""
      const blobId = location.replace(/.*\//, "").trim()
      if (!blobId) throw new Error("No blob ID returned")
      LS.set("tc_share_blobid", blobId)
      setShareState({ step: "ready", code: blobId, blobId, error: "" })
      if (onSyncEnable) onSyncEnable(blobId)
    } catch (e) {
      setShareState({
        step: "error",
        code: "",
        blobId: "",
        error: "Could not create link — " + e.message,
      })
    }
  }

  // ── Push update ──────────────────────────────────────────────────────────
  const pushUpdate = async () => {
    const blobId = shareState.blobId || LS.get("tc_share_blobid", "")
    if (!blobId) return
    setShareState((p) => ({ ...p, step: "updating" }))
    try {
      await fetch(`${JSONBLOB}/${blobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      setShareState((p) => ({ ...p, step: "ready" }))
      flash("✓ Updated!")
    } catch {
      setShareState((p) => ({ ...p, step: "ready" }))
      flash("⚠️ Update failed")
    }
  }

  // ── Restore existing link on open ────────────────────────────────────────
  useEffect(() => {
    const savedBlobId = LS.get("tc_share_blobid", "")
    if (savedBlobId && activeTab === "share") {
      setShareState({ step: "ready", code: savedBlobId, blobId: savedBlobId, error: "" })
    }
  }, [activeTab])

  // ── Auto-fetch if initialCode given ─────────────────────────────────────
  useEffect(() => {
    if (initialCode) {
      setJoinCode(initialCode)
      fetchPreview(initialCode)
    }
  }, [])

  // ── Fetch preview ────────────────────────────────────────────────────────
  const fetchPreview = async (rawCode = "") => {
    let input = (rawCode || joinCode).trim()
    if (!input) return
    // If user pasted a full URL, extract the ?trip= param or the last path segment
    try {
      const u = new URL(input)
      input = u.searchParams.get("trip") || u.pathname.replace(/.*\//, "") || input
    } catch {}
    // Strip any trailing slashes or whitespace
    input = input.replace(/\/+$/, "").trim()
    if (!input) return
    setJoinState({ step: "fetching", preview: null, error: "", blobId: "" })
    try {
      const res = await fetch(`${JSONBLOB}/${input}`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data || !data.trip) throw new Error("Invalid trip data")
      setJoinState({ step: "preview", preview: data, error: "", blobId: input })
    } catch (e) {
      setJoinState({
        step: "error",
        preview: null,
        error: `Trip not found (${e.message}). Paste the full link or ID shared by the trip creator.`,
        blobId: "",
      })
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  const importTrip = () => {
    const d = joinState.preview
    if (!d) return
    setJoinState((p) => ({ ...p, step: "importing" }))
    if (onJoinTrip) {
      onJoinTrip({
        payload: d,
        joinName: joinName.trim(),
        joinIncludes,
        blobId: joinState.blobId,
      })
    } else {
      if (d.trip) saveTrip(d.trip)
      if (d.baseCurrency) saveBaseCurrency(d.baseCurrency)
      if (d.totalBudget) saveBudget(d.totalBudget)
      const existingNames = new Set(people.map((p) => p.name))
      const incoming = (d.people || []).filter((p) => !existingNames.has(p.name))
      const myEntry =
        joinName.trim() && !existingNames.has(joinName.trim())
          ? [{ id: Date.now() + 1, name: joinName.trim() }]
          : []
      savePeople([...people, ...incoming, ...myEntry])
      if (joinIncludes.itinerary && d.itinerary) saveItinerary(d.itinerary)
      if (joinIncludes.packing && d.packing) savePacking(d.packing)
      if (joinIncludes.budget && d.expenses) saveExpenses(d.expenses)
      if (onSyncEnable && joinState.blobId) onSyncEnable(joinState.blobId)
    }
    setJoinState((p) => ({ ...p, step: "done" }))
  }

  // ── Share helpers ─────────────────────────────────────────────────────────
  const tripUrl = () =>
    `${window.location.origin}${window.location.pathname}?trip=${joinState.blobId || shareState.blobId}`
  const qrUrl = (code) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}&bgcolor=07101F&color=FFA828&margin=10`

  const flash = (msg) => {
    setCopiedMsg(msg)
    setTimeout(() => setCopiedMsg(""), 2000)
  }

  const copyCode = () => {
    navigator.clipboard
      ?.writeText(shareState.code)
      .then(() => flash("✓ Code copied!"))
      .catch(() => {})
  }
  const copyLink = () => {
    navigator.clipboard
      ?.writeText(tripUrl())
      .then(() => flash("✓ Link copied!"))
      .catch(() => {})
  }
  const nativeShare = () => {
    if (!navigator.share) {
      copyLink()
      return
    }
    navigator
      .share({
        title: `Join ${trip.name || "my trip"}!`,
        text: `Join my TravelPal trip${trip.destination ? " to " + trip.destination : ""}! Use code: ${shareState.code}`,
        url: tripUrl(),
      })
      .catch(() => {})
  }

  const SECTIONS = [
    { key: "itinerary", icon: "📅", label: "Itinerary", sub: `${itinerary.length} days` },
    {
      key: "packing",
      icon: "🧳",
      label: "Packing list",
      sub: `${Object.values(packing).flat().length} items`,
    },
    { key: "budget", icon: "💰", label: "Budget & expenses", sub: `${expenses.length} expenses` },
    {
      key: "memories",
      icon: "📸",
      label: "Memory pins",
      sub: `${memories.length} memories (no photos)`,
    },
  ]

  return (
    <>
      <div className="share-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="share-sheet">
          <div className="share-header">
            <div className="share-header-top">
              <div className="share-title">✈️ Share &amp; Invite</div>
              <button className="btn-del" style={{ fontSize: 22 }} onClick={onClose}>
                ✕
              </button>
            </div>
            <div className="share-tabs">
              <button
                className={`share-tab-btn${activeTab === "share" ? " active" : ""}`}
                onClick={() => setActiveTab("share")}
              >
                📤 Share Trip
              </button>
              <button
                className={`share-tab-btn${activeTab === "join" ? " active" : ""}`}
                onClick={() => setActiveTab("join")}
              >
                📥 Join a Trip
              </button>
            </div>
          </div>

          <div className="share-body">
            {/* ── SHARE TAB ── */}
            {activeTab === "share" && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    marginBottom: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Create a shareable trip code. Anyone with the code can view and import your trip
                  data.
                </div>

                {/* What to include */}
                <div className="card-title-small">What to share</div>
                {SECTIONS.map((s) => (
                  <div key={s.key} className="include-row" onClick={() => toggleInclude(s.key)}>
                    <div className={`include-check${includes[s.key] ? " on" : ""}`} />
                    <span style={{ fontSize: 16 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.sub}</div>
                    </div>
                  </div>
                ))}

                {/* Trip basics always included note */}
                <div
                  style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, marginBottom: 14 }}
                >
                  ✓ Trip details &amp; travellers always included
                </div>

                {/* Create / Update button */}
                {shareState.step === "idle" && (
                  <button className="btn btn-full" onClick={createLink}>
                    🔗 Create Trip Link
                  </button>
                )}
                {(shareState.step === "creating" || shareState.step === "updating") && (
                  <button className="btn btn-full" disabled>
                    <span className="dots">
                      <span>·</span>
                      <span>·</span>
                      <span>·</span>
                    </span>
                  </button>
                )}
                {shareState.step === "error" && (
                  <div>
                    <div
                      style={{
                        color: "#FF5C5C",
                        fontSize: 13,
                        marginBottom: 10,
                        textAlign: "center",
                      }}
                    >
                      ⚠️ {shareState.error}
                    </div>
                    <button className="btn btn-full" onClick={createLink}>
                      Try Again
                    </button>
                  </div>
                )}

                {/* Code + QR ready */}
                {shareState.step === "ready" && (
                  <div>
                    <div className="trip-code-box">
                      <div className="trip-code-label">Trip ID (tap to copy)</div>
                      <div
                        className="trip-code"
                        onClick={copyCode}
                        title="Tap to copy"
                        style={{ fontSize: 13, letterSpacing: 1, wordBreak: "break-all" }}
                      >
                        {shareState.code}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        Share the link below — anyone can join with it
                      </div>
                    </div>

                    <div className="qr-wrap">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tripUrl())}&bgcolor=07101F&color=FFA828&margin=10`}
                        alt="QR Code"
                      />
                    </div>

                    <div className="share-actions">
                      {"share" in navigator && (
                        <button className="share-action-btn" onClick={nativeShare}>
                          <span className="sab-icon">📲</span>
                          <div className="sab-info">
                            <div className="sab-title">Share via…</div>
                            <div className="sab-sub">WhatsApp, Messages, Email & more</div>
                          </div>
                        </button>
                      )}
                      <button className="share-action-btn" onClick={copyLink}>
                        <span className="sab-icon">🔗</span>
                        <div className="sab-info">
                          <div className="sab-title">Copy Link</div>
                          <div className="sab-sub">{tripUrl().slice(0, 42)}…</div>
                        </div>
                      </button>
                      <button className="share-action-btn" onClick={copyCode}>
                        <span className="sab-icon">📋</span>
                        <div className="sab-info">
                          <div className="sab-title">Copy Code Only</div>
                          <div className="sab-sub">Paste it to your travel group chat</div>
                        </div>
                      </button>
                      <button className="share-action-btn" onClick={pushUpdate}>
                        <span className="sab-icon">🔄</span>
                        <div className="sab-info">
                          <div className="sab-title">Push Update</div>
                          <div className="sab-sub">Sync latest changes to this link</div>
                        </div>
                      </button>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 14,
                        fontSize: 12,
                        color: "var(--text-dim)",
                      }}
                    >
                      <span className="collab-dot" />
                      <span>Link is live · Stored securely on JSONBlob</span>
                    </div>

                    {/* Live sync panel */}
                    <div className="sync-section">
                      <div className="sync-status-row">
                        <div
                          className={`sync-dot ${syncEnabled ? (syncStatus === "error" ? "error" : "synced") : "disabled"}`}
                        />
                        <span
                          style={{
                            fontWeight: 600,
                            color: syncEnabled ? "#4DB87A" : "var(--text-dim)",
                          }}
                        >
                          {syncEnabled ? "Auto-sync active" : "Auto-sync off"}
                        </span>
                      </div>
                      {syncLastAt && (
                        <div className="sync-last-at">
                          Last sync:{" "}
                          {new Date(syncLastAt).toLocaleTimeString("en", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                      <div className="flex gap-8 mt-8">
                        <button
                          className="btn-ghost flex-1"
                          style={{ fontSize: 11 }}
                          onClick={onPushNow}
                          disabled={!syncEnabled}
                        >
                          {syncStatus === "pushing" ? (
                            <span className="dots">
                              <span>·</span>
                              <span>·</span>
                              <span>·</span>
                            </span>
                          ) : (
                            "⬆ Push now"
                          )}
                        </button>
                        <button
                          className="btn-ghost flex-1"
                          style={{ fontSize: 11 }}
                          onClick={onPullNow}
                          disabled={!syncEnabled}
                        >
                          {syncStatus === "pulling" ? (
                            <span className="dots">
                              <span>·</span>
                              <span>·</span>
                              <span>·</span>
                            </span>
                          ) : (
                            "⬇ Pull latest"
                          )}
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          marginTop: 6,
                          lineHeight: 1.6,
                        }}
                      >
                        Changes sync every 30s. Team sees itinerary, expenses &amp; packing updates
                        in real time.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── JOIN TAB ── */}
            {activeTab === "join" && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    marginBottom: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Enter a trip code or paste a link shared by a fellow traveller.
                </div>

                {/* Code input */}
                <div className="card-title-small">Trip Code</div>
                <div className="flex gap-8" style={{ marginBottom: 14 }}>
                  <input
                    className="input flex-1"
                    placeholder="Paste code or full link…"
                    value={joinCode}
                    onChange={(e) => {
                      let v = e.target.value.trim()
                      // If it's a URL, extract the trip param
                      try {
                        const u = new URL(v)
                        const p = u.searchParams.get("trip")
                        if (p) v = p
                      } catch {}
                      setJoinCode(v)
                      setJoinState({ step: "idle", preview: null, error: "", blobId: "" })
                    }}
                  />
                  <button
                    className="btn"
                    onClick={() => fetchPreview()}
                    disabled={!joinCode.trim() || joinState.step === "fetching"}
                  >
                    {joinState.step === "fetching" ? (
                      <span className="dots">
                        <span>·</span>
                        <span>·</span>
                        <span>·</span>
                      </span>
                    ) : (
                      "Look up"
                    )}
                  </button>
                </div>

                {joinState.step === "error" && (
                  <div
                    style={{
                      color: "#FF5C5C",
                      fontSize: 13,
                      textAlign: "center",
                      marginBottom: 14,
                    }}
                  >
                    ⚠️ {joinState.error}
                  </div>
                )}

                {/* Preview */}
                {(joinState.step === "preview" ||
                  joinState.step === "importing" ||
                  joinState.step === "done") &&
                  joinState.preview && (
                    <div>
                      <div className="join-preview">
                        <div className="join-preview-title">
                          ✈️ {joinState.preview.trip?.name || "Untitled Trip"}
                        </div>
                        {joinState.preview.trip?.destination && (
                          <div className="join-preview-row">
                            📍 {joinState.preview.trip.destination}
                          </div>
                        )}
                        {joinState.preview.trip?.startDate && (
                          <div className="join-preview-row">
                            🗓️ {joinState.preview.trip.startDate} →{" "}
                            {joinState.preview.trip.endDate || "?"}
                          </div>
                        )}
                        {joinState.preview.people?.length > 0 && (
                          <div className="join-preview-row">
                            👥 {joinState.preview.people.map((p) => p.name).join(", ")}
                          </div>
                        )}
                        <div
                          className="join-preview-row"
                          style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}
                        >
                          {joinState.preview.itinerary && (
                            <span className="invite-badge">📅 Itinerary</span>
                          )}
                          {joinState.preview.packing && (
                            <span className="invite-badge">🧳 Packing</span>
                          )}
                          {joinState.preview.expenses && (
                            <span className="invite-badge">💰 Budget</span>
                          )}
                        </div>
                      </div>

                      {joinState.step !== "done" && (
                        <div style={{ marginTop: 14 }}>
                          <div className="card-title-small">Your name (added to travellers)</div>
                          <input
                            className="input"
                            style={{ marginBottom: 12 }}
                            placeholder="e.g. Sarah"
                            value={joinName}
                            onChange={(e) => setJoinName(e.target.value)}
                          />

                          <div className="card-title-small">What to import</div>
                          {[
                            { key: "itinerary", icon: "📅", label: "Itinerary" },
                            { key: "packing", icon: "🧳", label: "Packing list" },
                            { key: "budget", icon: "💰", label: "Budget & expenses" },
                          ]
                            .filter((s) => joinState.preview[s.key])
                            .map((s) => (
                              <div
                                key={s.key}
                                className="include-row"
                                onClick={() => toggleJoinInclude(s.key)}
                              >
                                <div
                                  className={`include-check${joinIncludes[s.key] ? " on" : ""}`}
                                />
                                <span>{s.icon}</span>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
                              </div>
                            ))}
                          <div
                            style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 12px" }}
                          >
                            {currentTripEmpty
                              ? "Trip details and travellers always imported"
                              : "Saved as a new trip — your current trip stays untouched"}
                          </div>

                          <button
                            className="btn btn-full"
                            onClick={importTrip}
                            disabled={joinState.step === "importing"}
                          >
                            {joinState.step === "importing" ? (
                              <span className="dots">
                                <span>·</span>
                                <span>·</span>
                                <span>·</span>
                              </span>
                            ) : (
                              "📥 Import & Join Trip"
                            )}
                          </button>
                        </div>
                      )}

                      {joinState.step === "done" && (
                        <div style={{ textAlign: "center", padding: "20px 0" }}>
                          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                          <div
                            style={{
                              fontFamily: "'Playfair Display',serif",
                              fontSize: 17,
                              color: "#4DB87A",
                              marginBottom: 6,
                            }}
                          >
                            You're in!
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                            Trip data imported. Welcome aboard!
                          </div>
                          <button className="btn mt-12" onClick={onClose}>
                            Let's go ✈️
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
      {copiedMsg && <div className="copied-flash">{copiedMsg}</div>}
    </>
  )
}

/* ── BUDGET Tab ───────────────────────────────────────────────────────────── */
