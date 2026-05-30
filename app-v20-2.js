
const PAVIMENTOLAB_VERSION = "v20-indexeddb";
console.log("PavimentoLab", PAVIMENTOLAB_VERSION);

const DB_NAME = "pavimentolab_v20_db";
const DB_VERSION = 1;
const COLLECTIONS = "collections";
const POINTS = "points";
const SEGMENTS = "segments";
const META = "meta";

const SAMPLE_RATE_GUESS = 60;
const AGGREGATION_M = 10;
const ANTI_DRIFT_M = 2;

const LEGACY_KEYS = [
  "pavimentolab_collections_v5","pavimentolab_collections_v12","pavimentolab_collections_v13",
  "pavimentolab_collections_v14","pavimentolab_collections_v15","pavimentolab_collections_v16",
  "pavimentolab_collections_v17","pavimentolab_collections_v18","pavimentolab_collections_v19",
  "pavimentolab_current_v5","pavimentolab_current_v12","pavimentolab_current_v13",
  "pavimentolab_current_v14","pavimentolab_current_v15","pavimentolab_current_v16",
  "pavimentolab_current_v17","pavimentolab_current_v18","pavimentolab_current_v19"
];

const els = {
  btnMenu: document.getElementById("btnMenu"),
  btnCloseDrawer: document.getElementById("btnCloseDrawer"),
  drawer: document.getElementById("drawer"),
  statusPill: document.getElementById("statusPill"),
  gpsPill: document.getElementById("gpsPill"),
  btnLocate: document.getElementById("btnLocate"),
  distanceValue: document.getElementById("distanceValue"),
  durationValue: document.getElementById("durationValue"),
  speedValue: document.getElementById("speedValue"),
  btnMain: document.getElementById("btnMain"),
  btnPause: document.getElementById("btnPause"),
  holdProgress: document.getElementById("holdProgress"),
  barGood: document.getElementById("barGood"),
  barRegular: document.getElementById("barRegular"),
  barBad: document.getElementById("barBad"),
  barCritical: document.getElementById("barCritical"),
  barEmpty: document.getElementById("barEmpty"),
  pctGood: document.getElementById("pctGood"),
  pctRegular: document.getElementById("pctRegular"),
  pctBad: document.getElementById("pctBad"),
  pctCritical: document.getElementById("pctCritical"),
  diagGps: document.getElementById("diagGps"),
  diagMotion: document.getElementById("diagMotion"),
  diagWake: document.getElementById("diagWake"),
  diagSave: document.getElementById("diagSave"),
  diagGpsAge: document.getElementById("diagGpsAge"),
  diagGpsInterval: document.getElementById("diagGpsInterval"),
  diagMotionHz: document.getElementById("diagMotionHz"),
  diagVisibility: document.getElementById("diagVisibility"),
  diagHistoryCount: document.getElementById("diagHistoryCount"),
  diagDraftCount: document.getElementById("diagDraftCount"),
  diagStorageSize: document.getElementById("diagStorageSize"),
  diagStorageKey: document.getElementById("diagStorageKey"),
  diagDbStatus: document.getElementById("diagDbStatus"),
  btnScanLocal: document.getElementById("btnScanLocal"),
  btnImportBackup: document.getElementById("btnImportBackup"),
  backupFileInput: document.getElementById("backupFileInput"),
  localDataList: document.getElementById("localDataList"),
  historyList: document.getElementById("historyList"),
  btnBackupAll: document.getElementById("btnBackupAll"),
  btnCleanDrafts: document.getElementById("btnCleanDrafts"),
  btnClearAll: document.getElementById("btnClearAll"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalText: document.getElementById("modalText"),
  spinner: document.getElementById("spinner"),
  modalActions: document.getElementById("modalActions"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  btnExportPackage: document.getElementById("btnExportPackage"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnExportRawPoints: document.getElementById("btnExportRawPoints"),
  btnExportSimplePoints: document.getElementById("btnExportSimplePoints"),
  btnExportSegments: document.getElementById("btnExportSegments"),
  btnExportSummary: document.getElementById("btnExportSummary")
};

const state = {
  db:null,
  map:null,
  routeLayer:null,
  marker:null,
  watchId:null,
  collecting:false,
  paused:false,
  finalizing:false,
  current:null,
  lastGps:null,
  lastGpsAt:null,
  gpsIntervals:[],
  motionBuffer:[],
  motionHz:SAMPLE_RATE_GUESS,
  motionCount:0,
  motionWindowStart:null,
  pointBatch:[],
  segmentBatch:[],
  elapsedTimer:null,
  wakeLock:null,
  holdTimer:null,
  holdStart:null,
  lastStopped:null
};

function openDb(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(COLLECTIONS)){
        const s = db.createObjectStore(COLLECTIONS,{keyPath:"id"});
        s.createIndex("startedAt","startedAt");
        s.createIndex("status","status");
      }
      if(!db.objectStoreNames.contains(POINTS)){
        const s = db.createObjectStore(POINTS,{keyPath:"pk",autoIncrement:true});
        s.createIndex("collectionId","collectionId");
        s.createIndex("timestamp","timestamp");
      }
      if(!db.objectStoreNames.contains(SEGMENTS)){
        const s = db.createObjectStore(SEGMENTS,{keyPath:"pk",autoIncrement:true});
        s.createIndex("collectionId","collectionId");
        s.createIndex("segment_id","segment_id");
      }
      if(!db.objectStoreNames.contains(META)) db.createObjectStore(META,{keyPath:"key"});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode="readonly"){ return state.db.transaction(store, mode).objectStore(store); }
function reqToPromise(req){ return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });}
function put(store, value){ return reqToPromise(tx(store,"readwrite").put(value));}
function getAll(store){ return reqToPromise(tx(store).getAll());}
function getAllByIndex(store,index,value){ return reqToPromise(tx(store).index(index).getAll(value));}
function deleteKey(store,key){ return reqToPromise(tx(store,"readwrite").delete(key));}

