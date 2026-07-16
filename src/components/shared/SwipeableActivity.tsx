import { useRef, useState } from "react"

export function SwipeableActivity({
  act,
  dayId,
  onToggle,
  onDelete,
  onExpense,
  onMemory,
  isFirst,
}) {
  const THRESHOLD = 72 // px to trigger action
  const MAX_DRAG = 115 // max px drag before clamping
  const MIN_INTENT = 8 // px before we commit to horizontal swipe

  const [dx, setDx] = useState(0)
  const [phase, setPhase] = useState("idle") // idle | drag | snap | done-flash | delete-flash | collapsing
  const touch = useRef({ x0: 0, y0: 0, decided: false, horiz: false })
  const wrapRef = useRef(null)

  const clamp = (v) => Math.max(-MAX_DRAG, Math.min(MAX_DRAG, v))
  const rProg = Math.min(1, Math.max(0, dx / THRESHOLD)) // right progress 0→1
  const lProg = Math.min(1, Math.max(0, -dx / THRESHOLD)) // left  progress 0→1

  // ── Touch handlers ──────────────────────────────────────────────────────
  const onStart = (e) => {
    const t = e.touches[0]
    touch.current = { x0: t.clientX, y0: t.clientY, decided: false, horiz: false }
    setPhase("drag")
  }

  const onMove = (e) => {
    const t = e.touches[0]
    const diffX = t.clientX - touch.current.x0
    const diffY = t.clientY - touch.current.y0
    // Decide direction once past MIN_INTENT
    if (!touch.current.decided && Math.hypot(diffX, diffY) > MIN_INTENT) {
      touch.current.decided = true
      touch.current.horiz = Math.abs(diffX) >= Math.abs(diffY)
    }
    if (!touch.current.decided) return
    if (!touch.current.horiz) {
      setPhase("idle")
      return
    }
    e.preventDefault()
    setDx(clamp(diffX))
  }

  const onEnd = () => {
    const cur = clamp(dx)
    if (cur > THRESHOLD) {
      // ── right swipe: toggle done ───────────────────────────────────────
      setPhase("done-flash")
      setDx(0)
      setTimeout(() => {
        onToggle()
        setPhase("idle")
      }, 320)
    } else if (cur < -THRESHOLD) {
      // ── left swipe: delete ────────────────────────────────────────────
      setPhase("collapsing")
      setDx(0)
      if (wrapRef.current) {
        wrapRef.current.style.maxHeight = wrapRef.current.offsetHeight + "px"
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (wrapRef.current) wrapRef.current.style.maxHeight = "0px"
          })
        })
      }
      setTimeout(() => onDelete(), 340)
    } else {
      // ── snap back ─────────────────────────────────────────────────────
      setDx(0)
      setPhase("snap")
      setTimeout(() => setPhase("idle"), 280)
    }
    touch.current.decided = false
  }

  // ── Mouse fallback (desktop testing) ────────────────────────────────────
  const mouse = useRef({ down: false, x0: 0 })
  const onMouseDown = (e) => {
    mouse.current = { down: true, x0: e.clientX }
    setPhase("drag")
  }
  const onMouseMove = (e) => {
    if (!mouse.current.down) return
    setDx(clamp(e.clientX - mouse.current.x0))
  }
  const onMouseUp = () => {
    if (!mouse.current.down) return
    mouse.current.down = false
    onEnd()
  }

  const isDone = act.done
  const isTransition = phase !== "drag"
  const flashClass =
    phase === "done-flash"
      ? " flash-done"
      : phase === "collapsing" || phase === "delete-flash"
        ? " flash-delete"
        : ""

  return (
    <div
      ref={wrapRef}
      className={`swipe-wrap${phase === "collapsing" ? " collapsing" : ""}`}
      style={{
        maxHeight: phase === "collapsing" ? undefined : "none",
        overflow: "hidden",
        transition:
          phase === "collapsing" ? "max-height 0.32s ease, opacity 0.22s ease" : undefined,
        opacity: phase === "collapsing" ? 0 : 1,
      }}
    >
      {/* ── Background layers ── */}
      <div className="swipe-bg swipe-bg-right" style={{ opacity: rProg }}>
        <div className="swipe-bg-icon" style={{ transform: `scale(${0.65 + rProg * 0.5})` }}>
          {isDone ? "↩️" : "✅"}
        </div>
        <span className="swipe-bg-label" style={{ color: "#4DB87A", marginLeft: 8 }}>
          {isDone ? "Undo" : "Done"}
        </span>
      </div>
      <div className="swipe-bg swipe-bg-left" style={{ opacity: lProg }}>
        <span className="swipe-bg-label" style={{ color: "#FF5C5C", marginRight: 8 }}>
          Delete
        </span>
        <div className="swipe-bg-icon" style={{ transform: `scale(${0.65 + lProg * 0.5})` }}>
          🗑️
        </div>
      </div>

      {/* ── Content row ── */}
      <div
        className={`swipe-content${isTransition ? " has-transition" : ""}${flashClass}`}
        style={{ transform: `translateX(${phase === "drag" ? dx : 0}px)` }}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Status dot */}
        <div
          className={`swipe-status-dot${isDone ? " done" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          {isDone && "✓"}
        </div>

        {/* Text */}
        <span className={`swipe-act-text${isDone ? " done" : ""}`} onClick={onToggle}>
          {act.text}
        </span>

        {/* Quick actions — only visible when not swiping */}
        <div
          className="act-quick-btns"
          style={{ opacity: Math.max(0, 1 - Math.abs(dx) / 30), flexShrink: 0 }}
        >
          {onExpense && (
            <div
              className="act-q-btn"
              title="Log expense"
              onClick={(e) => {
                e.stopPropagation()
                onExpense()
              }}
            >
              💰
            </div>
          )}
          {onMemory && (
            <div
              className="act-q-btn"
              title="Add memory"
              onClick={(e) => {
                e.stopPropagation()
                onMemory()
              }}
            >
              📸
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── DASHBOARD ────────────────────────────────────────────────────────────── */
