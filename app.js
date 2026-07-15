import {
  createPopulation,
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

const state = {
  start: 0.12,
  end: 0.68,
  level: 5,
  queued: false,
};

const target = createTargetPolygon();

function sliceCount() {
  return 2 ** state.level;
}

function canvasPoint(point, size) {
  const padding = Math.max(28, size * 0.075);
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

function drawPolygon(polygon, size, fill, stroke = null, lineWidth = 1) {
  if (polygon.length < 3) return;
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

  const population = createPopulation({ target, sliceCount: sliceCount() });
  const selection = selectPopulationInterval(population, state.start, state.end);

  drawPolygon(target, size, "#ddd9cf", "rgba(21, 21, 18, 0.72)", 1.1);

  // The population itself: overlapping convex bodies, drawn as quiet ribs.
  context.save();
  for (const slice of population.slices) {
    drawPolygon(slice.body, size, "rgba(244, 242, 236, 0.055)", "rgba(21, 21, 18, 0.095)", 0.65);
  }
  context.restore();

  // This polygon is the consecutive union itself: A_last ∩ B_first.
  drawPolygon(selection.body, size, "rgba(255, 92, 53, 0.86)", "#151512", 1.15);

  // Retain the individual bodies inside the selected run so its construction is visible.
  context.save();
  for (let index = selection.firstSlice; index <= selection.lastSlice; index += 1) {
    drawPolygon(population.slices[index].body, size, null, "rgba(21, 21, 18, 0.16)", 0.65);
  }
  context.restore();

  const apex = canvasPoint(population.apex, size);
  context.beginPath();
  context.arc(apex.x, apex.y, 3.2, 0, Math.PI * 2);
  context.fillStyle = "#151512";
  context.fill();
}

function scheduleDraw() {
  if (state.queued) return;
  state.queued = true;
  requestAnimationFrame(draw);
}

function updateControls() {
  const count = sliceCount();
  intervalOutput.textContent = `[${state.start.toFixed(3)}, ${state.end.toFixed(3)}]`;
  resolutionOutput.textContent = `${count} bodies`;
  rangeFill.style.left = `${state.start * 100}%`;
  rangeFill.style.right = `${(1 - state.end) * 100}%`;
  resolutionInput.style.setProperty("--progress", `${((state.level - 3) / 5) * 100}%`);
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
  state.level = Number(resolutionInput.value);
  updateControls();
  scheduleDraw();
});

new ResizeObserver(scheduleDraw).observe(wrap);
updateControls();
scheduleDraw();
