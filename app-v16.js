const PAVIMENTOLAB_VERSION = "v16-recovery";
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
  finalizing:false
};

const els = {
  btnMenu:document.getElementById("btnMenu"), drawer:document.getElementById("drawer"), btnCloseDrawer:document.getElementById("btnCloseDrawer"),
  statusPill:document.getElementById("statusPill"), gpsPill:document.getElementById("gpsPill"), btnLocate:document.getElementById("btnLocate"),
  distanceValue:document.getElementById("distanceValue"), durationValue:document.getElementById("durationValue"), speedValue:document.getElementById("speedValue"),
  pctGood:document.getElementById("pctGood"), pctRegular:document.getElementById("pctRegular"), pctBad:document.getElementById("pctBad"), pctCritical:document.getElementById("pctCritical"),
  barGood:document.getElementById("barGood"), barRegular:document.getElementById("barRegular"), barBad:document.getElementById("barBad"), barCritical:document.getElementById("barCritical"), barEmpty:document.getElementById("barEmpty"),
  btnMain:document.getElementById("btnMain"), btnPause:document.getElementById("btnPause"), holdProgress:document.getElementById("holdProgress"),
  diagGps:document.getElementById("diagGps"), diagMotion:document.getElementById("diagMotion"), diagWake:document.getElementById("diagWake"), diagSave:document.getElementById("diagSave"),
  diagGpsAge:document.getElementById("diagGpsAge"), diagGpsInterval:document.getElementById("diagGpsInterval"), diagMotionHz:document.getElementById("diagMotionHz"), diagVisibility:document.getElementById("diagVisibility"),
  historyList:document.getElementById("historyList"), btnClearAll:document.getElementById("btnClearAll"), btnBackupAll:document.getElementById("btnBackupAll"),
  modal:document.getElementById("modal"), modalTitle:document.getElementById("modalTitle"), modalText:document.getElementById("modalText"), spinner:document.getElementById("spinner"), modalActions:document.getElementById("modalActions"),
  btnExportPackage:document.getElementById("btnExportPackage"), btnExportCsv:document.getElementById("btnExportCsv"), btnExportRawPoints:document.getElementById("btnExportRawPoints"), btnExportSimplePoints:document.getElementById("btnExportSimplePoints"), btnExportSegments:document.getElementById("btnExportSegments"), btnExportSummary:document.getElementById("btnExportSummary"), btnCloseModal:document.getElementById("btnCloseModal")
};

const COLORS={bom:"#22c55e",regular:"#facc15",ruim:"#f97316",critico:"#ef4444",sem_amostra:"#94a3b8"};
const STORAGE_KEY="pavimentolab_collections_v16";
const DRAFT_KEY="pavimentolab_current_v16";
const LEGACY_COLLECTION_KEYS=["pavimentolab_collections_v12","pavimentolab_collections_v13","pavimentolab_collections_v14","pavimentolab_collections_v15"];
const LEGACY_DRAFT_KEYS=["pavimentolab_current_v12","pavimentolab_current_v13","pavimentolab_current_v14","pavimentolab_current_v15"];
const AGGREGATION_M=10;
const ANTI_DRIFT_M=2;

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
function distanceMeters(a,b){if(!a||!b)return null;const R=6371000,rad=d=>d*Math.PI/180;const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la1=rad(a.lat),la2=rad(b.lat);const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function getCollections(){return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}
function saveCollection(c){const list=getCollections().filter(x=>x.id!==c.id);list.unshift(c);localStorage.setItem(STORAGE_KEY,JSON.stringify(list))}
function saveDraft(){if(!state.current)return;localStorage.setItem(DRAFT_KEY,JSON.stringify(state.current));state.lastSaveAt=Date.now();state.saveCounter++;updateDiagnostics()}

function initMap(){if(state.map)return;state.map=L.map("map",{zoomControl:false,attributionControl:false}).setView([-23.5505,-46.6333],16);L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:20,subdomains:"abcd"}).addTo(state.map);L.control.zoom({position:"bottomright"}).addTo(state.map);state.routeLayer=L.layerGroup().addTo(state.map)}
function locate(){navigator.geolocation.getCurrentPosition(pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};state.lastGpsPosition=p;updateMarker(p,pos.coords.heading);state.map.setView([p.lat,p.lon],17,{animate:true});els.gpsPill.textContent=p.accuracy?`GPS ${p.accuracy.toFixed(0)}m`:"GPS ok"},()=>{els.gpsPill.textContent="GPS erro"},{enableHighAccuracy:true,maximumAge:0,timeout:10000})}
function updateMarker(p,heading){if(!state.map||!p)return;const latlng=[p.lat,p.lon];if(!state.marker){const icon=L.divIcon({className:"",html:'<div class="vehicle-marker"></div>',iconSize:[36,36],iconAnchor:[18,18]});state.marker=L.marker(latlng,{icon}).addTo(state.map)}else state.marker.setLatLng(latlng);const el=state.marker.getElement()?.querySelector(".vehicle-marker");if(el&&typeof heading==="number")el.style.transform=`rotate(${heading}deg)`}
function follow(p){if(state.collecting&&!state.paused&&p?.lat)state.map.setView([p.lat,p.lon],Math.max(state.map.getZoom(),17),{animate:false})}
function drawSegment(s){if(!state.routeLayer||!s)return;L.polyline([[s.lat_start,s.lon_start],[s.lat_end,s.lon_end]],{color:COLORS[s.classe]||COLORS.sem_amostra,weight:8,opacity:s.segment_quality==="baixa_confianca"?0.45:0.92,lineCap:"round",lineJoin:"round"}).bindPopup(`<b>Trecho ${s.segment_id}</b><br>Classe: ${s.classe}<br>Índice: ${s.roughness_index==null?"sem amostra":s.roughness_index.toFixed(2)}<br>Distância: ${s.distance_m.toFixed(1)} m<br>Flags: ${s.flags||"-"}`).addTo(state.routeLayer)}

