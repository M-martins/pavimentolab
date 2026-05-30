
const PAVIMENTOLAB_VERSION = "v21.7.1-indexeddb-botoes-dados-locais";
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
const ROUGHNESS_THRESHOLDS = {
  bom: 0.45,
  regular: 1.10,
  ruim: 2.00
};
const CALIBRATION_MS = 10000;
const CLEAN_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const CLEAN_LABEL_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

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
  btnExportSummary: document.getElementById("btnExportSummary"),
  calibrationOverlay: document.getElementById("calibrationOverlay"),
  calibrationMessage: document.getElementById("calibrationMessage"),
  calibrationCount: document.getElementById("calibrationCount"),
  calibrationProgress: document.getElementById("calibrationProgress"),
  calibrationSamples: document.getElementById("calibrationSamples")
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
  calibrating:false,
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
  if(v == null || !Number.isFinite(v)) return "sem_amostra";
  if(v < ROUGHNESS_THRESHOLDS.bom) return "bom";
  if(v < ROUGHNESS_THRESHOLDS.regular) return "regular";
  if(v < ROUGHNESS_THRESHOLDS.ruim) return "ruim";
  return "critico";
}

function motionSampleValue(s){
  // Compatibilidade: versões antigas salvavam objeto com az; v20/v21 passaram a salvar número.
  if(typeof s === "number") return s;
  if(s && typeof s.az === "number") return s.az;
  if(s && typeof s.z === "number") return s.z;
  return 0;
}

function roughnessValue(s){
  // v21.7: volta à lógica antiga: eixo Z calibrado, subtraindo ruído da calibração.
  // Isso evita que o valor absoluto da gravidade / magnitude jogue tudo para ruim/crítico.
  const calibration = state.current?.calibration || state.calibration || {};
  const azMean = typeof calibration.azMean === "number" ? calibration.azMean :
                 typeof calibration.baseline_mean === "number" ? calibration.baseline_mean : 9.81;
  const azStd = typeof calibration.azStd === "number" ? calibration.azStd :
                typeof calibration.baseline_std === "number" ? calibration.baseline_std : 0.05;
  const az = motionSampleValue(s);
  return Math.max(0, Math.abs(az - azMean) - azStd);
}

function classCountsFromSegments(segments=[]){
  const counts={bom:0,regular:0,ruim:0,critico:0};
  (segments||[]).forEach(s=>{ if(counts[s.classe]!==undefined) counts[s.classe]++; });
  return counts;
}

function touchQuality(seg){
  if(!state.current || !seg) return;
  if(!state.current.classCounts) state.current.classCounts={bom:0,regular:0,ruim:0,critico:0};
  if(state.current.classCounts[seg.classe] !== undefined){
    state.current.classCounts[seg.classe] += 1;
  }
  setQuality(state.current.classCounts);
}

