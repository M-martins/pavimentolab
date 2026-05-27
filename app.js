const state = {
  calibration: null,
  collecting: false,
  paused: false,
  current: null,
  lastGpsPoint: null,
  lastGpsAt: null,
  lastGpsPosition: null,
  gpsWatchId: null,
  motionBuffer: [],
  calibrationSamples: null,
  wakeLock: null,
  map: null,
  routeLayer: null,
  marker: null,
  holdTimer: null,
  holdStart: null,
  elapsedTimer: null,
  lastStoppedCollection: null
};

const els = {
  btnMenu: document.getElementById("btnMenu"),
  drawer: document.getElementById("drawer"),
  btnCloseDrawer: document.getElementById("btnCloseDrawer"),
  recordingPill: document.getElementById("recordingPill"),
  gpsPill: document.getElementById("gpsPill"),
  btnLocate: document.getElementById("btnLocate"),
  distanceValue: document.getElementById("distanceValue"),
  durationValue: document.getElementById("durationValue"),
  speedValue: document.getElementById("speedValue"),
  pctGood: document.getElementById("pctGood"),
  pctRegular: document.getElementById("pctRegular"),
  pctBad: document.getElementById("pctBad"),
  pctCritical: document.getElementById("pctCritical"),
  barGood: document.getElementById("barGood"),
  barRegular: document.getElementById("barRegular"),
  barBad: document.getElementById("barBad"),
  barCritical: document.getElementById("barCritical"),
  barNoSample: document.getElementById("barNoSample"),
  btnMain: document.getElementById("btnMain"),
  btnPause: document.getElementById("btnPause"),
  holdProgress: document.getElementById("holdProgress"),
  historyList: document.getElementById("historyList"),
  btnClearAll: document.getElementById("btnClearAll"),
  healthGps: document.getElementById("healthGps"),
  healthGpsText: document.getElementById("healthGpsText"),
  healthMotion: document.getElementById("healthMotion"),
  healthMotionText: document.getElementById("healthMotionText"),
  healthWake: document.getElementById("healthWake"),
  healthWakeText: document.getElementById("healthWakeText"),
  healthStorage: document.getElementById("healthStorage"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalText: document.getElementById("modalText"),
  modalSpinner: document.getElementById("modalSpinner"),
  modalActions: document.getElementById("modalActions"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  btnExportPoints: document.getElementById("btnExportPoints"),
  btnExportSegments: document.getElementById("btnExportSegments"),
  btnCloseModal: document.getElementById("btnCloseModal"),
};

const CLASS_COLORS = {
  bom: "#22c55e",
  regular: "#facc15",
  ruim: "#f97316",
  critico: "#ef4444",
  sem_amostra: "#94a3b8"
};

function pad(n) { return String(n).padStart(2, "0"); }

function nowId() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function collectionName() {
  return `coleta_${nowId()}_motorola_g82`;
}

function formatKm(meters) {
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a,b) => a+b, 0) / values.length;
}

function std(values, avg = mean(values)) {
  if (values.length < 2) return 0;
  const variance = values.reduce((s,v) => s + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function distanceMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function storageKey() {
  return "pavimentolab_collections_v5";
}

function getCollections() {
  return JSON.parse(localStorage.getItem(storageKey()) || "[]");
}

function saveCollection(collection) {
  const list = getCollections().filter(c => c.id !== collection.id);
  list.unshift(collection);
  localStorage.setItem(storageKey(), JSON.stringify(list));
}

function saveCurrentDraft() {
  if (state.current) localStorage.setItem("pavimentolab_current_v5", JSON.stringify(state.current));
}

function initMap() {
  if (state.map || typeof L === "undefined") return;

  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: false
  }).setView([-23.5505, -46.6333], 16);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd"
  }).addTo(state.map);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
}

