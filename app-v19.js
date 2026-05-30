const PAVIMENTOLAB_VERSION = "v19-indexeddb";
console.log("PavimentoLab", PAVIMENTOLAB_VERSION);

const state = {
  collecting:false, paused:false, current:null,
  calibration:null, calibrationSamples:null,
  gpsWatchId:null, lastGpsAt:null, lastGpsTick:null, gpsIntervals:[],
  lastGpsPosition:null, lastGpsPoint:null,
  motionBuffer:[], motionTickCount:0, motionHz:0, lastMotionHzAt:Date.now(), lastMotionAt:null,
  wakeLock:null, map:null, routeLayer:null, marker:null,
  elapsedTimer:null, holdTimer:null, holdStart:null, lastSaveAt:null, saveCounter:0,
  lastStoppedCollection:null,
  finalizing:false, pointBatch:[], segmentBatch:[], indexedDbReady:false
};

const els = {
  btnMenu:document.getElementById("btnMenu"), drawer:document.getElementById("drawer"), btnCloseDrawer:document.getElementById("btnCloseDrawer"),
  statusPill:document.getElementById("statusPill"), gpsPill:document.getElementById("gpsPill"), btnLocate:document.getElementById("btnLocate"),
  distanceValue:document.getElementById("distanceValue"), durationValue:document.getElementById("durationValue"), speedValue:document.getElementById("speedValue"),
  pctGood:document.getElementById("pctGood"), pctRegular:document.getElementById("pctRegular"), pctBad:document.getElementById("pctBad"), pctCritical:document.getElementById("pctCritical"),
  barGood:document.getElementById("barGood"), barRegular:document.getElementById("barRegular"), barBad:document.getElementById("barBad"), barCritical:document.getElementById("barCritical"), barEmpty:document.getElementById("barEmpty"),
  btnMain:document.getElementById("btnMain"), btnPause:document.getElementById("btnPause"), holdProgress:document.getElementById("holdProgress"),
  diagGps:document.getElementById("diagGps"), diagMotion:document.getElementById("diagMotion"), diagWake:document.getElementById("diagWake"), diagSave:document.getElementById("diagSave"),
  diagGpsAge:document.getElementById("diagGpsAge"), diagGpsInterval:document.getElementById("diagGpsInterval"), diagMotionHz:document.getElementById("diagMotionHz"), diagVisibility:document.getElementById("diagVisibility"), diagHistoryCount:document.getElementById("diagHistoryCount"), diagDraftCount:document.getElementById("diagDraftCount"), diagStorageSize:document.getElementById("diagStorageSize"), diagStorageKey:document.getElementById("diagStorageKey"), diagDbStatus:document.getElementById("diagDbStatus"),
  historyList:document.getElementById("historyList"), localDataList:document.getElementById("localDataList"), btnScanLocal:document.getElementById("btnScanLocal"), btnImportBackup:document.getElementById("btnImportBackup"), backupFileInput:document.getElementById("backupFileInput"), btnClearAll:document.getElementById("btnClearAll"), btnBackupAll:document.getElementById("btnBackupAll"), btnCleanDrafts:document.getElementById("btnCleanDrafts"),
  modal:document.getElementById("modal"), modalTitle:document.getElementById("modalTitle"), modalText:document.getElementById("modalText"), spinner:document.getElementById("spinner"), modalActions:document.getElementById("modalActions"),
  btnExportPackage:document.getElementById("btnExportPackage"), btnExportCsv:document.getElementById("btnExportCsv"), btnExportRawPoints:document.getElementById("btnExportRawPoints"), btnExportSimplePoints:document.getElementById("btnExportSimplePoints"), btnExportSegments:document.getElementById("btnExportSegments"), btnExportSummary:document.getElementById("btnExportSummary"), btnCloseModal:document.getElementById("btnCloseModal")
};

const COLORS={bom:"#22c55e",regular:"#facc15",ruim:"#f97316",critico:"#ef4444",sem_amostra:"#94a3b8"};
const STORAGE_KEY="pavimentolab_collections_v19";
const DRAFT_KEY="pavimentolab_current_v19";
const LEGACY_COLLECTION_KEYS=["pavimentolab_collections_v5","pavimentolab_collections_v12","pavimentolab_collections_v13","pavimentolab_collections_v14","pavimentolab_collections_v15","pavimentolab_collections_v16","pavimentolab_collections_v17","pavimentolab_collections_v18"];
const LEGACY_DRAFT_KEYS=["pavimentolab_current_v5","pavimentolab_current_v12","pavimentolab_current_v13","pavimentolab_current_v14","pavimentolab_current_v15","pavimentolab_current_v16","pavimentolab_current_v17","pavimentolab_current_v18"];
const AGGREGATION_M=10;
const ANTI_DRIFT_M=2;

