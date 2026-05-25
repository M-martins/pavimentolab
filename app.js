const state = {
  calibration: null,
  collecting: false,
  paused: false,
  current: null,
  lastGpsPoint: null,
  gpsWatchId: null,
  motionBuffer: [],
  calibrationSamples: null,
};

const els = {
  sensorBadge: document.getElementById("sensorBadge"),
  driverName: document.getElementById("driverName"),
  vehicleName: document.getElementById("vehicleName"),
  mountPosition: document.getElementById("mountPosition"),
  btnPermission: document.getElementById("btnPermission"),
  btnCalibrate: document.getElementById("btnCalibrate"),
  btnStart: document.getElementById("btnStart"),
  btnPause: document.getElementById("btnPause"),
  btnStop: document.getElementById("btnStop"),
  calibrationInfo: document.getElementById("calibrationInfo"),
  currentName: document.getElementById("currentName"),
  pointCount: document.getElementById("pointCount"),
  segmentCount: document.getElementById("segmentCount"),
  gpsAccuracy: document.getElementById("gpsAccuracy"),
  roughnessNow: document.getElementById("roughnessNow"),
  motionCount: document.getElementById("motionCount"),
  status: document.getElementById("status"),
  collectionsList: document.getElementById("collectionsList"),
};

function nowId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function sanitizeName(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function collectionName() {
  const device = "motorola_g82";
  const driver = sanitizeName(els.driverName.value);
  const vehicle = sanitizeName(els.vehicleName.value);
  return ["coleta", nowId(), device, driver, vehicle].filter(Boolean).join("_");
}

function setBadge(text, cls) {
  els.sensorBadge.textContent = text;
  els.sensorBadge.className = `badge ${cls}`;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a,b) => a + b, 0) / values.length;
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

async function requestPermissions() {
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const response = await DeviceMotionEvent.requestPermission();
      if (response !== "granted") throw new Error("Permissão de movimento negada.");
    }

    if (!("geolocation" in navigator)) {
      throw new Error("Geolocalização não disponível neste navegador.");
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setBadge("Sensores OK", "ok");
        els.status.textContent = "Sensores liberados. Você já pode calibrar.";
      },
      (err) => {
        setBadge("GPS pendente", "warn");
        els.status.textContent = `GPS ainda não liberado: ${err.message}`;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  } catch (err) {
    setBadge("Erro", "bad");
    els.status.textContent = err.message;
  }
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

  if (state.calibrationSamples) {
    state.calibrationSamples.push(sample);
  }

  if (state.collecting && !state.paused) {
    state.motionBuffer.push(sample);
    els.motionCount.textContent = state.motionBuffer.length;
  }
}

function roughnessValue(sample) {
  const baseZ = state.calibration?.azMean ?? 9.81;
  const idleNoise = state.calibration?.azStd ?? 0.05;
  const verticalDelta = Math.abs(sample.az - baseZ);
  return Math.max(0, verticalDelta - idleNoise);
}