function updateStatus(){const b=els.statusPill.querySelector("b");els.statusPill.className="status-pill";if(state.collecting&&state.paused){els.statusPill.classList.add("paused");b.textContent="Pausado"}else if(state.collecting){els.statusPill.classList.add("recording");b.textContent="Gravando"}else{els.statusPill.classList.add("idle");b.textContent="Pronto"}}
function updateMetrics(){const c=state.current;if(!c){els.distanceValue.textContent="0,0 km";els.durationValue.textContent="00:00:00";els.speedValue.textContent="-- km/h";updateQuality();return}els.distanceValue.textContent=formatKm(c.totalDistanceM);const end=c.endedAt?new Date(c.endedAt).getTime():Date.now();els.durationValue.textContent=formatDuration(end-new Date(c.startedAt).getTime());const speeds=c.points.map(p=>p.speed_mps).filter(v=>typeof v==="number"&&v>0);els.speedValue.textContent=speeds.length?`${(mean(speeds)*3.6).toFixed(0)} km/h`:"-- km/h";updateQuality()}
function updateQuality(){const segs=state.current?.segments||[];const valid=segs.filter(s=>["bom","regular","ruim","critico"].includes(s.classe));const total=valid.length;const pct=cls=>total?Math.round(valid.filter(s=>s.classe===cls).length/total*100):0;const g=pct("bom"),r=pct("regular"),b=pct("ruim"),c=pct("critico");els.pctGood.textContent=`${g}%`;els.pctRegular.textContent=`${r}%`;els.pctBad.textContent=`${b}%`;els.pctCritical.textContent=`${c}%`;els.barGood.style.width=`${g}%`;els.barRegular.style.width=`${r}%`;els.barBad.style.width=`${b}%`;els.barCritical.style.width=`${c}%`;els.barEmpty.style.width=total?`0%`:`100%`}
function updateDiagnostics(){const now=Date.now();const gpsAge=state.lastGpsAt?(now-state.lastGpsAt)/1000:null;const avg=state.gpsIntervals.length?mean(state.gpsIntervals)/1000:null;els.diagGps.textContent=state.lastGpsPosition?.accuracy?`${state.lastGpsPosition.accuracy.toFixed(0)}m`:"--";els.diagMotion.textContent=state.motionHz?`${state.motionHz.toFixed(0)} Hz`:"--";els.diagWake.textContent=state.wakeLock?"ativa":"não ativa";els.diagSave.textContent=state.lastSaveAt?`salvo ${state.saveCounter}`:"--";els.diagGpsAge.textContent=gpsAge==null?"--":gpsAge<1?"agora":`${gpsAge.toFixed(0)}s`;els.diagGpsInterval.textContent=avg?`${avg.toFixed(1)}s`:"--";els.diagMotionHz.textContent=state.motionHz?`${state.motionHz.toFixed(0)} Hz`:"--";els.diagVisibility.textContent=document.visibilityState==="visible"?"ativa":"2º plano"}