function locateOnMap() {
  if (state.lastGpsPosition) {
    state.map.setView([state.lastGpsPosition.lat, state.lastGpsPosition.lon], Math.max(state.map.getZoom(), 17), { animate: true });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.lastGpsPosition = p;
      updateMarker(p, pos.coords.heading);
      state.map.setView([p.lat, p.lon], 17, { animate: true });
    },
    () => alert("Não consegui obter sua localização agora."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function updateMarker(point, heading) {
  if (!state.map) return;
  const latlng = [point.lat, point.lon];

  if (!state.marker) {
    const icon = L.divIcon({
      className: "",
      html: `<div class="vehicle-marker"></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    state.marker = L.marker(latlng, { icon }).addTo(state.map);
  } else {
    state.marker.setLatLng(latlng);
  }

  const el = state.marker.getElement()?.querySelector(".vehicle-marker");
  if (el && typeof heading === "number") {
    el.style.transform = `rotate(${heading}deg)`;
  }
}

function drawSegment(segment) {
  if (!state.routeLayer || !segment) return;

  const color = CLASS_COLORS[segment.classe] || CLASS_COLORS.sem_amostra;
  L.polyline(
    [[segment.lat_start, segment.lon_start], [segment.lat_end, segment.lon_end]],
    {
      color,
      weight: 8,
      opacity: segment.segment_quality === "baixa_confianca" ? 0.45 : 0.92,
      lineCap: "round",
      lineJoin: "round"
    }
  ).bindPopup([
    `<b>Trecho</b>`,
    `Classe: ${segment.classe}`,
    `Índice: ${segment.roughness_index == null ? "sem amostra" : segment.roughness_index.toFixed(2)}`,
    `Distância: ${segment.distance_m == null ? "---" : segment.distance_m.toFixed(1) + " m"}`,
    `GPS: ${segment.gps_accuracy_end_m == null ? "---" : segment.gps_accuracy_end_m.toFixed(1) + " m"}`,
    `Flags: ${segment.flags || "-"}`
  ].join("<br>")).addTo(state.routeLayer);
}

function updateStatusPill() {
  const span = els.recordingPill.querySelector("b");
  els.recordingPill.classList.remove("recording", "paused", "idle");

  if (state.collecting && state.paused) {
    els.recordingPill.classList.add("paused");
    span.textContent = "Pausado";
  } else if (state.collecting) {
    els.recordingPill.classList.add("recording");
    span.textContent = "Gravando";
  } else {
    els.recordingPill.classList.add("idle");
    span.textContent = "Pronto";
  }
}

function setHealth(el, cls) {
  el.classList.remove("ok", "warn", "bad");
  el.classList.add(cls);
}

function updateHealth() {
  const now = Date.now();
  const gpsAge = state.lastGpsAt ? (now - state.lastGpsAt) / 1000 : null;
  const acc = state.lastGpsPosition?.accuracy;

  if (!gpsAge) {
    setHealth(els.healthGps, "warn");
    els.healthGpsText.textContent = "aguardando";
  } else if (gpsAge > 8) {
    setHealth(els.healthGps, "bad");
    els.healthGpsText.textContent = `lento: ${gpsAge.toFixed(0)}s`;
  } else if (acc && acc > 25) {
    setHealth(els.healthGps, "warn");
    els.healthGpsText.textContent = `${acc.toFixed(0)}m`;
  } else {
    setHealth(els.healthGps, "ok");
    els.healthGpsText.textContent = acc ? `${acc.toFixed(0)}m` : "ok";
  }

  if (state.motionBuffer.length > 0 || state.calibration) {
    setHealth(els.healthMotion, "ok");
    els.healthMotionText.textContent = state.calibration ? "calibrado" : "ok";
  } else {
    setHealth(els.healthMotion, "warn");
    els.healthMotionText.textContent = "aguardando";
  }

  if (state.wakeLock) {
    setHealth(els.healthWake, "ok");
    els.healthWakeText.textContent = "ativa";
  } else {
    setHealth(els.healthWake, "warn");
    els.healthWakeText.textContent = "não ativa";
  }
}

function updateMetrics() {
  const c = state.current;
  if (!c) {
    els.distanceValue.textContent = "0,0 km";
    els.durationValue.textContent = "00:00:00";
    els.speedValue.textContent = "-- km/h";
    return;
  }

  els.distanceValue.textContent = formatKm(c.totalDistanceM || 0);
  const end = c.endedAt ? new Date(c.endedAt).getTime() : Date.now();
  els.durationValue.textContent = formatDuration(end - new Date(c.startedAt).getTime());

  const speeds = c.points.map(p => p.speed_mps).filter(v => typeof v === "number" && v > 0);
  const avgKmh = speeds.length ? mean(speeds) * 3.6 : null;
  els.speedValue.textContent = avgKmh == null ? "-- km/h" : `${avgKmh.toFixed(0)} km/h`;

  updateQuality();
}

function updateQuality() {
  const segments = state.current?.segments || [];
  const valid = segments.filter(s => ["bom", "regular", "ruim", "critico"].includes(s.classe));
  const total = valid.length || 0;

  const counts = {
    bom: valid.filter(s => s.classe === "bom").length,
    regular: valid.filter(s => s.classe === "regular").length,
    ruim: valid.filter(s => s.classe === "ruim").length,
    critico: valid.filter(s => s.classe === "critico").length
  };

  const pct = (n) => total ? Math.round((n / total) * 100) : 0;

  const good = pct(counts.bom);
  const regular = pct(counts.regular);
  const bad = pct(counts.ruim);
  const critical = pct(counts.critico);
  const noSample = total ? 0 : 100;

  els.pctGood.textContent = `${good}%`;
  els.pctRegular.textContent = `${regular}%`;
  els.pctBad.textContent = `${bad}%`;
  els.pctCritical.textContent = `${critical}%`;

  els.barGood.style.width = `${good}%`;
  els.barRegular.style.width = `${regular}%`;
  els.barBad.style.width = `${bad}%`;
  els.barCritical.style.width = `${critical}%`;
  els.barNoSample.style.width = `${noSample}%`;
}

function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    return DeviceMotionEvent.requestPermission().then(r => {
      if (r !== "granted") throw new Error("Permissão de movimento negada.");
    });
  }
  return Promise.resolve();
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
        updateHealth();
      });
    }
  } catch (err) {
    console.warn("Wake lock indisponível", err);
  }
  updateHealth();
}

async function releaseWakeLock() {
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
    }
  } catch {}
  updateHealth();
}

function onMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration || {};
  const rot = event.rotationRate || {};

  const sample = {
    t: new Date().toISOString(),
    ax: Number(acc.x || 0),
    ay: Number(acc.y || 0),
    az: Number(acc.z || 0),
    gx: Number(rot.alpha || 0),
    gy: Number(rot.beta || 0),
    gz: Number(rot.gamma || 0),
  };

  if (state.calibrationSamples) state.calibrationSamples.push(sample);
  if (state.collecting && !state.paused) state.motionBuffer.push(sample);
}

function roughnessValue(sample) {
  const baseZ = state.calibration?.azMean ?? 9.81;
  const idleNoise = state.calibration?.azStd ?? 0.05;
  const verticalDelta = Math.abs(sample.az - baseZ);
  return Math.max(0, verticalDelta - idleNoise);
}

function classByIndex(index) {
  if (index == null) return "sem_amostra";
  if (index < 0.45) return "bom";
  if (index < 1.10) return "regular";
  if (index < 2.00) return "ruim";
  return "critico";
}

function summarizeBuffer() {
  const values = state.motionBuffer.map(roughnessValue);
  const meanVal = mean(values);
  const maxVal = values.length ? Math.max(...values) : 0;
  const stdVal = std(values, meanVal);
  const peakCount = values.filter(v => v >= 2.0).length;

  return {
    sample_count: values.length,
    roughness_mean: meanVal,
    roughness_max: maxVal,
    roughness_std: stdVal,
    peak_count: peakCount,
    roughness_index: meanVal + (stdVal * 0.5) + (peakCount > 0 ? Math.min(1, peakCount / 10) : 0),
  };
}

async function calibrateForStart() {
  showModal("Preparando coleta", "Liberando sensores e mantendo a tela ativa...", true);
  await requestMotionPermission();
  await requestWakeLock();

  showModal("Calibrando sensores", "Deixe o celular parado por 10 segundos antes de iniciar.", true);
  state.calibrationSamples = [];

  await new Promise(resolve => setTimeout(resolve, 10000));

  const samples = state.calibrationSamples || [];
  state.calibrationSamples = null;

  if (samples.length >= 10) {
    const azs = samples.map(s => s.az);
    const axs = samples.map(s => s.ax);
    const ays = samples.map(s => s.ay);

    state.calibration = {
      date: new Date().toISOString(),
      device: "motorola_g82_android_13",
      axMean: mean(axs),
      ayMean: mean(ays),
      azMean: mean(azs),
      azStd: std(azs),
      samples: samples.length
    };

    localStorage.setItem("pavimentolab_calibration_v5", JSON.stringify(state.calibration));
  }

  hideModal();
}

function startGpsWatch() {
  if (!("geolocation" in navigator)) {
    alert("Geolocalização não disponível neste navegador.");
    return;
  }

  if (state.gpsWatchId !== null) return;

  state.gpsWatchId = navigator.geolocation.watchPosition(
    onGps,
    (err) => {
      els.gpsPill.textContent = "GPS erro";
      setHealth(els.healthGps, "bad");
      els.healthGpsText.textContent = err.message;
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function onGps(pos) {
  const c = pos.coords;
  const pointBase = {
    timestamp: new Date().toISOString(),
    lat: c.latitude,
    lon: c.longitude,
    gps_accuracy_m: c.accuracy ?? null,
    speed_mps: c.speed ?? null,
    heading: c.heading ?? null,
    altitude: c.altitude ?? null,
  };

  state.lastGpsAt = Date.now();
  state.lastGpsPosition = { ...pointBase, accuracy: c.accuracy ?? null };
  els.gpsPill.textContent = c.accuracy ? `GPS ${c.accuracy.toFixed(0)}m` : "GPS ok";

  updateMarker(pointBase, c.heading);
  updateHealth();

  if (state.collecting && !state.paused && state.current) {
    saveGpsRecord(pointBase);
  }
}

function saveGpsRecord(pointBase) {
  const summary = state.motionBuffer.length
    ? summarizeBuffer()
    : {
        sample_count: 0,
        roughness_mean: null,
        roughness_max: null,
        roughness_std: null,
        peak_count: 0,
        roughness_index: null,
      };

  const point = {
    ...pointBase,
    ...summary
  };
  point.classe = classByIndex(point.roughness_index);

  const previous = state.lastGpsPoint;
  let createdSegment = null;
  state.current.points.push(point);

  if (previous && typeof previous.lat === "number" && typeof previous.lon === "number") {
    const dist = distanceMeters(previous, point);
    const accNow = point.gps_accuracy_m ?? 999;
    const accPrev = previous.gps_accuracy_m ?? 999;

    let segment_quality = "ok";
    const flags = [];

    if (dist !== null && dist < 1.5) {
      flags.push("trecho_muito_curto");
      segment_quality = "atencao";
    }
    if (dist !== null && dist > 120) {
      flags.push("possivel_salto_gps");
      segment_quality = "baixa_confianca";
    }
    if (accNow > 35 || accPrev > 35) {
      flags.push("gps_baixa_precisao");
      segment_quality = "baixa_confianca";
    }
    if (point.sample_count === 0) {
      flags.push("sem_amostra_acelerometro");
      if (segment_quality === "ok") segment_quality = "atencao";
    }

    const segment = {
      timestamp_start: previous.timestamp,
      timestamp_end: point.timestamp,
      lat_start: previous.lat,
      lon_start: previous.lon,
      lat_end: point.lat,
      lon_end: point.lon,
      distance_m: dist,
      speed_mps: point.speed_mps,
      heading: point.heading,
      gps_accuracy_start_m: previous.gps_accuracy_m,
      gps_accuracy_end_m: point.gps_accuracy_m,
      sample_count: point.sample_count,
      roughness_mean: point.roughness_mean,
      roughness_max: point.roughness_max,
      roughness_std: point.roughness_std,
      peak_count: point.peak_count,
      roughness_index: point.roughness_index,
      classe: point.classe,
      segment_quality,
      flags: flags.join(";"),
    };

    state.current.segments.push(segment);
    createdSegment = segment;

    if (dist && dist > 0 && dist < 120) {
      state.current.totalDistanceM = (state.current.totalDistanceM || 0) + dist;
    }
  }

  if (createdSegment) drawSegment(createdSegment);

  state.lastGpsPoint = point;
  state.motionBuffer = [];
  saveCurrentDraft();
  updateMetrics();
}

async function startCollection() {
  try {
    await calibrateForStart();

    if (state.routeLayer) state.routeLayer.clearLayers();

    state.current = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: collectionName(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      device: "motorola_g82_android_13",
      calibration: state.calibration,
      points: [],
      segments: [],
      pauses: [],
      totalDistanceM: 0
    };

    state.collecting = true;
    state.paused = false;
    state.lastGpsPoint = null;
    state.motionBuffer = [];

    els.btnMain.classList.remove("start");
    els.btnMain.classList.add("stop");
    els.btnMain.querySelector("b").textContent = "Segure para parar";
    els.btnMain.querySelector("small").textContent = "encerrar gravação";
    els.btnMain.querySelector(".action-icon").textContent = "■";
    els.btnPause.disabled = false;

    updateStatusPill();
    updateMetrics();

    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(() => {
      updateMetrics();
      updateHealth();
    }, 1000);

    startGpsWatch();
  } catch (err) {
    hideModal();
    alert(err.message || "Não foi possível iniciar a coleta.");
  }
}

function togglePause() {
  if (!state.collecting || !state.current) return;

  state.paused = !state.paused;
  state.motionBuffer = [];
  state.lastGpsPoint = null;

  if (state.paused) {
    state.current.pauses.push({ start: new Date().toISOString(), end: null });
    els.btnPause.querySelector("b").textContent = "Retomar";
    els.btnPause.querySelector("small").textContent = "voltar coleta";
    els.btnPause.querySelector("span").textContent = "▶";
  } else {
    const last = state.current.pauses[state.current.pauses.length - 1];
    if (last && !last.end) last.end = new Date().toISOString();
    els.btnPause.querySelector("b").textContent = "Pausar";
    els.btnPause.querySelector("small").textContent = "pausar coleta";
    els.btnPause.querySelector("span").textContent = "Ⅱ";
  }

  updateStatusPill();
  saveCurrentDraft();
}

function stopCollection() {
  if (!state.current) return;

  state.collecting = false;
  state.paused = false;
  state.current.endedAt = new Date().toISOString();

  const lastPause = state.current.pauses[state.current.pauses.length - 1];
  if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();

  saveCollection(state.current);
  localStorage.removeItem("pavimentolab_current_v5");
  state.lastStoppedCollection = state.current;

  state.current = null;
  state.lastGpsPoint = null;
  state.motionBuffer = [];

  els.btnMain.classList.remove("stop");
  els.btnMain.classList.add("start");
  els.btnMain.style.setProperty("--hold", "0%");
  els.btnMain.querySelector("b").textContent = "Iniciar gravação";
  els.btnMain.querySelector("small").textContent = "calibrar e começar";
  els.btnMain.querySelector(".action-icon").textContent = "●";
  els.btnPause.disabled = true;
  els.btnPause.querySelector("b").textContent = "Pausar";
  els.btnPause.querySelector("small").textContent = "pausar coleta";
  els.btnPause.querySelector("span").textContent = "Ⅱ";

  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  updateStatusPill();
  updateMetrics();
  renderHistory();
  releaseWakeLock();

  showExportModal(state.lastStoppedCollection);
}

function startHoldToStop() {
  if (!state.collecting) {
    startCollection();
    return;
  }

  if (state.paused) {
    // still allow stopping while paused
  }

  state.holdStart = Date.now();
  const duration = 1500;

  if (state.holdTimer) clearInterval(state.holdTimer);
  state.holdTimer = setInterval(() => {
    const elapsed = Date.now() - state.holdStart;
    const pct = Math.min(100, (elapsed / duration) * 100);
    els.btnMain.style.setProperty("--hold", `${pct}%`);

    if (pct >= 100) {
      clearInterval(state.holdTimer);
      state.holdTimer = null;
      stopCollection();
    }
  }, 30);
}

function cancelHoldToStop() {
  if (!state.collecting) return;
  if (state.holdTimer) {
    clearInterval(state.holdTimer);
    state.holdTimer = null;
  }
  els.btnMain.style.setProperty("--hold", "0%");
}

function toCsv(collection) {
  const cols = [
    "timestamp","lat","lon","gps_accuracy_m","speed_mps","heading","altitude",
    "sample_count","roughness_mean","roughness_max","roughness_std",
    "peak_count","roughness_index","classe"
  ];
  const meta = [
    `# name=${collection.name}`,
    `# startedAt=${collection.startedAt}`,
    `# endedAt=${collection.endedAt || ""}`,
    `# device=${collection.device || ""}`,
    `# totalDistanceM=${collection.totalDistanceM || 0}`,
    `# points=${collection.points.length}`,
    `# segments=${collection.segments.length}`,
  ];
  const lines = [cols.join(",")];
  collection.points.forEach(row => lines.push(cols.map(c => row[c] ?? "").join(",")));
  return meta.join("\n") + "\n" + lines.join("\n");
}

function toPointsGeoJson(collection) {
  const features = collection.points
    .filter(r => typeof r.lat === "number" && typeof r.lon === "number")
    .map(r => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        timestamp: r.timestamp,
        gps_accuracy_m: r.gps_accuracy_m,
        speed_mps: r.speed_mps,
        heading: r.heading,
        sample_count: r.sample_count,
        roughness_mean: r.roughness_mean,
        roughness_max: r.roughness_max,
        roughness_std: r.roughness_std,
        peak_count: r.peak_count,
        roughness_index: r.roughness_index,
        classe: r.classe,
        collection: collection.name,
      }
    }));

  return JSON.stringify({
    type: "FeatureCollection",
    name: `${collection.name}_pontos`,
    metadata: {
      startedAt: collection.startedAt,
      endedAt: collection.endedAt,
      device: collection.device,
      totalDistanceM: collection.totalDistanceM,
      calibration: collection.calibration,
    },
    features
  }, null, 2);
}

function toSegmentsGeoJson(collection) {
  const features = collection.segments.map(s => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [[s.lon_start, s.lat_start], [s.lon_end, s.lat_end]]
    },
    properties: {
      timestamp_start: s.timestamp_start,
      timestamp_end: s.timestamp_end,
      distance_m: s.distance_m,
      speed_mps: s.speed_mps,
      heading: s.heading,
      gps_accuracy_start_m: s.gps_accuracy_start_m,
      gps_accuracy_end_m: s.gps_accuracy_end_m,
      sample_count: s.sample_count,
      roughness_mean: s.roughness_mean,
      roughness_max: s.roughness_max,
      roughness_std: s.roughness_std,
      peak_count: s.peak_count,
      roughness_index: s.roughness_index,
      classe: s.classe,
      segment_quality: s.segment_quality,
      flags: s.flags,
      collection: collection.name,
    }
  }));

  return JSON.stringify({
    type: "FeatureCollection",
    name: `${collection.name}_trechos`,
    metadata: {
      startedAt: collection.startedAt,
      endedAt: collection.endedAt,
      device: collection.device,
      totalDistanceM: collection.totalDistanceM,
      calibration: collection.calibration,
    },
    features
  }, null, 2);
}

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCollection(collection, kind) {
  if (!collection) return;
  if (kind === "csv") downloadText(`${collection.name}_pontos.csv`, toCsv(collection), "text/csv");
  if (kind === "points") downloadText(`${collection.name}_pontos.geojson`, toPointsGeoJson(collection), "application/geo+json");
  if (kind === "segments") downloadText(`${collection.name}_trechos.geojson`, toSegmentsGeoJson(collection), "application/geo+json");
}

