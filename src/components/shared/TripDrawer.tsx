import { useState } from "react"
export function TripDrawer({ trips, activeTripId, onSwitch, onCreate, onDelete, onClose }) {
  const tripStatus = (t) => {
    if (!t.startDate) return "draft"
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(t.startDate)
    const end = t.endDate ? new Date(t.endDate) : null
    if (start > today) return "upcoming"
    if (end && end < today) return "completed"
    return "active"
  }

  const statusLabel = {
    draft: "Draft",
    upcoming: "Upcoming",
    active: "On trip!",
    completed: "Completed",
  }
  const statusClass = {
    draft: "tsb-draft",
    upcoming: "tsb-upcoming",
    active: "tsb-active",
    completed: "tsb-completed",
  }

  const tripIcon = (t) => {
    const s = tripStatus(t)
    if (s === "active") return "🌍"
    if (s === "upcoming") return "✈️"
    if (s === "completed") return "📸"
    return "🗺️"
  }

  const formatDates = (t) => {
    if (!t.startDate) return "No dates set"
    if (!t.endDate) return t.startDate
    const days = Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1
    return `${t.startDate} → ${t.endDate} · ${days}d`
  }

  const [confirmDelete, setConfirmDelete] = useState(null)

  const sorted = [...trips].sort((a, b) => {
    // Active trip first, then by startDate desc
    if (a.id === activeTripId) return -1
    if (b.id === activeTripId) return 1
    return (b.startDate || "").localeCompare(a.startDate || "")
  })

  return (
    <div className="trip-drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="trip-drawer-sheet">
        <div className="trip-drawer-hdr">
          <div className="trip-drawer-title">🗺️ My Trips</div>
          <button className="btn-del" style={{ fontSize: 22 }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="trip-drawer-body">
          {/* New trip */}
          <div className="new-trip-btn" onClick={onCreate}>
            <div className="new-trip-btn-icon">＋</div>
            <div>
              <div className="new-trip-btn-text">New Trip</div>
              <div className="new-trip-btn-sub">Start planning a fresh adventure</div>
            </div>
          </div>

          {/* Trip list */}
          {sorted.map((t) => {
            const status = tripStatus(t)
            const isActive = t.id === activeTripId
            return (
              <div
                key={t.id}
                className={`trip-card${isActive ? " active" : ""}`}
                onClick={() => {
                  if (!isActive) {
                    onSwitch(t.id)
                  } else onClose()
                }}
              >
                <div className="trip-card-hdr">
                  <div className="trip-card-icon">{tripIcon(t)}</div>
                  <div className="trip-card-info">
                    <div className="trip-card-name">{t.name || "Untitled Trip"}</div>
                    {t.destination && <div className="trip-card-dest">📍 {t.destination}</div>}
                    <div className="trip-card-dates">{formatDates(t)}</div>
                  </div>
                  {isActive && <div className="trip-card-active-dot" />}
                </div>
                <div className="trip-card-footer">
                  <div className={`trip-status-badge ${statusClass[status]}`}>
                    {statusLabel[status]}
                    {isActive && " · current"}
                  </div>
                  {!isActive &&
                    (confirmDelete === t.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn-ghost"
                          style={{
                            fontSize: 11,
                            padding: "3px 9px",
                            color: "#FF5C5C",
                            borderColor: "rgba(255,92,92,0.3)",
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(t.id)
                            setConfirmDelete(null)
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 11, padding: "3px 9px" }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete(null)
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-del"
                        style={{ fontSize: 13, opacity: 0.4 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(t.id)
                        }}
                      >
                        🗑
                      </button>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sync merge helpers (append-only — never deletes local data) ───────────────
