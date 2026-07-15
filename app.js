import {
  blocksToSquares,
  convexHull,
  decomposeInterval,
  hilbertIndexToXY,
  squareCorners,
} from "./geometry.js";

const canvas = document.querySelector("#peano-canvas");
const context = canvas.getContext("2d", { alpha: false });
const canvasWrap = canvas.parentElement;

const controls = {
  start: document.querySelector("#interval-start"),
  end: document.querySelector("#interval-end"),
  resolution: document.querySelector("#resolution"),
  animate: document.querySelector("#animate-button"),
  reset: document.querySelector("#reset-button"),
};

const outputs = {
  interval: document.querySelector("#interval-output"),
  start: document.querySelector("#start-value"),
  end: document.querySelector("#end-value"),
  length: document.querySelector("#length-value"),
  resolution: document.querySelector("#resolution-output"),
  cells: document.querySelector("#cell-count"),
  selected: document.querySelector("#selected-count"),
  blocks: document.querySelector("#block-count"),
  hull: document.querySelector("#hull-count"),
  fill: document.querySelector("#range-fill"),
};

const formatInteger = new Intl.NumberFormat("en-US");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  start: 0.12,
  end: 0.68,
  order: 7,
  animationFrame: 0,
  animationStartedAt: 0,
  animating: false,
  background: null,
  backgroundKey: "",
  renderQueued: false,
};

function intervalToIndices() {
  const total = 4 ** state.order;
  const start = Math.min(total - 1, Math.floor(state.start * total));
  const end = Math.max(start + 1, Math.min(total, Math.ceil(state.end * total)));
  return { total, start, end };
}

function getPlotBounds(width, height) {
  const mobile = width < 520;
  const top = mobile ? 34 : 42;
  const bottom = mobile ? 62 : 52;
  const horizontal = mobile ? 34 : 54;
  const size = Math.max(10, Math.min(width - horizontal * 2, height - top - bottom));
  return {
    x: (width - size) / 2,
    y: top + (height - top - bottom - size) / 2,
    size,
  };
}

function normalizedToCanvas(point, plot) {
  return {
    x: plot.x + point.x * plot.size,
    y: plot.y + (1 - point.y) * plot.size,
  };
}

function sizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.backgroundKey = "";
  }

  return { width, height, dpr };
}