function onMotion(e){state.motionTickCount++;state.lastMotionAt=Date.now();const elapsed=(Date.now()-state.lastMotionHzAt)/1000;if(elapsed>=1){state.motionHz=state.motionTickCount/elapsed;state.motionTickCount=0;state.lastMotionHzAt=Date.now()}const acc=e.accelerationIncludingGravity||e.acceleration||{},rot=e.rotationRate||{};const s={t:new Date().toISOString(),ax:Number(acc.x||0),ay:Number(acc.y||0),az:Number(acc.z||0),gx:Number(rot.alpha||0),gy:Number(rot.beta||0),gz:Number(rot.gamma||0)};if(state.calibrationSamples)state.calibrationSamples.push(s);if(state.collecting&&!state.paused)state.motionBuffer.push(s)}
function roughnessValue(s){const base=state.calibration?.azMean??9.81,noise=state.calibration?.azStd??0.05;return Math.max(0,Math.abs(s.az-base)-noise)}
function classByIndex(i){if(i==null)return"sem_amostra";if(i<0.45)return"bom";if(i<1.10)return"regular";if(i<2.00)return"ruim";return"critico"}
function summarizeBuffer(){const vals=state.motionBuffer.map(roughnessValue),m=mean(vals),mx=vals.length?Math.max(...vals):0,sd=std(vals,m),peaks=vals.filter(v=>v>=2).length;return{sample_count:vals.length,roughness_mean:m,roughness_max:mx,roughness_std:sd,peak_count:peaks,roughness_index:m+(sd*.5)+(peaks?Math.min(1,peaks/10):0)}}

function startGps(){if(state.gpsWatchId!=null)return;state.gpsWatchId=navigator.geolocation.watchPosition(onGps,()=>{els.gpsPill.textContent="GPS erro"},{enableHighAccuracy:true,maximumAge:0,timeout:10000})}
function onGps(pos){const now=Date.now();if(state.lastGpsTick){const it=now-state.lastGpsTick;if(it>0&&it<60000){state.gpsIntervals.push(it);if(state.gpsIntervals.length>20)state.gpsIntervals.shift()}}state.lastGpsTick=now;state.lastGpsAt=now;const c=pos.coords;const p={timestamp:new Date().toISOString(),lat:c.latitude,lon:c.longitude,gps_accuracy_m:c.accuracy??null,speed_mps:c.speed??null,heading:c.heading??null,altitude:c.altitude??null};state.lastGpsPosition={lat:p.lat,lon:p.lon,accuracy:p.gps_accuracy_m};els.gpsPill.textContent=p.gps_accuracy_m?`GPS ${p.gps_accuracy_m.toFixed(0)}m`:"GPS ok";updateMarker(p,p.heading);follow(p);if(state.collecting&&!state.paused&&state.current)saveGpsRecord(p);updateDiagnostics()}
function saveGpsRecord(base){const summary=state.motionBuffer.length?summarizeBuffer():{sample_count:0,roughness_mean:null,roughness_max:null,roughness_std:null,peak_count:0,roughness_index:null};const point={...base,...summary,raw_point:true,used_for_segment:false,ignored_reason:""};point.classe=classByIndex(point.roughness_index);state.current.points.push(point);
 if(!state.current.pendingStartPoint){state.current.pendingStartPoint=point;state.current.pendingLastPoint=point;state.current.pendingDistanceM=0;state.current.pendingStats=[];state.lastGpsPoint=point;state.motionBuffer=[];saveDraft();updateMetrics();return}
 const prev=state.current.pendingLastPoint,step=distanceMeters(prev,point);
 if(step!==null&&step<ANTI_DRIFT_M){point.ignored_reason=`gps_drift_menor_${ANTI_DRIFT_M}m`;state.current.pendingLastPoint=point;state.lastGpsPoint=point;state.motionBuffer=[];saveDraft();updateMetrics();return}
 if(step!==null&&step>120){point.ignored_reason="possivel_salto_gps_maior_120m";state.current.pendingLastPoint=point;state.lastGpsPoint=point;state.motionBuffer=[];saveDraft();updateMetrics();return}
 if(step&&step>=ANTI_DRIFT_M&&step<=120){state.current.pendingDistanceM+=step;point.used_for_segment=true}
 state.current.pendingStats.push(point);state.current.pendingLastPoint=point;
 if(state.current.pendingDistanceM>=AGGREGATION_M){const sp=state.current.pendingStartPoint,ep=point,stats=state.current.pendingStats.filter(p=>p.roughness_index!==null);const idxs=stats.map(p=>p.roughness_index).filter(v=>typeof v==="number"),means=stats.map(p=>p.roughness_mean).filter(v=>typeof v==="number"),maxs=stats.map(p=>p.roughness_max).filter(v=>typeof v==="number"),sds=stats.map(p=>p.roughness_std).filter(v=>typeof v==="number"),peaks=stats.map(p=>p.peak_count).filter(v=>typeof v==="number"),samples=stats.map(p=>p.sample_count).filter(v=>typeof v==="number");const idx=idxs.length?mean(idxs):null;let quality="ok";const flags=[];if(state.current.pendingDistanceM>80){flags.push("trecho_longo_gps_lento");quality="atencao"}if((ep.gps_accuracy_m??999)>35||(sp.gps_accuracy_m??999)>35){flags.push("gps_baixa_precisao");quality="baixa_confianca"}if(!idxs.length){flags.push("sem_amostra_acelerometro");if(quality==="ok")quality="atencao"}
 const segment={segment_id:state.current.segments.length+1,timestamp_start:sp.timestamp,timestamp_end:ep.timestamp,lat_start:sp.lat,lon_start:sp.lon,lat_end:ep.lat,lon_end:ep.lon,distance_m:state.current.pendingDistanceM,speed_mps:ep.speed_mps,heading:ep.heading,gps_accuracy_start_m:sp.gps_accuracy_m,gps_accuracy_end_m:ep.gps_accuracy_m,sample_count:samples.reduce((a,b)=>a+b,0),roughness_mean:means.length?mean(means):null,roughness_max:maxs.length?Math.max(...maxs):null,roughness_std:sds.length?mean(sds):null,peak_count:peaks.reduce((a,b)=>a+b,0),roughness_index:idx,classe:classByIndex(idx),segment_quality:quality,flags:flags.join(";"),aggregation_m:AGGREGATION_M,source_points:state.current.pendingStats.length,anti_drift_min_step_m:ANTI_DRIFT_M};
 state.current.segments.push(segment);drawSegment(segment);if(segment.distance_m>0&&segment.distance_m<120)state.current.totalDistanceM=(state.current.totalDistanceM||0)+segment.distance_m;state.current.pendingStartPoint=ep;state.current.pendingLastPoint=ep;state.current.pendingDistanceM=0;state.current.pendingStats=[]}
 state.lastGpsPoint=point;state.motionBuffer=[];saveDraft();updateMetrics()}

