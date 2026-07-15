import {
  createNestedPopulation,
  createPopulationPortalCurve,
  createTargetPolygon,
  isConvexPolygon,
  maxPolygonDiameter,
  pointInConvexPolygon,
  polygonArea,
  selectPopulationInterval,
  supportStation,
} from "./geometry.js";

const canvas = document.querySelector("#lab-canvas");
const context = canvas.getContext("2d", { alpha: false });
const wrap = canvas.parentElement;
const diagnostics = document.querySelector("#diagnostics");
const legend = document.querySelector("#legend");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const panels = [...document.querySelectorAll("[data-panel]")];

const stationStepInput = document.querySelector("#station-step");
const stationPrecisionInput = document.querySelector("#station-precision");
const stationStepOutput = document.querySelector("#station-step-output");
const stationPrecisionOutput = document.querySelector("#station-precision-output");
const generationInput = document.querySelector("#generation");
const generationOutput = document.querySelector("#generation-output");
const parentInput = document.querySelector("#parent");
const parentOutput = document.querySelector("#parent-output");
const parentControl = document.querySelector("#parent-control");
const portalStartInput = document.querySelector("#portal-start");
const portalEndInput = document.querySelector("#portal-end");
const portalOutput = document.querySelector("#portal-output");
const portalFill = document.querySelector("#portal-fill");

const target = createTargetPolygon(36);
const inner = target.map((point) => ({
  x: 0.5 + (point.x - 0.5) * 0.65,
  y: 0.5 + (point.y - 0.5) * 0.65,
}));
const PRECISIONS = [0.14, 0.1, 0.075, 0.055, 0.04];
const stationCache = new Map();
const metricCache = new Map();

const population = createNestedPopulation({
  target,
  resolution: 8,
  coarseResolution: 7,
  includeHullIndex: true,
});
const portalCurve = createPopulationPortalCurve(population);

const state = {
  mode: "station",
  stationProgress: 0.57,
  precisionIndex: 2,
  generation: 1,
  parentIndex: Math.floor(population.parents.length / 2),
  portalStart: 0.18,
  portalEnd: 0.72,
  queued: false,
};

parentInput.max = String(population.parents.length - 1);
parentInput.value = String(state.parentIndex);

function station() {
  if (!stationCache.has(state.precisionIndex)) {
    stationCache.set(
      state.precisionIndex,
      supportStation(inner, target, PRECISIONS[state.precisionIndex]),
    );
  }
  return stationCache.get(state.precisionIndex);
}

function mixColor(progress, alpha = 1) {
  const blue = [54, 93, 204];
  const orange = [237, 85, 51];
  const values = blue.map((value, index) => Math.round(
    value + (orange[index] - value) * progress,
  ));
  return `rgba(${values.join(", ")}, ${alpha})`;
}

function canvasPoint(point, size) {
  const padding = Math.max(30, size * 0.07);
  const plotSize = size - padding * 2;
  return {
    x: padding + point.x * plotSize,
    y: padding + (1 - point.y) * plotSize,
  };
}

function tracePolygon(polygon, size) {
  context.beginPath();
  polygon.forEach((point, index) => {
    const position = canvasPoint(point, size);
    if (index === 0) context.moveTo(position.x, position.y);
    else context.lineTo(position.x, position.y);
  });
  context.closePath();
}