function classByIndex(index) {
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

function onGps(pos) {
  const c = pos.coords;
  els.gpsAccuracy.textContent = c.accuracy ? `${c.accuracy.toFixed(1)} m` : "---";

  if (!state.collecting || state.paused || !state.current) return;
  if (!state.motionBuffer.length) return;

  const point = {
    timestamp: new Date().toISOString(),
    lat: c.latitude,
    lon: c.longitude,
    gps_accuracy_m: c.accuracy ?? null,
    speed_mps: c.speed ?? null,
    heading: c.heading ?? null,
    altitude: c.altitude ?? null,
    ...summarizeBuffer(),
  };
  point.classe = classByIndex(point.roughness_index);

  const previous = state.lastGpsPoint;
  state.current.points.push(point);

  if (previous) {
    const dist = distanceMeters(previous, point);
    const validDistance = dist !== null && dist >= 1.5 && dist <= 80;
    const validGps = (point.gps_accuracy_m ?? 999) <= 35 && (previous.gps_accuracy_m ?? 999) <= 35;

    if (validDistance && validGps) {
      const segment = {
        timestamp_start: previous.timestamp,
        timestamp_end: point.timestamp,
        lat_start: previous.lat,
        lon_start: previous.lon,
        lat_end: point.lat,
        lon_end: point.lon,
        distance_m: dist,
        speed_mps: point.speed_mps,
        gps_accuracy_start_m: previous.gps_accuracy_m,
        gps_accuracy_end_m: point.gps_accuracy_m,
        sample_count: point.sample_count,
        roughness_mean: point.roughness_mean,
        roughness_max: point.roughness_max,
        roughness_std: point.roughness_std,
        peak_count: point.peak_count,
        roughness_index: point.roughness_index,
        classe: point.classe,
      };
      state.current.segments.push(segment);
    }
  }

  state.lastGpsPoint = point;
  state.motionBuffer = [];

  els.pointCount.textContent = state.current.points.length;
  els.segmentCount.textContent = state.current.segments.length;
  els.roughnessNow.textContent = `${point.roughness_index.toFixed(2)} (${point.classe})`;
  els.motionCount.textContent = "0";

  saveCurrentDraft();
}

function startGpsWatch() {
  if (!("geolocation" in navigator)) return;

  state.gpsWatchId = navigator.geolocation.watchPosition(
    onGps,
    (err) => { els.status.textContent = `GPS: ${err.message}`; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function calibrate() {
  state.calibrationSamples = [];
  els.status.textContent = "Calibrando: deixe o celular parado por 15 segundos...";
  els.btnCalibrate.disabled = true;

  setTimeout(() => {
    const samples = state.calibrationSamples || [];
    state.calibrationSamples = null;
    els.btnCalibrate.disabled = false;

    if (samples.length < 10) {
      els.calibrationInfo.textContent = "Calibração falhou: poucos dados do acelerômetro. Verifique permissões.";
      return;
    }

    const azs = samples.map(s => s.az);
    const axs = samples.map(s => s.ax);
    const ays = samples.map(s => s.ay);

    state.calibration = {
      date: new Date().toISOString(),
      device: "motorola_g82_android_13",
      mountPosition: els.mountPosition.value,
      axMean: mean(axs),
      ayMean: mean(ays),
      azMean: mean(azs),
      azStd: std(azs),
      samples: samples.length,
    };

    localStorage.setItem("pavimentolab_calibration", JSON.stringify(state.calibration));
    els.calibrationInfo.textContent =
      `Calibrado. Base Z: ${state.calibration.azMean.toFixed(3)} | ruído parado: ${state.calibration.azStd.toFixed(3)} | amostras: ${samples.length}`;
    els.status.textContent = "Calibração salva no celular.";
  }, 15000);
}

function startCollection() {
  const name = collectionName();

  state.current = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    startedAt: new Date().toISOString(),
    endedAt: null,
    driver: els.driverName.value.trim(),
    vehicle: els.vehicleName.value.trim(),
    device: "motorola_g82_android_13",
    mountPosition: els.mountPosition.value,
    calibration: state.calibration,
    points: [],
    segments: [],
    pauses: [],
  };

  state.collecting = true;
  state.paused = false;
  state.lastGpsPoint = null;
  state.motionBuffer = [];

  els.currentName.textContent = name;
  els.pointCount.textContent = "0";
  els.segmentCount.textContent = "0";
  els.motionCount.textContent = "0";
  els.btnStart.disabled = true;
  els.btnPause.disabled = false;
  els.btnPause.textContent = "Pausar";
  els.btnStop.disabled = false;
  els.status.textContent = "Coletando. O registro é salvo a cada atualização do GPS.";
  setBadge("Coletando", "ok");
  saveCurrentDraft();
}

function togglePause() {
  if (!state.current || !state.collecting) return;

  state.paused = !state.paused;
  state.motionBuffer = [];
  state.lastGpsPoint = null;

  if (state.paused) {
    state.current.pauses.push({ start: new Date().toISOString(), end: null });
    els.btnPause.textContent = "Retomar";
    els.status.textContent = "Coleta pausada. Nenhum ponto ou trecho será salvo.";
    setBadge("Pausado", "warn");
  } else {
    const last = state.current.pauses[state.current.pauses.length - 1];
    if (last && !last.end) last.end = new Date().toISOString();
    els.btnPause.textContent = "Pausar";
    els.status.textContent = "Coleta retomada.";
    setBadge("Coletando", "ok");
  }

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
  localStorage.removeItem("pavimentolab_current");

  els.btnStart.disabled = false;
  els.btnPause.disabled = true;
  els.btnPause.textContent = "Pausar";
  els.btnStop.disabled = true;
  els.status.textContent = `Coleta salva: ${state.current.name}`;
  setBadge("Salvo", "ok");

  state.current = null;
  state.lastGpsPoint = null;
  state.motionBuffer = [];
  renderCollections();
}

function storageKey() {
  return "pavimentolab_collections_v2";
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
  if (state.current) {
    localStorage.setItem("pavimentolab_current", JSON.stringify(state.current));
  }
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
    `# driver=${collection.driver || ""}`,
    `# vehicle=${collection.vehicle || ""}`,
    `# device=${collection.device || ""}`,
    `# mountPosition=${collection.mountPosition || ""}`,
    `# points=${collection.points.length}`,
    `# segments=${collection.segments.length}`,
  ];
  const lines = [cols.join(",")];
  collection.points.forEach(row => {
    lines.push(cols.map(c => row[c] ?? "").join(","));
  });
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
        sample_count: r.sample_count,
        roughness_mean: r.roughness_mean,
        roughness_max: r.roughness_max,
        roughness_std: r.roughness_std,
        peak_count: r.peak_count,
        roughness_index: r.roughness_index,
        classe: r.classe,
        collection: collection.name,
        driver: collection.driver,
        vehicle: collection.vehicle,
        mountPosition: collection.mountPosition,
      }
    }));

  return JSON.stringify({
    type: "FeatureCollection",
    name: `${collection.name}_pontos`,
    metadata: {
      startedAt: collection.startedAt,
      endedAt: collection.endedAt,
      device: collection.device,
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
      coordinates: [
        [s.lon_start, s.lat_start],
        [s.lon_end, s.lat_end]
      ]
    },
    properties: {
      timestamp_start: s.timestamp_start,
      timestamp_end: s.timestamp_end,
      distance_m: s.distance_m,
      speed_mps: s.speed_mps,
      gps_accuracy_start_m: s.gps_accuracy_start_m,
      gps_accuracy_end_m: s.gps_accuracy_end_m,
      sample_count: s.sample_count,
      roughness_mean: s.roughness_mean,
      roughness_max: s.roughness_max,
      roughness_std: s.roughness_std,
      peak_count: s.peak_count,
      roughness_index: s.roughness_index,
      classe: s.classe,
      collection: collection.name,
      driver: collection.driver,
      vehicle: collection.vehicle,
      mountPosition: collection.mountPosition,
    }
  }));

  return JSON.stringify({
    type: "FeatureCollection",
    name: `${collection.name}_trechos`,
    metadata: {
      startedAt: collection.startedAt,
      endedAt: collection.endedAt,
      device: collection.device,
      calibration: collection.calibration,
    },
    features
  }, null, 2);
}