async function requestMotionPermission(){if(typeof DeviceMotionEvent!=="undefined"&&typeof DeviceMotionEvent.requestPermission==="function"){const r=await DeviceMotionEvent.requestPermission();if(r!=="granted")throw new Error("Permissão de movimento negada.")}}
async function requestWakeLock(){try{if("wakeLock"in navigator){state.wakeLock=await navigator.wakeLock.request("screen");state.wakeLock.addEventListener("release",()=>{state.wakeLock=null;updateDiagnostics()})}}catch(e){}updateDiagnostics()}
async function releaseWakeLock(){try{if(state.wakeLock){await state.wakeLock.release();state.wakeLock=null}}catch(e){}updateDiagnostics()}
function showModal(t,msg,spin=true){els.modal.classList.remove("hidden");els.modalTitle.textContent=t;els.modalText.textContent=msg;els.spinner.style.display=spin?"block":"none";els.modalActions.classList.add("hidden")}
function hideModal(){els.modal.classList.add("hidden")}
async function calibrate(){showModal("Preparando coleta","Liberando sensores e tela ativa...",true);await requestMotionPermission();await requestWakeLock();showModal("Calibrando sensores","Deixe o celular parado por 10 segundos.",true);state.calibrationSamples=[];await new Promise(r=>setTimeout(r,10000));const samples=state.calibrationSamples||[];state.calibrationSamples=null;if(samples.length>=10){const az=samples.map(s=>s.az),ax=samples.map(s=>s.ax),ay=samples.map(s=>s.ay);state.calibration={date:new Date().toISOString(),version:PAVIMENTOLAB_VERSION,device:"motorola_g82_android_13",axMean:mean(ax),ayMean:mean(ay),azMean:mean(az),azStd:std(az),samples:samples.length};localStorage.setItem("pavimentolab_calibration_v12",JSON.stringify(state.calibration))}hideModal()}

