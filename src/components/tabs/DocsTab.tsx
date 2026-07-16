import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { LS } from '../../lib/storage';
import { EXPENSE_CATS } from '../../lib/constants';
import { processFiles, formatBytes, isImage, isPDF } from '../../lib/attachments';
import { AttachStrip } from '../shared/AttachStrip';
import { ViewerModal } from '../shared/ViewerModal';
import { generateExportHTML } from '../../lib/export';
export function DocsTab({ docs, saveDocs, expenses, itinerary, navigateTo, trip, memories, packing, baseCurrency, people, onExport }) {
  const [filterCat, setFilterCat] = useState("all");
  const [viewingAtt, setViewingAtt] = useState(null);
  const [addingDoc,  setAddingDoc]  = useState(false);
  const [newDocForm, setNewDocForm] = useState({ name:"", cat:"other", linkedTo:"none", linkedId:"" });
  const fileRef = useRef(null);

  // All activities flat list for linking
  const allActivities = itinerary.flatMap(d => d.activities.map(a => ({ ...a, dayLabel: d.label, dayId: d.id })));

  const filtered = filterCat === "all" ? docs : docs.filter(d => d.cat === filterCat);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const attachments = await processFiles(files);
    const newDocs = attachments.map(att => ({
      id: att.id,
      name: newDocForm.name || att.name,
      cat: newDocForm.cat,
      linkedTo: newDocForm.linkedTo,
      linkedId: newDocForm.linkedId,
      ...att,
      uploadedAt: att.uploadedAt,
    }));
    saveDocs([...docs, ...newDocs]);
    setAddingDoc(false);
    setNewDocForm({ name:"", cat:"other", linkedTo:"none", linkedId:"" });
    e.target.value = "";
  };

  const deleteDoc = (id) => saveDocs(docs.filter(d => d.id !== id));

  const getLinkedLabel = (doc) => {
    if (doc.linkedTo === "expense") {
      const exp = expenses.find(e => String(e.id) === String(doc.linkedId));
      return exp ? `💰 ${exp.desc}` : null;
    }
    if (doc.linkedTo === "activity") {
      const act = allActivities.find(a => String(a.id) === String(doc.linkedId));
      return act ? `📅 ${act.dayLabel} — ${act.text}` : null;
    }
    return null;
  };

  const catCounts = {};
  docs.forEach(d => { catCounts[d.cat] = (catCounts[d.cat] || 0) + 1; });

  return (
    <div>
      {/* ── Export Card ── */}
      <div className="export-card">
        <div className="card-title" style={{marginBottom:4,color:"var(--amber)"}}>📄 Export Trip</div>
        <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:8}}>
          Generate a print-ready PDF — itinerary, expenses, memories and packing list all in one page.
        </div>
        <div className="export-includes">
          {[["📅","Itinerary",itinerary.flatMap(d=>d.activities).length+" activities"],
            ["💰","Expenses",expenses.length+" entries"],
            ["📸","Memories",memories.length+" pins"],
            ["🧳","Packing",Object.values(packing).flat().length+" items"],
          ].map(([icon,label,count])=>(
            <div key={label} className="export-include-chip">{icon} {label} <span style={{color:"var(--amber)",fontWeight:600}}>{count}</span></div>
          ))}
        </div>
        <div className="export-option-row">
          <div className="export-option-btn" onClick={()=>onExport(false)}>
            <div className="export-option-icon">🖨️</div>
            <div className="export-option-label">Print / PDF</div>
            <div className="export-option-sub">Opens print dialog — save as PDF or print directly</div>
          </div>
          <div className="export-option-btn" onClick={()=>onExport(true)}>
            <div className="export-option-icon">📋</div>
            <div className="export-option-label">Preview</div>
            <div className="export-option-sub">Open in new tab to review before printing</div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom:12 }}>
          <div className="card-title" style={{ marginBottom:0 }}>🗄️ Document Vault</div>
          <button className="btn btn-sm" onClick={() => setAddingDoc(true)}>+ Upload</button>
        </div>
        <div style={{ fontSize:13, color:"var(--text-dim)", lineHeight:1.6 }}>
          {docs.length === 0
            ? "Store passports, visas, bookings, receipts — all in one place."
            : `${docs.length} document${docs.length !== 1 ? "s" : ""} stored`}
        </div>
        {/* Category filter */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:12 }}>
          <div className={`doc-cat-chip${filterCat==="all"?" on":""}`} onClick={() => setFilterCat("all")}>
            All {docs.length > 0 && `(${docs.length})`}
          </div>
          {DOC_CATS.filter(c => catCounts[c.id]).map(c => (
            <div key={c.id} className={`doc-cat-chip${filterCat===c.id?" on":""}`} onClick={() => setFilterCat(c.id)}>
              {c.icon} {c.label} ({catCounts[c.id]})
            </div>
          ))}
        </div>
      </div>

      {/* Upload Form */}
      {addingDoc && (
        <div className="card" style={{ border:"1px solid rgba(255,168,40,0.2)" }}>
          <div className="card-title">📎 Upload Document</div>
          <div className="flex flex-col gap-8">
            <input className="input" placeholder="Document name (optional)" value={newDocForm.name}
              onChange={e => setNewDocForm(f => ({...f, name: e.target.value}))} />

            <div>
              <div className="card-title-small">Category</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                {DOC_CATS.map(c => (
                  <div key={c.id} className={`doc-cat-chip${newDocForm.cat===c.id?" on":""}`}
                    onClick={() => setNewDocForm(f => ({...f, cat:c.id}))}>
                    {c.icon} {c.label}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="card-title-small">Link to (optional)</div>
              <select className="input" value={newDocForm.linkedTo}
                onChange={e => setNewDocForm(f => ({...f, linkedTo: e.target.value, linkedId:""}))}>
                <option value="none">No link</option>
                <option value="expense">An expense</option>
                <option value="activity">An activity</option>
                <option value="trip">The whole trip</option>
              </select>
            </div>

            {newDocForm.linkedTo === "expense" && expenses.length > 0 && (
              <select className="input" value={newDocForm.linkedId}
                onChange={e => setNewDocForm(f => ({...f, linkedId: e.target.value}))}>
                <option value="">— choose expense —</option>
                {[...expenses].reverse().map(exp => (
                  <option key={exp.id} value={exp.id}>{exp.desc} · {new Date(exp.date||"").toLocaleDateString()}</option>
                ))}
              </select>
            )}

            {newDocForm.linkedTo === "activity" && allActivities.length > 0 && (
              <select className="input" value={newDocForm.linkedId}
                onChange={e => setNewDocForm(f => ({...f, linkedId: e.target.value}))}>
                <option value="">— choose activity —</option>
                {allActivities.map(a => (
                  <option key={a.id} value={a.id}>{a.dayLabel} — {a.text}</option>
                ))}
              </select>
            )}

            <div className="attach-upload-zone" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" multiple
                accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
                style={{ display:"none" }} onChange={handleUpload} />
              <div className="attach-upload-label">
                <span style={{ fontSize:24 }}>📎</span>
                <span>Tap to pick files<br/><span style={{ fontSize:10 }}>Images, PDFs, docs — up to 10 MB each</span></span>
              </div>
            </div>

            <button className="btn-ghost" onClick={() => setAddingDoc(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Doc list */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📁</div>
          <div className="empty-msg">{filterCat === "all" ? "No documents yet.\nTap + Upload to add your first." : "No documents in this category."}</div>
        </div>
      ) : filtered.map(doc => {
        const linkedLabel = getLinkedLabel(doc);
        const catObj = DOC_CATS.find(c => c.id === doc.cat) || DOC_CATS[DOC_CATS.length - 1];
        return (
          <div key={doc.id} className="doc-vault-card" onClick={() => setViewingAtt(doc)}>
            <div className="doc-vault-hdr">
              <div className="doc-vault-icon">{isImage(doc.type) ? "🖼️" : catObj.icon}</div>
              <div className="doc-vault-info">
                <div className="doc-vault-name">{doc.name}</div>
                <div className="doc-vault-meta">
                  {catObj.label} · {formatBytes(doc.data)}
                  {linkedLabel && <span style={{ color:"#5BA4FF", marginLeft:6 }}>🔗 {linkedLabel}</span>}
                </div>
              </div>
              <button className="btn-del" onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}>✕</button>
            </div>
            {isImage(doc.type) && (
              <img src={doc.data} alt={doc.name}
                style={{ width:"100%", height:100, objectFit:"cover", borderRadius:10, marginTop:10, border:"1px solid rgba(255,255,255,0.06)" }} />
            )}
          </div>
        );
      })}

      {/* Viewer */}
      {viewingAtt && (
        <ViewerModal
          att={viewingAtt}
          onClose={() => setViewingAtt(null)}
          onDelete={() => { deleteDoc(viewingAtt.id); setViewingAtt(null); }}
        />
      )}
    </div>
  );
}

/* ── SWIPEABLE ACTIVITY ───────────────────────────────────────────────────── */
