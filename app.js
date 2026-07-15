import {
  createNestedPopulation,
  createTargetPolygon,
  selectPopulationCurve,
} from "./geometry.js";

const canvas = document.querySelector("#peano-canvas");
const context = canvas.getContext("2d", { alpha: false });
const wrap = canvas.parentElement;
const startInput = document.querySelector("#interval-start");
const endInput = document.querySelector("#interval-end");
const resolutionInput = document.querySelector("#resolution");
const intervalOutput = document.querySelector("#interval-output");
const resolutionOutput = document.querySelector("#resolution-output");
const rangeFill = document.querySelector("#range-fill");

const RESOLUTIONS = [7, 8, 10, 14, 18, 22];
const COARSE_RESOLUTIONS = [4, 4, 5, 5, 6, 7];
const target = createTargetPolygon();
const populationCache = new Map();

const state = {
  start: 0,
  end: 1,
  resolutionIndex: 4,
  queued: false,
};

function resolution() {
  return RESOLUTIONS[state.resolutionIndex];
}

function population() {
  const value = resolution();
  if (populationCache.has(value)) {
    const cached = populationCache.get(value);
    populationCache.delete(value);
    populationCache.set(value, cached);
    return cached;
  }
  const created = createNestedPopulation({
    target,
    resolution: value,
    coarseResolution: COARSE_RESOLUTIONS[state.resolutionIndex],
    includeHullIndex: false,
  });
  if (populationCache.size >= 2) populationCache.delete(populationCache.keys().next().value);
  populationCache.set(value, created);
  return created;
}

function canvasPoint(point, size) {
  const padding = Math.max(28, size * 0.067);
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

function strokeCurveRange(points, first, last, size, stroke, lineWidth) {
  if (last <= first) return;
  context.beginPath();
  for (let index = first; index <= last; index += 1) {
    const position = canvasPoint(points[index], size);
    if (index === first) context.moveTo(position.x, position.y);
    else context.lineTo(position.x, position.y);
  }
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

function curveColor(progress) {
  const blue = [49, 86, 200];
  const orange = [232, 73, 36];
  const color = blue.map((value, index) => Math.round(
    value + (orange[index] - value) * progress,
  ));
  return `rgba(${color.join(", ")}, 0.72)`;
}

function drawTimedCurve(points, size) {
  const segmentCount = points.length - 1;
  if (segmentCount < 1) return;
  const chunkCount = Math.min(180, segmentCount);
  const lineWidth = size < 440 ? 0.52 : 0.62;
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const first = Math.floor((chunk * segmentCount) / chunkCount);
    const last = Math.max(first + 1, Math.floor(((chunk + 1) * segmentCount) / chunkCount));
    strokeCurveRange(
      points,
      first,
      Math.min(segmentCount, last),
      size,
      curveColor((chunk + 0.5) / chunkCount),
      lineWidth,
    );
  }
}

function drawPoint(point, size, color) {
  const position = canvasPoint(point, size);
  context.beginPath();
  context.arc(position.x, position.y, 2.1, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  const cssSize = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelSize = Math.round(cssSize * dpr);
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return cssSize;
}

function draw() {
  state.queued = false;
  const size = resizeCanvas();
  context.fillStyle = "#ebe8e0";
  context.fillRect(0, 0, size, size);

  tracePolygon(target, size);
  context.strokeStyle = "rgba(20, 20, 17, 0.11)";
  context.lineWidth = 0.75;
  context.stroke();

  const selected = selectPopulationCurve(population(), state.start, state.end);
  drawTimedCurve(selected, size);
  if (selected.length) {
    drawPoint(selected[0], size, "#3156c8");
    drawPoint(selected.at(-1), size, "#e84924");
  }
}

function scheduleDraw() {
  if (state.queued) return;
  state.queued = true;
  requestAnimationFrame(draw);
}

function updateControls() {
  const currentPopulation = population();
  intervalOutput.textContent = `[${state.start.toFixed(3)}, ${state.end.toFixed(3)}]`;
  resolutionOutput.textContent = `${currentPopulation.atoms.length.toLocaleString("en-US")} segments`;
  rangeFill.style.left = `${state.start * 100}%`;
  rangeFill.style.right = `${(1 - state.end) * 100}%`;
  resolutionInput.style.setProperty(
    "--progress",
    `${(state.resolutionIndex / (RESOLUTIONS.length - 1)) * 100}%`,
  );
  startInput.style.zIndex = state.start > 0.85 ? "3" : "2";
  endInput.style.zIndex = "1";
}

function updateInterval(changedInput) {
  const rawStart = Number(startInput.value) / 1000;
  const rawEnd = Number(endInput.value) / 1000;
  if (changedInput === startInput && rawStart > rawEnd) startInput.value = endInput.value;
  if (changedInput === endInput && rawEnd < rawStart) endInput.value = startInput.value;
  state.start = Number(startInput.value) / 1000;
  state.end = Number(endInput.value) / 1000;
  updateControls();
  scheduleDraw();
}

startInput.addEventListener("input", () => updateInterval(startInput));
endInput.addEventListener("input", () => updateInterval(endInput));
resolutionInput.addEventListener("input", () => {
  state.resolutionIndex = Number(resolutionInput.value);
  updateControls();
  scheduleDraw();
});

new ResizeObserver(scheduleDraw).observe(wrap);
updateControls();
scheduleDraw();
