// ── SistemIA Lácteo — app.js ──────────────────────────────────────────────
const API = 'http://localhost:8000';

let chartTemp = null;
let chartDist = null;
let historyData = [];
let alertsData = [];

// ── Página activa ──────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');

  const idx = ['dashboard','analisis','historico','alertas','modelo'].indexOf(name);
  document.querySelectorAll('.nav-item')[idx].classList.add('active');

  const titles = { dashboard:'Dashboard', analisis:'Análisis IA', historico:'Historial de Muestras', alertas:'Alertas Activas', modelo:'Modelo IA' };
  document.getElementById('pageTitle').textContent = titles[name];

  if (name === 'dashboard') initDashboard();
  if (name === 'modelo') loadModelInfo();
  if (name === 'historico') renderHistory();
  if (name === 'alertas') renderAlerts();
}

// ── Tiempo en topbar ───────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('topbarTime').textContent =
    now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ── KPIs helpers ───────────────────────────────────────────────────────────
function setKpi(id, value, unit, statusText, statusClass) {
  const card = document.getElementById(`kpi-${id}`);
  if (!card) return;
  card.querySelector('.kpi-value').innerHTML = `${value}<span class="kpi-unit">${unit}</span>`;
  const s = card.querySelector('.kpi-status');
  s.textContent = statusText;
  s.className = `kpi-status ${statusClass}`;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function initDashboard() {
  // Cargar histórico para gráfica
  try {
    const data = await fetch(`${API}/api/historico?horas=24`).then(r => r.json());
    renderTempChart(data);
  } catch (e) { console.warn('Sin datos históricos:', e); }

  // KPIs: usar última muestra o valores demo
  const last = historyData[historyData.length - 1];
  if (last) {
    const p = last.parametros;
    setKpi('temp', p.temperatura.toFixed(1), '°C', kpiStatus('temperatura', p.temperatura), kpiClass(last.score_global));
    setKpi('ph', p.ph.toFixed(2), '', kpiStatus('ph', p.ph), kpiClass(last.score_global));
    setKpi('cond', p.conductividad.toFixed(1), ' mS/cm', kpiStatus('conductividad', p.conductividad), kpiClass(last.score_global));
    setKpi('score', last.score_global, '/100', last.etiqueta, kpiClass(last.score_global));
    updateLastReading(last);
  } else {
    // Valores demo para que el dashboard no quede vacío
    setKpi('temp', '4.2', '°C', 'Estado óptimo', 'status-opt');
    setKpi('ph', '6.7', '', 'Estado óptimo', 'status-opt');
    setKpi('cond', '4.9', ' mS/cm', 'Estado óptimo', 'status-opt');
    setKpi('score', '87', '/100', 'Analiza una muestra', 'status-opt');
    document.getElementById('last-reading').textContent = 'Sin muestras analizadas aún. Ve a "Análisis IA" para evaluar una muestra.';
  }

  // Stats → gráfica de distribución
  try {
    const stats = await fetch(`${API}/api/estadisticas`).then(r => r.json());
    renderDistChart(stats.distribucion_calidad);
  } catch (e) { console.warn('Sin estadísticas:', e); }
}

function kpiStatus(param, val) {
  const ranges = {
    temperatura: { opt: [0,4], acc: [4,6], alt: [6,8] },
    ph: { opt: [6.6,6.8], acc: [6.4,7.0], alt: [6.2,7.2] },
    conductividad: { opt: [0,5.5], acc: [5.5,6.5], alt: [6.5,7.5] },
  };
  const r = ranges[param];
  if (!r) return 'Sin datos';
  if (val >= r.opt[0] && val <= r.opt[1]) return 'Estado óptimo';
  if (val >= r.acc[0] && val <= r.acc[1]) return 'Estado aceptable';
  return 'En alerta';
}

function kpiClass(score) {
  if (score >= 80) return 'status-opt';
  if (score >= 60) return 'status-acc';
  if (score >= 40) return 'status-alt';
  return 'status-rej';
}

function updateLastReading(result) {
  const p = result.parametros;
  document.getElementById('last-reading').innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:.88rem">
      <span>🕐 <strong>${new Date(result.timestamp).toLocaleTimeString('es-CO')}</strong></span>
      <span>ID: <code>${result.id_muestra}</code></span>
      <span>🌡️ ${p.temperatura}°C</span>
      <span>⚗️ pH ${p.ph}</span>
      <span>⚡ ${p.conductividad} mS/cm</span>
      <span>🧪 Acidez ${p.acidez}</span>
      <span>🥛 Grasa ${p.grasa}%</span>
      <span>🔬 Proteína ${p.proteina}%</span>
      <span>🦠 CST ${p.cst} mil/mL</span>
      <span style="font-weight:700;color:${result.color}">● ${result.etiqueta} (${result.score_global}/100)</span>
    </div>
  `;
}

// ── Charts ─────────────────────────────────────────────────────────────────
function renderTempChart(data) {
  const ctx = document.getElementById('chartTemp');
  if (!ctx) return;
  if (chartTemp) chartTemp.destroy();

  const labels = data.map(d => {
    const t = new Date(d.timestamp);
    return `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
  });
  const temps = data.map(d => d.temperatura);

  chartTemp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Temperatura (°C)',
        data: temps,
        backgroundColor: temps.map(t => t <= 4 ? '#22c55e88' : t <= 6 ? '#f59e0b88' : '#ef444488'),
        borderColor: temps.map(t => t <= 4 ? '#22c55e' : t <= 6 ? '#f59e0b' : '#ef4444'),
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: false, min: 0, max: 10, grid: { color: '#E5E1D820' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
        x: { ticks: { maxRotation: 0, font: { size: 9 }, maxTicksLimit: 12 }, grid: { display: false } }
      }
    }
  });
}

