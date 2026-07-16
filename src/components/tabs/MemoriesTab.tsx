import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { LS } from '../../lib/storage';
import { callAi } from '../../lib/ai';
import { compressImage } from '../../lib/attachments';
export function MemoriesTab({ memories, addMemory, updateMemory, deleteMemory, trip, quickMemoryCtx, clearQuickMemory }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  // Pre-fill form from quick-memory context (tapped 📸 on an activity)
  useEffect(()=>{
    if(!quickMemoryCtx) return;
    const {act,day}=quickMemoryCtx;
    setForm(f=>({...f,title:act.text,date:new Date().toISOString().split("T")[0],notes:`${day.label} · ${act.text}`}));
    if(clearQuickMemory) clearQuickMemory();
  },[quickMemoryCtx]);
  const markersRef = useRef({});
  const pendingMarkerRef = useRef(null);

  const [pinForm, setPinForm]   = useState(null);
  const [form, setForm]         = useState({ title:"", date:new Date().toISOString().split("T")[0], mood:"😍", notes:"", photo:null, locationName:"" });
  const MOODS = ["😍","😄","😊","🥹","🤩","😎","😌","🥰","😮","😴","🥶","🌧️"];

  // AI states
  const [genLoading, setGenLoading]       = useState(false);
  const [genSuggestion, setGenSuggestion] = useState(null);
  const [photoCaption, setPhotoCaption]   = useState({ loading:false, result:null, error:"" });

  // ── Analyse photo with Claude vision ──────────────────────────────────────
  const analyzePhoto = async (base64jpeg) => {
    setPhotoCaption({ loading:true, result:null, error:"" });
    try {
      const data = { content: [{ text: await callAi({ task: 'caption', system: `You are a travel memory writer. Analyse the photo and return ONLY valid JSON — no markdown.
Shape:
{
  "title": "evocative place or moment title, max 7 words — specific and poetic",
  "mood":  "single emoji capturing the atmosphere or emotion",
  "notes": "vivid 2–3 sentence first-person present-tense journal entry. Start mid-scene without 'I' or 'The photo'. Be sensory: describe light, smell, sound, feeling. If you can identify the location, weave it in naturally."
}
Rules: title should feel like a chapter heading, not a description. mood must match the visual atmosphere. notes should make the reader feel present.`, messages: [{
            role: "user",
            content: [
              { type:"image", source:{ type:"base64", media_type:"image/jpeg", data: base64jpeg.split(",")[1] } },
              { type:"text",  text:"Analyse this travel photo and return the caption JSON." }
            ]
          }], maxTokens: 500 }) }] };
      const raw  = (data.content?.[0]?.text || "{}").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);
      if (!parsed.title) throw new Error("empty");
      setPhotoCaption({ loading:false, result:parsed, error:"" });
    } catch {
      setPhotoCaption({ loading:false, result:null, error:"Couldn't read the photo. You can still caption it manually." });
    }
  };

  const acceptCaption = () => {
    if (!photoCaption.result) return;
    const r = photoCaption.result;
    setForm(f => ({
      ...f,
      title: r.title || f.title,
      mood:  MOODS.includes(r.mood) ? r.mood : f.mood,
      notes: r.notes || f.notes,
    }));
    setPhotoCaption({ loading:false, result:null, error:"" });
  };
  const [enhancing, setEnhancing]         = useState({});      // {[id]: {loading, result}}
  const [story, setStory]                 = useState({loading:false, text:""});
  const [showStory, setShowStory]         = useState(false);

  // ── Claude helper ──────────────────────────────────────────────────────────
  const callClaude = async (system, userMsg, maxTokens=600) => {
    const d = { content: [{ text: await callAi({ task: 'tip', system: undefined, messages: [{role:"user",content:userMsg}], maxTokens: 1000 }) }] };
    return d.content?.[0]?.text || "";
  };

  // ── 1. Generate memory note from location + mood ──────────────────────────
  const generateMemoryNote = async () => {
    const place = form.title || form.locationName;
    if (!place) return;
    setGenLoading(true);
    setGenSuggestion(null);
    try {
      const raw = await callClaude(
        `You are a travel journal writer. Return ONLY valid JSON, no markdown.
Shape: {"title":"catchy place title (max 6 words)","mood":"single emoji that fits","notes":"vivid 2–3 sentence journal entry written in first person, present tense, sensory detail"}
Rules: notes must be immersive, specific to the place, and evocative. Do not start with "I". No generic phrases.`,
        `Place: ${place}
Location: ${form.locationName || "unknown"}
Date: ${form.date}
Current mood emoji: ${form.mood}
Trip destination: ${trip.destination || "unknown"}
User's rough notes (may be empty): ${form.notes}
Generate a rich memory entry.`
      );
      const cleaned = raw.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(cleaned);
      setGenSuggestion(parsed);
    } catch { setGenSuggestion({notes:"Could not generate — check your connection.", mood:form.mood, title:form.title}); }
    setGenLoading(false);
  };

  const acceptSuggestion = () => {
    if (!genSuggestion) return;
    setForm(f=>({ ...f,
      title: genSuggestion.title || f.title,
      mood:  genSuggestion.mood  || f.mood,
      notes: genSuggestion.notes || f.notes,
    }));
    setGenSuggestion(null);
  };

  // ── 2. Enhance an existing memory card ────────────────────────────────────
  const enhanceMemory = async (mem) => {
    setEnhancing(p=>({...p,[mem.id]:{loading:true,result:null}}));
    try {
      const enhanced = await callClaude(
        `You are a gifted travel writer. Take the raw memory details and write a beautiful, vivid journal entry (3–5 sentences, first person). Be poetic but grounded in the specific place. Do NOT add fictional facts. Return ONLY the journal text — no headings, no JSON.`,
        `Place: ${mem.title}
Location: ${mem.locationName}
Date: ${mem.date}
Mood: ${mem.mood}
Original notes: ${mem.notes || "(none — write from place knowledge)"}

Write an enhanced journal entry for this memory.`
      , 400);
      setEnhancing(p=>({...p,[mem.id]:{loading:false,result:enhanced.trim()}}));
    } catch { setEnhancing(p=>({...p,[mem.id]:{loading:false,result:"⚠️ Could not enhance. Try again."}})); }
  };

  const acceptEnhancement = (mem) => {
    const enhanced = enhancing[mem.id]?.result;
    if (!enhanced) return;
    updateMemory({...mem, notes: enhanced});
    setEnhancing(p=>({...p,[mem.id]:{loading:false,result:null}}));
  };

  const dismissEnhancement = (id) => setEnhancing(p=>({...p,[id]:{loading:false,result:null}}));

  // ── 3. Weave all memories into a travel story ─────────────────────────────
  const generateStory = async () => {
    if (memories.length < 2) return;
    setStory({loading:true, text:""});
    setShowStory(true);
    try {
      const memSummaries = [...memories].sort((a,b)=>a.date.localeCompare(b.date))
        .map(m=>`• ${m.date} | ${m.mood} ${m.title} @ ${m.locationName||"unknown location"}: ${m.notes||"(no notes)"}`)
        .join("\n");
      const text = await callClaude(
        `You are a travel memoirist. Given a traveller's pinned memories, weave them into a cohesive, beautifully written travel story in first person. Use narrative prose — no bullet points or headers. Include sensory detail, emotion, and a sense of journey. 300–450 words.`,
        `Trip: ${trip.name||"My Trip"}${trip.destination?" to "+trip.destination:""}
Memories (chronological):
${memSummaries}

Write the travel story.`
      , 800);
      setStory({loading:false, text:text.trim()});
    } catch { setStory({loading:false, text:"⚠️ Could not generate story. Check your connection and try again."}); }
  };

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!mapRef.current || leafletMap.current) return;
    /* L from leaflet */
    const map = L.map(mapRef.current, { zoomControl:true, attributionControl:false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom:19 }).addTo(map);
    map.setView([20, 0], 2);
    leafletMap.current = map;
    map.on("click", (e)=>{
      const {lat,lng} = e.latlng;
      if(pendingMarkerRef.current){ pendingMarkerRef.current.remove(); pendingMarkerRef.current=null; }
      const pIcon = L.divIcon({ className:"", html:`<div style="width:22px;height:22px;background:#FFA828;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(255,168,40,0.3);animation:pulse 1s infinite;"></div>`, iconSize:[22,22], iconAnchor:[11,11] });
      pendingMarkerRef.current = L.marker([lat,lng],{icon:pIcon}).addTo(map);
      setGenSuggestion(null);
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json`)
        .then(r=>r.json()).then(d=>{
          const loc = d.address?[d.address.city||d.address.town||d.address.village,d.address.country].filter(Boolean).join(", "):"";
          const name = d.name||d.address?.tourism||d.address?.amenity||loc||"";
          setPinForm({lat,lng,locationName:loc});
          setForm(f=>({...f,locationName:loc,title:name||loc||"",date:new Date().toISOString().split("T")[0],notes:"",photo:null}));
        }).catch(()=>{ setPinForm({lat,lng,locationName:""}); setForm(f=>({...f,locationName:"",title:"",date:new Date().toISOString().split("T")[0],notes:"",photo:null})); });
    });
    return ()=>{ map.remove(); leafletMap.current=null; };
  },[]);

  // ── Render markers ─────────────────────────────────────────────────────────
  useEffect(()=>{
    /* L from leaflet */
    if(!leafletMap.current) return;
    const map = leafletMap.current;
    Object.values(markersRef.current).forEach(m=>m.remove());
    markersRef.current = {};
    memories.forEach(mem=>{
      const icon = L.divIcon({
        className:"",
        html:`<div style="display:flex;flex-direction:column;align-items:center">
          <div style="font-size:18px;line-height:1">${mem.mood}</div>
          <div style="width:12px;height:12px;background:#FFA828;border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>
        </div>`,
        iconSize:[30,36], iconAnchor:[15,36], popupAnchor:[0,-38]
      });
      const m = L.marker([mem.lat,mem.lng],{icon}).addTo(map);
      m.bindPopup(`<div class="popup-title">${mem.mood} ${mem.title}</div><div class="popup-meta">📍 ${mem.locationName||""}${mem.locationName?" · ":""}${mem.date}</div>${mem.notes?`<div class="popup-notes">${mem.notes.slice(0,120)}${mem.notes.length>120?"…":""}</div>`:""}`);
      markersRef.current[mem.id] = m;
    });
    if(memories.length>0){ try{ leafletMap.current.fitBounds(memories.map(m=>[m.lat,m.lng]),{padding:[40,40],maxZoom:12}); }catch{} }
  },[memories]);

  // ── Photo handler ──────────────────────────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0]; if(!file) return;
    setPhotoCaption({ loading:false, result:null, error:"" }); // clear old caption
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(600/img.width,600/img.height,1);
        canvas.width=img.width*ratio; canvas.height=img.height*ratio;
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        const b64 = canvas.toDataURL("image/jpeg",0.75);
        setForm(f=>({...f,photo:b64}));
        analyzePhoto(b64); // 🔍 auto-analyse with Claude vision
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if(!form.title.trim()||!pinForm) return;
    addMemory({id:Date.now(),lat:pinForm.lat,lng:pinForm.lng,locationName:form.locationName||"",title:form.title.trim(),date:form.date,mood:form.mood,notes:form.notes.trim(),photo:form.photo});
    if(pendingMarkerRef.current){pendingMarkerRef.current.remove();pendingMarkerRef.current=null;}
    setPinForm(null);
    setGenSuggestion(null);
    setPhotoCaption({ loading:false, result:null, error:"" });
    setForm({title:"",date:new Date().toISOString().split("T")[0],mood:"😍",notes:"",photo:null,locationName:""});
  };

  const handleCancel = () => {
    if(pendingMarkerRef.current){pendingMarkerRef.current.remove();pendingMarkerRef.current=null;}
    setPinForm(null); setGenSuggestion(null);
    setForm(f=>({...f,photo:null,notes:"",title:""}));
  };

  return (
    <div>
      {/* Map */}
      <div className="card" style={{padding:0,overflow:"hidden",borderRadius:18}}>
        <div id="travel-map" ref={mapRef} />
      </div>
      <div className="map-hint">📍 Tap anywhere on the map to drop a memory pin</div>

      {/* Journal header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"14px 0 10px"}}>
        <div className="card-title" style={{marginBottom:0}}>📖 Memory Journal</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div className="progress-pill">✨ {memories.length}</div>
          {memories.length >= 2 && (
            <button className="ai-gen-btn" onClick={generateStory} disabled={story.loading}>
              {story.loading
                ? <span className="dots"><span>·</span><span>·</span><span>·</span></span>
                : "📖 Story"}
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {memories.length===0 ? (
        <div className="empty" style={{paddingTop:24}}>
          <div className="empty-icon">🗺️</div>
          <div className="empty-msg">Tap the map to drop your first memory pin.<br/>Your journey starts with one step!</div>
        </div>
      ) : (
        <div className="timeline">
          {[...memories].sort((a,b)=>b.date.localeCompare(a.date)).map(mem=>{
            const enh = enhancing[mem.id] || {};
            return (
              <div key={mem.id} className="memory-card">
                <div className="mem-header">
                  <div className="mem-mood">{mem.mood}</div>
                  <div className="mem-info">
                    <div className="mem-title">{mem.title}</div>
                    <div className="mem-meta">
                      {mem.locationName&&<span>📍 {mem.locationName} · </span>}
                      <span>🗓️ {mem.date}</span>
                    </div>
                  </div>
                  <button className="btn-del" onClick={()=>deleteMemory(mem.id)}>✕</button>
                </div>

                {mem.notes&&<div className="mem-notes">{mem.notes}</div>}
                {mem.photo&&<img className="mem-photo" src={mem.photo} alt="Memory" />}

                {/* Enhance result */}
                {enh.result && (
                  <div>
                    <div style={{fontSize:10,color:"var(--amber)",fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginTop:10,marginBottom:4}}>✨ AI Enhanced</div>
                    <div className="enhance-result">{enh.result}</div>
                    <div className="enhance-actions">
                      <button className="btn btn-sm" onClick={()=>acceptEnhancement(mem)}>Accept & Replace</button>
                      <button className="btn-ghost" style={{fontSize:11}} onClick={()=>dismissEnhancement(mem.id)}>Discard</button>
                    </div>
                  </div>
                )}

                <div className="mem-coords">
                  <span>🌐</span>
                  <span>{mem.lat.toFixed(4)}°, {mem.lng.toFixed(4)}°</span>
                  <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                    <button className="ai-gen-btn" disabled={enh.loading}
                      onClick={()=>enhanceMemory(mem)}
                      style={{fontSize:10,padding:"3px 9px"}}>
                      {enh.loading?<span className="dots"><span>·</span><span>·</span><span>·</span></span>:"✨ Enhance"}
                    </button>
                    <button className="btn-ghost" style={{fontSize:10,padding:"3px 9px"}}
                      onClick={()=>{ if(leafletMap.current) leafletMap.current.flyTo([mem.lat,mem.lng],13,{duration:1.2}); window.scrollTo({top:0,behavior:"smooth"}); }}>
                      Map
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pin drop form overlay ── */}
      {pinForm&&(
        <div className="pin-form-overlay" onClick={e=>e.target===e.currentTarget&&handleCancel()}>
          <div className="pin-form" style={{overflowY:"auto",maxHeight:"90vh"}}>
            <div className="pin-form-title">📍 Add Memory Pin</div>

            {/* AI Generate bar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:12,color:"var(--text-dim)"}}>
                {form.locationName||form.title ? `📍 ${form.locationName||form.title}` : "Drop a pin to get started"}
              </div>
              <button className="ai-gen-btn" disabled={genLoading||(!form.title&&!form.locationName)}
                onClick={generateMemoryNote}>
                {genLoading
                  ? <span className="dots"><span>·</span><span>·</span><span>·</span></span>
                  : "✨ AI Generate"}
              </button>
            </div>

            {/* AI suggestion preview */}
            {genSuggestion && (
              <div className="gen-suggestion-bar">
                <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"center"}}>
                  <strong>{genSuggestion.mood} {genSuggestion.title}</strong>
                </div>
                <div style={{fontSize:12,lineHeight:1.7}}>{genSuggestion.notes}</div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button className="btn btn-sm" onClick={acceptSuggestion}>Use this ✓</button>
                  <button className="btn-ghost" style={{fontSize:11}} onClick={()=>setGenSuggestion(null)}>Discard</button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-8">
              <input className="input" placeholder="What's this place?" maxLength={60}
                value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
              <input className="input" placeholder="Location (auto-detected)" maxLength={80}
                value={form.locationName} onChange={e=>setForm(f=>({...f,locationName:e.target.value}))} />

              <div className="grid-2">
                <div><div className="card-title-small">Date</div>
                  <input type="date" className="input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></div>
                <div><div className="card-title-small">Mood</div>
                  <div className="mood-row">{MOODS.slice(0,6).map(m=>(
                    <button key={m} className={`mood-btn${form.mood===m?" on":""}`} onClick={()=>setForm(f=>({...f,mood:m}))}>{m}</button>
                  ))}</div>
                </div>
              </div>
              <div className="mood-row">{MOODS.slice(6).map(m=>(
                <button key={m} className={`mood-btn${form.mood===m?" on":""}`} onClick={()=>setForm(f=>({...f,mood:m}))}>{m}</button>
              ))}</div>

              <textarea className="input" placeholder="Jot a few words… or tap ✨ AI Generate above to let AI write it for you" rows={3}
                value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />

              <div className="photo-upload-area">
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
                {form.photo
                  ? <div style={{position:"relative"}}>
                      <img className="photo-preview" src={form.photo} alt="Preview" />
                      {/* Scanning overlay while analysing */}
                      {photoCaption.loading && (
                        <div style={{position:"absolute",inset:0,background:"rgba(7,16,31,0.55)",
                          borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
                          flexDirection:"column",gap:8}}>
                          <div style={{width:"60%",height:2,background:"linear-gradient(90deg,transparent,#4DB87A,transparent)",
                            animation:"scanLine 1.3s ease-in-out infinite"}}/>
                          <div style={{fontSize:11,color:"#4DB87A",fontWeight:600}}>Analysing photo…</div>
                        </div>
                      )}
                    </div>
                  : <div className="photo-upload-label">📷 Tap to attach a photo — Claude will caption it</div>}
              </div>

              {/* ── AI Caption Result ── */}
              {(photoCaption.loading || photoCaption.result || photoCaption.error) && (
                <div className="photo-caption-card">
                  {/* Loading */}
                  {photoCaption.loading && (
                    <div className="photo-caption-analyzing">
                      <div className="photo-caption-scan"/>
                      <span className="dots"><span>·</span><span>·</span><span>·</span></span>
                      <span>Claude is reading your photo…</span>
                    </div>
                  )}

                  {/* Error */}
                  {!photoCaption.loading && photoCaption.error && (
                    <div className="photo-caption-err">⚠️ {photoCaption.error}</div>
                  )}

                  {/* Result */}
                  {!photoCaption.loading && photoCaption.result && (() => {
                    const r = photoCaption.result;
                    return (
                      <>
                        <div className="photo-caption-body">
                          <div className="photo-caption-hdr">
                            <span style={{fontSize:14}}>✨</span>
                            <div className="photo-caption-lbl">AI Caption Suggestion</div>
                            {r.mood && <div className="photo-caption-mood">{r.mood}</div>}
                          </div>
                          {r.title && (
                            <div className="photo-caption-field">
                              <div className="photo-caption-field-key">Title</div>
                              <div className="photo-caption-field-val" style={{fontWeight:600}}>{r.title}</div>
                            </div>
                          )}
                          {r.notes && (
                            <div className="photo-caption-field">
                              <div className="photo-caption-field-key">Description</div>
                              <div className="photo-caption-field-val">{r.notes}</div>
                            </div>
                          )}
                        </div>
                        <div className="photo-caption-actions">
                          <button className="btn flex-1" onClick={acceptCaption}
                            style={{fontSize:12,padding:"8px 12px"}}>
                            Use this ✓
                          </button>
                          <button className="btn-ghost" style={{fontSize:12,padding:"7px 12px"}}
                            onClick={()=>setPhotoCaption({loading:false,result:null,error:""})}>
                            Discard
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex gap-8 mt-12">
              <button className="btn-ghost flex-1" onClick={handleCancel} style={{textAlign:"center"}}>Cancel</button>
              <button className="btn flex-1" onClick={handleSave} disabled={!form.title.trim()}>Save Memory ✨</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Travel Story Modal ── */}
      {showStory&&(
        <div className="story-overlay" onClick={e=>e.target===e.currentTarget&&setShowStory(false)}>
          <div className="story-sheet">
            <div className="story-header">
              <div className="story-title">📖 {trip.name||"My Travel Story"}</div>
              <button className="btn-del" style={{fontSize:20}} onClick={()=>setShowStory(false)}>✕</button>
            </div>
            <div className="story-body">
              {story.loading
                ? <div style={{textAlign:"center",paddingTop:40}}>
                    <div style={{fontSize:32,marginBottom:12}}>✍️</div>
                    <div style={{color:"var(--text-dim)",fontSize:13}}>
                      Weaving your memories into a story<span className="dots"><span>·</span><span>·</span><span>·</span></span>
                    </div>
                  </div>
                : story.text
              }
            </div>
            {!story.loading&&story.text&&(
              <div className="story-footer">
                <button className="btn btn-full" onClick={generateStory}>🔄 Regenerate</button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 4px rgba(255,168,40,0.3)} 50%{box-shadow:0 0 0 8px rgba(255,168,40,0.1)} }
      `}</style>
    </div>
  );
}

