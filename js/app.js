async function fetchCSV(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}: ${res.status}`);
  const text = await res.text();
  return parseSimpleCSV(text);
}

// CSV sencillo: una fila por línea, separador coma, valores opcionalmente entre comillas
function parseSimpleCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => stripQuotes(h));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCSVLine(lines[i]).map(c => stripQuotes(c));
    const row = {};
    headers.forEach((h, idx) => row[h] = (cols[idx] ?? "").trim());
    rows.push(row);
  }
  return rows;
}

function stripQuotes(s) {
  return s.replace(/^"(.*)"$/, "$1");
}

// Parte la línea respetando comillas
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function setKPI(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderTable(tableId, rows, columns, headersMap) {
  const table = document.getElementById(tableId);
  if (!table) return;

  if (!rows.length) {
    table.innerHTML = "<tr><td>No hay datos</td></tr>";
    return;
  }

  let html = "<thead><tr>";
  columns.forEach(c => html += `<th>${headersMap[c] ?? c}</th>`);
  html += "</tr></thead><tbody>";

  rows.forEach(r => {
    html += "<tr>";
    columns.forEach(c => html += `<td>${r[c] ?? ""}</td>`);
    html += "</tr>";
  });

  html += "</tbody>";
  table.innerHTML = html;
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map(r => r[key]).filter(v => v !== undefined && v !== "")));
}

function fillSelect(selectId, values, allLabel) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  sel.appendChild(optAll);

  values.sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function applyFilters(rows, estado, nivel) {
  return rows.filter(r => {
    const okEstado = !estado || r["estado"] === estado;
    const okNivel = !nivel || r["nivel_de_rentabi"] === nivel;
    return okEstado && okNivel;
  });
}

let chart1 = null;
let chart2 = null;

function renderChartBeneficioNivel(rows) {
  const labels = rows.map(r => r["nivel_de_rentabi"]);
  const data = rows.map(r => Number(r["beneficio_total"]));

  const ctx = document.getElementById("chartBeneficioNivel");
  if (!ctx || !window.Chart) return;
  if (chart1) chart1.destroy();

  chart1 = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Beneficio total", data }] }
  });
}

function renderChartVentasEstado(rows) {
  const labels = rows.map(r => r["estado"]);
  const data = rows.map(r => Number(r["num_ventas"]));

  const ctx = document.getElementById("chartVentasEstado");
  if (!ctx || !window.Chart) return;
  if (chart2) chart2.destroy();

  chart2 = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Número de ventas", data }] }
  });
}

async function init() {
  const kpis = await fetchCSV("data/kpis.csv");
  const beneficioNivel = await fetchCSV("data/beneficio_por_nivel.csv");
  const ventasEstado = await fetchCSV("data/ventas_por_estado.csv");
  const topProductos = await fetchCSV("data/top_productos_beneficio.csv");

  if (kpis.length) {
    setKPI("kpiRegistros", kpis[0]["num_registros"]);
    setKPI("kpiUnidades", kpis[0]["total_unidades"]);
    setKPI("kpiBeneficioTotal", kpis[0]["beneficio_total"]);
    setKPI("kpiBeneficioMedio", kpis[0]["beneficio_medio"]);
  }

  renderChartBeneficioNivel(beneficioNivel);
  renderChartVentasEstado(ventasEstado);

  renderTable(
    "tablaTopProductos",
    topProductos,
    ["producto", "beneficio_total", "unidades"],
    { producto: "Producto", beneficio_total: "Beneficio total", unidades: "Unidades" }
  );

  renderTable(
    "tablaVentasEstado",
    ventasEstado,
    ["estado", "num_ventas", "unidades"],
    { estado: "Estado", num_ventas: "Nº ventas", unidades: "Unidades" }
  );

  // Filtros + KPIs recalculados desde detalle
  let detalle = [];
  try { detalle = await fetchCSV("data/detalle.csv"); } catch (e) { detalle = []; }

  const filtroEstado = document.getElementById("filtroEstado");
  const filtroNivel = document.getElementById("filtroNivel");
  const btnReset = document.getElementById("btnReset");

  if (!detalle.length) return;

  fillSelect("filtroEstado", uniqueValues(detalle, "estado"), "Todos los estados");
  fillSelect("filtroNivel", uniqueValues(detalle, "nivel_de_rentabi"), "Todos los niveles");

  function updateFiltered() {
    const estado = filtroEstado.value;
    const nivel = filtroNivel.value;
    const filtrado = applyFilters(detalle, estado, nivel);

    const num = filtrado.length;
    const unidades = filtrado.reduce((acc, r) => acc + Number(r["unidades_vendida"] || 0), 0);
    const beneficio = filtrado.reduce((acc, r) => acc + Number(r["Beneficio_total_eur"] || 0), 0);

    setKPI("kpiRegistros", num);
    setKPI("kpiUnidades", unidades);
    setKPI("kpiBeneficioTotal", beneficio.toFixed(2));
    setKPI("kpiBeneficioMedio", num ? (beneficio / num).toFixed(2) : "0.00");
  }

  filtroEstado.addEventListener("change", updateFiltered);
  filtroNivel.addEventListener("change", updateFiltered);
  btnReset.addEventListener("click", () => {
    filtroEstado.value = "";
    filtroNivel.value = "";
    updateFiltered();
  });

  updateFiltered();
}

init().catch(err => {
  console.error(err);
});
