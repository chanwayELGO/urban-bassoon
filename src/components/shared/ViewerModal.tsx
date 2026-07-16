import { isImage, isPDF } from "../../lib/attachments"
export function ViewerModal({ att, onClose, onDelete }) {
  if (!att) return null
  return (
    <div className="viewer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-header">
        <div className="viewer-title">{att.name}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={att.data}
            download={att.name}
            style={{
              background: "rgba(255,168,40,0.1)",
              border: "1px solid rgba(255,168,40,0.2)",
              borderRadius: 9,
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--amber)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            ⬇ Save
          </a>
          {onDelete && (
            <button
              className="btn-del"
              style={{ fontSize: 18, color: "rgba(255,92,92,0.6)" }}
              onClick={onDelete}
            >
              🗑
            </button>
          )}
          <button className="btn-del" style={{ fontSize: 22 }} onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {isImage(att.type) ? (
          <img src={att.data} className="viewer-img" alt={att.name} />
        ) : isPDF(att.type) ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
            <div style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>
              {att.name}
            </div>
            <a
              href={att.data}
              download={att.name}
              className="btn"
              style={{ textDecoration: "none", display: "inline-block" }}
            >
              ⬇ Download PDF
            </a>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📎</div>
            <div style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>
              {att.name}
            </div>
            <a
              href={att.data}
              download={att.name}
              className="btn"
              style={{ textDecoration: "none", display: "inline-block" }}
            >
              ⬇ Download File
            </a>
          </div>
        )}
      </div>
      <div className="viewer-footer">
        <div style={{ fontSize: 11, color: "var(--text-dim)", flex: 1 }}>
          {formatBytes(att.data)} · {new Date(att.uploadedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}

/* ── DOCS VAULT TAB ───────────────────────────────────────────────────────── */
export const DOC_CATS = [
  { id: "passport", icon: "🛂", label: "Passport / Visa" },
  { id: "insurance", icon: "🏥", label: "Insurance" },
  { id: "flights", icon: "✈️", label: "Flights" },
  { id: "hotel", icon: "🏨", label: "Hotels" },
  { id: "receipt", icon: "🧾", label: "Receipts" },
  { id: "ticket", icon: "🎟️", label: "Tickets / Bookings" },
  { id: "map", icon: "🗺️", label: "Maps / Guides" },
  { id: "other", icon: "📎", label: "Other" },
]

// ── Trip export HTML generator ────────────────────────────────────────────────