function paintPolygon(polygon, size, fill, stroke, lineWidth = 1) {
  if (polygon.length < 2) return;
  tracePolygon(polygon, size);
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function drawPath(points, size, stroke, lineWidth = 0.8) {
  if (points.length < 2) return;
  context.beginPath();
  points.forEach((point, index) => {
    const position = canvasPoint(point, size);
    if (index === 0) context.moveTo(position.x, position.y);
    else context.lineTo(position.x, position.y);
  });
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

function drawGradientPath(points, size, lineWidth = 1.3) {
  if (points.length < 2) return;
  const segmentCount = points.length - 1;
  const chunkCount = Math.min(100, segmentCount);
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const first = Math.floor((chunk * segmentCount) / chunkCount);
    const last = Math.max(first + 1, Math.floor(((chunk + 1) * segmentCount) / chunkCount));
    drawPath(points.slice(first, Math.min(points.length, last + 1)), size, mixColor(
      (chunk + 0.5) / chunkCount,
      0.88,
    ), lineWidth);
  }
}

function drawDot(point, size, color) {
  const position = canvasPoint(point, size);
  context.beginPath();
  context.arc(position.x, position.y, 2.6, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function setDiagnostics(items) {
  diagnostics.replaceChildren(...items.map(({ label, value, good = false }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "diagnostic";
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.className = good ? "good" : "";
    description.textContent = value;
    wrapper.append(term, description);
    return wrapper;
  }));
}

function pointsDiameter(points) {
  let maximum = 0;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      maximum = Math.max(maximum, Math.hypot(
        points[a].x - points[b].x,
        points[a].y - points[b].y,
      ));
    }
  }
  return maximum;
}

function drawStation(size) {
  const bodies = station();
  const index = Math.round(state.stationProgress * (bodies.length - 1));
  const current = bodies[index];
  const previous = bodies[Math.max(0, index - 1)];
  const snapshotCount = Math.min(9, index + 1);

  paintPolygon(current, size, "rgba(54, 93, 204, 0.08)", null);
  for (let snapshot = 0; snapshot < snapshotCount; snapshot += 1) {
    const snapshotIndex = snapshotCount === 1
      ? 0
      : Math.round((snapshot * index) / (snapshotCount - 1));
    paintPolygon(
      bodies[snapshotIndex],
      size,
      null,
      mixColor(snapshot / Math.max(1, snapshotCount - 1), 0.28),
      0.72,
    );
  }
  paintPolygon(inner, size, "rgba(244, 242, 236, 0.86)", "rgba(54, 93, 204, 0.68)", 1);
  paintPolygon(current, size, null, "rgba(237, 85, 51, 0.92)", 1.25);
  paintPolygon(target, size, null, "rgba(21, 21, 18, 0.25)", 0.8);

  const newVertices = current.filter((point) => !pointInConvexPolygon(point, previous, 1e-7));
  const nested = previous.every((point) => pointInConvexPolygon(point, current, 1e-7));
  const areaRatio = polygonArea(current) / polygonArea(target);
  setDiagnostics([
    { label: "body", value: `${index + 1} / ${bodies.length}` },
    { label: "target area", value: `${(areaRatio * 100).toFixed(1)}%` },
    { label: "convex", value: isConvexPolygon(current) ? "yes" : "no", good: isConvexPolygon(current) },
    { label: "contains prior", value: nested ? "yes" : "no", good: nested },
    { label: "new-vertex span", value: pointsDiameter(newVertices).toFixed(4) },
    { label: "supports", value: String(inner.length) },
  ]);
  stationStepOutput.textContent = `${index + 1} / ${bodies.length}`;
  stationPrecisionOutput.textContent = `${bodies.length} bodies`;
  legend.textContent = "blue · inner   orange · current";
}

function sampleCoverage(body, cells, gridSize = 25) {
  let inside = 0;
  let covered = 0;
  for (let y = 0; y <= gridSize; y += 1) {
    for (let x = 0; x <= gridSize; x += 1) {
      const point = { x: x / gridSize, y: y / gridSize };
      if (!pointInConvexPolygon(point, body)) continue;
      inside += 1;
      if (cells.some((cell) => pointInConvexPolygon(point, cell.body))) covered += 1;
    }
  }
  return covered / Math.max(1, inside);
}

function coverageFor(key, body, cells) {
  if (!metricCache.has(key)) metricCache.set(key, sampleCoverage(body, cells));
  return metricCache.get(key);
}

function drawCells(cells, size, alpha = 0.13) {
  cells.forEach((cell, index) => {
    const progress = index / Math.max(1, cells.length - 1);
    paintPolygon(
      cell.body,
      size,
      mixColor(progress, alpha),
      mixColor(progress, Math.min(0.48, alpha * 2.5)),
      0.52,
    );
  });
}

function populationSelection() {
  if (state.generation === 0) {
    return {
      body: target,
      cells: population.parents,
      key: "generation-0",
      axis: "x-thin",
    };
  }
  const range = population.levelRanges[0][state.parentIndex];
  return {
    body: population.parents[state.parentIndex].body,
    cells: population.atoms.slice(range.first, range.last + 1),
    key: `parent-${state.parentIndex}`,
    axis: "y-thin",
  };
}

function drawPopulation(size) {
  const selection = populationSelection();
  if (state.generation === 1) drawCells(population.parents, size, 0.025);
  paintPolygon(selection.body, size, "rgba(54, 93, 204, 0.035)", "rgba(21, 21, 18, 0.5)", 0.9);
  drawCells(selection.cells, size, state.generation === 0 ? 0.095 : 0.15);
  paintPolygon(selection.body, size, null, "rgba(21, 21, 18, 0.62)", 0.9);

  const coverage = coverageFor(selection.key, selection.body, selection.cells);
  const convex = selection.cells.every(({ body }) => isConvexPolygon(body));
  setDiagnostics([
    { label: "generation", value: state.generation === 0 ? "01" : "02" },
    { label: "direction", value: selection.axis },
    { label: "cells", value: selection.cells.length.toLocaleString("en-US") },
    { label: "all convex", value: convex ? "yes" : "no", good: convex },
    { label: "sampled coverage", value: `${(coverage * 100).toFixed(1)}%`, good: coverage > 0.999 },
    { label: "max diameter", value: maxPolygonDiameter(selection.cells.map(({ body }) => body)).toFixed(3) },
  ]);
  generationOutput.textContent = state.generation === 0 ? "01 · x-thin" : "02 · y-thin";
  parentOutput.textContent = `${state.parentIndex + 1} / ${population.parents.length}`;
  parentControl.style.opacity = state.generation === 0 ? "0.28" : "1";
  parentInput.disabled = state.generation === 0;
  legend.textContent = state.generation === 0 ? "ordered root population" : "one contiguous child block";
}

function portalIsContained(first, last) {
  for (let index = first; index <= last; index += 1) {
    const atom = population.atoms[index];
    for (const amount of [0, 0.5, 1]) {
      const point = {
        x: portalCurve[index].x + (portalCurve[index + 1].x - portalCurve[index].x) * amount,
        y: portalCurve[index].y + (portalCurve[index + 1].y - portalCurve[index].y) * amount,
      };
      if (!pointInConvexPolygon(point, atom.body, 1e-7)) return false;
    }
  }
  return true;
}

function drawPortal(size) {
  const selection = selectPopulationInterval(population, state.portalStart, state.portalEnd);
  const count = selection.last - selection.first + 1;
  const selectedAtoms = population.atoms.slice(selection.first, selection.last + 1);
  const selectedPath = portalCurve.slice(selection.first, selection.last + 2);

  paintPolygon(selection.body, size, "rgba(54, 93, 204, 0.10)", "rgba(54, 93, 204, 0.48)", 0.8);
  if (count <= 160) drawCells(selectedAtoms, size, 0.055);
  drawPath(portalCurve, size, "rgba(21, 21, 18, 0.07)", 0.55);
  drawGradientPath(selectedPath, size, size < 520 ? 1.05 : 1.25);
  drawDot(selectedPath[0], size, "#365dcc");
  drawDot(selectedPath.at(-1), size, "#ed5533");
  paintPolygon(target, size, null, "rgba(21, 21, 18, 0.2)", 0.7);

  const convex = isConvexPolygon(selection.body);
  const contained = portalIsContained(selection.first, selection.last);
  setDiagnostics([
    { label: "atoms", value: count.toLocaleString("en-US") },
    { label: "segments", value: count.toLocaleString("en-US") },
    { label: "envelope convex", value: convex ? "yes" : "no", good: convex },
    { label: "path contained", value: contained ? "yes" : "no", good: contained },
    { label: "max atom diameter", value: maxPolygonDiameter(selectedAtoms.map(({ body }) => body)).toFixed(3) },
    { label: "stage", value: "finite · 02" },
  ]);
  portalOutput.textContent = `[${state.portalStart.toFixed(3)}, ${state.portalEnd.toFixed(3)}]`;
  portalFill.style.left = `${state.portalStart * 100}%`;
  portalFill.style.right = `${(1 - state.portalEnd) * 100}%`;
  legend.textContent = "line · portal approximant   fill · convex envelope";
}

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  const cssSize = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelSize = Math.round(cssSize * dpr);
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return cssSize;
}

