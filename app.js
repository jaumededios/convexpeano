import {
  createNestedPopulation,
  createTargetPolygon,
  selectPopulationInterval,
} from "./geometry.js";

const canvas = document.querySelector("#peano-canvas");
const overlayCanvas = document.querySelector("#overlay-canvas");
const context = canvas.getContext("2d", { alpha: false });
const overlayContext = overlayCanvas.getContext("2d");
const wrap = canvas.parentElement;
const startInput = document.querySelector("#interval-start");
const endInput = document.querySelector("#interval-end");
const resolutionInput = document.querySelector("#resolution");
const intervalOutput = document.querySelector("#interval-output");
const resolutionOutput = document.querySelector("#resolution-output");
const rangeFill = document.querySelector("#range-fill");

const RESOLUTIONS = [7, 8, 10, 14, 18, 22];
const target = createTargetPolygon();
const populationCache = new Map();

const state = {
  start: 0.333,
  end: 0.667,
  resolutionIndex: 4,
  queued: false,
  staticLayer: null,
  staticKey: "",
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
  const created = createNestedPopulation({ target, resolution: value });
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

function tracePolygon(targetContext, polygon, size) {
  if (polygon.length < 3) return;
  targetContext.beginPath();
  polygon.forEach((point, index) => {
    const position = canvasPoint(point, size);
    if (index === 0) targetContext.moveTo(position.x, position.y);
    else targetContext.lineTo(position.x, position.y);
  });
  targetContext.closePath();
}

function drawPolygon(targetContext, polygon, size, fill, stroke = null, lineWidth = 1) {
  if (polygon.length < 3) return;
  tracePolygon(targetContext, polygon, size);
  if (fill) {
    targetContext.fillStyle = fill;
    targetContext.fill();
  }
  if (stroke) {
    targetContext.strokeStyle = stroke;
    targetContext.lineWidth = lineWidth;
    targetContext.stroke();
  }
}

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  const cssSize = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelSize = Math.round(cssSize * dpr);
  let resized = false;

  for (const currentCanvas of [canvas, overlayCanvas]) {
    if (currentCanvas.width === pixelSize && currentCanvas.height === pixelSize) continue;
    currentCanvas.width = pixelSize;
    currentCanvas.height = pixelSize;
    resized = true;
  }

  if (resized) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.staticKey = "";
  }
  return { cssSize, dpr };
}

function buildStaticLayer(currentPopulation, size, dpr) {
  const layer = document.createElement("canvas");
  layer.width = Math.round(size * dpr);
  layer.height = Math.round(size * dpr);
  const layerContext = layer.getContext("2d", { alpha: false });
  layerContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  layerContext.fillStyle = "#ebe8e0";
  layerContext.fillRect(0, 0, size, size);

  drawPolygon(layerContext, target, size, "#dedbd2", "rgba(20, 20, 17, 0.66)", 1.05);
  for (const parent of currentPopulation.parents) {
    drawPolygon(
      layerContext,
      parent.body,
      size,
      null,
      "rgba(20, 20, 17, 0.055)",
      0.55,
    );
  }
  return layer;
}

function mixedColor(progress, strength = 0.68) {
  const paper = [235, 232, 224];
  const blue = [65, 105, 225];
  const orange = [255, 88, 50];
  const ink = blue.map((value, index) => (
    value + (orange[index] - value) * progress
  ));
  const color = paper.map((value, index) => Math.round(
    value + (ink[index] - value) * strength,
  ));
  return `rgb(${color.join(", ")})`;
}

function drawOrderedBodies(selection, size) {
  const currentPopulation = population();
  const selectedCount = selection.last - selection.first + 1;
  const sampleCount = Math.min(320, selectedCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const progress = sampleCount === 1 ? 0.5 : sample / (sampleCount - 1);
    const index = selection.first + Math.round(progress * (selectedCount - 1));
    drawPolygon(
      overlayContext,
      currentPopulation.atoms[index].body,
      size,
      mixedColor(progress),
    );
  }
}

function drawBodyContours(selection, size) {
  const currentPopulation = population();
  const selectedCount = selection.last - selection.first + 1;
  const sampleCount = Math.min(22, selectedCount);
  if (sampleCount < 3) return;

  for (let sample = 1; sample + 1 < sampleCount; sample += 1) {
    const progress = sample / (sampleCount - 1);
    const index = selection.first + Math.round(progress * (selectedCount - 1));
    const red = Math.round(65 + (255 - 65) * progress);
    const green = Math.round(105 + (88 - 105) * progress);
    const blue = Math.round(225 + (50 - 225) * progress);
    drawPolygon(
      overlayContext,
      currentPopulation.atoms[index].body,
      size,
      null,
      `rgba(${red}, ${green}, ${blue}, 0.18)`,
      0.5,
    );
  }
}

function drawEndpoint(atom, size, color, fill) {
  drawPolygon(overlayContext, atom.body, size, fill, color, 1.15);
  const point = canvasPoint(atom.center, size);
  overlayContext.beginPath();
  overlayContext.arc(point.x, point.y, 2.25, 0, Math.PI * 2);
  overlayContext.fillStyle = color;
  overlayContext.fill();
}

function draw() {
  state.queued = false;
  const { cssSize: size, dpr } = resizeCanvas();
  const currentPopulation = population();
  const staticKey = `${resolution()}-${size}-${dpr}`;
  if (state.staticKey !== staticKey) {
    state.staticLayer = buildStaticLayer(currentPopulation, size, dpr);
    state.staticKey = staticKey;
  }
  context.drawImage(state.staticLayer, 0, 0, size, size);

  const selection = selectPopulationInterval(currentPopulation, state.start, state.end);
  const wash = context.createLinearGradient(size * 0.24, size * 0.76, size * 0.76, size * 0.24);
  wash.addColorStop(0, "rgba(65, 105, 225, 0.10)");
  wash.addColorStop(1, "rgba(255, 92, 53, 0.13)");
  drawPolygon(context, selection.body, size, wash);

  overlayContext.clearRect(0, 0, size, size);
  drawOrderedBodies(selection, size);
  drawPolygon(overlayContext, selection.body, size, null, "#151512", 1.25);
  drawBodyContours(selection, size);
  drawEndpoint(
    selection.firstAtom,
    size,
    "#3156c8",
    "rgba(65, 105, 225, 0.045)",
  );
  if (selection.last !== selection.first) {
    drawEndpoint(
      selection.lastAtom,
      size,
      "#e84924",
      "rgba(255, 92, 53, 0.045)",
    );
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
  resolutionOutput.textContent = `${currentPopulation.atoms.length.toLocaleString("en-US")} bodies`;
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
  state.staticKey = "";
  updateControls();
  scheduleDraw();
});

new ResizeObserver(scheduleDraw).observe(wrap);
updateControls();
scheduleDraw();