function drawRecursiveGrid(ctx, plot, order) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let level = 1; level <= Math.min(order, 6); level += 1) {
    const divisions = 2 ** level;
    ctx.strokeStyle = `rgba(22, 22, 18, ${Math.max(0.018, 0.1 - level * 0.013)})`;
    ctx.beginPath();
    for (let i = 1; i < divisions; i += 1) {
      const position = (i / divisions) * plot.size;
      ctx.moveTo(plot.x + position, plot.y);
      ctx.lineTo(plot.x + position, plot.y + plot.size);
      ctx.moveTo(plot.x, plot.y + position);
      ctx.lineTo(plot.x + plot.size, plot.y + position);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function buildBackground(width, height, dpr) {
  const key = `${width}:${height}:${dpr}:${state.order}`;
  if (state.backgroundKey === key && state.background) return;

  const buffer = document.createElement("canvas");
  buffer.width = Math.round(width * dpr);
  buffer.height = Math.round(height * dpr);
  const ctx = buffer.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#dcd7ca";
  ctx.fillRect(0, 0, width, height);

  const plot = getPlotBounds(width, height);
  drawRecursiveGrid(ctx, plot, state.order);

  const displayOrder = Math.min(state.order, 8);
  const side = 2 ** displayOrder;
  const count = side * side;
  ctx.save();
  ctx.beginPath();
  for (let index = 0; index < count; index += 1) {
    const point = hilbertIndexToXY(displayOrder, index);
    const x = plot.x + ((point.x + 0.5) / side) * plot.size;
    const y = plot.y + (1 - (point.y + 0.5) / side) * plot.size;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = state.order < 6 ? "rgba(22, 22, 18, 0.34)" : "rgba(22, 22, 18, 0.17)";
  ctx.lineWidth = state.order < 6 ? 1.1 : 0.72;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.strokeStyle = "rgba(22, 22, 18, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
  ctx.restore();

  state.background = buffer;
  state.backgroundKey = key;
}

function drawHull(hull, plot) {
  if (!hull.length) return;
  context.save();
  context.beginPath();
  hull.forEach((point, index) => {
    const canvasPoint = normalizedToCanvas(point, plot);
    if (index === 0) context.moveTo(canvasPoint.x, canvasPoint.y);
    else context.lineTo(canvasPoint.x, canvasPoint.y);
  });
  context.closePath();
  context.fillStyle = "rgba(80, 120, 255, 0.19)";
  context.fill();
  context.strokeStyle = "#5078ff";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.stroke();
  context.restore();
}

function drawSelectedSquares(squares, plot) {
  context.save();
  context.fillStyle = "rgba(255, 92, 53, 0.78)";
  context.strokeStyle = "rgba(212, 62, 27, 0.5)";
  context.lineWidth = 0.7;

  for (const square of squares) {
    const x = plot.x + square.x * plot.size;
    const y = plot.y + (1 - square.y - square.size) * plot.size;
    const size = Math.max(0.8, square.size * plot.size);
    context.fillRect(x, y, size, size);
    if (size > 3) context.strokeRect(x, y, size, size);
  }
  context.restore();
}

function drawEndpoints(startIndex, endIndex, plot) {
  const side = 2 ** state.order;
  const points = [
    { ...hilbertIndexToXY(state.order, startIndex), color: "#ff5c35", label: "a" },
    { ...hilbertIndexToXY(state.order, Math.max(startIndex, endIndex - 1)), color: "#5078ff", label: "b" },
  ];

  context.save();
  context.font = '500 9px "DM Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const point of points) {
    const normalized = { x: (point.x + 0.5) / side, y: (point.y + 0.5) / side };
    const position = normalizedToCanvas(normalized, plot);
    context.beginPath();
    context.arc(position.x, position.y, 5.5, 0, Math.PI * 2);
    context.fillStyle = point.color;
    context.fill();
    context.strokeStyle = "#161612";
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = "#161612";
    context.fillText(point.label, position.x, position.y - 12);
  }
  context.restore();
}

function render() {
  state.renderQueued = false;
  const { width, height, dpr } = sizeCanvas();
  buildBackground(width, height, dpr);

  context.clearRect(0, 0, width, height);
  context.drawImage(state.background, 0, 0, state.background.width, state.background.height, 0, 0, width, height);

  const plot = getPlotBounds(width, height);
  const { total, start, end } = intervalToIndices();
  const blocks = decomposeInterval(start, end, total);
  const squares = blocksToSquares(state.order, blocks);
  const hull = convexHull(squares.flatMap(squareCorners));

  drawHull(hull, plot);
  drawSelectedSquares(squares, plot);
  drawEndpoints(start, end, plot);

  outputs.blocks.textContent = formatInteger.format(blocks.length);
  outputs.hull.textContent = formatInteger.format(hull.length);
}

function scheduleRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(render);
}

function updateOutputs() {
  const { total, start, end } = intervalToIndices();
  const progress = ((state.order - 3) / 7) * 100;
  const startText = state.start.toFixed(3);
  const endText = state.end.toFixed(3);

  outputs.interval.textContent = `[${startText}, ${endText}]`;
  outputs.start.textContent = startText;
  outputs.end.textContent = endText;
  outputs.length.textContent = (state.end - state.start).toFixed(3);
  outputs.resolution.textContent = `Level ${state.order}`;
  outputs.cells.textContent = formatInteger.format(total);
  outputs.selected.textContent = formatInteger.format(end - start);
  outputs.fill.style.left = `${state.start * 100}%`;
  outputs.fill.style.right = `${(1 - state.end) * 100}%`;
  controls.resolution.style.setProperty("--progress", `${progress}%`);

  controls.start.style.zIndex = state.start > 0.84 ? "4" : "3";
  controls.end.style.zIndex = "2";
}

function stopAnimation() {
  state.animating = false;
  cancelAnimationFrame(state.animationFrame);
  controls.animate.setAttribute("aria-pressed", "false");
  controls.animate.querySelector(".play-icon").textContent = "▶";
  controls.animate.querySelector(".button-label").textContent = "Grow interval";
}

function handleIntervalInput(changedControl) {
  stopAnimation();
  const rawStart = Number(controls.start.value) / 1000;
  const rawEnd = Number(controls.end.value) / 1000;

  if (changedControl === controls.start) {
    state.start = Math.min(rawStart, rawEnd);
    if (rawStart > rawEnd) controls.start.value = controls.end.value;
  } else {
    state.end = Math.max(rawStart, rawEnd);
    if (rawEnd < rawStart) controls.end.value = controls.start.value;
  }

  state.start = Number(controls.start.value) / 1000;
  state.end = Number(controls.end.value) / 1000;
  updateOutputs();
  scheduleRender();
}

function animate(timestamp) {
  if (!state.animating) return;
  if (!state.animationStartedAt) state.animationStartedAt = timestamp;
  const elapsed = (timestamp - state.animationStartedAt) / 1000;
  const phase = (elapsed % 6) / 6;
  const eased = 0.5 - Math.cos(phase * Math.PI * 2) / 2;
  state.start = 0.08;
  state.end = 0.1 + eased * 0.87;
  controls.start.value = String(Math.round(state.start * 1000));
  controls.end.value = String(Math.round(state.end * 1000));
  updateOutputs();
  scheduleRender();
  state.animationFrame = requestAnimationFrame(animate);
}

controls.start.addEventListener("input", () => handleIntervalInput(controls.start));
controls.end.addEventListener("input", () => handleIntervalInput(controls.end));

controls.resolution.addEventListener("input", () => {
  stopAnimation();
  state.order = Number(controls.resolution.value);
  state.backgroundKey = "";
  updateOutputs();
  scheduleRender();
});

controls.animate.addEventListener("click", () => {
  if (state.animating) {
    stopAnimation();
    return;
  }

  state.animating = true;
  state.animationStartedAt = 0;
  controls.animate.setAttribute("aria-pressed", "true");
  controls.animate.querySelector(".play-icon").textContent = "Ⅱ";
  controls.animate.querySelector(".button-label").textContent = "Pause growth";
  state.animationFrame = requestAnimationFrame(animate);
});

controls.reset.addEventListener("click", () => {
  stopAnimation();
  state.start = 0.12;
  state.end = 0.68;
  state.order = 7;
  controls.start.value = "120";
  controls.end.value = "680";
  controls.resolution.value = "7";
  state.backgroundKey = "";
  updateOutputs();
  scheduleRender();
});

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) stopAnimation();
});

new ResizeObserver(() => scheduleRender()).observe(canvasWrap);

updateOutputs();
scheduleRender();