function draw() {
  state.queued = false;
  const size = resizeCanvas();
  context.fillStyle = "#ebe8e0";
  context.fillRect(0, 0, size, size);
  if (state.mode === "station") drawStation(size);
  if (state.mode === "population") drawPopulation(size);
  if (state.mode === "portal") drawPortal(size);
}

function scheduleDraw() {
  if (state.queued) return;
  state.queued = true;
  requestAnimationFrame(draw);
}

function setProgress(input) {
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const progress = (Number(input.value) - minimum) / (maximum - minimum);
  input.style.setProperty("--progress", `${progress * 100}%`);
}

function updateMode(mode) {
  state.mode = mode;
  modeButtons.forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.mode === mode));
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== mode;
  });
  scheduleDraw();
}

function updatePortal(changedInput) {
  const rawStart = Number(portalStartInput.value) / 1000;
  const rawEnd = Number(portalEndInput.value) / 1000;
  if (changedInput === portalStartInput && rawStart > rawEnd) portalStartInput.value = portalEndInput.value;
  if (changedInput === portalEndInput && rawEnd < rawStart) portalEndInput.value = portalStartInput.value;
  state.portalStart = Number(portalStartInput.value) / 1000;
  state.portalEnd = Number(portalEndInput.value) / 1000;
  portalStartInput.style.zIndex = state.portalStart > 0.85 ? "3" : "2";
  portalEndInput.style.zIndex = "1";
  scheduleDraw();
}

modeButtons.forEach((button) => button.addEventListener("click", () => updateMode(button.dataset.mode)));
stationStepInput.addEventListener("input", () => {
  state.stationProgress = Number(stationStepInput.value) / 1000;
  setProgress(stationStepInput);
  scheduleDraw();
});
stationPrecisionInput.addEventListener("input", () => {
  state.precisionIndex = Number(stationPrecisionInput.value);
  setProgress(stationPrecisionInput);
  scheduleDraw();
});
generationInput.addEventListener("input", () => {
  state.generation = Number(generationInput.value);
  setProgress(generationInput);
  scheduleDraw();
});
parentInput.addEventListener("input", () => {
  state.parentIndex = Number(parentInput.value);
  setProgress(parentInput);
  scheduleDraw();
});
portalStartInput.addEventListener("input", () => updatePortal(portalStartInput));
portalEndInput.addEventListener("input", () => updatePortal(portalEndInput));

[stationStepInput, stationPrecisionInput, generationInput, parentInput].forEach(setProgress);
new ResizeObserver(scheduleDraw).observe(wrap);
scheduleDraw();
