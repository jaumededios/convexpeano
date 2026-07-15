import {
  createNestedPopulation,
  createTargetPolygon,
  selectPopulationInterval,
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

const RESOLUTIONS = [9, 11, 12, 13, 15, 18];
const target = createTargetPolygon();
const populationCache = new Map();

const state = {
  start: 0.12,
  end: 0.68,
  resolutionIndex: 2,
  queued: false,
  staticLayer: null,
  staticKey: "",
};

function resolution() {
  return RESOLUTIONS[state.resolutionIndex];
}

function population() {
  const value = resolution();
  if (!populationCache.has(value)) {
    populationCache.set(value, createNestedPopulation({ target, resolution: value }));
  }
  return populationCache.get(value);
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
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  drawPolygon(layerContext, target, size, "#dedbd2", "rgba(20, 20, 17, 0.70)", 1.05);

  for (const parent of currentPopulation.parents) {
    drawPolygon(
      layerContext,
      parent.body,
      size,
      null,
      "rgba(20, 20, 17, 0.045)",
      0.46,
    );
  }

  const atomOpacity = currentPopulation.atoms.length > 8000 ? 0.017 : 0.024;
  const atomWidth = currentPopulation.atoms.length > 8000 ? 0.34 : 0.42;
  for (const atom of currentPopulation.atoms) {
    drawPolygon(
      layerContext,
      atom.body,
      size,
      null,
      `rgba(20, 20, 17, ${atomOpacity})`,
      atomWidth,
    );
  }

  return layer;
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
  const gradient = context.createLinearGradient(size * 0.18, size * 0.82, size * 0.82, size * 0.18);
  gradient.addColorStop(0, "rgba(255, 74, 40, 0.90)");
  gradient.addColorStop(1, "rgba(255, 111, 59, 0.88)");
  drawPolygon(context, selection.body, size, gradient, "#151512", 1.15);

  const drawEndpoint = (atom) => {
    const point = canvasPoint(atom.center, size);
    context.beginPath();
    context.arc(point.x, point.y, 2.15, 0, Math.PI * 2);
    context.fillStyle = "#151512";
    context.fill();
  };
  drawEndpoint(selection.firstAtom);
  if (selection.last !== selection.first) drawEndpoint(selection.lastAtom);
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