async function bulkPut(storeName, values){
  if(!values?.length) return 0;
  return new Promise((resolve,reject)=>{
    const t = state.db.transaction(storeName,"readwrite");
    const s = t.objectStore(storeName);
    values.forEach(v=>s.put(v));
    t.oncomplete = () => resolve(values.length);
    t.onerror = () => reject(t.error);
  });
}
async function deleteByCollection(storeName, collectionId){
  const rows = await getAllByIndex(storeName,"collectionId",collectionId);
  await new Promise((resolve,reject)=>{
    const t = state.db.transaction(storeName,"readwrite");
    const s = t.objectStore(storeName);
    rows.forEach(r=>s.delete(r.pk));
    t.oncomplete=resolve; t.onerror=()=>reject(t.error);
  });
}

function nowId(){ return new Date().toISOString().replace(/[:.]/g,"-");}
function fmtKm(m){ return `${(m/1000).toFixed(1).replace(".",",")} km`; }
function fmtTime(sec){ const h=String(Math.floor(sec/3600)).padStart(2,"0"); const m=String(Math.floor(sec%3600/60)).padStart(2,"0"); const s=String(sec%60).padStart(2,"0"); return `${h}:${m}:${s}`;}
function mean(a){ return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0; }
function round(n,d=6){ return typeof n==="number" && isFinite(n) ? Number(n.toFixed(d)) : n; }
function distanceMeters(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function classify(v){
  if(v < 0.6) return "bom";
  if(v < 1.2) return "regular";
  if(v < 2.0) return "ruim";
  return "critico";
}
function deviceInfo(){
  return {
    app_version:PAVIMENTOLAB_VERSION,
    collected_at:new Date().toISOString(),
    user_agent:navigator.userAgent,
    platform:navigator.platform,
    language:navigator.language,
    hardware_concurrency:navigator.hardwareConcurrency || null,
    device_memory_gb:navigator.deviceMemory || null,
    max_touch_points:navigator.maxTouchPoints || null,
    screen_width:screen.width,
    screen_height:screen.height,
    device_pixel_ratio:devicePixelRatio,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    page_url:location.href
  };
}

function headerFromCollection(c,status="draft"){
  return {
    id:c.id, name:c.name, version:c.version||PAVIMENTOLAB_VERSION,
    startedAt:c.startedAt, endedAt:c.endedAt||null, finalizedAt:c.finalizedAt||null,
    status, device:c.device||"unknown", deviceInfo:c.deviceInfo||null,
    calibration:c.calibration||null, totalDistanceM:c.totalDistanceM||0,
    pointCount:c.pointCount||0, segmentCount:c.segmentCount||0,
    summary:c.summary||null, recovered:!!c.recovered, recoveredFrom:c.recoveredFrom||null,
    updatedAt:new Date().toISOString()
  };
}
async function saveHeader(c,status="draft"){ await put(COLLECTIONS, headerFromCollection(c,status));}
async function flushPoints(force=false){
  if(!state.current || !state.pointBatch.length) return;
  if(!force && state.pointBatch.length < 100) return;
  const batch = state.pointBatch.splice(0);
  try{ await bulkPut(POINTS,batch.map(p=>({...p,collectionId:state.current.id}))); }
  catch(e){ console.warn("erro lote pontos",e); state.pointBatch.unshift(...batch); }
}
async function flushSegments(force=false){
  if(!state.current || !state.segmentBatch.length) return;
  if(!force && state.segmentBatch.length < 50) return;
  const batch = state.segmentBatch.splice(0);
  try{ await bulkPut(SEGMENTS,batch.map(s=>({...s,collectionId:state.current.id}))); }
  catch(e){ console.warn("erro lote trechos",e); state.segmentBatch.unshift(...batch); }
}
async function hydrate(header){
  const points = await getAllByIndex(POINTS,"collectionId",header.id);
  const segments = await getAllByIndex(SEGMENTS,"collectionId",header.id);
  return {...header,points,segments};
}
async function listHeaders(){
  const rows = await getAll(COLLECTIONS);
  return rows.sort((a,b)=>new Date(b.startedAt||0)-new Date(a.startedAt||0));
}
async function dbUsageText(){
  const h = await listHeaders();
  const pts = await getAll(POINTS);
  const seg = await getAll(SEGMENTS);
  return `ok · ${h.length} coleta(s) · ${pts.length} pts · ${seg.length} trechos`;
}

function showModal(title,text,loading=false){
  els.modalTitle.textContent=title;
  els.modalText.textContent=text;
  els.spinner.classList.toggle("hidden",!loading);
  els.modalActions.classList.add("hidden");
  els.modal.classList.remove("hidden");
}
function closeModal(){ els.modal.classList.add("hidden");}
function showExportModal(c){
  state.lastStopped = c;
  els.modalTitle.textContent="Coleta salva";
  els.modalText.textContent="Deseja gerar os arquivos de saída agora?";
  els.spinner.classList.add("hidden");
  els.modalActions.classList.remove("hidden");
  els.modal.classList.remove("hidden");
}

function initMap(){
  state.map = L.map("map",{zoomControl:false,attributionControl:false}).setView([-23.5505,-46.6333],14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(state.map);
  L.control.zoom({position:"bottomright"}).addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
  state.marker = L.circleMarker([-23.5505,-46.6333],{radius:10,color:"#38bdf8",weight:4,fillColor:"#2563eb",fillOpacity:.9}).addTo(state.map);
  setTimeout(()=>state.map.invalidateSize(),250);
}
function updateMarker(p,center=false){
  if(!state.marker) return;
  state.marker.setLatLng([p.lat,p.lon]);
  if(center || state.collecting) state.map.setView([p.lat,p.lon], state.map.getZoom() || 17, {animate:true});
}
function drawSegment(seg){
  const color = {bom:"#22c55e",regular:"#facc15",ruim:"#f97316",critico:"#ef4444"}[seg.classe] || "#94a3b8";
  L.polyline([[seg.lat_start,seg.lon_start],[seg.lat_end,seg.lon_end]],{color,weight:7,opacity:.9,lineCap:"round"}).addTo(state.routeLayer);
}
function locate(){
  els.gpsPill.textContent="Aguardando GPS...";
  navigator.geolocation.getCurrentPosition(pos=>{
    const p={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
    state.lastGps=p; state.lastGpsAt=Date.now();
    updateMarker(p,true);
    els.gpsPill.textContent = p.accuracy ? `GPS ${p.accuracy.toFixed(0)}m` : "GPS ok";
    updateDiagnostics();
  },()=>{ els.gpsPill.textContent="GPS --"; },{enableHighAccuracy:true,maximumAge:0,timeout:10000});
}
function startGps(){
  if(!navigator.geolocation) return;
  state.watchId = navigator.geolocation.watchPosition(onGps,()=>{els.gpsPill.textContent="GPS erro";},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function onGps(pos){
  const now = Date.now();
  const p = {
    timestamp:new Date().toISOString(),
    lat:round(pos.coords.latitude,7),
    lon:round(pos.coords.longitude,7),
    gps_accuracy_m:round(pos.coords.accuracy,2),
    speed_mps:round(pos.coords.speed ?? 0,2),
    heading:pos.coords.heading ?? null,
    altitude:pos.coords.altitude ?? null
  };
  if(state.lastGpsAt) state.gpsIntervals.push(now-state.lastGpsAt);
  if(state.gpsIntervals.length>30) state.gpsIntervals.shift();
  state.lastGpsAt=now;
  state.lastGps=p;
  els.gpsPill.textContent = p.gps_accuracy_m ? `GPS ${p.gps_accuracy_m.toFixed(0)}m` : "GPS ok";
  updateMarker(p,state.collecting);

  if(!state.collecting || state.paused || !state.current) return;

  const samples = state.motionBuffer.splice(0);
  const rough = computeRoughness(samples);
  const point = {...p,...rough,raw_point:true,classe:classify(rough.roughness_index)};
  state.current.pointCount += 1;
  state.pointBatch.push(point);
  flushPoints().catch(()=>{});

  if(!state.current.lastSegmentPoint){
    state.current.lastSegmentPoint = point;
    return;
  }
  const dist = distanceMeters(state.current.lastSegmentPoint, point);
  if(dist < ANTI_DRIFT_M) return;
  state.current.pendingDistance += dist;
  if(state.current.pendingDistance >= AGGREGATION_M){
    const a = state.current.lastSegmentPoint;
    const seg = {
      segment_id:state.current.segmentCount+1,
      timestamp_start:a.timestamp, timestamp_end:point.timestamp,
      lat_start:a.lat, lon_start:a.lon, lat_end:point.lat, lon_end:point.lon,
      distance_m:round(state.current.pendingDistance,2),
      speed_mps:point.speed_mps, heading:point.heading,
      gps_accuracy_start_m:a.gps_accuracy_m, gps_accuracy_end_m:point.gps_accuracy_m,
      sample_count:point.sample_count,
      roughness_mean:point.roughness_mean, roughness_max:point.roughness_max,
      roughness_std:point.roughness_std, peak_count:point.peak_count,
      roughness_index:point.roughness_index, classe:point.classe,
      segment_quality:"ok", flags:"", aggregation_m:AGGREGATION_M,
      source_points:1, anti_drift_min_step_m:ANTI_DRIFT_M
    };
    state.current.segmentCount += 1;
    state.current.totalDistanceM += state.current.pendingDistance;
    state.current.pendingDistance = 0;
    state.current.lastSegmentPoint = point;
    state.segmentBatch.push(seg);
    drawSegment(seg);
    flushSegments().catch(()=>{});
    updateMetrics();
    saveHeader(state.current,"draft").catch(()=>{});
  }
}
function computeRoughness(samples){
  if(!samples.length) return {sample_count:0,roughness_mean:0,roughness_max:0,roughness_std:0,peak_count:0,roughness_index:0};
  const vals = samples.map(v=>Math.abs(v));
  const m=mean(vals), max=Math.max(...vals);
  const std=Math.sqrt(mean(vals.map(v=>(v-m)**2)));
  const peaks=vals.filter(v=>v>2.2).length;
  return {
    sample_count:samples.length,
    roughness_mean:round(m,3),
    roughness_max:round(max,3),
    roughness_std:round(std,3),
    peak_count:peaks,
    roughness_index:round(m + std*0.8 + peaks*0.12,3)
  };
}
function startMotion(){
  window.addEventListener("devicemotion", e=>{
    const a=e.accelerationIncludingGravity;
    if(!a) return;
    const mag = Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
    state.motionBuffer.push(mag-9.81);
    if(state.motionBuffer.length>1000) state.motionBuffer.splice(0,state.motionBuffer.length-1000);
    state.motionCount++;
    if(!state.motionWindowStart) state.motionWindowStart=Date.now();
    const dt=(Date.now()-state.motionWindowStart)/1000;
    if(dt>=2){ state.motionHz=Math.round(state.motionCount/dt); state.motionCount=0; state.motionWindowStart=Date.now(); }
  });
}
async function requestWakeLock(){
  try{ if("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen"); }catch(e){}
}
async function releaseWakeLock(){ try{ await state.wakeLock?.release(); }catch(e){} state.wakeLock=null; }

async function startCollection(){
  if(state.collecting) return;
  showModal("Calibrando sensores","Aguarde alguns segundos antes de iniciar a coleta...",true);
  await new Promise(r=>setTimeout(r,900));
  closeModal();

  const id = crypto.randomUUID ? crypto.randomUUID() : `coleta_${Date.now()}`;
  state.routeLayer.clearLayers();
  state.current = {
    id,
    name:`coleta_${nowId()}_motorola_g82`,
    version:PAVIMENTOLAB_VERSION,
    startedAt:new Date().toISOString(),
    endedAt:null,
    finalizedAt:null,
    status:"draft",
    device:"motorola_g82_android_13",
    deviceInfo:deviceInfo(),
    calibration:{date:new Date().toISOString(),version:PAVIMENTOLAB_VERSION,samples:state.motionBuffer.length},
    totalDistanceM:0,
    pointCount:0,
    segmentCount:0,
    pendingDistance:0,
    lastSegmentPoint:null
  };
  state.pointBatch=[]; state.segmentBatch=[];
  state.collecting=true; state.paused=false;
  await saveHeader(state.current,"draft");
  await requestWakeLock();
  state.elapsedTimer=setInterval(updateMetrics,1000);
  updateStatus(); updateMetrics();
  if(state.lastGps) updateMarker(state.lastGps,true);
}
async function stopCollection(){
  if(!state.current || state.finalizing) return;
  state.finalizing=true;
  showModal("Consolidando dados","Salvando a corrida no banco local. Aguarde...",true);
  await new Promise(r=>setTimeout(r,80));
  try{
    state.collecting=false; state.paused=false;
    state.current.endedAt=new Date().toISOString();
    state.current.finalizedAt=new Date().toISOString();
    await flushPoints(true);
    await flushSegments(true);
    const full = await hydrate(headerFromCollection(state.current,"draft"));
    full.summary = summarize(full);
    await put(COLLECTIONS, headerFromCollection(full,"finalized"));
    state.lastStopped = full;
    resetUi();
    await renderHistory();
    showExportModal(full);
  }catch(err){
    console.error(err);
    showModal("Erro ao finalizar", err.message || String(err), false);
  }finally{
    state.finalizing=false;
  }
}
function resetUi(){
  clearInterval(state.elapsedTimer);
  state.current=null; state.pointBatch=[]; state.segmentBatch=[];
  releaseWakeLock();
  updateStatus(); updateMetrics();
}
function summarize(c){
  const points=c.points||[], segments=c.segments||[];
  const distance = segments.reduce((s,x)=>s+(x.distance_m||0),0) || c.totalDistanceM || 0;
  const counts={bom:0,regular:0,ruim:0,critico:0};
  segments.forEach(s=>{ if(counts[s.classe]!==undefined) counts[s.classe]++; });
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const pct = n => total ? Math.round(n/total*100) : 0;
  return {
    app_version:PAVIMENTOLAB_VERSION, name:c.name, startedAt:c.startedAt, endedAt:c.endedAt,
    totalDistanceM:round(distance,2), totalDistanceKm:round(distance/1000,3),
    pointCount:points.length, segmentCount:segments.length,
    class_counts:counts, class_percentages:{bom:pct(counts.bom),regular:pct(counts.regular),ruim:pct(counts.ruim),critico:pct(counts.critico)},
    gps_accuracy_mean_m:round(mean(points.map(p=>p.gps_accuracy_m).filter(Boolean)),2),
    storage:"IndexedDB"
  };
}

function updateStatus(){
  const pill=els.statusPill;
  pill.className = `status-pill ${state.collecting?"recording":"idle"}`;
  pill.querySelector("b").textContent = state.collecting ? (state.paused?"Pausado":"Gravando") : "Pronto";
  els.btnMain.className = `main-action ${state.collecting?"stop":"start"}`;
  els.btnMain.querySelector("b").textContent = state.collecting ? "Segure para parar" : "Iniciar gravação";
  els.btnMain.querySelector("small").textContent = state.collecting ? "encerrar gravação" : "calibrar e começar";
  els.btnMain.querySelector(".circle").textContent = state.collecting ? "■" : "●";
  els.btnPause.disabled = !state.collecting;
}
function updateMetrics(){
  const c=state.current;
  if(!c){
    els.distanceValue.textContent="0,0 km";
    els.durationValue.textContent="00:00:00";
    els.speedValue.textContent="-- km/h";
    setQuality({});
    return;
  }
  const secs=Math.max(0,Math.round((Date.now()-new Date(c.startedAt).getTime())/1000));
  els.distanceValue.textContent=fmtKm(c.totalDistanceM||0);
  els.durationValue.textContent=fmtTime(secs);
  const kmh = c.totalDistanceM && secs ? (c.totalDistanceM/secs)*3.6 : 0;
  els.speedValue.textContent = kmh ? `${kmh.toFixed(0)} km/h` : "-- km/h";
}
function setQuality(counts){
  const total=(counts.bom||0)+(counts.regular||0)+(counts.ruim||0)+(counts.critico||0);
  const pct=k=> total ? Math.round((counts[k]||0)*100/total) : 0;
  const good=pct("bom"), reg=pct("regular"), bad=pct("ruim"), crit=pct("critico");
  els.pctGood.textContent=`${good}%`; els.pctRegular.textContent=`${reg}%`; els.pctBad.textContent=`${bad}%`; els.pctCritical.textContent=`${crit}%`;
  els.barGood.style.width=`${good}%`; els.barRegular.style.width=`${reg}%`; els.barBad.style.width=`${bad}%`; els.barCritical.style.width=`${crit}%`;
  els.barEmpty.style.width= total ? "0%" : "100%";
}
async function updateDiagnostics(){
  try{
    const headers = await listHeaders();
    const dbText = await dbUsageText();
    els.diagGps.textContent = state.lastGps?.gps_accuracy_m ? `${state.lastGps.gps_accuracy_m.toFixed(0)}m` : "--";
    els.diagMotion.textContent = `${state.motionHz || SAMPLE_RATE_GUESS} Hz`;
    els.diagWake.textContent = state.wakeLock ? "ativa" : "não ativa";
    els.diagSave.textContent = "IndexedDB";
    els.diagGpsAge.textContent = state.lastGpsAt ? `${Math.round((Date.now()-state.lastGpsAt)/1000)}s` : "--";
    els.diagGpsInterval.textContent = state.gpsIntervals.length ? `${Math.round(mean(state.gpsIntervals))} ms` : "--";
    els.diagMotionHz.textContent = `${state.motionHz || SAMPLE_RATE_GUESS} Hz`;
    els.diagVisibility.textContent = document.visibilityState==="visible" ? "ativa" : "2º plano";
    els.diagHistoryCount.textContent = `${headers.length} coleta(s)`;
    els.diagDraftCount.textContent = `${headers.filter(h=>h.status==="draft").length} rascunho(s)`;
    els.diagStorageSize.textContent = "banco local";
    els.diagStorageKey.textContent = "IndexedDB";
    if(els.diagDbStatus) els.diagDbStatus.textContent = dbText;
  }catch(e){ console.warn(e); }
}

async function renderHistory(){
  const headers = await listHeaders();
  els.historyList.innerHTML="";
  if(!headers.length){ els.historyList.innerHTML='<p class="local-note">Nenhuma rota salva.</p>'; return; }
  for(const h of headers){
    const div=document.createElement("div");
    div.className="history-item";
    div.innerHTML = `
      <strong>${h.name}</strong>
      <small>${new Date(h.startedAt).toLocaleString()} · ${fmtKm(h.totalDistanceM||h.summary?.totalDistanceM||0)} · ${h.pointCount||0} pontos · ${h.segmentCount||0} trechos · ${h.status}</small>
      <div class="history-actions">
        <button data-map="${h.id}">ver mapa</button>
        <button data-zip="${h.id}">ZIP</button>
        <button data-csv="${h.id}">CSV</button>
        <button data-seg="${h.id}">trechos</button>
        <button data-del="${h.id}" class="danger">apagar</button>
      </div>`;
    els.historyList.appendChild(div);
  }
  els.historyList.querySelectorAll("[data-map]").forEach(b=>b.onclick=async()=>showOnMap(b.dataset.map));
  els.historyList.querySelectorAll("[data-zip]").forEach(b=>b.onclick=async()=>exportById(b.dataset.zip,"package"));
  els.historyList.querySelectorAll("[data-csv]").forEach(b=>b.onclick=async()=>exportById(b.dataset.csv,"csv"));
  els.historyList.querySelectorAll("[data-seg]").forEach(b=>b.onclick=async()=>exportById(b.dataset.seg,"segments"));
  els.historyList.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>deleteCollection(b.dataset.del));
}
async function getFullById(id){ const h=(await listHeaders()).find(x=>x.id===id); return h ? hydrate(h) : null; }
async function showOnMap(id){
  const c=await getFullById(id);
  if(!c) return;
  state.routeLayer.clearLayers();
  c.segments.forEach(drawSegment);
  if(c.points[0]) state.map.setView([c.points[0].lat,c.points[0].lon],15);
  els.drawer.classList.remove("open");
}
async function deleteCollection(id){
  if(!confirm("Apagar esta coleta?")) return;
  await deleteKey(COLLECTIONS,id);
  await deleteByCollection(POINTS,id);
  await deleteByCollection(SEGMENTS,id);
  await renderHistory(); updateDiagnostics();
}
async function clearAll(){
  if(!confirm("Apagar todo histórico do IndexedDB?")) return;
  for(const h of await listHeaders()) await deleteCollectionNoConfirm(h.id);
  await renderHistory(); updateDiagnostics();
}
async function deleteCollectionNoConfirm(id){
  await deleteKey(COLLECTIONS,id);
  await deleteByCollection(POINTS,id);
  await deleteByCollection(SEGMENTS,id);
}

function toCsv(c){
  const rows=c.points||[];
  const fields=["timestamp","lat","lon","gps_accuracy_m","speed_mps","heading","altitude","sample_count","roughness_mean","roughness_max","roughness_std","peak_count","roughness_index","classe"];
  return [fields.join(",")].concat(rows.map(r=>fields.map(f=>JSON.stringify(r[f]??"")).join(","))).join("\n");
}
function pointsGeo(c){
  return JSON.stringify({type:"FeatureCollection",metadata:{version:PAVIMENTOLAB_VERSION,summary:summarize(c)},features:(c.points||[]).map(p=>({type:"Feature",geometry:{type:"Point",coordinates:[p.lon,p.lat]},properties:{...p,lon:undefined,lat:undefined}}))});
}
function segmentsGeo(c){
  return JSON.stringify({type:"FeatureCollection",metadata:{version:PAVIMENTOLAB_VERSION,summary:summarize(c)},features:(c.segments||[]).map(s=>({type:"Feature",geometry:{type:"LineString",coordinates:[[s.lon_start,s.lat_start],[s.lon_end,s.lat_end]]},properties:{...s,lon_start:undefined,lat_start:undefined,lon_end:undefined,lat_end:undefined}}))});
}
function simplePointsGeo(c){
  const feats=[];
  (c.segments||[]).forEach(s=>{
    feats.push({type:"Feature",geometry:{type:"Point",coordinates:[s.lon_start,s.lat_start]},properties:{segment_id:s.segment_id,role:"start",classe:s.classe,roughness_index:s.roughness_index}});
    feats.push({type:"Feature",geometry:{type:"Point",coordinates:[s.lon_end,s.lat_end]},properties:{segment_id:s.segment_id,role:"end",classe:s.classe,roughness_index:s.roughness_index}});
  });
  return JSON.stringify({type:"FeatureCollection",metadata:{version:PAVIMENTOLAB_VERSION,simplification:"start_end_points_per_segment"},features:feats});
}
function download(name,text,type="application/json"){
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function exportPackage(c){
  if(typeof JSZip==="undefined"){ alert("JSZip não carregou."); return; }
  const zip=new JSZip();
  zip.file(`${c.name}_resumo.json`, JSON.stringify(summarize(c),null,2));
  zip.file(`${c.name}_pontos.csv`, toCsv(c));
  zip.file(`${c.name}_pontos.geojson`, pointsGeo(c));
  zip.file(`${c.name}_pontos_simplificados.geojson`, simplePointsGeo(c));
  zip.file(`${c.name}_trechos.geojson`, segmentsGeo(c));
  const blob=await zip.generateAsync({type:"blob"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`${c.name}_pacote.zip`; a.click(); URL.revokeObjectURL(url);
}
async function exportById(id,kind){ const c=await getFullById(id); if(c) exportCollection(c,kind); }
function exportCollection(c,kind){
  if(kind==="package") return exportPackage(c);
  if(kind==="csv") return download(`${c.name}_pontos.csv`,toCsv(c),"text/csv");
  if(kind==="raw") return download(`${c.name}_pontos.geojson`,pointsGeo(c));
  if(kind==="simple") return download(`${c.name}_pontos_simplificados.geojson`,simplePointsGeo(c));
  if(kind==="segments") return download(`${c.name}_trechos.geojson`,segmentsGeo(c));
  if(kind==="summary") return download(`${c.name}_resumo.json`,JSON.stringify(summarize(c),null,2));
}

function looksLikeCollection(o){ return o && typeof o==="object" && Array.isArray(o.points) && Array.isArray(o.segments); }
function normalizeCollection(c,source="import"){
  return {
    ...c,
    id:c.id || (crypto.randomUUID ? crypto.randomUUID() : `import_${Date.now()}_${Math.random()}`),
    name:c.name || `coleta_importada_${nowId()}`,
    version:c.version || "legacy",
    startedAt:c.startedAt || new Date().toISOString(),
    endedAt:c.endedAt || c.finalizedAt || new Date().toISOString(),
    finalizedAt:c.finalizedAt || c.endedAt || new Date().toISOString(),
    recovered:true,
    recoveredFrom:source,
    pointCount:c.points?.length || 0,
    segmentCount:c.segments?.length || 0,
    totalDistanceM:c.totalDistanceM || (c.segments||[]).reduce((s,x)=>s+(x.distance_m||0),0)
  };
}
async function importCollection(c,source){
  const n=normalizeCollection(c,source);
  await put(COLLECTIONS, headerFromCollection(n,"finalized"));
  await deleteByCollection(POINTS,n.id);
  await deleteByCollection(SEGMENTS,n.id);
  await bulkPut(POINTS,(n.points||[]).map(p=>({...p,collectionId:n.id})));
  await bulkPut(SEGMENTS,(n.segments||[]).map(s=>({...s,collectionId:n.id})));
  return n.id;
}
function collectionsFromJson(text,source){
  const parsed=JSON.parse(text);
  if(Array.isArray(parsed)) return parsed.filter(looksLikeCollection);
  if(Array.isArray(parsed.collections)) return parsed.collections.filter(looksLikeCollection);
  if(looksLikeCollection(parsed)) return [parsed];
  return [];
}
function scanLocal(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i), val=localStorage.getItem(key)||"";
    let collections=[];
    try{ collections=collectionsFromJson(val,key); }catch{}
    if(collections.length) out.push({key,size:val.length,collections});
  }
  return out;
}
function renderLocalScan(){
  const res=scanLocal();
  els.localDataList.innerHTML="";
  if(!res.length){ els.localDataList.innerHTML='<p class="local-note">Nenhum dado antigo encontrado.</p>'; return; }
  res.forEach((r,i)=>{
    const pts=r.collections.reduce((s,c)=>s+(c.points?.length||0),0);
    const seg=r.collections.reduce((s,c)=>s+(c.segments?.length||0),0);
    const div=document.createElement("div");
    div.className="local-item";
    div.innerHTML=`<strong>${r.key}</strong><small>${r.collections.length} coleta(s) · ${pts} pontos · ${seg} trechos · ${(r.size/1024).toFixed(1)} KB</small><div class="local-actions"><button data-import="${i}">importar</button><button data-backup="${i}">backup</button></div>`;
    els.localDataList.appendChild(div);
  });
  els.localDataList.querySelectorAll("[data-import]").forEach(b=>b.onclick=async()=>{
    const r=res[Number(b.dataset.import)];
    showModal("Importando",`Importando ${r.collections.length} coleta(s) para IndexedDB...`,true);
    let ok=0;
    for(const c of r.collections){ await importCollection(c,r.key); ok++; }
    await renderHistory(); updateDiagnostics();
    showModal("Importação concluída",`${ok} coleta(s) importadas para o banco local.`,false);
  });
  els.localDataList.querySelectorAll("[data-backup]").forEach(b=>b.onclick=()=>{
    const r=res[Number(b.dataset.backup)];
    download(`pavimentolab_backup_${r.key}_${nowId()}.json`,JSON.stringify({app_version:PAVIMENTOLAB_VERSION,source_key:r.key,collections:r.collections},null,2));
  });
}
function importBackupClick(){ els.backupFileInput.value=""; els.backupFileInput.click(); }
async function handleBackupFile(e){
  const file=e.target.files?.[0]; if(!file) return;
  try{
    showModal("Lendo backup","Carregando arquivo JSON...",true);
    const text=await file.text();
    const cols=collectionsFromJson(text,file.name);
    if(!cols.length) throw new Error("Nenhuma coleta válida encontrada.");
    let ok=0;
    for(const c of cols){ await importCollection(c,file.name); ok++; }
    await renderHistory(); updateDiagnostics();
    showModal("Backup importado",`${ok} coleta(s) importadas para IndexedDB.`,false);
  }catch(err){ showModal("Erro ao importar", err.message || String(err), false); }
}
async function backupAll(){
  const headers=await listHeaders();
  const collections=[];
  for(const h of headers) collections.push(await hydrate(h));
  download(`pavimentolab_v20_backup_${nowId()}.json`,JSON.stringify({app_version:PAVIMENTOLAB_VERSION,exported_at:new Date().toISOString(),collections},null,2));
}
async function cleanDrafts(){
  const headers=await listHeaders();
  const drafts=headers.filter(h=>h.status==="draft");
  if(!drafts.length){ showModal("Sem rascunhos","Nenhum rascunho no banco local.",false); return; }
  if(!confirm(`Apagar ${drafts.length} rascunho(s)?`)) return;
  for(const d of drafts) await deleteCollectionNoConfirm(d.id);
  await renderHistory(); updateDiagnostics();
}

function startHold(){
  if(!state.collecting){ startCollection(); return; }
  if(state.holdTimer) return;
  state.holdStart=Date.now();
  state.holdTimer=setInterval(()=>{
    const pct=Math.min(100,(Date.now()-state.holdStart)/1200*100);
    els.btnMain.style.setProperty("--hold",`${pct}%`);
    if(pct>=100){ clearInterval(state.holdTimer); state.holdTimer=null; els.btnMain.style.setProperty("--hold","0%"); stopCollection(); }
  },30);
}
function cancelHold(){ if(state.holdTimer){ clearInterval(state.holdTimer); state.holdTimer=null; els.btnMain.style.setProperty("--hold","0%"); } }

async function boot(){
  state.db = await openDb();
  initMap();
  locate();
  startGps();
  startMotion();
  await renderHistory();
  updateStatus();
  updateMetrics();
  updateDiagnostics();
  setInterval(updateDiagnostics,5000);

  els.btnMenu.onclick=()=>{ els.drawer.classList.add("open"); renderHistory(); renderLocalScan(); updateDiagnostics(); };
  els.btnCloseDrawer.onclick=()=>els.drawer.classList.remove("open");
  els.btnLocate.onclick=locate;
  els.btnMain.addEventListener("pointerdown",startHold);
  els.btnMain.addEventListener("pointerup",cancelHold);
  els.btnMain.addEventListener("pointerleave",cancelHold);
  els.btnPause.onclick=()=>{ if(!state.collecting) return; state.paused=!state.paused; els.btnPause.querySelector("b").textContent=state.paused?"Retomar":"Pausar"; updateStatus(); };
  els.btnCloseModal.onclick=closeModal;
  els.modal.addEventListener("click",e=>{ if(e.target===els.modal) closeModal(); });
  els.btnExportPackage.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"package");
  els.btnExportCsv.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"csv");
  els.btnExportRawPoints.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"raw");
  els.btnExportSimplePoints.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"simple");
  els.btnExportSegments.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"segments");
  els.btnExportSummary.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"summary");
  els.btnScanLocal.onclick=renderLocalScan;
  els.btnImportBackup.onclick=importBackupClick;
  els.backupFileInput.onchange=handleBackupFile;
  els.btnBackupAll.onclick=backupAll;
  els.btnCleanDrafts.onclick=cleanDrafts;
  els.btnClearAll.onclick=clearAll;
}
boot().catch(err=>{
  console.error(err);
  alert("Erro ao iniciar PavimentoLab v20: " + (err.message || err));
});
