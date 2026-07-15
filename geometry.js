const EPSILON = 1e-9;

export function dot(point, normal) {
  return point.x * normal.x + point.y * normal.y;
}

/**
 * A strictly convex, slightly sheared superellipse. The construction works for
 * any convex target; this one makes the changing sections easier to read.
 */
export function createTargetPolygon(vertexCount = 192) {
  const points = [];
  const exponent = 3.2;
  const rotation = -0.09;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);

  for (let index = 0; index < vertexCount; index += 1) {
    const angle = (index / vertexCount) * Math.PI * 2;
    const rawX = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** (2 / exponent);
    const rawY = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** (2 / exponent);
    const rotatedX = rawX * cosine - rawY * sine;
    const rotatedY = rawX * sine + rawY * cosine;
    points.push({
      x: 0.5 + 0.405 * (rotatedX + rotatedY * 0.11),
      y: 0.5 + 0.405 * rotatedY,
    });
  }

  return points;
}

/** Clip a convex polygon by one closed half-plane. */
export function clipPolygonHalfPlane(polygon, normal, threshold, keepLess = true) {
  if (!polygon.length) return [];
  const output = [];
  const inside = (point) => keepLess
    ? dot(point, normal) <= threshold + EPSILON
    : dot(point, normal) >= threshold - EPSILON;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);

    if (currentInside !== previousInside) {
      const previousProjection = dot(previous, normal);
      const currentProjection = dot(current, normal);
      const denominator = currentProjection - previousProjection;
      const amount = Math.abs(denominator) < EPSILON
        ? 0
        : (threshold - previousProjection) / denominator;
      output.push({
        x: previous.x + (current.x - previous.x) * amount,
        y: previous.y + (current.y - previous.y) * amount,
      });
    }

    if (currentInside) output.push(current);
  }

  return output;
}

export function clipPolygonToSlab(polygon, normal, lower, upper) {
  return clipPolygonHalfPlane(
    clipPolygonHalfPlane(polygon, normal, lower, false),
    normal,
    upper,
    true,
  );
}

export function polygonArea(polygon) {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

export function isConvexPolygon(polygon, tolerance = 1e-8) {
  if (polygon.length < 3) return true;
  let sign = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const c = polygon[(index + 2) % polygon.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) <= tolerance) continue;
    const currentSign = Math.sign(cross);
    if (sign && currentSign !== sign) return false;
    sign = currentSign;
  }

  return true;
}

export function pointInConvexPolygon(point, polygon) {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) <= EPSILON) continue;
    const currentSign = Math.sign(cross);
    if (sign && currentSign !== sign) return false;
    sign = currentSign;
  }
  return true;
}

function normalizedAngle(point, apex) {
  const angle = Math.atan2(point.y - apex.y, point.x - apex.x);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

function rayNormal(angle) {
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

function clipBelowRay(polygon, apex, angle) {
  const normal = rayNormal(angle);
  return clipPolygonHalfPlane(polygon, normal, dot(apex, normal), true);
}

function clipAboveRay(polygon, apex, angle) {
  const normal = rayNormal(angle);
  return clipPolygonHalfPlane(polygon, normal, dot(apex, normal), false);
}

export function clipPolygonToWedge(polygon, apex, lowerAngle, upperAngle) {
  return clipBelowRay(
    clipAboveRay(polygon, apex, lowerAngle),
    apex,
    upperAngle,
  );
}

/**
 * A finite version of the paper's net/anti-net intersection step.
 *
 * A_i is an increasing convex cone, B_i a decreasing convex cone, and
 * t_i = A_i ∩ B_i. Adjacent t_i overlap. Consequently, for k ≤ l,
 *
 *     ⋃(i=k…l) t_i = A_l ∩ B_k,
 *
 * which is convex before it reaches the renderer.
 */
export function createPopulation({ target, sliceCount, overlap = 0.72 }) {
  const apex = target.reduce((rightmost, point) => point.x > rightmost.x ? point : rightmost);
  const angles = target
    .filter((point) => Math.hypot(point.x - apex.x, point.y - apex.y) > 1e-6)
    .map((point) => normalizedAngle(point, apex));
  const range = { min: Math.min(...angles), max: Math.max(...angles) };
  const step = (range.max - range.min) / Math.max(1, sliceCount - 1);
  const halfWidth = step * overlap;
  const slices = [];

  for (let index = 0; index < sliceCount; index += 1) {
    const center = range.min + index * step;
    const lower = center - halfWidth;
    const upper = center + halfWidth;
    const growingNet = clipBelowRay(target, apex, upper);
    const shrinkingAntiNet = clipAboveRay(target, apex, lower);
    const body = clipPolygonToWedge(target, apex, lower, upper);
    slices.push({
      index,
      center,
      lower,
      upper,
      growingNet,
      shrinkingAntiNet,
      body,
    });
  }

  // Paszkiewicz's Step II repeats each base t⊗(i) twice before anti-ordering.
  const members = slices.flatMap((slice) => [slice, slice]);
  return { target, apex, range, step, halfWidth, slices, members };
}

export function selectPopulationInterval(population, start, end) {
  const memberCount = population.members.length;
  const firstMember = Math.min(memberCount - 1, Math.floor(start * memberCount));
  const lastMember = Math.max(
    firstMember,
    Math.min(memberCount - 1, Math.max(0, Math.ceil(end * memberCount) - 1)),
  );
  const firstSlice = Math.floor(firstMember / 2);
  const lastSlice = Math.floor(lastMember / 2);
  const first = population.slices[firstSlice];
  const last = population.slices[lastSlice];

  // This is the consecutive union itself, using the exact net/anti-net identity.
  const body = clipPolygonToWedge(
    population.target,
    population.apex,
    first.lower,
    last.upper,
  );

  return {
    firstMember,
    lastMember,
    firstSlice,
    lastSlice,
    selectedMemberCount: lastMember - firstMember + 1,
    selectedSliceCount: lastSlice - firstSlice + 1,
    growingNet: last.growingNet,
    shrinkingAntiNet: first.shrinkingAntiNet,
    body,
    lower: first.lower,
    upper: last.upper,
  };
}