async function startCollection(){try{startGps();locate();await calibrate();state.routeLayer.clearLayers();state.current={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:collectionName(),version:PAVIMENTOLAB_VERSION,deviceInfo:getDeviceInfo(),startedAt:new Date().toISOString(),endedAt:null,device:"motorola_g82_android_13",calibration:state.calibration,points:[],segments:[],pauses:[],visibilityEvents:[],totalDistanceM:0,pendingStartPoint:null,pendingLastPoint:null,pendingDistanceM:0,pendingStats:[]};state.collecting=true;state.paused=false;state.lastGpsPoint=null;state.motionBuffer=[];els.btnMain.className="main-action stop";els.btnMain.querySelector("b").textContent="Segure para parar";els.btnMain.querySelector("small").textContent="encerrar gravação";els.btnMain.querySelector(".circle").textContent="■";els.btnPause.disabled=false;updateStatus();updateMetrics();state.elapsedTimer=setInterval(()=>{updateMetrics();updateDiagnostics()},1000)}catch(e){hideModal();alert(e.message||"Não foi possível iniciar.")}}
function togglePause(){if(!state.collecting||!state.current)return;state.paused=!state.paused;state.motionBuffer=[];state.lastGpsPoint=null;if(state.paused){state.current.pauses.push({start:new Date().toISOString(),end:null});els.btnPause.querySelector("b").textContent="Retomar";els.btnPause.querySelector("small").textContent="voltar coleta";els.btnPause.querySelector("span").textContent="▶"}else{const p=state.current.pauses.at(-1);if(p&&!p.end)p.end=new Date().toISOString();els.btnPause.querySelector("b").textContent="Pausar";els.btnPause.querySelector("small").textContent="pausar coleta";els.btnPause.querySelector("span").textContent="Ⅱ"}updateStatus();saveDraft()}

function safeSummarizeCollection(c){
  try{
    return summarizeCollection(c);
  }catch(err){
    console.warn("Resumo falhou; usando resumo mínimo", err);
    return {
      app_version: c.version || PAVIMENTOLAB_VERSION,
      name: c.name,
      startedAt: c.startedAt,
      endedAt: c.endedAt || null,
      finalizedAt: c.finalizedAt || null,
      totalDistanceM: c.totalDistanceM || 0,
      pointCount: Array.isArray(c.points) ? c.points.length : 0,
      segmentCount: Array.isArray(c.segments) ? c.segments.length : 0,
      aggregation_m: AGGREGATION_M,
      anti_drift_min_step_m: ANTI_DRIFT_M,
      summary_error: String(err && err.message ? err.message : err)
    };
  }
}

function resetUiAfterStop(){
  state.current=null;
  state.lastGpsPoint=null;
  state.motionBuffer=[];
  state.collecting=false;
  state.paused=false;

  els.btnMain.className="main-action start";
  els.btnMain.style.setProperty("--hold","0%");
  els.btnMain.querySelector("b").textContent="Iniciar gravação";
  els.btnMain.querySelector("small").textContent="calibrar e começar";
  els.btnMain.querySelector(".circle").textContent="●";

  els.btnPause.disabled=true;
  els.btnPause.querySelector("b").textContent="Pausar";
  els.btnPause.querySelector("small").textContent="pausar coleta";
  els.btnPause.querySelector("span").textContent="Ⅱ";

  if(state.elapsedTimer) clearInterval(state.elapsedTimer);

  updateStatus();
  updateMetrics();
  renderHistory();
}

async function stopCollection(){
  if(!state.current || state.finalizing) return;

  state.finalizing = true;
  showModal("Consolidando dados","Salvando a corrida no histórico. Aguarde...",true);
  await new Promise(r=>setTimeout(r,80));

  let collection = state.current;

  try{
    state.collecting=false;
    state.paused=false;

    collection.endedAt = new Date().toISOString();
    collection.finalizedAt = new Date().toISOString();
    collection.version = PAVIMENTOLAB_VERSION;

    const p = collection.pauses?.at ? collection.pauses.at(-1) : collection.pauses?.[collection.pauses.length-1];
    if(p && !p.end) p.end = new Date().toISOString();

    // SALVA PRIMEIRO. Nada de resumo, ZIP ou export antes disso.
    saveCollection(collection);
    localStorage.removeItem(DRAFT_KEY);
    state.lastStoppedCollection = collection;

    // Reseta interface e atualiza histórico imediatamente.
    resetUiAfterStop();

    releaseWakeLock().catch(()=>{});

    // Agora tenta anexar resumo. Se falhar, a coleta já está salva.
    await new Promise(r=>setTimeout(r,80));
    try{
      collection.summary = safeSummarizeCollection(collection);
      saveCollection(collection);
      renderHistory();
    }catch(summaryErr){
      console.warn("Falha ao anexar resumo; coleta preservada", summaryErr);
    }

    await new Promise(r=>setTimeout(r,100));
    showExportModal(collection);

  }catch(err){
    console.error("Erro crítico ao finalizar coleta", err);

    try{
      if(collection){
        collection.endedAt = collection.endedAt || new Date().toISOString();
        collection.finalizedAt = collection.finalizedAt || new Date().toISOString();
        collection.version = collection.version || PAVIMENTOLAB_VERSION;
        saveCollection(collection);
        localStorage.removeItem(DRAFT_KEY);
        state.lastStoppedCollection = collection;
      }
    }catch(preserveErr){
      console.error("Falha ao preservar coleta", preserveErr);
    }

    resetUiAfterStop();
    showModal("Coleta preservada","Abra o menu e verifique o histórico. Se a rota aparecer lá, os dados foram salvos.",false);
  }finally{
    state.finalizing=false;
  }
}