function collectionDisplayName(){
  // Nome neutro. O modelo real nem sempre está disponível no navegador.
  return `coleta_${nowId()}`;
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


function lockCalibrationModal(){
  state.calibrating = true;
  document.body.classList.add("calibrating-lock");
}

function unlockCalibrationModal(){
  state.calibrating = false;
  document.body.classList.remove("calibrating-lock");
}

function showCalibrationModal(title, text){
  lockCalibrationModal();
  els.modalTitle.textContent = title;
  els.modalText.textContent = text;
  els.spinner.classList.remove("hidden");
  els.modalActions.classList.add("hidden");
  els.modal.classList.remove("hidden");
}


function showModal(title,text,loading=false){
  els.modalTitle.textContent = title;
  els.modalText.textContent = text;
  els.spinner.classList.toggle("hidden", !loading);
  els.modalActions.classList.add("hidden");
  els.modal.classList.remove("hidden");
}
function closeModal(force=false){
  if(state.calibrating && !force) return;
  els.modal.classList.add("hidden");
}


function showExportModal(c){
  state.lastStopped = c;
  els.modalTitle.textContent = "Coleta salva";
  els.modalText.textContent = "Deseja gerar os arquivos de saída agora?";
  els.spinner.classList.add("hidden");
  els.modalActions.classList.remove("hidden");
  els.modal.classList.remove("hidden");
}

function initMap(){
  state.map = L.map("map",{zoomControl:false,attributionControl:false}).setView([-23.5505,-46.6333],14);

  L.tileLayer(CLEAN_TILE_URL,{
    maxZoom:20,
    attribution:"Esri, OpenStreetMap"
  }).addTo(state.map);

  L.tileLayer(CLEAN_LABEL_URL,{
    maxZoom:20,
    attribution:""
  }).addTo(state.map);

  L.control.zoom({position:"bottomright"}).addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
  state.marker = L.circleMarker([-23.5505,-46.6333],{
    radius:10,
    color:"#0f172a",
    weight:3,
    fillColor:"#38bdf8",
    fillOpacity:.95
  }).addTo(state.map);
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
    touchQuality(seg);
    flushSegments().catch(()=>{});
    updateMetrics();
    state.current.summary = summarize({points:[], segments:[], ...state.current, segments:[...state.segmentBatch]});
    saveHeader(state.current,"draft").catch(()=>{});
  }
}
function computeRoughness(samples){
  const vals=(samples||[]).map(roughnessValue).filter(v=>Number.isFinite(v));
  if(!vals.length) return {
    sample_count:0,
    roughness_mean:null,
    roughness_max:null,
    roughness_std:null,
    peak_count:0,
    roughness_index:null
  };

  const m = mean(vals);
  const max = Math.max(...vals);
  const std = Math.sqrt(mean(vals.map(v=>(v-m)**2)));
  const peaks = vals.filter(v=>v>=2.0).length;
  const index = m + (std * 0.5) + (peaks ? Math.min(1, peaks / 10) : 0);

  return {
    sample_count:vals.length,
    roughness_mean:round(m,3),
    roughness_max:round(max,3),
    roughness_std:round(std,3),
    peak_count:peaks,
    roughness_index:round(index,3)
  };
}
function startMotion(){
  window.addEventListener("devicemotion", e=>{
    const acc=e.accelerationIncludingGravity || e.acceleration || {};
    const rot=e.rotationRate || {};
    const sample={
      t:new Date().toISOString(),
      ax:Number(acc.x||0),
      ay:Number(acc.y||0),
      az:Number(acc.z||0),
      gx:Number(rot.alpha||0),
      gy:Number(rot.beta||0),
      gz:Number(rot.gamma||0)
    };
    state.motionBuffer.push(sample);
    if(state.motionBuffer.length>1800) state.motionBuffer.splice(0,state.motionBuffer.length-1800);
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


function showCalibrationScreen(){}

function updateCalibrationScreen(elapsedMs, samplesCount){}

function hideCalibrationScreen(){}


async function calibrateSensors(){
  showCalibrationModal(
    "Calibrando sensores",
    "Deixe o celular parado por 10 segundos antes de iniciar. Faltam 10s. Amostras: 0"
  );

  try{
    if(typeof DeviceMotionEvent !== "undefined" &&
       typeof DeviceMotionEvent.requestPermission === "function"){
      await DeviceMotionEvent.requestPermission();
    }
  }catch(err){
    console.warn("Permissão de movimento não concedida ou não necessária", err);
  }

  await requestWakeLock();

  const samples = [];
  if(Array.isArray(state.motionBuffer)) state.motionBuffer.splice(0);

  const start = Date.now();

  while(Date.now() - start < CALIBRATION_MS){
    if(Array.isArray(state.motionBuffer) && state.motionBuffer.length){
      samples.push(...state.motionBuffer.splice(0));
    }

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, Math.ceil((CALIBRATION_MS - elapsed) / 1000));
    const progress = Math.min(100, Math.round((elapsed / CALIBRATION_MS) * 100));

    els.modalTitle.textContent = "Calibrando sensores";
    els.modalText.innerHTML =
      `Deixe o celular parado por 10 segundos antes de iniciar.<br>` +
      `<strong>Faltam ${remaining}s</strong><br>` +
      `Amostras: ${samples.length}<br>` +
      `<div style="height:10px;border-radius:999px;background:rgba(148,163,184,.25);overflow:hidden;margin-top:12px;">` +
      `<div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#38bdf8,#22c55e);"></div>` +
      `</div>`;

    els.modal.classList.remove("hidden");
    document.body.classList.add("calibrating-lock");

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if(Array.isArray(state.motionBuffer) && state.motionBuffer.length){
    samples.push(...state.motionBuffer.splice(0));
  }

  const azValues = samples.map(motionSampleValue).filter(v=>Number.isFinite(v));
  const azMean = azValues.length ? mean(azValues) : 9.81;
  const azStd = azValues.length ? Math.sqrt(mean(azValues.map(v => (v - azMean) ** 2))) : 0.05;

  els.modalText.innerHTML = "Calibração concluída. Iniciando gravação...";
  await new Promise(resolve => setTimeout(resolve, 500));

  unlockCalibrationModal();
  closeModal(true);

  const calibration = {
    date:new Date().toISOString(),
    version:PAVIMENTOLAB_VERSION,
    duration_ms:CALIBRATION_MS,
    samples:azValues.length,
    azMean:round(azMean,4),
    azStd:round(azStd,4),
    baseline_mean:round(azMean,4),
    baseline_std:round(azStd,4),
    motion_hz:state.motionHz || SAMPLE_RATE_GUESS,
    gps_accuracy_m:state.lastGps?.gps_accuracy_m || state.lastGps?.accuracy || null,
    gps_available:!!state.lastGps,
    mandatory:true,
    ui:"modal-fixo-mobile",
    algorithm:"az_calibrated_noise_subtracted"
  };

  try{
    localStorage.setItem("pavimentolab_calibration_v21_7", JSON.stringify(calibration));
  }catch(err){
    console.warn("Não foi possível salvar calibração no localStorage", err);
  }

  return calibration;
}

async function startCollection(){
  if(state.collecting || state.finalizing || state.calibrating) return;

  try{
    const calibration = await calibrateSensors();

    const id = crypto.randomUUID ? crypto.randomUUID() : `coleta_${Date.now()}`;
    if(state.routeLayer) state.routeLayer.clearLayers();

    state.current = {
      id,
      name:collectionDisplayName(),
      version:PAVIMENTOLAB_VERSION,
      startedAt:new Date().toISOString(),
      endedAt:null,
      finalizedAt:null,
      status:"draft",
      device:"browser_dynamic",
      deviceInfo:deviceInfo(),
      calibration,
      totalDistanceM:0,
      pointCount:0,
      segmentCount:0,
      pendingDistance:0,
      lastSegmentPoint:null,
      classCounts:{bom:0,regular:0,ruim:0,critico:0}
    };

    state.pointBatch=[];
    state.segmentBatch=[];
    state.collecting=true;
    state.paused=false;

    await saveHeader(state.current,"draft");
    await requestWakeLock();

    if(state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer=setInterval(updateMetrics,1000);

    updateStatus();
    updateMetrics();

    if(state.lastGps) updateMarker(state.lastGps,true);
  }catch(err){
    state.calibrating=false;
    unlockCalibrationModal();
    closeModal(true);
    alert(err.message || "Não foi possível iniciar a coleta.");
  }
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
    if(typeof showExportModal === "function"){
      showExportModal(full);
    }else{
      showModal("Coleta salva", "A coleta foi salva no histórico. Abra o menu para exportar os arquivos.", false);
    }
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
  const counts={bom:0,regular:0,ruim:0,critico:0,sem_amostra:0};
  segments.forEach(s=>{ if(counts[s.classe]!==undefined) counts[s.classe]++; });
  const total = counts.bom+counts.regular+counts.ruim+counts.critico;
  const pct = n => total ? Math.round(n/total*100) : 0;
  const gpsVals=points.map(p=>p.gps_accuracy_m).filter(v=>typeof v==="number" && Number.isFinite(v));
  const speeds=points.map(p=>p.speed_mps).filter(v=>typeof v==="number" && Number.isFinite(v) && v>0);
  const rough=segments.map(s=>s.roughness_index).filter(v=>typeof v==="number" && Number.isFinite(v));
  const worst=[...segments].filter(s=>typeof s.roughness_index==="number").sort((a,b)=>b.roughness_index-a.roughness_index)[0]||null;
  const avgSeg = segments.length ? distance/segments.length : null;
  const warnings=[];
  if(gpsVals.length && gpsVals.filter(v=>v>25).length/gpsVals.length > .2) warnings.push("gps_com_muitos_pontos_acima_25m");
  if(segments.length && counts.sem_amostra/segments.length > .1) warnings.push("muitos_trechos_sem_amostra");
  if(avgSeg !== null && avgSeg < 8) warnings.push("trechos_muito_curtos");
  if(rough.length && mean(rough) > 2) warnings.push("indice_medio_alto_verificar_calibracao");

  return {
    app_version:PAVIMENTOLAB_VERSION,
    name:c.name,
    startedAt:c.startedAt,
    endedAt:c.endedAt,
    finalizedAt:c.finalizedAt||null,
    totalDistanceM:round(distance,2),
    totalDistanceKm:round(distance/1000,3),
    duration_seconds:c.startedAt && c.endedAt ? Math.max(0,Math.round((new Date(c.endedAt)-new Date(c.startedAt))/1000)) : null,
    pointCount:points.length || c.pointCount || 0,
    segmentCount:segments.length || c.segmentCount || 0,
    aggregation_m:AGGREGATION_M,
    anti_drift_min_step_m:ANTI_DRIFT_M,
    avg_segment_m:avgSeg==null?null:round(avgSeg,2),
    class_counts:counts,
    class_percentages:{bom:pct(counts.bom),regular:pct(counts.regular),ruim:pct(counts.ruim),critico:pct(counts.critico)},
    gps_accuracy_mean_m:gpsVals.length?round(mean(gpsVals),2):null,
    gps_accuracy_max_m:gpsVals.length?round(Math.max(...gpsVals),2):null,
    speed_mean_kmh:speeds.length?round(mean(speeds)*3.6,2):null,
    roughness_mean:rough.length?round(mean(rough),3):null,
    roughness_max:rough.length?round(Math.max(...rough),3):null,
    worst_segment:worst?{
      segment_id:worst.segment_id, roughness_index:worst.roughness_index, classe:worst.classe,
      distance_m:worst.distance_m, timestamp_start:worst.timestamp_start, timestamp_end:worst.timestamp_end,
      lon_start:worst.lon_start, lat_start:worst.lat_start, lon_end:worst.lon_end, lat_end:worst.lat_end
    }:null,
    quality_warnings:warnings,
    calibration:c.calibration||null,
    device:c.deviceInfo||null,
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


function qualityLine(summary){
  if(!summary || !summary.class_percentages) return "qualidade: sem resumo";
  const p=summary.class_percentages;
  return `qualidade: boa ${p.bom||0}% · regular ${p.regular||0}% · ruim ${p.ruim||0}% · crítica ${p.critico||0}%`;
}

async function renderHistory(){
  let headers = await listHeaders();
  // Backfill leve: se header finalizado não tem resumo, calcula a partir do IndexedDB.
  for(const h of headers){
    if(!h.summary && h.status==="finalized"){
      try{ const full=await hydrate(h); h.summary=summarize(full); await put(COLLECTIONS, headerFromCollection({...full,summary:h.summary},h.status||"finalized")); }catch(e){ console.warn("backfill resumo falhou",e); }
    }
  }
  els.historyList.innerHTML="";
  if(!headers.length){ els.historyList.innerHTML='<p class="local-note">Nenhuma rota salva.</p>'; return; }
  for(const h of headers){
    const div=document.createElement("div");
    div.className="history-item";
    div.innerHTML = `
      <strong>${h.name}</strong>
      <small>${new Date(h.startedAt).toLocaleString()} · ${fmtKm(h.totalDistanceM||h.summary?.totalDistanceM||0)} · ${h.pointCount||0} pontos · ${h.segmentCount||0} trechos · ${h.status}<br>${qualityLine(h.summary)}</small>
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
function renderLocalScan(showFeedback=false){
  const res=scanLocal();
  els.localDataList.innerHTML="";
  if(!res.length){
    els.localDataList.innerHTML='<p class="local-note">Nenhum dado antigo encontrado.</p>';
    if(showFeedback) showModal("Busca concluída","Nenhum dado antigo em localStorage foi encontrado. As coletas atuais já estão no Histórico / IndexedDB.",false);
    return 0;
  }
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
  if(showFeedback) showModal("Busca concluída",`${res.length} grupo(s) de dados antigos encontrado(s).`,false);
  return res.length;
}
function importBackupClick(){
  if(!els.backupFileInput){
    showModal("Importar backup","Campo de arquivo não encontrado na tela.",false);
    return;
  }
  els.backupFileInput.value="";
  els.backupFileInput.click();
}
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
  download(`pavimentolab_v21_7_backup_${nowId()}.json`,JSON.stringify({app_version:PAVIMENTOLAB_VERSION,exported_at:new Date().toISOString(),collections},null,2));
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
  if(state.calibrating || state.finalizing) return;

  if(!state.collecting){
    startCollection();
    return;
  }

  if(state.holdTimer) return;
  state.holdStart=Date.now();
  state.holdTimer=setInterval(()=>{
    const pct=Math.min(100,(Date.now()-state.holdStart)/1200*100);
    els.btnMain.style.setProperty("--hold",`${pct}%`);
    if(pct>=100){
      clearInterval(state.holdTimer);
      state.holdTimer=null;
      els.btnMain.style.setProperty("--hold","0%");
      stopCollection();
    }
  },30);
}
function cancelHold(){ if(state.holdTimer){ clearInterval(state.holdTimer); state.holdTimer=null; els.btnMain.style.setProperty("--hold","0%"); } }


function bindResilientDrawerButtons(){
  const bind = (el, fn) => {
    if(!el || el.dataset.boundResilient === "1") return;
    el.dataset.boundResilient = "1";
    el.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      try{ await fn(e); }
      catch(err){ showModal("Erro", err.message || String(err), false); }
    }, {capture:true});
    el.addEventListener("touchend", async e => {
      e.preventDefault();
      e.stopPropagation();
      try{ await fn(e); }
      catch(err){ showModal("Erro", err.message || String(err), false); }
    }, {capture:true});
  };

  bind(els.btnScanLocal, async()=>renderLocalScan(true));
  bind(els.btnImportBackup, async()=>importBackupClick());
  bind(els.btnBackupAll, async()=>backupAll());
  bind(els.btnCleanDrafts, async()=>cleanDrafts());
  bind(els.btnClearAll, async()=>clearAll());
}

async function boot(){
  state.db = await openDb();
  initMap();
  if(state.routeLayer) state.routeLayer.clearLayers();
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
  els.btnCloseModal.onclick=()=>closeModal(false);
  els.modal.addEventListener("click",e=>{ if(state.calibrating) return; if(e.target===els.modal) closeModal(); });
  els.btnExportPackage.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"package");
  els.btnExportCsv.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"csv");
  els.btnExportRawPoints.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"raw");
  els.btnExportSimplePoints.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"simple");
  els.btnExportSegments.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"segments");
  els.btnExportSummary.onclick=()=> state.lastStopped && exportCollection(state.lastStopped,"summary");
  els.btnScanLocal.onclick=()=>renderLocalScan(true);
  els.btnImportBackup.onclick=importBackupClick;
  els.backupFileInput.onchange=handleBackupFile;
  els.btnBackupAll.onclick=backupAll;
  els.btnCleanDrafts.onclick=cleanDrafts;
  els.btnClearAll.onclick=clearAll;
  bindResilientDrawerButtons();
}
boot().catch(err=>{
  console.error(err);
  alert("Erro ao iniciar PavimentoLab v21.7.1: " + (err.message || err));
});