function renderHistory() {
  const list = getCollections();
  els.historyList.innerHTML = "";

  if (!list.length) {
    els.historyList.innerHTML = `<p class="muted">Nenhuma rota salva ainda.</p>`;
    return;
  }

  list.forEach(c => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <strong>${c.name}</strong>
      <small>
        ${new Date(c.startedAt).toLocaleString()}<br>
        ${formatKm(c.totalDistanceM || 0)} · ${c.points.length} pontos · ${c.segments.length} trechos
      </small>
      <div class="history-actions">
        <button data-show="${c.id}">ver mapa</button>
        <button data-csv="${c.id}">CSV</button>
        <button data-points="${c.id}">pontos</button>
        <button data-segments="${c.id}">trechos</button>
        <button class="danger" data-delete="${c.id}">apagar</button>
      </div>
    `;
    els.historyList.appendChild(div);
  });

  els.historyList.querySelectorAll("[data-show]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.show);
      showCollectionOnMap(c);
      closeDrawer();
    });
  });
  els.historyList.querySelectorAll("[data-csv]").forEach(btn => btn.addEventListener("click", () => exportCollection(getCollections().find(x => x.id === btn.dataset.csv), "csv")));
  els.historyList.querySelectorAll("[data-points]").forEach(btn => btn.addEventListener("click", () => exportCollection(getCollections().find(x => x.id === btn.dataset.points), "points")));
  els.historyList.querySelectorAll("[data-segments]").forEach(btn => btn.addEventListener("click", () => exportCollection(getCollections().find(x => x.id === btn.dataset.segments), "segments")));
  els.historyList.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("Apagar esta rota?")) return;
      const list = getCollections().filter(x => x.id !== btn.dataset.delete);
      localStorage.setItem(storageKey(), JSON.stringify(list));
      renderHistory();
    });
  });
}

function showCollectionOnMap(collection) {
  if (!collection || !state.routeLayer) return;
  state.routeLayer.clearLayers();
  collection.segments.forEach(drawSegment);
  const first = collection.points.find(p => typeof p.lat === "number");
  const last = [...collection.points].reverse().find(p => typeof p.lat === "number");
  if (last) updateMarker(last, last.heading);
  if (first && last) {
    const bounds = L.latLngBounds(collection.points.filter(p => p.lat && p.lon).map(p => [p.lat, p.lon]));
    state.map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function showModal(title, text, spinner = false) {
  els.modal.classList.remove("hidden");
  els.modalTitle.textContent = title;
  els.modalText.textContent = text;
  els.modalSpinner.style.display = spinner ? "block" : "none";
  els.modalActions.classList.add("hidden");
}

function hideModal() {
  els.modal.classList.add("hidden");
}

function showExportModal(collection) {
  els.modal.classList.remove("hidden");
  els.modalTitle.textContent = "Coleta salva";
  els.modalText.textContent = "Deseja gerar os arquivos de saída agora?";
  els.modalSpinner.style.display = "none";
  els.modalActions.classList.remove("hidden");

  els.btnExportCsv.onclick = () => exportCollection(collection, "csv");
  els.btnExportPoints.onclick = () => exportCollection(collection, "points");
  els.btnExportSegments.onclick = () => exportCollection(collection, "segments");
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  renderHistory();
  updateHealth();
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

function loadSavedCalibration() {
  const cal = localStorage.getItem("pavimentolab_calibration_v5");
  if (cal) state.calibration = JSON.parse(cal);
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service worker não registrado", err);
    }
  }
}

window.addEventListener("devicemotion", onMotion);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.collecting) {
    await requestWakeLock();
  }
});

els.btnMenu.addEventListener("click", openDrawer);
els.btnCloseDrawer.addEventListener("click", closeDrawer);
els.drawer.addEventListener("click", (e) => {
  if (e.target === els.drawer) closeDrawer();
});
els.btnLocate.addEventListener("click", locateOnMap);
els.btnPause.addEventListener("click", togglePause);
els.btnCloseModal.addEventListener("click", hideModal);

els.btnMain.addEventListener("pointerdown", startHoldToStop);
els.btnMain.addEventListener("pointerup", cancelHoldToStop);
els.btnMain.addEventListener("pointerleave", cancelHoldToStop);
els.btnMain.addEventListener("pointercancel", cancelHoldToStop);

els.btnClearAll.addEventListener("click", () => {
  if (!confirm("Apagar todo o histórico local?")) return;
  localStorage.removeItem(storageKey());
  renderHistory();
});

initMap();
startGpsWatch();
loadSavedCalibration();
registerServiceWorker();
renderHistory();
updateStatusPill();
updateMetrics();
updateHealth();

setInterval(updateHealth, 2000);
