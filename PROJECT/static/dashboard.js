let topChartInstance = null;
let regionChartInstance = null;
let yearlyChartInstance = null;
let activeFilters = {
  year: [],
  genre: [],
  platform: [],
  publisher: [],
  region: [],
  name: null
};


async function fetchJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Network error");
    return await r.json();
  } catch (err) {
    console.error(err);
    return {};
  }
}

function checkedValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`)
  ).map(i => i.value);
}

function buildQuery() {
  const p = new URLSearchParams();
  checkedValues("year").forEach(v => p.append("year", v));
  checkedValues("genre").forEach(v => p.append("genre", v));
  checkedValues("platform").forEach(v => p.append("platform", v));
  checkedValues("publisher").forEach(v => p.append("publisher", v));
  checkedValues("region").forEach(v => p.append("region", v));

  const search = document.getElementById("gameSearch").value.trim();
  if (search) p.append("name", search);

  return p.toString();
}

/* ---------- COLOR MAPPING ---------- */
function getColor(metric) {
  if (metric.includes("Global")) return "#4cbbe3ff";
  if (metric.includes("NA")) return "#f97316";
  if (metric.includes("JP")) return "#ef4444";
  if (metric.includes("EU")) return "#0ea5e9";
  if (metric.includes("Other")) return "#22c55e";
  return "#38bdf8";
}

const regionColors = {
  "NA_Sales": "#f97316",
  "EU_Sales": "#0ea5e9",
  "JP_Sales": "#ef4444",
  "Other_Sales": "#22c55e"
};

/* ---------- FILTER ---------- */
function renderFilter(dropdown, name, items) {
  let html = "";
  items.forEach(i => {
    html += `
      <label>
        <input type="checkbox" name="${name}" value="${i}">
        ${i}
      </label>
    `;
  });
  dropdown.innerHTML = html;
}

async function loadFilters() {
  const d = await fetchJSON("/api/options");
  renderFilter(yearFilter, "year", d.years);
  renderFilter(genreFilter, "genre", d.genres);
  renderFilter(platformFilter, "platform", d.platforms);
  renderFilter(publisherFilter, "publisher", d.publishers);
  renderFilter(regionFilter, "region", d.regions);

  document.querySelectorAll("input[type=checkbox]").forEach(c =>
    c.addEventListener("change", reloadAll)
  );

  document.getElementById("gameSearch").addEventListener("input", reloadAll);

  // Toggle dropdown
  document.querySelectorAll(".filter-title").forEach(title => {
    title.addEventListener("click", () => {
      const dropdown = title.nextElementSibling;
      const arrow = title.querySelector(".arrow");
      dropdown.classList.toggle("open");
      arrow.textContent = dropdown.classList.contains("open") ? "▲" : "▼";
    });
  });
}

/* ---------- KPI ---------- */
async function loadKPI() {
  const d = await fetchJSON(`/api/kpi?${buildQuery()}`);
  totalSales.textContent = d.total_sales;
  totalGames.textContent = d.total_games;
}

/* ---------- TOP GAMES ---------- */
async function loadTopGames() {
  const d = await fetchJSON(`/api/top-games?${buildQuery()}`);
  const canvas = document.getElementById("topGamesChart");
  const nodata = document.getElementById("topGamesNoData");

  if (topChartInstance) topChartInstance.destroy();

  if (!d.labels || d.labels.length === 0) {
    canvas.style.display = "none";
    nodata.classList.remove("hidden");
    return;
  }

  nodata.classList.add("hidden");
  canvas.style.display = "block";

  topChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: d.labels,
      datasets: [{
        label: d.metric,
        data: d.values,
        backgroundColor: getColor(d.metric),
        hoverBackgroundColor: getColor(d.metric)
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { onClick: () => {} },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: getColor(d.metric),
          bodyColor: "#f0f9ff"
        }
      }
    }
  });
}

/* ---------- REGION ---------- */
async function loadRegion() {
  const d = await fetchJSON(`/api/region-sales?${buildQuery()}`);
  const canvas = document.getElementById("regionChart");
  const nodata = document.getElementById("regionNoData");

  const labels = d.labels || Object.keys(d);
  const values = d.values || Object.values(d);
  const regionColors = {
  "NA": "#f97316",
  "EU": "#0ea5e9",
  "JP": "#ef4444",
  "Other": "#22c55e"
};


  if (values.every(v => v === 0)) {
    canvas.style.display = "none";
    nodata.classList.remove("hidden");
    return;
  }

  nodata.classList.add("hidden");
  canvas.style.display = "block";

  if (!regionChartInstance) {
    regionChartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(k => regionColors[k]),
          hoverOffset: 20
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: {
            labels: { color: "#656667ff" },
            onClick: () => {}
          },
          tooltip: {
            backgroundColor: "#0f172a",
            titleColor: "#38bdf8",
            bodyColor: "#727374ff"
          }
        }
      }
    });
  } else {
    regionChartInstance.data.labels = labels;
    regionChartInstance.data.datasets[0].data = values;
    regionChartInstance.data.datasets[0].backgroundColor = labels.map(k => regionColors[k]);
    regionChartInstance.update();
  }
}

/* ---------- YEARLY SALES ---------- */
let yearlySalesChartInstance = null;
async function loadYearlySales() {
  const d = await fetchJSON(`/api/yearly-sales?${buildQuery()}`);
  const canvas = document.getElementById("yearlySalesChart");

  if (!d.labels || !d.labels.length || !d.datasets || !d.datasets.length) {
    canvas.style.display = "none";
    return;
  }

  canvas.style.display = "block";

  const regionColors = {
    "NA": "#f97316",
    "EU": "#0ea5e9",
    "JP": "#ef4444",
    "Other": "#22c55e",
    "Global": "#4cbbe3ff"
  };

  const datasets = d.datasets.map(ds => ({
    label: ds.label,
    data: ds.data,
    borderColor: regionColors[ds.label] || "#71a4d4ff",
    backgroundColor: regionColors[ds.label],
    fill: false,
    tension: 0.3
  }));

  if (!yearlySalesChartInstance) {
    yearlySalesChartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: d.labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#656667ff" } },
          tooltip: { mode: "index", intersect: false }
        },
        interaction: { mode: "nearest", axis: "x", intersect: false }
      }
    });
  } else {
    yearlySalesChartInstance.data.labels = d.labels;
    yearlySalesChartInstance.data.datasets = datasets;
    yearlySalesChartInstance.update();
  }
}
/* ---------- Donut Chart ---------- */

let genreChartInstance = null;

async function loadGenreChart() {
  const d = await fetchJSON(`/api/genre-sales?${buildQuery()}`);
  const canvas = document.getElementById("genreChart");
  const nodata = document.getElementById("genreNoData");

  if (genreChartInstance) genreChartInstance.destroy();

  const labels = Object.keys(d);
  const values = Object.values(d);

  if (!labels.length) {
    canvas.style.display = "none";
    nodata.classList.remove("hidden");
    return;
  }

  nodata.classList.add("hidden");
  canvas.style.display = "block";

  genreChartInstance = new Chart(canvas, {
    type: "doughnut", // donut chart
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#38bdf8","#22c55e","#f97316","#ef4444",
          "#0ea5e9","#a855f7","#14b8a6","#eab308",
          "#f472b6","#94a3b8"
        ],
        hoverOffset: 20
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { position: "right" },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#38bdf8",
          bodyColor: "#f0f9ff"
        }
      }
    }
  });
}

/* ---------- PUBLISHERS ---------- */
let publisherChartInstance = null;

async function loadPublisherChart() {
  const url = `/api/publisher-sales?${buildQuery()}`;
  const d = await fetchJSON(url);

  const canvas = document.getElementById("publisherChart");
  const nodata = document.getElementById("publisherNoData");

  // Nếu có chart cũ thì destroy để vẽ lại
  if (publisherChartInstance) {
    publisherChartInstance.destroy();
    publisherChartInstance = null;
  }

  const labels = d.labels || [];
  const values = d.values || [];

  // Nếu không có dữ liệu thì ẩn chart, hiện thông báo
  if (!labels.length) {
    canvas.style.display = "none";
    nodata.classList.remove("hidden");
    return;
  }

  // Có dữ liệu thì hiện chart
  nodata.classList.add("hidden");
  canvas.style.display = "block";

  publisherChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Global Sales (Million)",
        data: values,
        backgroundColor: "rgba(65, 163, 228)",
        borderRadius: 4,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.formattedValue}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Sales (Million)" },
          beginAtZero: true
        },
        y: {
          title: { display: true, text: "Publisher" }
        }
      }
    }
  });
}
/* -Download CSV */
function renderFilter(container, name, options) {
  container.innerHTML = "";
  options.forEach(opt => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = opt;
    label.appendChild(input);
    label.appendChild(document.createTextNode(opt));
    container.appendChild(label);
  });
}
function checkedValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`)
  ).map(i => i.value);
}
document.getElementById("downloadCsvBtn").addEventListener("click", async () => {
  const filters = {
    year: checkedValues("year"),
    genre: checkedValues("genre"),
    platform: checkedValues("platform"),
    publisher: checkedValues("publisher"),
    region: checkedValues("region"),
    game: document.getElementById("gameSearch").value.trim() || null
  };

  console.log("Filters gửi lên:", filters);

  const response = await fetch("https://christine-balmy-tasha.ngrok-free.dev/api/report_csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters })
  });

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "report.csv";
  a.click();
  window.URL.revokeObjectURL(url);
});
/* ---------- SEARCH ---------- */