function startHold(){if(state.finalizing)return;if(!state.collecting){startCollection();return}state.holdStart=Date.now();const dur=1500;clearInterval(state.holdTimer);state.holdTimer=setInterval(()=>{const pct=Math.min(100,(Date.now()-state.holdStart)/dur*100);els.btnMain.style.setProperty("--hold",`${pct}%`);if(pct>=100){clearInterval(state.holdTimer);state.holdTimer=null;stopCollection()}},30)}
function cancelHold(){if(!state.collecting)return;clearInterval(state.holdTimer);state.holdTimer=null;els.btnMain.style.setProperty("--hold","0%")}

function toCsv(c){const cols=["timestamp","lat","lon","gps_accuracy_m","speed_mps","heading","altitude","sample_count","roughness_mean","roughness_max","roughness_std","peak_count","roughness_index","classe","raw_point","used_for_segment","ignored_reason"];return [`# name=${c.name}`,`# version=${c.version}`,`# startedAt=${c.startedAt}`,`# endedAt=${c.endedAt||""}`,`# totalDistanceM=${c.totalDistanceM||0}`,`# points=${c.points.length}`,`# segments=${c.segments.length}`,cols.join(","),...c.points.map(r=>cols.map(k=>r[k]??"").join(","))].join("\n")}
function pointsGeo(c){return JSON.stringify({type:"FeatureCollection",name:`${c.name}_pontos_brutos`,metadata:{version:c.version,startedAt:c.startedAt,endedAt:c.endedAt,totalDistanceM:c.totalDistanceM,aggregation_m:AGGREGATION_M,anti_drift_min_step_m:ANTI_DRIFT_M,summary:c.summary||safeSummarizeCollection(c),device:c.deviceInfo||getDeviceInfo(),calibration:c.calibration,visibilityEvents:c.visibilityEvents||[]},features:c.points.filter(p=>p.lat&&p.lon).map(p=>({type:"Feature",geometry:{type:"Point",coordinates:[p.lon,p.lat]},properties:{...p,collection:c.name}}))},null,2)}
function simplePointsGeo(c){const f=[];c.segments.forEach(s=>{f.push({type:"Feature",geometry:{type:"Point",coordinates:[s.lon_start,s.lat_start]},properties:{point_role:"inicio_trecho",segment_id:s.segment_id,timestamp:s.timestamp_start,gps_accuracy_m:s.gps_accuracy_start_m,distance_m:s.distance_m,roughness_index:s.roughness_index,classe:s.classe,segment_quality:s.segment_quality,collection:c.name}});f.push({type:"Feature",geometry:{type:"Point",coordinates:[s.lon_end,s.lat_end]},properties:{point_role:"fim_trecho",segment_id:s.segment_id,timestamp:s.timestamp_end,gps_accuracy_m:s.gps_accuracy_end_m,distance_m:s.distance_m,roughness_index:s.roughness_index,classe:s.classe,segment_quality:s.segment_quality,collection:c.name}})});return JSON.stringify({type:"FeatureCollection",name:`${c.name}_pontos_simplificados`,metadata:{version:c.version,aggregation_m:AGGREGATION_M,anti_drift_min_step_m:ANTI_DRIFT_M,simplification:"start_end_points_per_segment",summary:c.summary||safeSummarizeCollection(c),device:c.deviceInfo||getDeviceInfo()},features:f},null,2)}
function segmentsGeo(c){return JSON.stringify({type:"FeatureCollection",name:`${c.name}_trechos`,metadata:{version:c.version,startedAt:c.startedAt,endedAt:c.endedAt,totalDistanceM:c.totalDistanceM,aggregation_m:AGGREGATION_M,anti_drift_min_step_m:ANTI_DRIFT_M,summary:c.summary||safeSummarizeCollection(c),device:c.deviceInfo||getDeviceInfo(),calibration:c.calibration,visibilityEvents:c.visibilityEvents||[]},features:c.segments.map(s=>({type:"Feature",geometry:{type:"LineString",coordinates:[[s.lon_start,s.lat_start],[s.lon_end,s.lat_end]]},properties:{...s,collection:c.name}}))},null,2)}
function download(name,text,type="text/plain"){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}