function renderDistChart(dist) {
  const ctx = document.getElementById('chartDist');
  if (!ctx) return;
  if (chartDist) chartDist.destroy();

  chartDist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(dist),
      datasets: [{
        data: Object.values(dist),
        backgroundColor: ['#22C55E','#84CC16','#F59E0B','#EF4444'],
        borderWidth: 0,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11, family: 'Space Grotesk' }, padding: 14 } }
      },
      cutout: '68%',
    }
  });
}

// ── Análisis ───────────────────────────────────────────────────────────────
async function analizar() {
  const btn = document.getElementById('btnAnalizar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analizando…';

  const body = {
    temperatura: parseFloat(document.getElementById('f-temp').value),
    ph: parseFloat(document.getElementById('f-ph').value),
    conductividad: parseFloat(document.getElementById('f-cond').value),
    acidez: parseFloat(document.getElementById('f-acidez').value),
    grasa: parseFloat(document.getElementById('f-grasa').value),
    proteina: parseFloat(document.getElementById('f-prot').value),
    cst: parseFloat(document.getElementById('f-cst').value),
    id_muestra: document.getElementById('f-id').value || null,
  };

  try {
    const res = await fetch(`${API}/api/predecir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());

    renderResult(res);
    historyData.push(res);

    // Agregar alerta si es necesario
    if (res.clase >= 2) {
      alertsData.unshift({
        tipo: res.clase === 3 ? 'err' : 'warn',
        titulo: `Muestra ${res.id_muestra} — ${res.etiqueta}`,
        detalle: res.recomendaciones[0] || '',
        ts: new Date().toLocaleTimeString('es-CO'),
      });
    }
  } catch (e) {
    alert('Error al conectar con el servidor IA. ¿Está corriendo el backend en puerto 8000?');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🧠</span> Analizar con IA';
  }
}

function renderResult(res) {
  const panel = document.getElementById('resultPanel');
  panel.classList.add('visible');


  document.getElementById('resultHeader').style.background = res.color;
  document.getElementById('resClase').textContent = res.etiqueta;
  document.getElementById('resScore').textContent = res.score_global;
  document.getElementById('resId').textContent = `Muestra: ${res.id_muestra}`;
  panel.style.borderColor = res.color;

  // Scores por parámetro
  const labels = {
    temperatura: 'Temp', ph: 'pH', conductividad: 'Cond',
    acidez: 'Acidez', grasa: 'Grasa', proteina: 'Prot', cst: 'CST'
  };
  const units = {
    temperatura: '°C', ph: '', conductividad: 'mS', acidez: '%', grasa: '%', proteina: '%', cst: 'k'
  };
  const params = res.parametros;
  const scores = res.scores_individuales;

  document.getElementById('paramScores').innerHTML = Object.entries(scores).map(([k, s]) => {
    const color = s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : '#ef4444';
    const val = params[k];
    return `
      <div class="param-score-card">
        <div class="p-name">${labels[k]}</div>
        <div class="p-val" style="color:${color}">${typeof val === 'number' ? val : '—'}${units[k]}</div>
        <div class="p-bar"><div class="p-fill" style="width:${s}%;background:${color}"></div></div>
        <div style="font-size:.65rem;color:var(--mist);margin-top:4px">${s}/100</div>
      </div>
    `;
  }).join('');

  // Probabilidades
  const colors = { 'Óptima':'#22c55e','Aceptable':'#84cc16','Alerta':'#f59e0b','Rechazada':'#ef4444' };
  document.getElementById('probsRow').innerHTML = Object.entries(res.probabilidades).map(([k, p]) => `
    <div class="prob-chip">
      <div class="p-label">${k}</div>
      <div class="p-pct" style="color:${colors[k]}">${p}%</div>
    </div>
  `).join('');

  // Recomendaciones
  document.getElementById('recsList').innerHTML = res.recomendaciones
    .map(r => `<li>${r}</li>`).join('');

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Fix: corregir la línea con bug de sintaxis
window.renderResult = function(res) {
  const panel = document.getElementById('resultPanel');
  panel.classList.add('visible');

  document.getElementById('resultHeader').style.background = res.color;
  document.getElementById('resClase').textContent = res.etiqueta;
  document.getElementById('resScore').textContent = res.score_global;
  document.getElementById('resId').textContent = `Muestra: ${res.id_muestra}`;
  panel.style.borderColor = res.color;

  const labels = { temperatura:'Temp', ph:'pH', conductividad:'Cond', acidez:'Acidez', grasa:'Grasa', proteina:'Prot', cst:'CST' };
  const units  = { temperatura:'°C', ph:'', conductividad:'mS', acidez:'%', grasa:'%', proteina:'%', cst:'k' };
  const params = res.parametros;
  const scores = res.scores_individuales;

  document.getElementById('paramScores').innerHTML = Object.entries(scores).map(([k, s]) => {
    const color = s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : '#ef4444';
    return `
      <div class="param-score-card">
        <div class="p-name">${labels[k]}</div>
        <div class="p-val" style="color:${color}">${params[k]}${units[k]}</div>
        <div class="p-bar"><div class="p-fill" style="width:${s}%;background:${color}"></div></div>
        <div style="font-size:.65rem;color:var(--mist);margin-top:4px">${s}/100</div>
      </div>`;
  }).join('');

  const cls = { 'Óptima':'#22c55e','Aceptable':'#84cc16','Alerta':'#f59e0b','Rechazada':'#ef4444' };
  document.getElementById('probsRow').innerHTML = Object.entries(res.probabilidades).map(([k,p]) =>
    `<div class="prob-chip"><div class="p-label">${k}</div><div class="p-pct" style="color:${cls[k]}">${p}%</div></div>`
  ).join('');

  document.getElementById('recsList').innerHTML = res.recomendaciones.map(r => `<li>${r}</li>`).join('');
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
};

// ── Ejemplos preset ────────────────────────────────────────────────────────
function cargarEjemplo(tipo) {
  const ejemplos = {
    optimo:   { temp: 3.2, ph: 6.72, cond: 4.8, acidez: 0.155, grasa: 3.6, prot: 3.3, cst: 95  },
    alerta:   { temp: 6.8, ph: 6.35, cond: 6.8, acidez: 0.195, grasa: 2.3, prot: 2.7, cst: 620 },
    rechazada:{ temp: 9.5, ph: 6.10, cond: 8.2, acidez: 0.260, grasa: 1.8, prot: 2.2, cst: 950 },
  };
  const e = ejemplos[tipo];
  document.getElementById('f-temp').value   = e.temp;
  document.getElementById('f-ph').value     = e.ph;
  document.getElementById('f-cond').value   = e.cond;
  document.getElementById('f-acidez').value = e.acidez;
  document.getElementById('f-grasa').value  = e.grasa;
  document.getElementById('f-prot').value   = e.prot;
  document.getElementById('f-cst').value    = e.cst;
  document.getElementById('f-id').value     = '';
}

// ── Historial ──────────────────────────────────────────────────────────────
function renderHistory() {
  const tbody = document.getElementById('historyTable');
  if (!historyData.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--mist);padding:24px">Sin registros. Analiza una muestra en la sección "Análisis IA".</td></tr>';
    return;
  }
  tbody.innerHTML = [...historyData].reverse().map(r => {
    const p = r.parametros;
    const bgMap = { 0:'#F0FDF4', 1:'#F7FEE7', 2:'#FFFBEB', 3:'#FEF2F2' };
    const txMap = { 0:'#16A34A', 1:'#65A30D', 2:'#D97706', 3:'#DC2626' };
    return `<tr>
      <td><code>${r.id_muestra}</code></td>
      <td style="font-size:.8rem">${new Date(r.timestamp).toLocaleString('es-CO')}</td>
      <td>${p.temperatura}°C</td>
      <td>${p.ph}</td>
      <td>${p.conductividad}</td>
      <td>${p.acidez}</td>
      <td>${p.grasa}%</td>
      <td>${p.proteina}%</td>
      <td>${p.cst}k</td>
      <td><span class="badge" style="background:${bgMap[r.clase]};color:${txMap[r.clase]}">${r.etiqueta}</span></td>
      <td style="font-family:var(--font-mono);font-weight:700">${r.score_global}</td>
    </tr>`;
  }).join('');
}

function clearHistory() {
  if (!confirm('¿Limpiar el historial?')) return;
  historyData = [];
  renderHistory();
}

// ── Alertas ────────────────────────────────────────────────────────────────
function renderAlerts() {
  const div = document.getElementById('alertList');
  if (!alertsData.length) {
    div.innerHTML = '<div class="alert-item alert-ok"><div class="alert-icon">✅</div><div class="alert-content"><h4>Sin alertas activas</h4><p>Todas las muestras analizadas están dentro de los rangos normales.</p></div></div>';
    return;
  }
  div.innerHTML = alertsData.map(a => `
    <div class="alert-item alert-${a.tipo}">
      <div class="alert-icon">${a.tipo === 'err' ? '❌' : '⚠️'}</div>
      <div class="alert-content">
        <h4>${a.titulo}</h4>
        <p>${a.detalle}</p>
        <p style="font-size:.75rem;margin-top:4px;color:var(--mist)">Detectado a las ${a.ts}</p>
      </div>
    </div>
  `).join('');
}

// ── Modelo ─────────────────────────────────────────────────────────────────
async function loadModelInfo() {
  try {
    const info = await fetch(`${API}/api/modelo/info`).then(r => r.json());
    document.getElementById('modelInfo').innerHTML = `
      <div class="metric-row"><span>Algoritmo</span><span class="metric-val">${info.algoritmo.split('(')[0]}</span></div>
      <div class="metric-row"><span>Precisión (CV)</span><span class="metric-val" style="color:var(--optimal)">${(info.metrics.accuracy * 100).toFixed(2)}%</span></div>
      <div class="metric-row"><span>Desviación std</span><span class="metric-val">±${(info.metrics.std * 100).toFixed(2)}%</span></div>
      <div class="metric-row"><span>Muestras entrenamiento</span><span class="metric-val">${info.metrics.n_samples.toLocaleString()}</span></div>
      <div class="metric-row"><span>Clases</span><span class="metric-val">4</span></div>
      <div class="metric-row"><span>Normativa</span><span class="metric-val" style="font-size:.8rem">${info.referencia_normativa}</span></div>
      <div class="metric-row"><span>Features</span><span class="metric-val" style="font-size:.8rem">${info.parametros.join(', ')}</span></div>
    `;
    document.getElementById('modelAccuracy').textContent = `Modelo: ${(info.metrics.accuracy * 100).toFixed(1)}% precisión`;
  } catch (e) {
    document.getElementById('modelInfo').textContent = 'Sin conexión con el backend.';
    document.getElementById('modelAccuracy').textContent = 'Backend desconectado';
  }
}

async function reentrenar() {
  if (!confirm('¿Re-entrenar el modelo con nuevos datos?')) return;
  try {
    const res = await fetch(`${API}/api/entrenar`, { method: 'POST' }).then(r => r.json());
    alert(`✅ ${res.mensaje}\nPrecisión: ${(res.metrics.accuracy * 100).toFixed(2)}%`);
    loadModelInfo();
  } catch (e) {
    alert('Error al re-entrenar. Verifica la conexión con el backend.');
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  loadModelInfo();
});