async function runNLSearch() {
  const query = document.getElementById("nl-search").value.trim();
  if (!query) return;

  const res = await fetch("/api/nl-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  const data = await res.json();

  applyFiltersFromNLP(data.filters);
}
function applyFiltersFromNLP(filters) {
  // 1. Clear hết checkbox cũ
  document.querySelectorAll("input[type=checkbox]")
    .forEach(c => c.checked = false);

  // 2. Tick checkbox theo NLP
  Object.entries(filters).forEach(([key, values]) => {
    if (!Array.isArray(values)) return;

    values.forEach(v => {
      const el = document.querySelector(
        `input[name="${key}"][value="${v}"]`
      );
      if (el) el.checked = true;
    });
  });

  // 3. Set search box
  const searchInput = document.getElementById("gameSearch");
  searchInput.value = filters.name || "";

  // 4. Reload chart
  reloadAll();
}


/* ---------- RESET ---------- */
resetBtn.onclick = () => {
  document.querySelectorAll("input[type=checkbox]")
    .forEach(c => c.checked = false);
  document.getElementById("gameSearch").value = "";
  reloadAll();
};

/* ---------- RELOAD ALL ---------- */
async function reloadAll() {
  await loadKPI();
  await loadTopGames();
  await loadRegion();
  await loadYearlySales();
  await loadGenreChart();
  await loadPublisherChart();
}

/* ---------- INIT ---------- */
loadFilters();
reloadAll();

/* ---------- THEME TOGGLE ---------- */
const themeToggle = document.getElementById("themeToggle");

themeToggle.addEventListener("click", () => {
  const body = document.body;
  if (body.classList.contains("light-mode")) {
    body.classList.remove("light-mode");
    body.classList.add("dark-mode");
    themeToggle.textContent = "☀️ Light Mode";
    themeToggle.classList.remove("bg-gray-300","text-black");
    themeToggle.classList.add("bg-gray-700","text-white");
  } else {
    body.classList.remove("dark-mode");
    body.classList.add("light-mode");
    themeToggle.textContent = "🌙 Dark Mode";
    themeToggle.classList.remove("bg-gray-700","text-white");
    themeToggle.classList.add("bg-gray-300","text-black");
  }
});