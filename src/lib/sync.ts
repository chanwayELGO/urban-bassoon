import { LS } from './storage';
import { DEFAULT_PACKING } from './constants';
export const mergeById = (local, remote) => {
  const ids = new Set((local||[]).map(x=>x.id));
  return [...(local||[]), ...(remote||[]).filter(x=>!ids.has(x.id))];
};
export const mergePeople = (local, remote) => {
  const names = new Set((local||[]).map(p=>p.name));
  return [...(local||[]), ...(remote||[]).filter(p=>!names.has(p.name))];
};
export const mergeItinerary = (local, remote) => {
  const dayMap = new Map((local||[]).map(d=>[d.id,d]));
  (remote||[]).forEach(rd => {
    if(!dayMap.has(rd.id)){ dayMap.set(rd.id,rd); return; }
    const ld = dayMap.get(rd.id);
    const actIds = new Set(ld.activities.map(a=>a.id));
    const newActs = (rd.activities||[]).filter(a=>!actIds.has(a.id));
    if(newActs.length) dayMap.set(rd.id,{...ld,activities:[...ld.activities,...newActs]});
  });
  return [...dayMap.values()].sort((a,b)=>a.day-b.day);
};
export const mergePacking = (local, remote) => {
  const merged = {...(local||{})};
  Object.entries(remote||{}).forEach(([cat,items])=>{
    if(!merged[cat]){ merged[cat]=items; return; }
    const ids = new Set(merged[cat].map(i=>i.id));
    const newItems = (items||[]).filter(i=>!ids.has(i.id));
    if(newItems.length) merged[cat]=[...merged[cat],...newItems];
  });
  return merged;
};

/* ── Main App ─────────────────────────────────────────────────────────────── */