function summaryJson(c){
  return JSON.stringify(safeSummarizeCollection(c), null, 2);
}

async function exportPackage(c){
  if(!c) return;

  if(typeof JSZip === "undefined"){
    alert("Biblioteca ZIP não carregou. Use as exportações individuais.");
    return;
  }

  const zip = new JSZip();
  zip.file(`${c.name}_resumo.json`, summaryJson(c));
  zip.file(`${c.name}_pontos_brutos.csv`, toCsv(c));
  zip.file(`${c.name}_pontos_brutos.geojson`, pointsGeo(c));
  zip.file(`${c.name}_pontos_simplificados.geojson`, simplePointsGeo(c));
  zip.file(`${c.name}_trechos.geojson`, segmentsGeo(c));

  const blob = await zip.generateAsync({type:"blob"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.name}_pacote.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCollection(c,kind){if(!c)return;if(kind==="summary")download(`${c.name}_resumo.json`,summaryJson(c),"application/json");if(kind==="csv")download(`${c.name}_pontos_brutos.csv`,toCsv(c),"text/csv");if(kind==="raw")download(`${c.name}_pontos_brutos.geojson`,pointsGeo(c),"application/geo+json");if(kind==="simple")download(`${c.name}_pontos_simplificados.geojson`,simplePointsGeo(c),"application/geo+json");if(kind==="segments")download(`${c.name}_trechos.geojson`,segmentsGeo(c),"application/geo+json")}
function showExportModal(c){
  els.modal.classList.remove("hidden");
  els.modalTitle.textContent="Coleta salva no histórico";
  els.modalText.textContent=`${c.segments.length} trechos e ${c.points.length} pontos brutos. Você pode exportar agora ou depois pelo menu.`;
  els.spinner.style.display="none";
  els.modalActions.classList.remove("hidden");

  els.btnExportPackage.onclick=()=>exportWithFeedback(c,"package");
  els.btnExportCsv.onclick=()=>exportWithFeedback(c,"csv");
  els.btnExportRawPoints.onclick=()=>exportWithFeedback(c,"raw");
  els.btnExportSimplePoints.onclick=()=>exportWithFeedback(c,"simple");
  els.btnExportSegments.onclick=()=>exportWithFeedback(c,"segments");
  els.btnExportSummary.onclick=()=>exportWithFeedback(c,"summary");
}

async function exportWithFeedback(c,kind){
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
    if(kind==="package") await exportPackage(c);
    else exportCollection(c,kind);

    await new Promise(r=>setTimeout(r,180));
    showExportModal(c);
  }catch(err){
    console.error("Erro ao exportar",err);
    showModal("Erro ao gerar arquivo","Não consegui gerar esse arquivo agora. A coleta continua salva no histórico.",false);
  }
}

function renderHistory(){const list=getCollections();els.historyList.innerHTML=list.length?"":'<p style="color:#94a3b8">Nenhuma rota salva.</p>';list.forEach(c=>{const d=document.createElement("div");d.className="history-item";d.innerHTML=`<strong>${c.name}</strong><small>${new Date(c.startedAt).toLocaleString()}<br>${formatKm(c.totalDistanceM||0)} · ${c.points.length} pontos · ${c.segments.length} trechos · ${c.version||"sem versão"}</small><div class="history-actions"><button data-show="${c.id}">ver mapa</button><button data-package="${c.id}">ZIP</button><button data-csv="${c.id}">CSV</button><button data-raw="${c.id}">brutos</button><button data-simple="${c.id}">simples</button><button data-seg="${c.id}">trechos</button><button data-summary="${c.id}">resumo</button><button class="danger" data-del="${c.id}">apagar</button></div>`;els.historyList.appendChild(d)});els.historyList.querySelectorAll("[data-show]").forEach(b=>b.onclick=()=>{const c=getCollections().find(x=>x.id===b.dataset.show);showOnMap(c);closeDrawer()});els.historyList.querySelectorAll("[data-package]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.package),"package"));
els.historyList.querySelectorAll("[data-csv]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.csv),"csv"));els.historyList.querySelectorAll("[data-raw]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.raw),"raw"));els.historyList.querySelectorAll("[data-simple]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.simple),"simple"));els.historyList.querySelectorAll("[data-seg]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.seg),"segments"));
els.historyList.querySelectorAll("[data-summary]").forEach(b=>b.onclick=()=>exportWithFeedback(getCollections().find(x=>x.id===b.dataset.summary),"summary"));els.historyList.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{if(confirm("Apagar rota?")){localStorage.setItem(STORAGE_KEY,JSON.stringify(getCollections().filter(x=>x.id!==b.dataset.del)));renderHistory()}})}
function showOnMap(c){if(!c)return;state.routeLayer.clearLayers();c.segments.forEach(drawSegment);const pts=c.points.filter(p=>p.lat&&p.lon);if(pts.length){const last=pts.at(-1);updateMarker(last,last.heading);state.map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])),{padding:[40,40]})}}
function openDrawer(){els.drawer.classList.add("open");renderHistory();updateDiagnostics()}function closeDrawer(){els.drawer.classList.remove("open")}


