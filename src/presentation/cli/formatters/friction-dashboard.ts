/**
 * Friction Dashboard Formatters
 *
 * Two formatters for friction data visualization:
 * 1. formatFrictionDashboard - Rich terminal output with ASCII bars
 * 2. generateFrictionHtml - Self-contained HTML with Chart.js charts
 *
 * Uses color.ts utilities for terminal coloring and reads Chart.js UMD
 * source from node_modules at HTML generation time (no CDN dependency).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FrictionStats } from "../../../domain/ports/repositories.js";
import type { FrictionEntry } from "../../../domain/entities/friction-entry.js";
import { bold, green, red, yellow, cyan, dim } from "./color.js";

/**
 * Render a rich terminal dashboard for friction stats.
 *
 * Displays overview counts, severity/category breakdowns with ASCII
 * bar charts, MTTR, oldest open entry, and weekly trends table.
 *
 * @param stats Aggregated friction statistics
 * @param trends Weekly new/resolved counts
 * @param openItems Currently open friction entries
 * @param useColor Whether to apply ANSI color codes
 * @returns Formatted dashboard string
 */
export function formatFrictionDashboard(
    stats: FrictionStats,
    trends: Array<{ week: string; newCount: number; resolvedCount: number }>,
    openItems: FrictionEntry[],
    useColor: boolean,
): string {
    if (stats.total === 0) {
        return "No friction entries logged yet.";
    }

    const lines: string[] = [];

    // Header
    lines.push(bold("Friction Dashboard", useColor));
    lines.push("==================");
    lines.push("");

    // Overview
    lines.push(bold("  Overview", useColor));
    lines.push("  --------");
    lines.push(
        `  Total: ${stats.total}    ` +
        `Open: ${yellow(String(stats.open), useColor)}    ` +
        `Resolved: ${green(String(stats.resolved), useColor)}    ` +
        `Won't Fix: ${stats.wontFix}`,
    );
    lines.push("");

    // MTTR and oldest open
    const mttrStr = stats.meanTimeToResolve !== null
        ? `MTTR: ${stats.meanTimeToResolve.toFixed(1)} days`
        : "MTTR: N/A";

    if (stats.oldestOpen) {
        lines.push(
            `  ${mttrStr}    Oldest Open: #${stats.oldestOpen.id} (${stats.oldestOpen.daysOpen} days)`,
        );
    } else {
        lines.push(`  ${mttrStr}`);
    }
    lines.push("");

    // Severity breakdown with bar charts
    lines.push(bold("  By Severity", useColor));
    lines.push("  -----------");
    const severities = ["critical", "high", "medium", "low"] as const;
    const maxSeverityCount = Math.max(
        ...severities.map((s) => stats.bySeverity[s]),
        1,
    );
    for (const sev of severities) {
        const count = stats.bySeverity[sev];
        const barLen = Math.round((count / maxSeverityCount) * 20);
        const bar = "=".repeat(barLen) + " ".repeat(20 - barLen);
        const label = sev.padEnd(10);
        const coloredLabel =
            sev === "critical" || sev === "high"
                ? red(label, useColor)
                : sev === "medium"
                  ? yellow(label, useColor)
                  : green(label, useColor);
        lines.push(`  ${coloredLabel}[${bar}] ${count}`);
    }
    lines.push("");

    // Category breakdown
    lines.push(bold("  By Category", useColor));
    lines.push("  -----------");
    const categories = [
        "search",
        "sync",
        "cli",
        "context",
        "integration",
        "ux",
    ] as const;
    for (const cat of categories) {
        const count = stats.byCategory[cat];
        lines.push(`  ${cyan(cat.padEnd(14), useColor)}${count}`);
    }
    lines.push("");

    // Trends
    if (trends.length === 0) {
        lines.push("  No trend data available.");
    } else {
        lines.push(bold("  Trends", useColor));
        lines.push("  ------");
        lines.push(`  ${"Week".padEnd(12)}${"New".padEnd(6)}Resolved`);
        for (const t of trends) {
            lines.push(
                `  ${dim(t.week.padEnd(12), useColor)}${String(t.newCount).padEnd(6)}${t.resolvedCount}`,
            );
        }
    }

    return lines.join("\n");
}