const DB_NAME = "pavimentolab_db";
const DB_VERSION = 1;
const POINT_BATCH_SIZE = 100;
const SEGMENT_BATCH_SIZE = 100;

let dbPromise = null;

function openPavimentoDb(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){
      reject(new Error("IndexedDB não disponível neste navegador"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event)=>{
      const db = event.target.result;
      if(!db.objectStoreNames.contains("collections")){
        const store = db.createObjectStore("collections", {keyPath:"id"});
        store.createIndex("startedAt","startedAt",{unique:false});
        store.createIndex("status","status",{unique:false});
      }
      if(!db.objectStoreNames.contains("points")){
        const store = db.createObjectStore("points", {keyPath:"pk", autoIncrement:true});
        store.createIndex("collectionId","collectionId",{unique:false});
        store.createIndex("timestamp","timestamp",{unique:false});
      }
      if(!db.objectStoreNames.contains("segments")){
        const store = db.createObjectStore("segments", {keyPath:"pk", autoIncrement:true});
        store.createIndex("collectionId","collectionId",{unique:false});
        store.createIndex("segment_id","segment_id",{unique:false});
      }
      if(!db.objectStoreNames.contains("meta")){
        db.createObjectStore("meta", {keyPath:"key"});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
  return dbPromise;
}

function idbRequest(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function idbTx(storeName, mode="readonly"){
  const db = await openPavimentoDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function idbPut(storeName, value){
  const store = await idbTx(storeName, "readwrite");
  return idbRequest(store.put(value));
}

async function idbBulkPut(storeName, values){
  if(!values || !values.length) return 0;
  const db = await openPavimentoDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach(v=>store.put(v));
    tx.oncomplete=()=>resolve(values.length);
    tx.onerror=()=>reject(tx.error);
  });
}

async function idbGetAll(storeName){
  const store = await idbTx(storeName, "readonly");
  return idbRequest(store.getAll());
}

async function idbGetAllByIndex(storeName, indexName, value){
  const store = await idbTx(storeName, "readonly");
  return idbRequest(store.index(indexName).getAll(value));
}

async function idbDeleteByIndex(storeName, indexName, value){
  const db = await openPavimentoDb();
  const rows = await idbGetAllByIndex(storeName, indexName, value);
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    rows.forEach(row=>store.delete(row.pk));
    tx.oncomplete=()=>resolve(rows.length);
    tx.onerror=()=>reject(tx.error);
  });
}

async function idbSaveCollectionHeader(c, status="draft"){
  const header = {
    id:c.id,
    name:c.name,
    version:c.version || PAVIMENTOLAB_VERSION,
    startedAt:c.startedAt,
    endedAt:c.endedAt || null,
    finalizedAt:c.finalizedAt || null,
    status,
    device:c.device || null,
    deviceInfo:c.deviceInfo || null,
    calibration:c.calibration || null,
    totalDistanceM:c.totalDistanceM || 0,
    pointCount:c.points?.length || c.pointCount || 0,
    segmentCount:c.segments?.length || c.segmentCount || 0,
    summary:c.summary || null,
    recovered:!!c.recovered,
    recoveredFrom:c.recoveredFrom || null,
    updatedAt:new Date().toISOString()
  };
  await idbPut("collections", header);
}

async function idbAppendPoints(collectionId, points){
  return idbBulkPut("points", points.map(p=>({...p, collectionId})));
}

async function idbAppendSegments(collectionId, segments){
  return idbBulkPut("segments", segments.map(s=>({...s, collectionId})));
}

async function idbListCollections(){
  try{
    const rows = await idbGetAll("collections");
    return rows.sort((a,b)=>new Date(b.startedAt||0)-new Date(a.startedAt||0));
  }catch(err){
    console.warn("Falha ao listar IndexedDB", err);
    return [];
  }
}

async function idbHydrateCollection(header){
  const points = await idbGetAllByIndex("points","collectionId",header.id);
  const segments = await idbGetAllByIndex("segments","collectionId",header.id);
  return {...header, points, segments};
}

async function idbImportFullCollection(c, source="import"){
  const normalized = normalizeRecoveredCollection(c, source);
  await idbSaveCollectionHeader(normalized, normalized.endedAt ? "finalized" : "draft");
  await idbDeleteByIndex("points","collectionId",normalized.id);
  await idbDeleteByIndex("segments","collectionId",normalized.id);
  await idbAppendPoints(normalized.id, normalized.points || []);
  await idbAppendSegments(normalized.id, normalized.segments || []);
  return normalized.id;
}

async function idbStatusText(){
  try{
    const headers = await idbListCollections();
    return `ok · ${headers.length} coleta(s)`;
  }catch(err){
    return "indisponível";
  }
}


function getDeviceInfo(){
  const nav = navigator || {};
  const scr = window.screen || {};
  return {
    app_version: PAVIMENTOLAB_VERSION,
    collected_at: new Date().toISOString(),
    user_agent: nav.userAgent || null,
    platform: nav.platform || null,
    language: nav.language || null,
    languages: nav.languages || null,
    vendor: nav.vendor || null,
    hardware_concurrency: nav.hardwareConcurrency || null,
    device_memory_gb: nav.deviceMemory || null,
    max_touch_points: nav.maxTouchPoints || null,
    screen_width: scr.width || null,
    screen_height: scr.height || null,
    screen_avail_width: scr.availWidth || null,
    screen_avail_height: scr.availHeight || null,
    device_pixel_ratio: window.devicePixelRatio || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    page_url: location.href
  };
}

function summarizeCollection(c){
  const points = c.points || [];
  const segments = c.segments || [];
  const gpsValues = points.map(p => p.gps_accuracy_m).filter(v => typeof v === "number");
  const speeds = points.map(p => p.speed_mps).filter(v => typeof v === "number" && v > 0);
  const rough = segments.map(s => s.roughness_index).filter(v => typeof v === "number");
  const distance = c.totalDistanceM || segments.reduce((sum,s)=>sum+(s.distance_m||0),0);
  const start = c.startedAt ? new Date(c.startedAt).getTime() : null;
  const end = c.endedAt ? new Date(c.endedAt).getTime() : Date.now();
  const durationSeconds = start ? Math.max(0, Math.round((end-start)/1000)) : null;

  const countByClass = {
    bom: segments.filter(s=>s.classe==="bom").length,
    regular: segments.filter(s=>s.classe==="regular").length,
    ruim: segments.filter(s=>s.classe==="ruim").length,
    critico: segments.filter(s=>s.classe==="critico").length,
    sem_amostra: segments.filter(s=>s.classe==="sem_amostra").length
  };
  const totalClassified = countByClass.bom + countByClass.regular + countByClass.ruim + countByClass.critico;
  const pct = n => totalClassified ? Math.round(n/totalClassified*100) : 0;
  const worst = [...segments].filter(s=>typeof s.roughness_index==="number").sort((a,b)=>b.roughness_index-a.roughness_index)[0] || null;

  return {
    app_version: c.version || PAVIMENTOLAB_VERSION,
    name: c.name,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    finalizedAt: c.finalizedAt || null,
    duration_seconds: durationSeconds,
    totalDistanceM: distance,
    totalDistanceKm: distance / 1000,
    pointCount: points.length,
    segmentCount: segments.length,
    aggregation_m: AGGREGATION_M,
    anti_drift_min_step_m: ANTI_DRIFT_M,
    gps_accuracy_mean_m: gpsValues.length ? mean(gpsValues) : null,
    gps_accuracy_max_m: gpsValues.length ? Math.max(...gpsValues) : null,
    speed_mean_kmh: speeds.length ? mean(speeds)*3.6 : null,
    roughness_mean: rough.length ? mean(rough) : null,
    roughness_max: rough.length ? Math.max(...rough) : null,
    class_counts: countByClass,
    class_percentages: {
      bom: pct(countByClass.bom),
      regular: pct(countByClass.regular),
      ruim: pct(countByClass.ruim),
      critico: pct(countByClass.critico)
    },
    worst_segment: worst ? {
      segment_id: worst.segment_id,
      roughness_index: worst.roughness_index,
      classe: worst.classe,
      distance_m: worst.distance_m,
      timestamp_start: worst.timestamp_start,
      timestamp_end: worst.timestamp_end,
      lon_start: worst.lon_start,
      lat_start: worst.lat_start,
      lon_end: worst.lon_end,
      lat_end: worst.lat_end
    } : null,
    quality_warnings: buildQualityWarnings(c),
    device: c.deviceInfo || getDeviceInfo(),
    calibration: c.calibration || null,
    visibilityEvents: c.visibilityEvents || []
  };
}

function buildQualityWarnings(c){
  const warnings = [];
  const points = c.points || [];
  const segments = c.segments || [];
  const gpsValues = points.map(p => p.gps_accuracy_m).filter(v => typeof v === "number");
  const badGps = gpsValues.filter(v=>v>25).length;
  const noSampleSegments = segments.filter(s=>s.classe==="sem_amostra" || (s.flags||"").includes("sem_amostra")).length;
  const lowConfidence = segments.filter(s=>s.segment_quality==="baixa_confianca").length;

  if (gpsValues.length && badGps/gpsValues.length > 0.2) warnings.push("gps_com_muitos_pontos_acima_25m");
  if (segments.length && noSampleSegments/segments.length > 0.1) warnings.push("muitos_trechos_sem_amostra_acelerometro");
  if (segments.length && lowConfidence/segments.length > 0.1) warnings.push("muitos_trechos_baixa_confianca");
  if (!segments.length) warnings.push("sem_trechos_exportados");
  return warnings;
}


function pad(n){return String(n).padStart(2,"0")}
function nowId(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`}
function collectionName(){return `coleta_${nowId()}_motorola_g82`}
function mean(v){return v.length?v.reduce((a,b)=>a+b,0)/v.length:0}
function std(v,a=mean(v)){if(v.length<2)return 0;return Math.sqrt(v.reduce((s,x)=>s+(x-a)**2,0)/(v.length-1))}
function formatKm(m){return `${((m||0)/1000).toFixed(1).replace(".",",")} km`}
function formatDuration(ms){const t=Math.max(0,Math.floor(ms/1000));return `${pad(Math.floor(t/3600))}:${pad(Math.floor((t%3600)/60))}:${pad(t%60)}`}

function bytesToHuman(bytes){
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function localStorageSize(){
  let total = 0;
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || "";
    total += k.length + v.length;
  }
  return total;
}

function countDrafts(){
  const keys = [DRAFT_KEY, ...LEGACY_DRAFT_KEYS];
  let count = 0;
  keys.forEach(k=>{
    try{
      const raw = localStorage.getItem(k);
      if(!raw) return;
      const d = JSON.parse(raw);
      if(d && !d.endedAt && ((Array.isArray(d.points)&&d.points.length) || (Array.isArray(d.segments)&&d.segments.length))) count++;
    }catch{}
  });
  return count;
}

function distanceMeters(a,b){if(!a||!b)return null;const R=6371000,rad=d=>d*Math.PI/180;const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la1=rad(a.lat),la2=rad(b.lat);const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function getCollections(){return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}
function saveCollection(c){
  const list = getCollections();
  const existing = list.findIndex(x=>x.id===c.id);

  const lite = {
    id:c.id,
    name:c.name,
    version:c.version || PAVIMENTOLAB_VERSION,
    startedAt:c.startedAt,
    endedAt:c.endedAt || null,
    finalizedAt:c.finalizedAt || null,
    device:c.device || null,
    deviceInfo:c.deviceInfo || null,
    calibration:c.calibration || null,
    totalDistanceM:c.totalDistanceM || 0,
    pointCount:c.points?.length || c.pointCount || 0,
    segmentCount:c.segments?.length || c.segmentCount || 0,
    summary:c.summary || null,
    recovered:!!c.recovered,
    recoveredFrom:c.recoveredFrom || null,
    storage:"indexeddb"
  };

  if(existing>=0) list[existing]=lite;
  else list.unshift(lite);

  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }catch(err){
    console.warn("Falha ao salvar histórico leve", err);
  }

  idbImportFullCollection(c, c.recoveredFrom || "saveCollection").catch(err=>console.warn("Falha ao salvar completo no IndexedDB",err));
}

async function exportWithFeedback(c,kind){
  if(!c) return;

  let full = c;
  if(c.storage==="indexeddb" && (!Array.isArray(c.points) || !Array.isArray(c.segments))){
    showModal("Carregando coleta","Buscando pontos e trechos no banco local...",true);
    try{
      full = await idbHydrateCollection(c);
    }catch(err){
      console.error("Falha ao carregar coleta do IndexedDB", err);
      showModal("Erro ao carregar","Não consegui carregar os dados completos dessa coleta.",false);
      return;
    }
  }

  const label = {
    package:"pacote ZIP",
    summary:"resumo JSON",
    csv:"CSV bruto",
    raw:"pontos brutos",
    simple:"pontos simplificados",
    segments:"trechos"
  }[kind] || "arquivo";

  showModal("Gerando arquivo",`Aguarde. Preparando ${label} para download...`,true);
  await new Promise(r=>setTimeout(r,120));

  try{
    if(kind==="package") await exportPackage(full);
    else exportCollection(full,kind);

    await new Promise(r=>setTimeout(r,180));
    showExportModal(full);
  }catch(err){
    console.error("Erro ao exportar",err);
    showModal("Erro ao gerar arquivo","Não consegui gerar esse arquivo agora. A coleta continua salva no histórico.",false);
  }
}


