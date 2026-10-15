// Chart.js theme and a registry that reuses chart instances: refreshes update data in place (animated only when
// the data really changed), so auto-refresh never restarts a chart.
import { prefersReducedMotion } from "./ui.js";

const registry = new Map();

export const CHART_COLORS = {
  grid: "rgba(255, 255, 255, 0.055)",
  tick: "#858c96",
  compare: "rgba(243, 245, 246, 0.42)",
  muted: "rgba(243, 245, 246, 0.16)",
  mint: "#7ae8bb",
  lavender: "#b497fc",
  blue: "#80aafe",
  crit: "#ff5a5f"
};

export function initChartTheme() {
  const Chart = window.Chart;
  if (!Chart) return;
  Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim() || "system-ui";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CHART_COLORS.tick;
  Chart.defaults.borderColor = CHART_COLORS.grid;
  Chart.defaults.animation.duration = 420;
  Chart.defaults.animation.easing = "easeOutQuart";
  Chart.defaults.plugins.legend.display = false;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: "#23262b",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    titleColor: "#f3f5f6",
    bodyColor: "#a4aab3",
    titleFont: { weight: "600", size: 12 },
    bodyFont: { size: 12 },
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
    usePointStyle: true
  });
}

export function hasCharts() {
  return Boolean(window.Chart);
}

/**
 * Create or update the chart registered under `key`. `build()` returns a Chart.js config; `signature` is a string
 * that changes only when the plotted data or options change.
 */
export function upsertChart(key, canvas, build, signature) {
  const Chart = window.Chart;
  if (!Chart || !canvas) return null;
  const entry = registry.get(key);
  const reduced = prefersReducedMotion();
  if (entry && entry.canvas === canvas && entry.chart) {
    if (entry.signature === signature) return entry.chart;
    const config = build();
    const chart = entry.chart;
    chart.data.labels = config.data.labels;
    if (chart.data.datasets.length === config.data.datasets.length) {
      config.data.datasets.forEach((dataset, index) => Object.assign(chart.data.datasets[index], dataset));
    } else {
      chart.data.datasets = config.data.datasets;
    }
    chart.options = { ...config.options, animation: reduced ? false : { duration: 380, easing: "easeOutQuart" } };
    chart.update();
    entry.signature = signature;
    return chart;
  }
  entry?.chart?.destroy();
  const config = build();
  config.options = { ...config.options, animation: reduced ? false : { duration: 520, easing: "easeOutQuart" } };
  const chart = new Chart(canvas, config);
  registry.set(key, { chart, canvas, signature });
  return chart;
}

export function destroyChart(key) {
  registry.get(key)?.chart?.destroy();
  registry.delete(key);
}

export function resizeCharts() {
  registry.forEach(({ chart }) => chart?.resize());
}

export function axisMoney(value) {
  const amount = Number(value);
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return `$${amount.toFixed(amount !== 0 && Math.abs(amount) < 10 ? 2 : 0)}`;
}

export function baseOptions({ stacked = false, yFormat = (value) => value, onClick, tooltipLabel, tooltipFooter, maxTicks = 5 } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    normalized: true,
    interaction: { intersect: false, mode: "index" },
    onClick,
    onHover: onClick ? (event, elements) => {
      event.native.target.style.cursor = elements.length ? "pointer" : "default";
    } : undefined,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          ...(tooltipLabel ? { label: tooltipLabel } : {}),
          ...(tooltipFooter ? { footer: tooltipFooter } : {})
        }
      }
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        border: { display: false },
        ticks: { maxRotation: 0, autoSkipPadding: 16, color: CHART_COLORS.tick }
      },
      y: {
        stacked,
        beginAtZero: true,
        grace: "8%",
        grid: { color: CHART_COLORS.grid, drawTicks: false },
        border: { display: false },
        ticks: { maxTicksLimit: maxTicks, padding: 8, color: CHART_COLORS.tick, callback: yFormat }
      }
    }
  };
}