function deleteCollection(id) {
  const list = getCollections().filter(c => c.id !== id);
  localStorage.setItem(storageKey(), JSON.stringify(list));
  renderCollections();
}

function renderCollections() {
  const list = getCollections();
  els.collectionsList.innerHTML = "";

  if (!list.length) {
    els.collectionsList.innerHTML = `<p class="muted">Nenhuma coleta salva ainda.</p>`;
    return;
  }

  list.forEach((c) => {
    const gpsValues = c.points.map(r => r.gps_accuracy_m).filter(v => typeof v === "number");
    const roughValues = c.points.map(r => r.roughness_index).filter(v => typeof v === "number");
    const gpsAvg = gpsValues.length ? `${mean(gpsValues).toFixed(1)} m` : "---";
    const roughAvg = roughValues.length ? mean(roughValues).toFixed(2) : "---";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTitle">${c.name}</div>
      <div class="itemMeta">
        Início: ${new Date(c.startedAt).toLocaleString()}<br>
        Pontos: ${c.points.length} | Trechos: ${c.segments.length}<br>
        GPS médio: ${gpsAvg}<br>
        Índice médio: ${roughAvg}<br>
        Pausas: ${c.pauses?.length || 0}
      </div>
      <div class="actions">
        <button data-csv="${c.id}">CSV pontos</button>
        <button data-points="${c.id}">GeoJSON pontos</button>
        <button data-segments="${c.id}">GeoJSON trechos</button>
        <button class="danger" data-delete="${c.id}">Apagar</button>
      </div>
    `;
    els.collectionsList.appendChild(div);
  });

  els.collectionsList.querySelectorAll("[data-csv]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.csv);
      downloadText(`${c.name}_pontos.csv`, toCsv(c), "text/csv");
    });
  });

  els.collectionsList.querySelectorAll("[data-points]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.points);
      downloadText(`${c.name}_pontos.geojson`, toPointsGeoJson(c), "application/geo+json");
    });
  });

  els.collectionsList.querySelectorAll("[data-segments]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.segments);
      downloadText(`${c.name}_trechos.geojson`, toSegmentsGeoJson(c), "application/geo+json");
    });
  });

  els.collectionsList.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Apagar esta coleta do celular?")) deleteCollection(btn.dataset.delete);
    });
  });
}

function loadSavedState() {
  const cal = localStorage.getItem("pavimentolab_calibration");
  if (cal) {
    state.calibration = JSON.parse(cal);
    els.calibrationInfo.textContent =
      `Calibração carregada. Base Z: ${state.calibration.azMean.toFixed(3)} | ruído parado: ${state.calibration.azStd.toFixed(3)}`;
  }
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("Service Worker não registrado", err);
    }
  }
}

window.addEventListener("devicemotion", onMotion);
els.btnPermission.addEventListener("click", requestPermissions);
els.btnCalibrate.addEventListener("click", calibrate);
els.btnStart.addEventListener("click", startCollection);
els.btnPause.addEventListener("click", togglePause);
els.btnStop.addEventListener("click", stopCollection);

startGpsWatch();
loadSavedState();
renderCollections();
registerServiceWorker();

setBadge("Pronto", "warn");