/**
 * Read Chart.js UMD source from node_modules.
 *
 * Reads the file at generation time so the HTML is self-contained
 * with no external CDN dependencies.
 *
 * @returns Chart.js UMD JavaScript source as a string
 */
function getChartJsSource(): string {
    const chartPath = resolve(
        import.meta.dirname,
        "../../../../node_modules/chart.js/dist/chart.umd.js",
    );
    return readFileSync(chartPath, "utf-8");
}

/**
 * Serialize FrictionEntry instances into plain objects for JSON embedding.
 *
 * FrictionEntry uses getters that don't survive JSON.stringify directly.
 * This maps each entry to a plain object with computed daysOpen.
 *
 * @param entries Array of FrictionEntry instances
 * @returns Array of plain objects suitable for JSON.stringify
 */
function serializeOpenItems(
    entries: FrictionEntry[],
): Array<{
    id: number | undefined;
    severity: string;
    category: string;
    description: string;
    daysOpen: number;
}> {
    return entries.map((e) => ({
        id: e.id,
        severity: e.severity,
        category: e.category,
        description: e.description,
        daysOpen: Math.floor((Date.now() - e.loggedAt.getTime()) / 86400000),
    }));
}

/**
 * Generate a self-contained HTML friction dashboard.
 *
 * The HTML file embeds Chart.js inline (no CDN), uses a dark theme,
 * and includes 4 chart types: line (over time), doughnut (by category),
 * horizontal bar (by severity), and grouped bar (resolution trend).
 *
 * @param stats Aggregated friction statistics
 * @param trends Weekly new/resolved counts
 * @param openItems Currently open friction entries
 * @returns Complete HTML document string
 */
