import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { LS } from '../../lib/storage';
import { EXPENSE_CATS } from '../../lib/constants';
import { SwipeableActivity } from '../shared/SwipeableActivity';
import { addDays, generateICS, downloadICS, gcalDayUrl, outlookDayUrl } from '../../lib/calendar';
export function PlanTab({ trip, saveTrip, itinerary, addDay, addActivity, toggleActivity, removeDay, removeActivity, expenses, baseCurrency, memories, navigateTo, onQuickExpense, onQuickMemory }) {
  const [newActs, setNewActs] = useState({});
  const tripDays = trip.startDate && trip.endDate
    ? Math.max(0, Math.round((new Date(trip.endDate)-new Date(trip.startDate))/86400000)+1)
    : null;

  const handleAdd = (dayId) => {
    const t = (newActs[dayId]||"").trim();
    if (!t) return;
    addActivity(dayId, t);
    setNewActs(p=>({...p,[dayId]:""}));
  };

  // Per-day derived stats
  const daySpend = (day) =>
    expenses.filter(e=>e.dayId===day.id).reduce((s,e)=>s+(e.amtBase??Number(e.amount??0)),0);
  const dayMemories = (day) => memories.filter(m=>m.dayId===day.id).length;

  return (
    <div>
      <div className="card">
        <div className="card-title">🗺️ Trip Details</div>
        <div className="flex flex-col gap-8">
          <input className="input" placeholder="Destination (e.g. Tokyo, Japan)"
            value={trip.destination} onChange={e=>saveTrip({...trip,destination:e.target.value})} />
          <div className="grid-2">
            <div><div className="card-title-small">Depart</div>
              <input type="date" className="input" value={trip.startDate} onChange={e=>saveTrip({...trip,startDate:e.target.value})} /></div>
            <div><div className="card-title-small">Return</div>
              <input type="date" className="input" value={trip.endDate} onChange={e=>saveTrip({...trip,endDate:e.target.value})} /></div>
          </div>
          {tripDays && (
            <div style={{fontSize:12,color:"rgba(230,217,194,0.45)",display:"flex",gap:12,flexWrap:"wrap"}}>
              <span>🗓️ {tripDays} {tripDays===1?"day":"days"}</span>
              {trip.destination&&<span>📍 {trip.destination}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Calendar Sync Card ── */}
      {(()=>{
        const allActs  = itinerary.flatMap(d=>d.activities).length;
        const daysWithActs = itinerary.filter(d=>d.activities.length>0).length;
        const icsStr   = () => generateICS({trip, itinerary});
        const isApple  = /iPhone|iPad|Mac/.test(navigator.userAgent);
        return (
          <div className="cal-sync-card">
            <div className="flex items-center justify-between" style={{marginBottom:6}}>
              <div className="card-title" style={{marginBottom:0,fontSize:14,color:"#5BA4FF"}}>📅 Add to Calendar</div>
              <button className="btn-ghost" style={{fontSize:11,padding:"4px 10px",borderColor:"rgba(91,164,255,0.3)",color:"#5BA4FF"}}
                onClick={()=>setShowCal(s=>!s)}>
                {showCal?"Hide":"Sync"}
              </button>
            </div>

            {!trip.startDate&&(
              <div className="cal-no-dates">Set trip dates in the fields above to enable calendar sync.</div>
            )}

            {trip.startDate&&(
              <>
                <div className="cal-stats-row">
                  <div className="cal-stat">{allActs} events</div>
                  <div className="cal-stat">{daysWithActs} days</div>
                  {trip.startDate&&<div className="cal-stat">from {trip.startDate}</div>}
                </div>

                {showCal&&(
                  <>
                    {/* Platform buttons */}
                    <div className="cal-platform-grid">
                      {/* Apple Calendar / ICS */}
                      <div className="cal-platform-btn"
                        onClick={()=>downloadICS(icsStr(), `${(trip.name||"trip").replace(/\s+/g,"-")}.ics`)}>
                        <div className="cal-platform-icon">🍎</div>
                        <div>
                          <div className="cal-platform-label">{isApple?"Apple Calendar":"Download .ics"}</div>
                          <div className="cal-platform-sub">{isApple?"Opens in Calendar.app":"All calendars, any device"}</div>
                        </div>
                      </div>
                      {/* Universal ICS */}
                      <div className="cal-platform-btn"
                        onClick={()=>downloadICS(icsStr(), `${(trip.name||"trip").replace(/\s+/g,"-")}.ics`)}>
                        <div className="cal-platform-icon">📥</div>
                        <div>
                          <div className="cal-platform-label">Download .ics</div>
                          <div className="cal-platform-sub">Universal — Google, Outlook, any app</div>
                        </div>
                      </div>
                    </div>

                    {/* Per-day calendar links preview */}
                    {itinerary.filter(d=>d.activities.length>0).length>0&&(
                      <div className="cal-event-preview">
                        <div style={{fontSize:11,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:".6px",fontWeight:700,marginBottom:6}}>
                          Add individual days
                        </div>
                        {itinerary.map((day,idx)=>{
                          if(!day.activities.length) return null;
                          const gc = gcalDayUrl(day,idx,trip);
                          const ol = outlookDayUrl(day,idx,trip);
                          const d  = addDays(trip.startDate,idx);
                          const dateLabel = d.toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"});
                          return(
                            <div key={day.id} className="cal-preview-row">
                              <div className="cal-preview-date">{dateLabel}</div>
                              <div className="cal-preview-acts">
                                {day.label} · {day.activities.length} act{day.activities.length!==1?"s":""}
                              </div>
                              {gc&&<a href={gc} target="_blank" rel="noopener noreferrer" className="cal-preview-gcal">G</a>}
                              {ol&&<a href={ol} target="_blank" rel="noopener noreferrer"
                                style={{background:"rgba(0,120,212,0.1)",border:"1px solid rgba(0,120,212,0.2)",borderRadius:6,padding:"2px 7px",fontSize:10,color:"#0078D4",textDecoration:"none",marginLeft:4,whiteSpace:"nowrap"}}>
                                ⊞
                              </a>}
                            </div>
                          );
                        })}
                        <div style={{fontSize:10,color:"rgba(230,217,194,0.3)",marginTop:8}}>
                          G = Google Calendar · ⊞ = Outlook
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div className="card">
        <div className="flex items-center justify-between" style={{marginBottom:12}}>
          <div className="card-title" style={{marginBottom:0}}>📅 Itinerary</div>
          <button className="btn btn-sm" onClick={addDay}>+ Day</button>
        </div>
        {itinerary.length===0 ? (
          <div className="empty"><div className="empty-icon">🗓️</div><div className="empty-msg">Add days to build your itinerary</div></div>
        ) : itinerary.map(day=>{
          const ds = daySpend(day); const dm = dayMemories(day);
          return (
            <div key={day.id} className="day-card">
              <div className="day-hdr">
                <div className="day-title">{day.label}</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {ds>0&&<span className="linked-badge" onClick={()=>navigateTo(3)}>💰 {baseCurrency} {ds.toFixed(0)}</span>}
                  {dm>0&&<span className="linked-badge" style={{background:"rgba(255,168,40,0.08)",borderColor:"rgba(255,168,40,0.2)",color:"var(--amber)"}} onClick={()=>navigateTo(5)}>📸 {dm}</span>}
                  <button className="btn-del" onClick={()=>removeDay(day.id)}>✕</button>
                </div>
              </div>
              {day.activities.map((act,i)=>(
                <SwipeableActivity key={act.id}
                  act={act} dayId={day.id}
                  onToggle={()=>toggleActivity(day.id,act.id)}
                  onDelete={()=>removeActivity(day.id,act.id)}
                  onExpense={()=>onQuickExpense(act,day)}
                  onMemory={()=>onQuickMemory(act,day)}
                  isFirst={i===0}
                />
              ))}
              {day.activities.length===0&&(
                <div className="swipe-hint" style={{textAlign:"left",paddingLeft:2}}>Add activities below</div>
              )}
              <div className="flex gap-8 mt-8">
                <input className="input flex-1" style={{padding:"7px 11px",fontSize:12}} placeholder="Add activity…"
                  value={newActs[day.id]||""} onChange={e=>setNewActs(p=>({...p,[day.id]:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&handleAdd(day.id)} />
                <button className="btn-ghost" onClick={()=>handleAdd(day.id)}>Add</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── PACK Tab ─────────────────────────────────────────────────────────────── */
