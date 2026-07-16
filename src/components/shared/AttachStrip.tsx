import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { processFiles } from '../../lib/attachments';
export function AttachStrip({ attachments = [], onAdd, onRemove, onView, compact = false }) {
  const fileRef = useRef(null);

  const handleFiles = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const processed = await processFiles(files);
    if (processed.length) onAdd(processed);
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginTop: compact ? 4 : 8 }}>
        {attachments.map(att => (
          isImage(att.type)
            ? <img key={att.id} src={att.data} className="doc-thumb" alt={att.name} onClick={() => onView(att)} />
            : <div key={att.id} className="doc-file-thumb" onClick={() => onView(att)}>
                <div className="doc-file-icon">{fileIcon(att.type)}</div>
                <div className="doc-file-ext">{fileExt(att.name)}</div>
              </div>
        ))}
        {/* Upload trigger */}
        <div className="attach-btn" style={{ minHeight:compact?28:36, padding: compact?"4px 8px":"6px 10px" }}
          onClick={() => fileRef.current?.click()}>
          📎 {attachments.length > 0 ? `+` : "Attach"}
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv"
            style={{ display:"none" }} onChange={handleFiles} />
        </div>
      </div>
    </div>
  );
}

/* ── VIEWER MODAL ─────────────────────────────────────────────────────────── */