export function generateFrictionHtml(
    stats: FrictionStats,
    trends: Array<{ week: string; newCount: number; resolvedCount: number }>,
    openItems: FrictionEntry[],
): string {
    const chartJsSource = getChartJsSource();
    const serializedOpenItems = serializeOpenItems(openItems);

    const mttrDisplay =
        stats.meanTimeToResolve !== null
            ? `${stats.meanTimeToResolve.toFixed(1)} days`
            : "N/A";

    const openItemsRows = serializedOpenItems
        .map(
            (item) =>
                `<tr>
          <td>${item.id ?? "-"}</td>
          <td class="severity-${item.severity}">${item.severity}</td>
          <td>${item.category}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${item.daysOpen}d</td>
        </tr>`,
        )
        .join("\n        ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memory Friction Dashboard</title>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; }
    h1 { color: #e0e0e0; border-bottom: 1px solid #333; padding-bottom: 12px; }
    h2 { color: #e0e0e0; margin-top: 32px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin: 24px 0; }
    .stat-card { background: #16213e; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 2em; font-weight: bold; }
    .stat-label { color: #888; font-size: 0.9em; }
    .chart-container { background: #16213e; border-radius: 8px; padding: 16px; margin: 24px 0; }
    canvas { max-height: 300px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #333; }
    th { color: #888; font-weight: 600; }
    .severity-critical { color: #ff4444; }
    .severity-high { color: #ff8800; }
    .severity-medium { color: #ffcc00; }
    .severity-low { color: #44bb44; }
    .open { color: #ffcc00; }
    .resolved { color: #44bb44; }
    .generated { color: #666; font-size: 0.8em; margin-top: 48px; text-align: center; }
  </style>
  <script>${chartJsSource}</script>
</head>
<body>
  <h1>Memory Friction Dashboard</h1>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-card">
      <div class="stat-value open">${stats.open}</div>
      <div class="stat-label">Open</div>
    </div>
    <div class="stat-card">
      <div class="stat-value resolved">${stats.resolved}</div>
      <div class="stat-label">Resolved</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.wontFix}</div>
      <div class="stat-label">Won't Fix</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${mttrDisplay}</div>
      <div class="stat-label">MTTR</div>
    </div>
  </div>

  <div class="chart-container">
    <canvas id="overTimeChart"></canvas>
  </div>

  <div class="chart-container">
    <canvas id="byCategoryChart"></canvas>
  </div>

  <div class="chart-container">
    <canvas id="bySeverityChart"></canvas>
  </div>

  <div class="chart-container">
    <canvas id="resolutionTrendChart"></canvas>
  </div>

  <h2>Open Items</h2>
  <table id="openItemsTable">
    <thead>
      <tr><th>ID</th><th>Severity</th><th>Category</th><th>Description</th><th>Age</th></tr>
    </thead>
    <tbody>
      ${openItemsRows || "<tr><td colspan=\"5\">No open items</td></tr>"}
    </tbody>
  </table>

  <div class="generated">Generated ${new Date().toISOString().split("T")[0]}</div>

  <script>
    const stats = ${JSON.stringify(stats)};
    const trends = ${JSON.stringify(trends)};
    const openItems = ${JSON.stringify(serializedOpenItems)};

    const chartDefaults = {
      color: '#e0e0e0',
      borderColor: '#333',
    };
    Chart.defaults.color = '#e0e0e0';
    Chart.defaults.borderColor = '#333';

    // Chart 1: Friction Over Time (line)
    if (trends.length > 0) {
      new Chart(document.getElementById('overTimeChart'), {
        type: 'line',
        data: {
          labels: trends.map(t => t.week),
          datasets: [
            { label: 'New', data: trends.map(t => t.newCount), borderColor: '#ff4444', backgroundColor: 'rgba(255,68,68,0.1)', fill: true, tension: 0.3 },
            { label: 'Resolved', data: trends.map(t => t.resolvedCount), borderColor: '#44bb44', backgroundColor: 'rgba(68,187,68,0.1)', fill: true, tension: 0.3 }
          ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Friction Over Time', color: '#e0e0e0' } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#333' } }, y: { ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true } } }
      });
    }

    // Chart 2: By Category (doughnut)
    new Chart(document.getElementById('byCategoryChart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(stats.byCategory),
        datasets: [{
          data: Object.values(stats.byCategory),
          backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40']
        }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'By Category', color: '#e0e0e0' }, legend: { labels: { color: '#e0e0e0' } } } }
    });

    // Chart 3: By Severity (horizontal bar)
    new Chart(document.getElementById('bySeverityChart'), {
      type: 'bar',
      data: {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{
          label: 'Count',
          data: [stats.bySeverity.critical, stats.bySeverity.high, stats.bySeverity.medium, stats.bySeverity.low],
          backgroundColor: ['#ff4444', '#ff8800', '#ffcc00', '#44bb44']
        }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { title: { display: true, text: 'By Severity', color: '#e0e0e0' }, legend: { display: false } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true }, y: { ticks: { color: '#888' }, grid: { color: '#333' } } } }
    });

    // Chart 4: Resolution Trend (grouped bar)
    if (trends.length > 0) {
      new Chart(document.getElementById('resolutionTrendChart'), {
        type: 'bar',
        data: {
          labels: trends.map(t => t.week),
          datasets: [
            { label: 'New', data: trends.map(t => t.newCount), backgroundColor: '#ff4444' },
            { label: 'Resolved', data: trends.map(t => t.resolvedCount), backgroundColor: '#44bb44' }
          ]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Resolution Trend', color: '#e0e0e0' }, legend: { labels: { color: '#e0e0e0' } } }, scales: { x: { ticks: { color: '#888' }, grid: { color: '#333' } }, y: { ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true } } }
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent injection in templates.
 *
 * @param text Raw text
 * @returns HTML-safe text
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
