import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { LS } from '../../lib/storage';
import { EXPENSE_CATS, CURRENCIES, countryFlag } from '../../lib/constants';
import { callAi } from '../../lib/ai';
import { compressImage, processFiles, isImage } from '../../lib/attachments';
import { AttachStrip } from '../shared/AttachStrip';
import { ViewerModal } from '../shared/ViewerModal';
export function BudgetTab({ totalBudget, saveBudget, baseCurrency, saveBaseCurrency, expenses, saveExpenses, people, savePeople, docs, saveDocs, dailyBudget, saveDailyBudget, notifPerm, requestNotifPermission, geoDetectEnabled, saveGeoDetectEnabled, geoChecking, onDetectNow }) {

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput,   setBudgetInput]   = useState(String(totalBudget));
  const [newPerson,     setNewPerson]     = useState("");
  const [ratesCache,    setRatesCache]    = useState({});
  const [activeTab,     setActiveTab]     = useState("add");

  const EMPTY_EXP = { desc:"", amount:"", currency:baseCurrency, cat:EXPENSE_CATS[0], paidBy:"Me", splitEnabled:false, splitWith:[], customSplit:{} };
  const [form,             setForm]             = useState(EMPTY_EXP);
  const [converting,       setConverting]       = useState(false);
  const [convertedPreview, setConvertedPreview] = useState(null);

  const PALETTE = ["#FFA828","#4DB87A","#5BA4FF","#E870FF","#FF6B6B","#FFD166","#06D6A0","#F78C6B"];
  const personColor = (name) => PALETTE[Math.abs([...name].reduce((h,c)=>h*31+c.charCodeAt(0),0)) % PALETTE.length];
  const allPeople = ["Me", ...people.map(p=>p.name)];

  const getRate = async (from, to) => {
    if (from===to) return 1;
    const key=`${from}_${to}`;
    if (ratesCache[key]) return ratesCache[key];
    try {
      const data = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`).then(r=>r.json());
      const rate = data.rates[to];
      setRatesCache(p=>({...p,[key]:rate}));
      return rate;
    } catch { return null; }
  };

  useEffect(()=>{
    setConvertedPreview(null);
    if (!form.amount||form.currency===baseCurrency) return;
    let cancelled=false; setConverting(true);
    getRate(form.currency,baseCurrency).then(rate=>{
      if(cancelled) return; setConverting(false);
      if(rate) setConvertedPreview({rate, amtBase:Number(form.amount)*rate});
    });
    return ()=>{cancelled=true;};
  },[form.amount,form.currency,baseCurrency]);

  const addExpense = async () => {
    if(!form.desc.trim()||!form.amount) return;
    const originalAmount=Number(form.amount);
    let amtBase=originalAmount, usedRate=1;
    if(form.currency!==baseCurrency){
      const rate=await getRate(form.currency,baseCurrency);
      if(rate){amtBase=originalAmount*rate; usedRate=rate;}
    }
    let splits=null;
    if(form.splitEnabled&&form.splitWith.length>0){
      const participants=[...new Set([form.paidBy,...form.splitWith])];
      splits=participants.map(name=>({name, amtBase:amtBase/participants.length}));
    }
    const expId = Date.now();
    // Build attachments from scanned receipt if present
    const receiptAtts = form.receiptImage
      ? [{ id: expId+"_r", data: form.receiptImage, type:"image/jpeg", name:"Receipt.jpg", uploadedAt:new Date().toISOString() }]
      : [];
    saveExpenses([...expenses,{
      id:expId, desc:form.desc.trim(), cat:form.cat,
      originalAmount, currency:form.currency, amtBase, usedRate,
      paidBy:form.paidBy, splits,
      attachments: receiptAtts,
      date:new Date().toLocaleDateString(),
      dateISO: new Date().toISOString().split("T")[0],
    }]);
    // Auto-save receipt to docs vault
    if(receiptAtts.length) {
      saveDocs([...(docs||[]), {
        ...receiptAtts[0], cat:"receipt",
        name: `Receipt — ${form.desc.trim()}`,
        linkedTo:"expense", linkedId:String(expId),
      }]);
    }
    setForm({...EMPTY_EXP, currency:form.currency, paidBy:form.paidBy});
    setConvertedPreview(null);
  };

  const spent=expenses.reduce((s,e)=>s+(e.amtBase??Number(e.amount)),0);
  const remaining=totalBudget-spent;
  const over=spent>totalBudget;
  const pct=totalBudget>0?Math.min(100,Math.round((spent/totalBudget)*100)):0;
  const barColor=pct>85?"linear-gradient(90deg,#FF5C5C,#C93030)":pct>60?"linear-gradient(90deg,#FFB347,#E07C00)":"linear-gradient(90deg,#4DB87A,#2D9E5A)";
  const catBreakdown=EXPENSE_CATS.map(cat=>({cat,total:expenses.filter(e=>e.cat===cat).reduce((s,e)=>s+(e.amtBase??Number(e.amount)),0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  // Balance sheet
  const balanceNet={};
  const initP=(n)=>{if(balanceNet[n]===undefined)balanceNet[n]=0;};
  expenses.forEach(exp=>{
    if(!exp.splits) return;
    initP(exp.paidBy);
    exp.splits.forEach(s=>{
      if(s.name===exp.paidBy) return;
      initP(s.name);
      balanceNet[exp.paidBy]+=s.amtBase;
      balanceNet[s.name]-=s.amtBase;
    });
  });

  const simplifyDebts=()=>{
    const creditors=Object.entries(balanceNet).filter(([,v])=>v>0).map(([n,v])=>({n,v}));
    const debtors=Object.entries(balanceNet).filter(([,v])=>v<0).map(([n,v])=>({n,v:-v}));
    const txns=[]; let ci=0,di=0;
    while(ci<creditors.length&&di<debtors.length){
      const c=creditors[ci],d=debtors[di];
      const amt=Math.min(c.v,d.v);
      if(amt>0.005) txns.push({from:d.n,to:c.n,amt});
      c.v-=amt; d.v-=amt;
      if(c.v<0.005)ci++; if(d.v<0.005)di++;
    }
    return txns;
  };
  const settlements=simplifyDebts();

  const handleAddPerson=()=>{
    const name=newPerson.trim();
    if(!name||people.find(p=>p.name===name)) return;
    savePeople([...people,{id:Date.now(),name}]);
    setNewPerson("");
  };
  const toggleSplitWith=(name)=>setForm(f=>({...f,splitWith:f.splitWith.includes(name)?f.splitWith.filter(n=>n!==name):[...f.splitWith,name]}));

  const fmt=(n)=>`${baseCurrency} ${Number(n).toFixed(2)}`;
  const fmtOrig=(exp)=>exp.currency!==baseCurrency?`${exp.currency} ${Number(exp.originalAmount).toFixed(2)}`:null;
  const myShare=(exp)=>{if(!exp.splits) return exp.amtBase??Number(exp.amount); const me=exp.splits.find(s=>s.name==="Me"); return me?me.amtBase:0;};

  const [viewingAtt,    setViewingAtt]    = useState(null);
  const [viewMode,      setViewMode]      = useState("list");
  const [galleryFilter, setGalleryFilter] = useState("all");
  const [selectedExp,   setSelectedExp]   = useState(null);
  const [ocrState,   setOcrState]   = useState({ step:"idle", image:null, result:null, error:"" });
  // step: idle | compressing | analyzing | ready | error
  const ocrFileRef = useRef(null);

  // ── OCR: scan a receipt photo with Claude vision ──────────────────────────
  const scanReceipt = async (file) => {
    if (!file) return;
    setOcrState({ step:"compressing", image:null, result:null, error:"" });

    // Compress image to reasonable size for API
    const compressed = await compressImage(file);
    const base64 = compressed.data.split(",")[1]; // strip data: prefix

    setOcrState({ step:"analyzing", image:compressed.data, result:null, error:"" });

    try {
      const data = { content: [{ text: await callAi({ task: 'ocr', system: `You are a receipt OCR engine. Extract data and return ONLY valid JSON — no markdown, no extra text.
Shape:
{
  "merchant": "store/restaurant name or best guess",
  "amount": "total amount as a number string e.g. 24.50",
  "currency": "3-letter ISO code inferred from receipt symbols, language or country (e.g. USD, SGD, EUR, GBP, JPY, THB)",
  "date": "YYYY-MM-DD format if found, else today",
  "category": "one of: 🍜 Food & Drink | 🚌 Transport | 🏨 Accommodation | 🎡 Activities | 🛍️ Shopping | 💊 Health | 📱 Other",
  "items": ["line item 1", "line item 2"],
  "confidence": "high | medium | low",
  "notes": "anything unusual — split bill, tip included, etc."
}
If you can't read a field clearly, make your best inference and lower confidence. Return ONLY the JSON object.`, messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64 }
              },
              { type: "text", text: "Extract all receipt data from this image and return the JSON." }
            ]
          }], maxTokens: 600 }) }] };
      const raw  = data.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      setOcrState({ step:"ready", image:compressed.data, result:parsed, error:"" });

    } catch(e) {
      setOcrState({ step:"error", image:null, result:null,
        error: "Could not read receipt. Try a clearer photo with good lighting." });
    }
  };

  // Accept OCR result → pre-fill the form
  const acceptOcr = () => {
    const r = ocrState.result;
    if (!r) return;
    // Map OCR category to EXPENSE_CATS
    const matchedCat = EXPENSE_CATS.find(c => c === r.category) || EXPENSE_CATS[0];
    setForm(f => ({
      ...f,
      desc:     r.merchant || f.desc,
      amount:   r.amount   || f.amount,
      currency: CURRENCIES.includes(r.currency) ? r.currency : baseCurrency,
      cat:      matchedCat,
      receiptImage: ocrState.image, // attach photo to expense
    }));
    setOcrState({ step:"idle", image:null, result:null, error:"" });
  };

  // Confidence colour helper
  const confClass = c => c === "high" ? "ocr-conf-high" : c === "medium" ? "ocr-conf-mid" : "ocr-conf-low";

  // Attach a receipt to an expense
  const addReceiptToExp = (expId, attachments) => {
    saveExpenses(expenses.map(e => e.id === expId
      ? { ...e, attachments: [...(e.attachments||[]), ...attachments] }
      : e));
    // also save to docs vault with auto-link
    const newDocs = attachments.map(att => ({
      ...att, cat:"receipt", name: att.name,
      linkedTo:"expense", linkedId: String(expId),
    }));
    saveDocs([...(docs||[]), ...newDocs]);
  };

  const removeReceiptFromExp = (expId, attId) => {
    saveExpenses(expenses.map(e => e.id === expId
      ? { ...e, attachments: (e.attachments||[]).filter(a => a.id !== attId) }
      : e));
  };

  const Avatar=({name,size=26})=><div style={{width:size,height:size,borderRadius:"50%",background:name==="Me"?"rgba(255,168,40,0.2)":personColor(name)+"22",color:name==="Me"?"var(--amber)":personColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.42,fontWeight:800,flexShrink:0}}>{name.slice(0,2).toUpperCase()}</div>;

  return (
    <div>
      {/* Overview */}
      <div className="card">
        <div className="flex items-center justify-between" style={{marginBottom:10}}>
          <div className="card-title" style={{marginBottom:0}}>💰 Budget</div>
          <div className="flex gap-6 items-center">
            <select className="input" style={{width:78,padding:"4px 6px",fontSize:12}} value={baseCurrency} onChange={e=>saveBaseCurrency(e.target.value)}>
              {CURRENCIES.map(c=><option key={c}>{c}</option>)}
            </select>
            {!editingBudget
              ? <button className="btn-ghost" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>{setEditingBudget(true);setBudgetInput(String(totalBudget));}}>Edit</button>
              : <div className="flex gap-6"><input className="input" style={{width:88,padding:"5px 8px",fontSize:12}} value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} type="number"/><button className="btn btn-sm" onClick={()=>{saveBudget(Number(budgetInput)||0);setEditingBudget(false);}}>✓</button></div>
            }
          </div>
        </div>
        <div className="grid-3">
          <div className="stat-card"><div className="stat-val" style={{fontSize:17}}>{baseCurrency} {totalBudget.toLocaleString()}</div><div className="stat-lbl">Budget</div></div>
          <div className="stat-card"><div className="stat-val" style={{fontSize:17,color:over?"#FF5C5C":"var(--amber)"}}>{baseCurrency} {spent.toFixed(0)}</div><div className="stat-lbl">Spent</div></div>
          <div className="stat-card"><div className="stat-val" style={{fontSize:17,color:over?"#FF5C5C":"#4DB87A"}}>{over?"-":""}{baseCurrency} {Math.abs(remaining).toFixed(0)}</div><div className="stat-lbl">{over?"Over!":"Left"}</div></div>
        </div>
        <div className="budget-bar"><div className="budget-fill" style={{width:`${pct}%`,background:barColor}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(230,217,194,0.35)"}}>
          <span>{pct}% used</span><span>{expenses.length} expense{expenses.length!==1?"s":""}</span>
        </div>
        {/* Geo currency detection row */}
        <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:10}}>
          <div className="geo-toggle-row" style={{flex:1,padding:0}} onClick={()=>saveGeoDetectEnabled(!geoDetectEnabled)}>
            <div className={`toggle-track${geoDetectEnabled?" on":""}`}><div className="toggle-knob"/></div>
            <span style={{flex:1}}>📍 Auto-detect currency by location</span>
            {geoDetectEnabled&&LS.get("tc_geo_last_cc","")&&(
              <span style={{fontSize:12}}>{countryFlag(LS.get("tc_geo_last_cc",""))}</span>
            )}
          </div>
          {geoDetectEnabled&&(
            <button className="geo-detect-btn" disabled={geoChecking}
              onClick={()=>onDetectNow()}>
              {geoChecking
                ?<span className="dots"><span>·</span><span>·</span><span>·</span></span>
                :"Detect now"}
            </button>
          )}
        </div>
      </div>

      {/* Travellers */}
      <div className="card">
        <div className="card-title">👥 Travellers</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:10,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><Avatar name="Me" size={28}/><span style={{fontSize:12}}>Me</span></div>
          {people.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:6}}>
              <Avatar name={p.name} size={28}/><span style={{fontSize:12}}>{p.name}</span>
              <button className="btn-del" style={{fontSize:12}} onClick={()=>savePeople(people.filter(x=>x.id!==p.id))}>✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-8">
          <input className="input flex-1" style={{fontSize:12,padding:"7px 11px"}} placeholder="Add traveller…" value={newPerson}
            onChange={e=>setNewPerson(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddPerson()}/>
          <button className="btn-ghost" onClick={handleAddPerson}>Add</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["add","➕ Add"],["transactions","🧾 Log"],["balances","⚖️ Balances"],["daily","📅 Daily"]].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{flex:1,padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:10,border:"none",cursor:"pointer",
              background:activeTab===id?"var(--amber)":"rgba(255,255,255,0.05)",
              color:activeTab===id?"#07101F":"rgba(230,217,194,0.5)",transition:"all 0.15s"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ADD */}
      {activeTab==="add"&&(
        <div className="card">
          <div className="flex items-center justify-between" style={{marginBottom:12}}>
            <div className="card-title" style={{marginBottom:0}}>➕ Add Expense</div>
            {ocrState.step==="idle"&&(
              <button className="ai-gen-btn" style={{fontSize:11}} onClick={()=>ocrFileRef.current?.click()}>
                📸 Scan Receipt
              </button>
            )}
            {(ocrState.step==="compressing"||ocrState.step==="analyzing")&&(
              <div className="ai-gen-btn" style={{fontSize:11,opacity:.7,pointerEvents:"none"}}>
                <span className="dots"><span>·</span><span>·</span><span>·</span></span> Reading…
              </div>
            )}
            {(ocrState.step==="ready"||ocrState.step==="error")&&(
              <button className="btn-ghost" style={{fontSize:11,padding:"4px 10px"}}
                onClick={()=>setOcrState({step:"idle",image:null,result:null,error:""})}>
                ✕ Clear scan
              </button>
            )}
          </div>

          {/* Hidden file input for OCR */}
          <input ref={ocrFileRef} type="file" accept="image/*" capture="environment"
            style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)scanReceipt(f);e.target.value="";}}/>

          {/* ── OCR STATES ── */}

          {/* Idle: show scan zone only when form is empty */}
          {ocrState.step==="idle" && !form.desc && !form.amount && (
            <div className="ocr-scan-zone" style={{marginBottom:12}} onClick={()=>ocrFileRef.current?.click()}>
              <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e=>{const f=e.target.files[0];if(f)scanReceipt(f);e.target.value="";}}/>
              <div className="ocr-scan-icon">🧾</div>
              <div className="ocr-scan-label">Snap or upload a receipt</div>
              <div className="ocr-scan-sub">Claude reads the total, merchant, date & category automatically</div>
            </div>
          )}

          {/* Analyzing */}
          {(ocrState.step==="compressing"||ocrState.step==="analyzing")&&ocrState.image&&(
            <div className="ocr-analyzing" style={{marginBottom:12}}>
              <div className="ocr-img-strip">
                <img src={ocrState.image} alt="Receipt being scanned"/>
                <div className="ocr-scan-line"/>
              </div>
              <div className="ocr-analyzing-label">
                <span className="dots"><span>·</span><span>·</span><span>·</span></span>
                {ocrState.step==="compressing" ? "Preparing image…" : "Claude is reading your receipt…"}
              </div>
            </div>
          )}

          {/* Error */}
          {ocrState.step==="error"&&(
            <div className="ocr-error" style={{marginBottom:12}}>
              ⚠️ {ocrState.error}
              <button className="btn-ghost" style={{marginLeft:"auto",fontSize:11,padding:"3px 9px"}}
                onClick={()=>ocrFileRef.current?.click()}>Retry</button>
            </div>
          )}

          {/* OCR Result */}
          {ocrState.step==="ready"&&ocrState.result&&(
            <div className="ocr-result" style={{marginBottom:14}}>
              {ocrState.image&&<img className="ocr-result-img" src={ocrState.image} alt="Receipt"/>}
              <div className="ocr-result-body">
                <div className="ocr-result-title">
                  ✨ Receipt read
                  <span style={{fontSize:10,background:"rgba(77,184,122,0.12)",border:"1px solid rgba(77,184,122,0.25)",borderRadius:5,padding:"1px 7px",color:"#4DB87A",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
                    {ocrState.result.confidence||"—"} confidence
                  </span>
                </div>

                {[
                  {label:"Merchant", val:ocrState.result.merchant},
                  {label:"Total",    val:ocrState.result.amount ? `${ocrState.result.currency||""} ${ocrState.result.amount}` : null},
                  {label:"Date",     val:ocrState.result.date},
                  {label:"Category", val:ocrState.result.category},
                ].filter(f=>f.val).map(f=>(
                  <div key={f.label} className="ocr-field">
                    <div className="ocr-field-label">{f.label}</div>
                    <div className="ocr-field-val">{f.val}</div>
                    <div className={`ocr-field-conf ${confClass(ocrState.result.confidence)}`}/>
                  </div>
                ))}

                {ocrState.result.items?.length>0&&(
                  <div className="ocr-items-list">
                    {ocrState.result.items.slice(0,5).join(" · ")}
                    {ocrState.result.items.length>5&&` +${ocrState.result.items.length-5} more`}
                  </div>
                )}
                {ocrState.result.notes&&(
                  <div style={{fontSize:11,color:"var(--text-dim)",marginTop:6}}>💬 {ocrState.result.notes}</div>
                )}
              </div>
              <div className="ocr-result-footer">
                <button className="btn flex-1" onClick={acceptOcr}>Use this ✓</button>
                <button className="btn-ghost" style={{fontSize:12}}
                  onClick={()=>setOcrState(s=>({...s,step:"idle",result:null}))}>Edit manually</button>
              </div>
            </div>
          )}

          {/* Show attached receipt thumbnail on form when accepted */}
          {form.receiptImage&&ocrState.step==="idle"&&(
            <div style={{position:"relative",marginBottom:10}}>
              <img src={form.receiptImage} alt="Receipt"
                style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:10,border:"1px solid rgba(255,168,40,0.2)"}}/>
              <div style={{position:"absolute",top:6,right:6}}>
                <button className="btn-del" style={{background:"rgba(7,16,31,0.75)",borderRadius:6,padding:"3px 6px",fontSize:12}}
                  onClick={()=>setForm(f=>({...f,receiptImage:null}))}>✕</button>
              </div>
              <div style={{fontSize:10,color:"var(--amber)",marginTop:3}}>📎 Receipt attached</div>
            </div>
          )}

          <div className="flex flex-col gap-8">
            <select className="input" value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>
              {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="Description" value={form.desc}
              onChange={e=>setForm(f=>({...f,desc:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addExpense()}/>
            <div className="flex gap-8">
              <input className="input flex-1" type="number" placeholder="Amount" value={form.amount}
                onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
              <select className="input" style={{width:88}} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                {CURRENCIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            {form.currency!==baseCurrency&&form.amount&&(
              <div className="rate-note">
                {converting?"Fetching rate…":convertedPreview
                  ?`≈ ${baseCurrency} ${convertedPreview.amtBase.toFixed(2)}  (1 ${form.currency} = ${convertedPreview.rate.toFixed(4)} ${baseCurrency})`
                  :"Could not fetch rate"}
              </div>
            )}

            {/* Paid by */}
            <div>
              <div className="card-title-small">Paid by</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {allPeople.map(p=>(
                  <div key={p} className={`person-chip${form.paidBy===p?" on":""}`} onClick={()=>setForm(f=>({...f,paidBy:p}))}>
                    <div style={{width:16,height:16,borderRadius:"50%",background:p==="Me"?"var(--amber)":personColor(p),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#07101F",flexShrink:0}}>{p.slice(0,1)}</div>
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {/* Split */}
            {people.length>0&&(
              <>
                <div className="split-toggle" onClick={()=>setForm(f=>({...f,splitEnabled:!f.splitEnabled,splitWith:f.splitEnabled?[]:allPeople.filter(n=>n!==f.paidBy)}))}>
                  <div className={`toggle-track${form.splitEnabled?" on":""}`}><div className="toggle-knob"/></div>
                  <span style={{fontSize:13,fontWeight:500}}>Split this expense</span>
                  {form.splitEnabled&&<span style={{fontSize:11,color:"var(--text-dim)",marginLeft:"auto"}}>select who splits</span>}
                </div>
                {form.splitEnabled&&(
                  <div>
                    <div className="card-title-small">Split with</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                      {allPeople.filter(n=>n!==form.paidBy).map(p=>(
                        <div key={p} className={`person-chip${form.splitWith.includes(p)?" on":""}`} onClick={()=>toggleSplitWith(p)}>
                          <div style={{width:16,height:16,borderRadius:"50%",background:p==="Me"?"var(--amber)":personColor(p),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#07101F",flexShrink:0}}>{p.slice(0,1)}</div>
                          {p}
                        </div>
                      ))}
                    </div>
                    {form.splitWith.length>0&&(()=>{
                      const participants=[...new Set([form.paidBy,...form.splitWith])];
                      const base=convertedPreview?convertedPreview.amtBase:(Number(form.amount)||0);
                      const share=base/participants.length;
                      return (
                        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"10px 12px"}}>
                          <div style={{fontSize:11,color:"var(--text-dim)",marginBottom:8}}>Equal split — {participants.length} people · {fmt(share)} each</div>
                          {participants.map(p=>(
                            <div key={p} className="split-share-row">
                              <Avatar name={p} size={22}/>
                              <span style={{fontSize:12,flex:1}}>{p}{p===form.paidBy?" (payer)":""}</span>
                              <span style={{fontSize:12,fontWeight:600,color:"var(--amber)"}}>{fmt(share)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
            <button className="btn btn-full" onClick={addExpense} disabled={!form.desc.trim()||!form.amount||converting||ocrState.step==="analyzing"}>
              {converting?"Fetching rate…":"Add Expense"}
            </button>
          </div>
        </div>
      )}

      {/* TRANSACTIONS */}
      {activeTab==="transactions"&&(()=>{
        // ── Gallery helpers ──────────────────────────────────────────────────
        const todayISO = new Date().toISOString().split("T")[0];

        const catBgClass = (cat) => {
          if(!cat) return "cat-bg-other";
          if(cat.includes("Food"))  return "cat-bg-food";
          if(cat.includes("Trans")) return "cat-bg-trans";
          if(cat.includes("Accom")) return "cat-bg-hotel";
          if(cat.includes("Act"))   return "cat-bg-act";
          if(cat.includes("Shop"))  return "cat-bg-shop";
          if(cat.includes("Health"))return "cat-bg-health";
          return "cat-bg-other";
        };

        const isToday = (exp) => {
          if(exp.dateISO) return exp.dateISO === todayISO;
          try{ return new Date(exp.date).toISOString().split("T")[0]===todayISO; }catch{ return false; }
        };

        const firstImg = (exp) => {
          const atts = exp.attachments||[];
          return atts.find(a=>isImage(a.type));
        };

        // Build filter options from categories actually used
        const usedCats = [...new Set(expenses.map(e=>e.cat))].slice(0,5);

        // Apply filter
        const filtered = expenses.filter(exp => {
          if(galleryFilter==="photos") return !!firstImg(exp);
          if(galleryFilter==="today")  return isToday(exp);
          if(galleryFilter!=="all")    return exp.cat===galleryFilter;
          return true;
        });
        const sortedExps = [...filtered].reverse();

        return (
          <div>
            {/* Category breakdown (list mode only) */}
            {viewMode==="list"&&catBreakdown.length>0&&(
              <div className="card">
                <div className="card-title">📊 Breakdown</div>
                {catBreakdown.map(({cat,total})=>(
                  <div key={cat} style={{marginBottom:10}}>
                    <div className="flex items-center justify-between" style={{fontSize:13,marginBottom:4}}>
                      <span style={{cursor:"pointer"}} onClick={()=>{setGalleryFilter(cat);setViewMode("gallery");}}>{cat}</span>
                      <span style={{color:"var(--amber)",fontWeight:600}}>{fmt(total)}</span>
                    </div>
                    <div className="prog-track" style={{height:4}}><div className="prog-fill" style={{width:`${Math.min(100,(total/spent)*100)}%`}}/></div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              {/* Header with toggle */}
              <div className="flex items-center justify-between" style={{marginBottom:0}}>
                <div className="card-title" style={{marginBottom:0}}>
                  {viewMode==="gallery"?"📷 Receipt Gallery":"🧾 Transactions"}
                </div>
                <div className="view-toggle">
                  <button className={`vt-btn${viewMode==="list"?" active":""}`}
                    onClick={()=>setViewMode("list")} title="List view">☰</button>
                  <button className={`vt-btn${viewMode==="gallery"?" active":""}`}
                    onClick={()=>setViewMode("gallery")} title="Gallery view">⊞</button>
                </div>
              </div>

              {/* Filter chips */}
              <div className="gallery-filters">
                {[
                  {id:"all",   label:"All"},
                  {id:"photos",label:"📎 With receipts"},
                  {id:"today", label:"Today"},
                  ...usedCats.map(c=>({id:c, label:c.split(" ").slice(0,2).join(" ")})),
                ].map(f=>(
                  <div key={f.id} className={`gf-chip${galleryFilter===f.id?" on":""}`}
                    onClick={()=>setGalleryFilter(f.id)}>
                    {f.label}
                    {f.id==="all"&&<span style={{opacity:.5}}>({expenses.length})</span>}
                    {f.id==="photos"&&<span style={{opacity:.5}}>({expenses.filter(e=>firstImg(e)).length})</span>}
                  </div>
                ))}
              </div>

              {/* ── LIST VIEW ── */}
              {viewMode==="list"&&(
                sortedExps.length===0
                  ?<div className="empty" style={{padding:"24px 0"}}>
                    <div className="empty-icon">💳</div>
                    <div className="empty-msg">No expenses match this filter</div>
                  </div>
                  :sortedExps.map(exp=>{
                    const orig=fmtOrig(exp); const isSplit=!!exp.splits; const share=myShare(exp);
                    const atts=exp.attachments||[]; const img=firstImg(exp);
                    return(
                      <div key={exp.id} style={{paddingBottom:10,marginBottom:6,borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                        <div className="exp-row" style={{borderBottom:"none",paddingBottom:0}}>
                          {/* Tap thumbnail to open gallery detail */}
                          {img
                            ?<img src={img.data} alt="" style={{width:40,height:40,objectFit:"cover",borderRadius:8,cursor:"pointer",flexShrink:0}} onClick={()=>setSelectedExp(exp)}/>
                            :<div className="exp-cat" style={{cursor:"pointer"}} onClick={()=>setSelectedExp(exp)}>{exp.cat.split(" ")[0]}</div>
                          }
                          <div className="exp-info" onClick={()=>setSelectedExp(exp)} style={{cursor:"pointer"}}>
                            <div className="exp-desc">{exp.desc}</div>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                              {orig&&<span className="curr-badge">{exp.currency}</span>}
                              {isSplit&&<span className="exp-split-tag">👥 Split {exp.splits.length}</span>}
                              {exp.paidBy&&exp.paidBy!=="Me"&&<span className="payer-tag">💳 {exp.paidBy}</span>}
                              {atts.length>0&&<span style={{fontSize:10,color:"var(--amber)",background:"rgba(255,168,40,0.08)",border:"1px solid rgba(255,168,40,0.2)",borderRadius:5,padding:"1px 6px"}}>📎 {atts.length}</span>}
                            </div>
                            <div className="exp-meta">{exp.date}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div className="exp-amt">{fmt(exp.amtBase??exp.amount)}</div>
                            {isSplit&&<div style={{fontSize:10,color:"var(--text-dim)"}}>your share: {fmt(share)}</div>}
                            {orig&&<div style={{fontSize:10,color:"var(--text-dim)"}}>{orig}</div>}
                          </div>
                          <button className="btn-del" onClick={()=>saveExpenses(expenses.filter(e=>e.id!==exp.id))}>✕</button>
                        </div>
                        <div style={{paddingLeft:38}}>
                          <AttachStrip attachments={atts} compact={true}
                            onAdd={newAtts=>addReceiptToExp(exp.id,newAtts)}
                            onRemove={attId=>removeReceiptFromExp(exp.id,attId)}
                            onView={att=>setViewingAtt(att)}/>
                        </div>
                      </div>
                    );
                  })
              )}

              {/* ── GALLERY VIEW ── */}
              {viewMode==="gallery"&&(
                <div className="gallery-grid">
                  {sortedExps.length===0&&(
                    <div className="gallery-empty">
                      <div className="gallery-empty-icon">
                        {galleryFilter==="photos"?"🧾":"💳"}
                      </div>
                      <div className="gallery-empty-msg">
                        {galleryFilter==="photos"
                          ?"No receipts yet — snap a receipt when adding an expense"
                          :"No expenses match this filter"}
                      </div>
                    </div>
                  )}
                  {sortedExps.map(exp=>{
                    const img = firstImg(exp);
                    const isExpToday = isToday(exp);
                    return(
                      <div key={exp.id} className="gallery-cell" onClick={()=>setSelectedExp(exp)}>
                        {img
                          ?<img src={img.data} className="gallery-cell-img" alt={exp.desc}/>
                          :<div className={`gallery-cell-bg ${catBgClass(exp.cat)}`}>
                            {exp.cat?.split(" ")[0]||"💳"}
                          </div>
                        }
                        <div className="gallery-cell-overlay">
                          <div className="gallery-cell-amount">{fmt(exp.amtBase??exp.amount)}</div>
                          <div className="gallery-cell-cat">{exp.desc?.slice(0,18)}</div>
                        </div>
                        {img&&<div className="gallery-cell-badge">📎</div>}
                        {isExpToday&&<div className="gallery-cell-date-badge">Today</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Expense Detail Sheet ── */}
            {selectedExp&&(
              <div className="exp-detail-overlay" onClick={e=>e.target===e.currentTarget&&setSelectedExp(null)}>
                <div className="exp-detail-sheet">
                  {/* Photo or placeholder */}
                  {(()=>{
                    const img=firstImg(selectedExp);
                    return img
                      ?<img src={img.data} className="exp-detail-photo" alt="Receipt" onClick={()=>setViewingAtt(img)}/>
                      :<div className={`exp-detail-nophoto ${catBgClass(selectedExp.cat)}`}>
                        {selectedExp.cat?.split(" ")[0]||"💳"}
                      </div>;
                  })()}

                  <div className="exp-detail-body">
                    <div className="exp-detail-title">{selectedExp.desc}</div>

                    <div className="exp-detail-row">
                      <div className="exp-detail-icon">💰</div>
                      <div className="exp-detail-lbl">Amount</div>
                      <div className="exp-detail-val" style={{color:"var(--amber)",fontWeight:700,fontSize:16}}>
                        {fmt(selectedExp.amtBase??selectedExp.amount)}
                        {fmtOrig(selectedExp)&&<span style={{fontSize:11,color:"var(--text-dim)",marginLeft:6}}>({fmtOrig(selectedExp)})</span>}
                      </div>
                    </div>

                    <div className="exp-detail-row">
                      <div className="exp-detail-icon">{selectedExp.cat?.split(" ")[0]||"📎"}</div>
                      <div className="exp-detail-lbl">Category</div>
                      <div className="exp-detail-val">{selectedExp.cat?.split(" ").slice(1).join(" ")||"Other"}</div>
                    </div>

                    <div className="exp-detail-row">
                      <div className="exp-detail-icon">🗓️</div>
                      <div className="exp-detail-lbl">Date</div>
                      <div className="exp-detail-val">{selectedExp.date}{isToday(selectedExp)&&<span className="exp-split-tag" style={{marginLeft:6}}>Today</span>}</div>
                    </div>

                    <div className="exp-detail-row">
                      <div className="exp-detail-icon">💳</div>
                      <div className="exp-detail-lbl">Paid by</div>
                      <div className="exp-detail-val">{selectedExp.paidBy||"Me"}</div>
                    </div>

                    {selectedExp.splits&&(
                      <div className="exp-detail-row">
                        <div className="exp-detail-icon">👥</div>
                        <div className="exp-detail-lbl">Split</div>
                        <div className="exp-detail-val">{selectedExp.splits.map(s=>`${s.name} (${fmt(s.amtBase)})`).join(", ")}</div>
                      </div>
                    )}

                    {selectedExp.activityText&&(
                      <div className="exp-detail-row">
                        <div className="exp-detail-icon">📅</div>
                        <div className="exp-detail-lbl">Activity</div>
                        <div className="exp-detail-val">{selectedExp.dayLabel} — {selectedExp.activityText}</div>
                      </div>
                    )}

                    {/* All attachments */}
                    {(selectedExp.attachments||[]).length>0&&(
                      <div style={{marginTop:14}}>
                        <div className="card-title-small" style={{marginBottom:8}}>Attachments</div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {(selectedExp.attachments||[]).map(att=>(
                            isImage(att.type)
                              ?<img key={att.id} src={att.data} onClick={()=>setViewingAtt(att)}
                                style={{width:72,height:72,objectFit:"cover",borderRadius:10,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)"}} alt=""/>
                              :<div key={att.id} className="doc-file-thumb" onClick={()=>setViewingAtt(att)}>
                                <div className="doc-file-icon">{fileIcon(att.type)}</div>
                                <div className="doc-file-ext">{fileExt(att.name)}</div>
                              </div>
                          ))}
                          {/* Add more receipts */}
                          <div className="attach-btn" style={{width:72,height:72,flexDirection:"column",gap:4,justifyContent:"center",borderRadius:10,fontSize:20,position:"relative"}}>
                            📎
                            <span style={{fontSize:9}}>Add</span>
                            <input type="file" multiple accept="image/*,.pdf" style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}
                              onChange={async e=>{ const p=await processFiles(e.target.files); if(p.length){addReceiptToExp(selectedExp.id,p); setSelectedExp(s=>({...s,attachments:[...(s.attachments||[]),...p]}));} e.target.value=""; }}/>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="exp-detail-actions">
                    {firstImg(selectedExp)&&(
                      <button className="btn-ghost flex-1" onClick={()=>setViewingAtt(firstImg(selectedExp))}>
                        🔍 Full Receipt
                      </button>
                    )}
                    <button className="btn-ghost flex-1" style={{borderColor:"rgba(255,92,92,.3)",color:"#FF5C5C"}}
                      onClick={()=>{ saveExpenses(expenses.filter(e=>e.id!==selectedExp.id)); setSelectedExp(null); }}>
                      🗑 Delete
                    </button>
                    <button className="btn flex-1" onClick={()=>setSelectedExp(null)}>Done</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        );
      })()}

      {viewingAtt && <ViewerModal att={viewingAtt} onClose={()=>setViewingAtt(null)} />}

      {/* BALANCES */}
      {activeTab==="balances"&&(
        <div>
          {people.length===0
            ?<div className="empty"><div className="empty-icon">👥</div><div className="empty-msg">Add travellers above to track who owes what</div></div>
            :<>
              <div className="card">
                <div className="card-title">💳 Net Balances</div>
                {allPeople.map(name=>{
                  const net=balanceNet[name]||0; const abs=Math.abs(net);
                  return(
                    <div key={name} className="balance-row">
                      <Avatar name={name} size={28}/>
                      <span style={{flex:1,fontSize:13}}>{name}</span>
                      {abs<0.005
                        ?<span className="balance-settled">✓ Settled</span>
                        :net>0?<span className="balance-owed">+{fmt(abs)} owed to them</span>
                             :<span className="balance-owes">−{fmt(abs)} owes</span>
                      }
                    </div>
                  );
                })}
              </div>

              <div className="card">
                <div className="card-title">🤝 Settle Up</div>
                {settlements.length===0
                  ?<div style={{textAlign:"center",padding:"16px 0",color:"var(--text-dim)",fontSize:13}}>✓ All settled up!</div>
                  :settlements.map((s,i)=>(
                    <div key={i} className="balance-row" style={{gap:8}}>
                      <Avatar name={s.from} size={26}/>
                      <span style={{fontSize:12,color:"var(--text-dim)"}}>pays</span>
                      <Avatar name={s.to} size={26}/>
                      <span style={{fontSize:12,flex:1}}>{s.from} → {s.to}</span>
                      <span style={{fontWeight:700,color:"var(--amber)",fontSize:13}}>{fmt(s.amt)}</span>
                    </div>
                  ))
                }
              </div>

              <div className="card">
                <div className="card-title">📊 Per-person Spend</div>
                {allPeople.map(name=>{
                  const total=expenses.reduce((s,exp)=>{
                    if(!exp.splits) return exp.paidBy===name?s+(exp.amtBase??Number(exp.amount)):s;
                    const mine=exp.splits.find(sp=>sp.name===name);
                    return mine?s+mine.amtBase:s;
                  },0);
                  return(
                    <div key={name} style={{marginBottom:12}}>
                      <div className="flex items-center justify-between" style={{marginBottom:4,fontSize:13}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}><Avatar name={name} size={22}/><span>{name}</span></div>
                        <span style={{fontWeight:700,color:"var(--amber)"}}>{fmt(total)}</span>
                      </div>
                      <div className="prog-track" style={{height:5}}><div className="prog-fill" style={{width:`${spent>0?Math.min(100,total/spent*100):0}%`}}/></div>
                    </div>
                  );
                })}
              </div>
            </>
          }
        </div>
      )}
      {/* DAILY */}
      {activeTab==="daily"&&(()=>{
        const todayISO = new Date().toISOString().split("T")[0];
        // Build 7-day data
        const days = Array.from({length:7},(_,i)=>{
          const d = new Date(); d.setDate(d.getDate()-6+i);
          const iso = d.toISOString().split("T")[0];
          const dayExps = expenses.filter(e=>(e.dateISO||"")===iso || (() => { try { return new Date(e.date).toISOString().split("T")[0]===iso; } catch{return false;} })());
          const spent = dayExps.reduce((s,e)=>s+(e.amtBase??Number(e.amount??0)),0);
          return { iso, spent, isToday: iso===todayISO,
            label: i===6?"Today":d.toLocaleDateString("en",{weekday:"short"}) };
        });
        const maxSpent = Math.max(...days.map(d=>d.spent), dailyBudget||1, 1);
        const todaySpent = days.find(d=>d.isToday)?.spent||0;
        const todayPct = dailyBudget>0 ? Math.min(100,Math.round(todaySpent/dailyBudget*100)) : 0;
        const todayOver = dailyBudget>0 && todaySpent>dailyBudget;
        const barColor = todayPct>100?"#FF5C5C":todayPct>80?"#FFA828":"#4DB87A";

        return (
          <div>
            {/* Notification permission */}
            {notifPerm !== "granted" && (
              <div className="notif-perm-card" style={{marginBottom:12}}>
                <div className="notif-perm-icon">🔔</div>
                <div className="notif-perm-body">
                  <div className="notif-perm-title">Enable spending nudges</div>
                  <div className="notif-perm-sub">Get push notifications at 80% and 100% of your daily limit — even when the app is in the background.</div>
                  <button className="btn btn-sm" style={{marginTop:10}}
                    onClick={async()=>{ const r=await requestNotifPermission(); if(r==="granted") setActiveTab("daily"); }}>
                    {notifPerm==="denied"?"Blocked by browser — enable in settings":"Enable notifications"}
                  </button>
                </div>
              </div>
            )}
            {notifPerm==="granted"&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:12,color:"#4DB87A"}}>
                <span className="collab-dot"/>
                Nudges active — alerts at 80% and 100% of daily limit
              </div>
            )}

            {/* Set daily limit */}
            <div className="card">
              <div className="card-title">📅 Daily Limit</div>
              <div style={{fontSize:12,color:"var(--text-dim)",marginBottom:10}}>
                Set how much you want to spend per day. You'll be nudged at 80% and 100%.
              </div>
              <div className="flex gap-8">
                <input className="input flex-1" type="number" placeholder={`e.g. 80 (${baseCurrency})`}
                  value={dailyBudget||""} onChange={e=>saveDailyBudget(Number(e.target.value)||0)}/>
                <div style={{display:"flex",alignItems:"center",padding:"0 10px",fontSize:13,color:"var(--text-dim)",
                  background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:11,flexShrink:0}}>
                  {baseCurrency}
                </div>
              </div>
              {dailyBudget>0&&(
                <div style={{marginTop:10,fontSize:11,color:"var(--text-dim)"}}>
                  = {baseCurrency} {(dailyBudget*7).toFixed(0)}/week · {baseCurrency} {(dailyBudget*30).toFixed(0)}/month
                </div>
              )}
            </div>

            {/* Today's progress */}
            {dailyBudget>0&&(
              <div className="card">
                <div className="flex items-center justify-between" style={{marginBottom:6}}>
                  <div className="card-title" style={{marginBottom:0}}>Today's Spending</div>
                  <span style={{fontSize:12,fontWeight:700,color:barColor}}>
                    {todayPct}% {todayOver?"— over limit ⚠️":""}
                  </span>
                </div>
                <div className="daily-stat-row">
                  <div className="daily-chip">
                    <div className="daily-chip-val" style={{color:barColor}}>{baseCurrency} {todaySpent.toFixed(2)}</div>
                    <div className="daily-chip-lbl">Spent</div>
                  </div>
                  <div className="daily-chip">
                    <div className="daily-chip-val">{baseCurrency} {dailyBudget.toFixed(2)}</div>
                    <div className="daily-chip-lbl">Limit</div>
                  </div>
                  <div className="daily-chip">
                    <div className="daily-chip-val" style={{color:todayOver?"#FF5C5C":"#4DB87A"}}>
                      {todayOver?"-":""}{baseCurrency} {Math.abs(dailyBudget-todaySpent).toFixed(2)}
                    </div>
                    <div className="daily-chip-lbl">{todayOver?"Over":"Left"}</div>
                  </div>
                </div>
                <div className="daily-prog-bar">
                  <div className="daily-prog-fill" style={{
                    width:`${Math.min(100,todayPct)}%`,
                    background:todayPct>100?"linear-gradient(90deg,#FF5C5C,#C93030)":
                               todayPct>80 ?"linear-gradient(90deg,#FFA828,#E07C00)":
                                            "linear-gradient(90deg,#4DB87A,#2D9E5A)"
                  }}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-dim)"}}>
                  <span>0</span><span style={{color:"rgba(255,168,40,.5)"}}>80%</span><span>{baseCurrency} {dailyBudget}</span>
                </div>

                {/* Today's transactions */}
                {days.find(d=>d.isToday)&&expenses.filter(e=>(e.dateISO||"")===todayISO||(()=>{try{return new Date(e.date).toISOString().split("T")[0]===todayISO;}catch{return false;}})()).length>0&&(
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Today's Expenses</div>
                    {expenses.filter(e=>(e.dateISO||"")===todayISO||(()=>{try{return new Date(e.date).toISOString().split("T")[0]===todayISO;}catch{return false;}})()).map(exp=>(
                      <div key={exp.id} className="exp-row" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                        <div className="exp-cat" style={{fontSize:17}}>{exp.cat.split(" ")[0]}</div>
                        <div className="exp-info">
                          <div className="exp-desc" style={{fontSize:12}}>{exp.desc}</div>
                          <div className="exp-meta">{exp.cat.split(" ").slice(1).join(" ")}</div>
                        </div>
                        <div className="exp-amt" style={{fontSize:12}}>{fmt(exp.amtBase??exp.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 7-day chart */}
            <div className="card">
              <div className="card-title">📊 Last 7 Days</div>
              {dailyBudget>0&&<div style={{fontSize:11,color:"rgba(255,168,40,.5)",marginBottom:2}}>
                — dashed line = daily limit ({baseCurrency} {dailyBudget})
              </div>}
              <div className="seven-day-chart" style={{position:"relative"}}>
                {/* Limit reference line */}
                {dailyBudget>0&&(
                  <div className="day-limit-line" style={{
                    bottom:`${(dailyBudget/maxSpent)*100}%`,
                    position:"absolute",left:0,right:0
                  }}/>
                )}
                {days.map((day,i)=>{
                  const h = maxSpent>0 ? Math.max(2,(day.spent/maxSpent)*100) : 2;
                  const over = dailyBudget>0 && day.spent>dailyBudget;
                  const pct  = dailyBudget>0 ? day.spent/dailyBudget : 0;
                  const col  = over?"#FF5C5C":pct>.8?"#FFA828":"#4DB87A";
                  return (
                    <div key={day.iso} className="day-bar-wrap">
                      {day.spent>0&&(
                        <div className="day-bar-val">{day.spent<10?day.spent.toFixed(1):Math.round(day.spent)}</div>
                      )}
                      <div className={`day-bar${day.isToday?" today":""}`}
                        style={{height:`${h}%`,background:day.isToday?`linear-gradient(to top,${col},${col}aa)`:col,opacity:day.isToday?1:.6}}/>
                      <div className={`day-bar-label${day.isToday?" today":""}`}>{day.label}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:"var(--text-dim)"}}>
                <span>7-day total: {fmt(days.reduce((s,d)=>s+d.spent,0))}</span>
                <span>avg/day: {fmt(days.reduce((s,d)=>s+d.spent,0)/7)}</span>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
// ── Airline IATA database ─────────────────────────────────────────────────────
export const AIRLINES = {
  AA:{name:"American Airlines",   web:"https://aa.com/booking/find-reservations"},
  AC:{name:"Air Canada",          web:"https://aircanada.com/en-ca/account/manage-booking"},
  AF:{name:"Air France",          web:"https://airfrance.com/en/common/reservation/reservation.do"},
  AI:{name:"Air India",           web:"https://airindia.in/manage-booking.htm"},
  AK:{name:"AirAsia",             web:"https://airasia.com/managebooking"},
  AM:{name:"Aeroméxico",          web:"https://aeromexico.com/en-us/travel-information/manage-your-trip"},
  AY:{name:"Finnair",             web:"https://finnair.com/en/manage"},
  AZ:{name:"ITA Airways",         web:"https://itaairways.com/en/manage-your-booking"},
  BA:{name:"British Airways",     web:"https://britishairways.com/travel/managebooking"},
  BG:{name:"Biman Bangladesh",    web:"https://biman-airlines.com"},
  BI:{name:"Royal Brunei",        web:"https://royalbrunei.com/manage-booking"},
  BR:{name:"EVA Air",             web:"https://evaair.com/en-global/manage-booking"},
  BX:{name:"Air Busan",           web:"https://airbusan.com/en"},
  CA:{name:"Air China",           web:"https://airchina.com/en-US/manage_booking"},
  CI:{name:"China Airlines",      web:"https://www.china-airlines.com/en-us/manage-booking"},
  CX:{name:"Cathay Pacific",      web:"https://cathaypacific.com/cx/en_HK/manage-booking"},
  CZ:{name:"China Southern",      web:"https://csair.com/en/booking/managebooking"},
  DL:{name:"Delta Air Lines",     web:"https://delta.com/us/en/need-help/manage-booking"},
  EK:{name:"Emirates",            web:"https://emirates.com/english/manage-booking"},
  ET:{name:"Ethiopian Airlines",  web:"https://ethiopianairlines.com/en/manage"},
  EY:{name:"Etihad Airways",      web:"https://etihad.com/en-us/manage"},
  FD:{name:"Thai AirAsia",        web:"https://airasia.com/managebooking"},
  FJ:{name:"Fiji Airways",        web:"https://fijiairways.com/manage-my-booking"},
  FZ:{name:"flydubai",            web:"https://flydubai.com/en/plan/manage-booking"},
  G9:{name:"Air Arabia",          web:"https://airarabia.com/en/manage-bookings"},
  GF:{name:"Gulf Air",            web:"https://gulfair.com/en/manage-booking"},
  HA:{name:"Hawaiian Airlines",   web:"https://hawaiianairlines.com/manage-flights"},
  HU:{name:"Hainan Airlines",     web:"https://hainanairlines.com/en/managebooking"},
  IB:{name:"Iberia",              web:"https://iberia.com/en/yourbookings"},
  IR:{name:"Iran Air",            web:"https://iranair.com"},
  IT:{name:"Tigerair Taiwan",     web:"https://tigerairtw.com/en-tw/manage-booking"},
  JJ:{name:"LATAM Brasil",        web:"https://latamairlines.com/us/en/manage-your-trip"},
  JL:{name:"Japan Airlines",      web:"https://jal.co.jp/en/booking/reserve"},
  JQ:{name:"Jetstar",             web:"https://jetstar.com/au/en/manage-booking"},
  KA:{name:"Cathay Dragon",       web:"https://cathaypacific.com"},
  KE:{name:"Korean Air",          web:"https://koreanair.com/booking/manage-booking"},
  KL:{name:"KLM",                 web:"https://klm.com/en-us/travel/booking/manage"},
  KQ:{name:"Kenya Airways",       web:"https://kenya-airways.com/manage-booking"},
  LA:{name:"LATAM Airlines",      web:"https://latamairlines.com/us/en/manage-your-trip"},
  LH:{name:"Lufthansa",           web:"https://lufthansa.com/en/homepage/myflights"},
  LO:{name:"LOT Polish Airlines", web:"https://lot.com/en/my-lot"},
  LX:{name:"Swiss International", web:"https://swiss.com/en/booking/myflights"},
  MH:{name:"Malaysia Airlines",   web:"https://malaysiaairlines.com/my/en/manage-booking"},
  MK:{name:"Air Mauritius",       web:"https://airmauritius.com/managebooking"},
  MS:{name:"EgyptAir",            web:"https://egyptair.com/en/eguest"},
  MU:{name:"China Eastern",       web:"https://ceair.com/en/booking/manageOrder"},
  NH:{name:"ANA",                 web:"https://ana.co.jp/en/us/manage-booking"},
  NZ:{name:"Air New Zealand",     web:"https://airnewzealand.com/manage-booking"},
  OK:{name:"Czech Airlines",      web:"https://csa.cz/en/booking-management"},
  OS:{name:"Austrian Airlines",   web:"https://austrian.com/en/myflights"},
  OZ:{name:"Asiana Airlines",     web:"https://flyasiana.com/C/US/EN/manage"},
  PC:{name:"Pegasus Airlines",    web:"https://flypgs.com/en/manage-booking"},
  PK:{name:"Pakistan International",web:"https://piac.aero"},
  PR:{name:"Philippine Airlines", web:"https://philippineairlines.com/en/ph/home/manage-booking"},
  PX:{name:"Air Niugini",         web:"https://airniugini.com.pg"},
  QF:{name:"Qantas",              web:"https://qantas.com/au/en/manage-booking"},
  QR:{name:"Qatar Airways",       web:"https://qatarairways.com/en/manage.html"},
  RJ:{name:"Royal Jordanian",     web:"https://rj.com/en/plan/manage-booking"},
  SA:{name:"South African Airways",web:"https://flysaa.com/manage"},
  SK:{name:"SAS",                 web:"https://sas.se/en/travel-info/manage"},
  SN:{name:"Brussels Airlines",   web:"https://brusselsairlines.com/en/your-trip/manage-booking"},
  SQ:{name:"Singapore Airlines",  web:"https://singaporeair.com/en_UK/us/travel-info/manage-booking"},
  SV:{name:"Saudia",              web:"https://saudia.com/en/manage-booking"},
  TG:{name:"Thai Airways",        web:"https://thaiairways.com/en_TH/manage_bookings"},
  TK:{name:"Turkish Airlines",    web:"https://turkishairlines.com/en-us/flights/manage-booking"},
  TP:{name:"TAP Air Portugal",    web:"https://tapairportugal.com/en/manage-your-booking"},
  TR:{name:"Scoot",               web:"https://flyscoot.com/en/manage-booking"},
  UA:{name:"United Airlines",     web:"https://united.com/ual/en/us/reservation"},
  UL:{name:"SriLankan Airlines",  web:"https://srilankan.com/en-us/manage-booking"},
  UX:{name:"Air Europa",          web:"https://aireuropa.com/en/my-booking"},
  VN:{name:"Vietnam Airlines",    web:"https://vietnamairlines.com/en/the-gioi/manage-booking"},
  VY:{name:"Vueling",             web:"https://vueling.com/en/booking-management"},
  WN:{name:"Southwest Airlines",  web:"https://southwest.com/air/manage-reservation"},
  WS:{name:"WestJet",             web:"https://westjet.com/en-ca/manage-trips"},
  XY:{name:"flynas",              web:"https://flynas.com/en/manage-booking"},
  ZI:{name:"Aigle Azur",          web:"https://aigle-azur.com"},
};

// Booking platform detection by reference pattern