function migrateLegacyCollections(){
  const current = getCollections();
  const byId = new Map(current.map(c=>[c.id,c]));
  LEGACY_COLLECTION_KEYS.forEach(key=>{
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const list = JSON.parse(raw);
      if(!Array.isArray(list)) return;
      list.forEach(c=>{
        if(c && c.id && !byId.has(c.id)){
          c.migratedFrom = key;
          byId.set(c.id,c);
        }
      });
    }catch(err){ console.warn("Falha ao migrar", key, err); }
  });
  const migrated = Array.from(byId.values()).sort((a,b)=>new Date(b.startedAt||0)-new Date(a.startedAt||0));
  if(migrated.length !== current.length){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  }
}

function recoverAnyDraftAutomatically(){
  const keys = [DRAFT_KEY, ...LEGACY_DRAFT_KEYS];
  let recoveredCount = 0;
  keys.forEach(key=>{
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const draft = JSON.parse(raw);
      if(!draft || draft.endedAt){
        localStorage.removeItem(key);
        return;
      }
      const hasData = (Array.isArray(draft.points) && draft.points.length > 0) || (Array.isArray(draft.segments) && draft.segments.length > 0);
      if(!hasData){
        localStorage.removeItem(key);
        return;
      }
      draft.endedAt = new Date().toISOString();
      draft.finalizedAt = draft.finalizedAt || new Date().toISOString();
      draft.recovered = true;
      draft.recoveredFrom = key;
      draft.version = draft.version || PAVIMENTOLAB_VERSION;
      draft.summary = safeSummarizeCollection(draft);
      saveCollection(draft);
      localStorage.removeItem(key);
      recoveredCount += 1;
    }catch(err){ console.warn("Falha ao recuperar rascunho", key, err); }
  });
  if(recoveredCount > 0){
    renderHistory();
    showModal("Coleta recuperada", `${recoveredCount} coleta(s) foram salvas no histórico automaticamente.`, false);
  }
}

function exportBackupAll(){
  const payload = {
    app_version: PAVIMENTOLAB_VERSION,
    exported_at: new Date().toISOString(),
    storage_key: STORAGE_KEY,
    collections: getCollections()
  };
  download(`pavimentolab_backup_${new Date().toISOString().replaceAll(":","-")}.json`, JSON.stringify(payload,null,2), "application/json");
}

function recoverDraft(){
  migrateLegacyCollections();
  recoverAnyDraftAutomatically();
}

document.addEventListener("visibilitychange",async()=>{updateDiagnostics();if(state.current){state.current.visibilityEvents.push({timestamp:new Date().toISOString(),state:document.visibilityState});saveDraft()}if(document.visibilityState==="visible"&&state.collecting)await requestWakeLock()});
window.addEventListener("devicemotion",onMotion);
els.btnMenu.onclick=openDrawer;els.btnCloseDrawer.onclick=closeDrawer;els.drawer.onclick=e=>{if(e.target===els.drawer)closeDrawer()};els.btnLocate.onclick=locate;els.btnPause.onclick=togglePause;els.btnCloseModal.onclick=hideModal;els.btnMain.addEventListener("pointerdown",startHold);els.btnMain.addEventListener("pointerup",cancelHold);els.btnMain.addEventListener("pointerleave",cancelHold);els.btnMain.addEventListener("pointercancel",cancelHold);els.btnBackupAll.onclick=exportBackupAll;
els.btnClearAll.onclick=()=>{if(confirm("Apagar todo histórico?")){localStorage.removeItem(STORAGE_KEY);renderHistory()}};

initMap();startGps();recoverDraft();renderHistory();updateStatus();updateMetrics();updateDiagnostics();setInterval(updateDiagnostics,2000);
if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(regs=>regs.forEach(r=>r.unregister()))}
