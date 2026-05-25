const state = {
  calibration: null,
  collecting: false,
  current: null,
  lastMotion: null,
  lastGps: null,
  gpsWatchId: null,
  calibrationSamples: [],
};

const els = {
  sensorBadge: document.getElementById("sensorBadge"),
  driverName: document.getElementById("driverName"),
  vehicleName: document.getElementById("vehicleName"),
  mountPosition: document.getElementById("mountPosition"),
  btnPermission: document.getElementById("btnPermission"),
  btnCalibrate: document.getElementById("btnCalibrate"),
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  calibrationInfo: document.getElementById("calibrationInfo"),
  currentName: document.getElementById("currentName"),
  pointCount: document.getElementById("pointCount"),
  gpsAccuracy: document.getElementById("gpsAccuracy"),
  roughnessNow: document.getElementById("roughnessNow"),
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
      (pos) => {
        state.lastGps = pos;
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
  state.lastMotion = sample;

  if (state.calibrationSamples) state.calibrationSamples.push(sample);

  if (state.collecting && state.current) {
    addCollectionSample(sample);
  }
}

function startGpsWatch() {
  if (!("geolocation" in navigator)) return;

  state.gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.lastGps = pos;
      const acc = pos.coords.accuracy;
      els.gpsAccuracy.textContent = acc ? `${acc.toFixed(1)} m` : "---";
    },
    (err) => {
      els.status.textContent = `GPS: ${err.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
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
      gpsAccuracy: state.lastGps?.coords?.accuracy || null,
    };

    localStorage.setItem("pavimentolab_calibration", JSON.stringify(state.calibration));
    els.calibrationInfo.textContent =
      `Calibrado. Base Z: ${state.calibration.azMean.toFixed(3)} | ruído parado: ${state.calibration.azStd.toFixed(3)} | amostras: ${samples.length}`;
    els.status.textContent = "Calibração salva no celular.";
  }, 15000);
}

function roughnessIndex(sample) {
  const baseZ = state.calibration?.azMean ?? 9.81;
  const idleNoise = state.calibration?.azStd ?? 0.05;
  const verticalDelta = Math.abs(sample.az - baseZ);
  const corrected = Math.max(0, verticalDelta - idleNoise);
  return corrected;
}

function classByIndex(index) {
  if (index < 0.45) return "bom";
  if (index < 1.10) return "regular";
  if (index < 2.00) return "ruim";
  return "critico";
}

function addCollectionSample(motionSample) {
  const gps = state.lastGps;
  const coords = gps?.coords || {};
  const index = roughnessIndex(motionSample);

  const row = {
    timestamp: motionSample.t,
    lat: coords.latitude ?? null,
    lon: coords.longitude ?? null,
    gps_accuracy_m: coords.accuracy ?? null,
    speed_mps: coords.speed ?? null,
    acc_x: motionSample.ax,
    acc_y: motionSample.ay,
    acc_z: motionSample.az,
    gyro_x: motionSample.gx,
    gyro_y: motionSample.gy,
    gyro_z: motionSample.gz,
    roughness_index: index,
    classe: classByIndex(index),
  };

  state.current.rows.push(row);
  els.pointCount.textContent = state.current.rows.length;
  els.roughnessNow.textContent = `${index.toFixed(2)} (${row.classe})`;

  if (state.current.rows.length % 25 === 0) {
    saveCurrentDraft();
  }
}

function startCollection() {
  if (!state.calibration) {
    els.status.textContent = "Você pode coletar sem calibrar, mas é melhor calibrar antes. Iniciando mesmo assim.";
  }

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
    rows: [],
  };

  state.collecting = true;
  els.currentName.textContent = name;
  els.pointCount.textContent = "0";
  els.btnStart.disabled = true;
  els.btnStop.disabled = false;
  els.status.textContent = "Coletando...";
  saveCurrentDraft();
}

function stopCollection() {
  if (!state.current) return;
  state.collecting = false;
  state.current.endedAt = new Date().toISOString();
  saveCollection(state.current);
  localStorage.removeItem("pavimentolab_current");
  els.btnStart.disabled = false;
  els.btnStop.disabled = true;
  els.status.textContent = `Coleta salva: ${state.current.name}`;
  state.current = null;
  renderCollections();
}

function storageKey() {
  return "pavimentolab_collections";
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
    "timestamp","lat","lon","gps_accuracy_m","speed_mps",
    "acc_x","acc_y","acc_z","gyro_x","gyro_y","gyro_z",
    "roughness_index","classe"
  ];
  const meta = [
    `# name=${collection.name}`,
    `# startedAt=${collection.startedAt}`,
    `# endedAt=${collection.endedAt || ""}`,
    `# driver=${collection.driver || ""}`,
    `# vehicle=${collection.vehicle || ""}`,
    `# device=${collection.device || ""}`,
    `# mountPosition=${collection.mountPosition || ""}`,
  ];
  const lines = [cols.join(",")];
  collection.rows.forEach(row => {
    lines.push(cols.map(c => row[c] ?? "").join(","));
  });
  return meta.join("\n") + "\n" + lines.join("\n");
}

function toGeoJson(collection) {
  const features = collection.rows
    .filter(r => typeof r.lat === "number" && typeof r.lon === "number")
    .map(r => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        timestamp: r.timestamp,
        gps_accuracy_m: r.gps_accuracy_m,
        speed_mps: r.speed_mps,
        acc_z: r.acc_z,
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
    name: collection.name,
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
    const gpsValues = c.rows.map(r => r.gps_accuracy_m).filter(v => typeof v === "number");
    const roughValues = c.rows.map(r => r.roughness_index).filter(v => typeof v === "number");
    const gpsAvg = gpsValues.length ? `${mean(gpsValues).toFixed(1)} m` : "---";
    const roughAvg = roughValues.length ? mean(roughValues).toFixed(2) : "---";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTitle">${c.name}</div>
      <div class="itemMeta">
        Início: ${new Date(c.startedAt).toLocaleString()}<br>
        Registros: ${c.rows.length}<br>
        GPS médio: ${gpsAvg}<br>
        Índice médio: ${roughAvg}
      </div>
      <div class="actions">
        <button data-csv="${c.id}">Exportar CSV</button>
        <button data-geojson="${c.id}">Exportar GeoJSON</button>
        <button class="danger" data-delete="${c.id}">Apagar</button>
      </div>
    `;
    els.collectionsList.appendChild(div);
  });

  els.collectionsList.querySelectorAll("[data-csv]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.csv);
      downloadText(`${c.name}.csv`, toCsv(c), "text/csv");
    });
  });

  els.collectionsList.querySelectorAll("[data-geojson]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = getCollections().find(x => x.id === btn.dataset.geojson);
      downloadText(`${c.name}.geojson`, toGeoJson(c), "application/geo+json");
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
els.btnStop.addEventListener("click", stopCollection);

startGpsWatch();
loadSavedState();
renderCollections();
registerServiceWorker();

setBadge("Pronto", "warn");