// ── Packing templates library ─────────────────────────────────────────────────
export const PACKING_TEMPLATES = [
  {
    id:"beach", emoji:"🏖️", name:"Beach Vacation", desc:"Sun, sand and sea essentials",
    items:{
      "📄 Documents":["Travel insurance","Hotel confirmation","Passport"],
      "👕 Clothing":["Swimsuit (x2)","Beach cover-up","Flip flops","Sandals","Shorts (x3)","Light sundress / shirt","Sun hat","Sunglasses"],
      "🧴 Toiletries":["High-SPF sunscreen","After-sun lotion","Lip balm with SPF","Insect repellent","Reef-safe sunscreen"],
      "🎒 Essentials":["Beach bag","Dry bag","Snorkel set","Waterproof phone pouch","Reusable water bottle","Beach towel"],
      "🔌 Electronics":["Waterproof camera","Portable charger"],
      "💊 Health":["Antihistamines","Blister plasters","Oral rehydration sachets"],
    }
  },
  {
    id:"ski", emoji:"⛷️", name:"Ski Holiday", desc:"On-piste and après-ski gear",
    items:{
      "📄 Documents":["Travel insurance (winter sports)","Ski pass booking","Hotel confirmation","Medical card"],
      "👕 Clothing":["Thermal base layer top (x2)","Thermal base layer bottoms (x2)","Ski jacket","Ski trousers","Fleece mid-layer","Wool socks (x4)","Ski gloves","Balaclava","Neck gaiter","Warm après-ski outfit","Casual evening wear"],
      "🧴 Toiletries":["High-SPF lip balm","SPF 50 face sunscreen","Moisturiser (cold weather)","Hand cream"],
      "🎒 Essentials":["Ski helmet","Ski goggles","Boot bag","Lock for skis","Hand warmers","Backpack for piste"],
      "🔌 Electronics":["GoPro + chest mount","Spare batteries (cold drains fast)","Portable charger","Earphones"],
      "💊 Health":["Ibuprofen / muscle rub","Blister plasters","Altitude sickness tablets (if high resort)"],
    }
  },
  {
    id:"business", emoji:"💼", name:"Business Travel", desc:"Sharp, efficient and carry-on only",
    items:{
      "📄 Documents":["Passport / ID","Business cards","Meeting agenda printouts","Expense receipts folder","Travel insurance","Visa (if required)"],
      "👕 Clothing":["Business suit / blazer","Dress shirts / blouses (x3)","Formal trousers / skirt","Smart shoes","Belt","Casual change of clothes","Workout gear","Ties / accessories"],
      "🧴 Toiletries":["Travel-size toiletries bag","Cologne / perfume","Shoe polish wipes","Lint roller"],
      "🎒 Essentials":["Laptop bag / briefcase","Padlock for luggage","Travel adapter (universal)","Notebook + pen","Business card holder"],
      "🔌 Electronics":["Laptop + charger","Phone + charger","Power bank","Presentation clicker","HDMI adapter","Noise-cancelling headphones","International SIM / eSIM"],
      "💊 Health":["Melatonin (jet lag)","Paracetamol","Eye drops","Hand sanitiser"],
    }
  },
  {
    id:"hiking", emoji:"🥾", name:"Hiking Trip", desc:"Day hikes to multi-day treks",
    items:{
      "📄 Documents":["National park permit","Trail maps (printed)","Emergency contacts","Travel insurance","ID"],
      "👕 Clothing":["Moisture-wicking hiking shirt (x3)","Hiking trousers","Convertible zip-off trousers","Thermal layer","Waterproof jacket","Hiking socks (x4)","Merino wool underwear","Gaiters","Buff / neck gaiter","Sun hat","Warm beanie"],
      "🧴 Toiletries":["Biodegradable soap","SPF 50 sunscreen","Insect repellent","Trowel (backcountry)","Toilet paper (sealed bag)"],
      "🎒 Essentials":["Hiking boots (broken in)","Trekking poles","Headtorch + spare batteries","Compass","Whistle","Survival blanket","Water filter / purification tabs","Blister kit","First aid kit","Carabiner clips","Dry bags"],
      "🔌 Electronics":["GPS device / downloaded offline maps","Satellite communicator","Solar power bank","Camera"],
      "💊 Health":["Blister plasters","Ibuprofen","DEET insect repellent","Altitude tablets","Antihistamines","Moleskin patches"],
      "🍎 Food & Drink":["High-energy trail snacks","Electrolyte tablets","Water bottles (x2 — 1L each)","Portable water filter"],
    }
  },
  {
    id:"camping", emoji:"⛺", name:"Camping", desc:"Car camping and festival essentials",
    items:{
      "📄 Documents":["Campsite booking confirmation","National park pass","Emergency contacts"],
      "👕 Clothing":["Warm layers","Waterproof jacket","Quick-dry trousers","Camp shoes / sandals","Thermal socks (x4)","Beanie","Gloves"],
      "🧴 Toiletries":["Biodegradable soap + shampoo","Dry shampoo","Wet wipes","Toothbrush + toothpaste","SPF sunscreen","Insect repellent"],
      "🎒 Essentials":["Tent + groundsheet","Sleeping bag (rated for temp)","Sleeping mat / inflatable pad","Camp chair / stool","Headtorch + spare batteries","Lighter + matches","Multi-tool / pocket knife","Rope + clothes line","Dustbin bags","Duct tape"],
      "🔌 Electronics":["Solar lantern","Power bank (large)","Bluetooth speaker","Car charger"],
      "💊 Health":["Full first aid kit","After-bite cream","Antihistamines","Blister plasters"],
      "🍎 Food & Drink":["Camp stove + fuel canister","Cookset (pot + pan + utensils)","Plates + cups + cutlery","Can opener","Cooler box + ice packs","Reusable water bottles","Coffee / tea supplies","Non-perishable staples"],
    }
  },
  {
    id:"dive", emoji:"🤿", name:"Dive Trip", desc:"Scuba & snorkelling adventure",
    items:{
      "📄 Documents":["PADI / dive certification card","Dive log book","Travel + dive insurance","Medical fitness declaration","Passport"],
      "👕 Clothing":["Rash guard (x2)","Boardshorts / bikini (x3)","Quick-dry towel","Wetsuit (if not renting)","Light evening wear","Sandals / flip flops"],
      "🧴 Toiletries":["Reef-safe sunscreen","After-sun lotion","Ear drops (swimmer's ear)","Anti-fog solution for mask"],
      "🎒 Essentials":["Dive mask (personal fit)","Snorkel","Fins","Surface marker buoy (SMB)","Dive knife / shears","Dive light","Underwater slate","Mesh bag","Waterproof dry bag","Dive computer"],
      "🔌 Electronics":["Underwater camera / GoPro","Waterproof housing","Spare SD cards","Charging cables"],
      "💊 Health":["Motion sickness tablets","Decongestants","Antihistamines","Sunburn relief","Diarrhoea tablets (travel gut issues)"],
    }
  },
  {
    id:"backpacking", emoji:"🎒", name:"Backpacking", desc:"Long-haul budget travel, light and flexible",
    items:{
      "📄 Documents":["Passport (+ 2 photocopies)","Visa(s)","Travel insurance","Yellow fever certificate (if needed)","Hostel bookings","Emergency contacts"],
      "👕 Clothing":["T-shirts (x3 — quick dry)","Merino wool long-sleeve","Lightweight trousers (x2)","Shorts","Underwear (x5 — merino)","Socks (x4)","Light packable rain jacket","Packable down jacket","Flip flops","Comfortable walking shoes"],
      "🧴 Toiletries":["Solid shampoo bar","Travel toothbrush","Wet wipes","Microfibre towel","Menstrual products / travel toiletries","Laundry sheets"],
      "🎒 Essentials":["Backpack (40–50L)","Daypack (20L foldable)","Padlocks (x2)","Cable lock","Packing cubes","Sleeping bag liner","Money belt / hidden wallet","Travel neck pillow","Earplugs","Eye mask"],
      "🔌 Electronics":["Universal travel adapter","Power bank (20000mAh)","SIM unlock phone / international eSIM","Laptop or tablet + charger","Earphones"],
      "💊 Health":["Full first aid kit","Diarrhoea tablets","Rehydration sachets","Antimalarials (if needed)","Altitude tablets","Insect repellent","Water purification tablets"],
    }
  },
  {
    id:"safari", emoji:"🦁", name:"Safari", desc:"Wildlife and bush adventure",
    items:{
      "📄 Documents":["Passport","Visa","Safari booking confirmation","Travel + medical insurance","Yellow fever certificate","Emergency contacts"],
      "👕 Clothing":["Neutral / khaki shirts (x4 — no white)","Long-sleeve shirts (sun + insects)","Lightweight trousers (x2)","Shorts","Warm fleece (cold mornings)","Windproof jacket","Sturdy walking shoes","Sandals","Wide-brim sun hat","Buff / scarf"],
      "🧴 Toiletries":["High-DEET insect repellent","SPF 50 sunscreen","Unscented toiletries (wildlife)","Aloe vera gel","Hand sanitiser"],
      "🎒 Essentials":["Binoculars (8x42 recommended)","Headtorch","Dust-proof bag for camera","Field guidebook","Reusable water bottle","Dry bag for valuables"],
      "🔌 Electronics":["Camera with telephoto lens (200mm+)","Extra memory cards","Dust-proof camera bag","Power bank","Spare batteries","Laptop for photo backup"],
      "💊 Health":["Antimalarials","DEET repellent","Antihistamines","Antibiotic prescription (bush emergency)","Imodium / rehydration","Water purification tablets"],
    }
  },
  {
    id:"cruise", emoji:"🚢", name:"Cruise", desc:"Ocean liner comfort and port days",
    items:{
      "📄 Documents":["Passport","Cruise booking confirmation + luggage tags","Travel insurance","Loyalty card / sea pass","Visa for ports","Credit card (no foreign fees)"],
      "👕 Clothing":["Smart casual eveningwear (x3)","Formal night outfit","Daywear for ports (x4)","Swimsuit (x2)","Cover-up / sarong","Comfortable walking shoes for ports","Formal shoes","Sandals","Light cardigan (ship AC is strong)","Sun hat"],
      "🧴 Toiletries":["Sunscreen","Seasickness bands / patches","Travel shampoo + conditioner","Magnets (cabin organisation hack)","Power strip (no surge protection required)"],
      "🎒 Essentials":["Small day bag for port excursions","Lanyard for sea pass card","Refillable water bottle","Tote bag for shopping","Snorkel (for beach stops)","Tide chart / port maps"],
      "🔌 Electronics":["Power bank","Camera + underwater case","Laptop or tablet","Adapter (ship sockets vary)","Earphones"],
      "💊 Health":["Seasickness tablets","Antihistamines","Hand sanitiser","Aftersun","Blister plasters (port walking)"],
    }
  },
  {
    id:"wedding", emoji:"💍", name:"Wedding / Formal Event", desc:"Destination weddings and black-tie travel",
    items:{
      "📄 Documents":["Passport","Wedding invitation / dress code","Hotel confirmation","Travel insurance","Guest gift"],
      "👕 Clothing":["Main formal outfit (suit / dress)","Backup smart outfit","Ceremony shoes","Dancing shoes / flats","Accessories (jewellery, tie, cufflinks)","Stain remover pen","Garment bag","Sewing kit (emergency repairs)","Light cover-up for travel","Casual change of clothes"],
      "🧴 Toiletries":["Full grooming kit","Perfume / cologne","Makeup bag","Hair tools","Nail kit","Whitening strips","Dry shampoo","Stain remover wipes"],
      "🎒 Essentials":["Gift / gift card","Card","Confetti (check if allowed)","Small clutch / evening bag","Steamer / wrinkle spray for outfit"],
      "🔌 Electronics":["Camera / phone charged","Portable charger","Travel adapter","Bluetooth earphones"],
      "💊 Health":["Paracetamol / ibuprofen","Antacids (rich food)","Plasters (new shoes)","Eye drops","Antihistamines"],
    }
  },
];

// ── Standalone packing builder ─────────────────────────────────────────────
