const EPSILON = 1e-9;

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function signedPolygonArea(polygon) {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function deduplicate(points) {
  const seen = new Set();
  const result = [];
  for (const point of points) {
    const key = `${point.x.toFixed(12)},${point.y.toFixed(12)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result;
}

export function convexHull(points) {
  const sorted = deduplicate(points).sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;

  const append = (half, point) => {
    while (half.length >= 2) {
      const a = half[half.length - 2];
      const b = half[half.length - 1];
      if (cross(subtract(b, a), subtract(point, b)) > EPSILON) break;
      half.pop();
    }
    half.push(point);
  };

  const lower = [];
  for (const point of sorted) append(lower, point);
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) append(upper, sorted[index]);
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function polygonArea(polygon) {
  return Math.abs(signedPolygonArea(polygon));
}

export function isConvexPolygon(polygon, tolerance = 1e-8) {
  if (polygon.length < 3) return true;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const c = polygon[(index + 2) % polygon.length];
    const turn = cross(subtract(b, a), subtract(c, b));
    if (Math.abs(turn) <= tolerance) continue;
    const currentSign = Math.sign(turn);
    if (sign && currentSign !== sign) return false;
    sign = currentSign;
  }
  return true;
}

export function pointInConvexPolygon(point, polygon, tolerance = 1e-8) {
  if (polygon.length < 3) return false;
  const orientation = Math.sign(signedPolygonArea(polygon)) || 1;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (orientation * cross(subtract(b, a), subtract(point, a)) < -tolerance) return false;
  }
  return true;
}

/** Sutherland–Hodgman intersection for two convex polygons. */
export function intersectConvexPolygons(subject, clipper) {
  if (subject.length < 3 || clipper.length < 3) return [];
  let output = subject;
  const orientation = Math.sign(signedPolygonArea(clipper)) || 1;

  for (let edge = 0; edge < clipper.length; edge += 1) {
    const a = clipper[edge];
    const b = clipper[(edge + 1) % clipper.length];
    const edgeVector = subtract(b, a);
    const input = output;
    output = [];
    if (!input.length) break;

    const side = (point) => orientation * cross(edgeVector, subtract(point, a));
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentSide = side(current);
      const previousSide = side(previous);
      const currentInside = currentSide >= -EPSILON;
      const previousInside = previousSide >= -EPSILON;

      if (currentInside !== previousInside) {
        const denominator = previousSide - currentSide;
        const amount = Math.abs(denominator) < EPSILON ? 0 : previousSide / denominator;
        output.push({
          x: previous.x + (current.x - previous.x) * amount,
          y: previous.y + (current.y - previous.y) * amount,
        });
      }
      if (currentInside) output.push(current);
    }
  }

  // Exact half-plane clipping is convex. Re-hulling only removes collinear or
  // near-duplicate vertices accumulated by floating-point intersections.
  return output.length >= 3 ? convexHull(output) : deduplicate(output);
}

export function createTargetPolygon(vertexCount = 72) {
  const points = [];
  const exponent = 3.35;
  const rotation = -0.055;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);

  for (let index = 0; index < vertexCount; index += 1) {
    const angle = (index / vertexCount) * Math.PI * 2;
    const rawX = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** (2 / exponent);
    const rawY = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** (2 / exponent);
    const x = rawX * cosine - rawY * sine;
    const y = rawX * sine + rawY * cosine;
    points.push({
      x: 0.5 + 0.407 * (x + y * 0.075),
      y: 0.5 + 0.407 * y,
    });
  }
  return points;
}

function polygonBounds(polygon) {
  return polygon.reduce((bounds, point) => ({
    xMin: Math.min(bounds.xMin, point.x),
    xMax: Math.max(bounds.xMax, point.x),
    yMin: Math.min(bounds.yMin, point.y),
    yMax: Math.max(bounds.yMax, point.y),
  }), { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
}

function axisMinimum(bounds, axis) {
  return axis === 0 ? bounds.xMin : bounds.yMin;
}

function axisMaximum(bounds, axis) {
  return axis === 0 ? bounds.xMax : bounds.yMax;
}

function axisPoint(axis, along, across) {
  return axis === 0 ? { x: along, y: across } : { x: across, y: along };
}

function rectanglePolygon(xMin, yMin, xMax, yMax) {
  return [
    { x: xMin, y: yMin },
    { x: xMax, y: yMin },
    { x: xMax, y: yMax },
    { x: xMin, y: yMax },
  ];
}

function reflectedPolygon(polygon, axis) {
  return convexHull(polygon.map((point) => axis === 0
    ? { x: -point.x, y: point.y }
    : { x: point.x, y: -point.y }));
}

/** A bowed convex prefix, the polygonal analogue of a supporting-ball cap. */
function parabolicPrefix(parent, axis, threshold, curvature, samples = 10) {
  const bounds = polygonBounds(parent);
  const acrossAxis = 1 - axis;
  const acrossMinimum = axisMinimum(bounds, acrossAxis);
  const acrossMaximum = axisMaximum(bounds, acrossAxis);
  const span = Math.max(EPSILON, axisMaximum(bounds, axis) - axisMinimum(bounds, axis));
  const acrossSpan = Math.max(EPSILON, acrossMaximum - acrossMinimum);
  const padding = acrossSpan * 0.08;
  const start = acrossMinimum - padding;
  const end = acrossMaximum + padding;
  const center = (start + end) / 2;
  const far = axisMinimum(bounds, axis) - span * 3;
  const cap = [axisPoint(axis, far, start)];
  for (let index = 0; index <= samples; index += 1) {
    const across = start + ((end - start) * index) / samples;
    const normalized = (across - center) / Math.max(span, acrossSpan);
    cap.push(axisPoint(axis, threshold - curvature * normalized ** 2, across));
  }
  cap.push(axisPoint(axis, far, end));
  return intersectConvexPolygons(parent, cap);
}

function polygonsNearlyEqual(a, b, tolerance = 1e-10) {
  return Math.abs(polygonArea(a) - polygonArea(b)) <= tolerance;
}

/**
 * A finite station. The thin difference between two nested convex bodies is
 * covered by small boxes; adjoining one box at a time and taking its convex
 * closure keeps every intermediate body convex and the disturbance local.
 */
function localizedStation(inner, outer, tileSize, reverse = false) {
  if (polygonsNearlyEqual(inner, outer)) return [inner, outer];
  const bounds = polygonBounds(outer);
  const xCount = Math.max(1, Math.ceil((bounds.xMax - bounds.xMin) / tileSize));
  const yCount = Math.max(1, Math.ceil((bounds.yMax - bounds.yMin) / tileSize));
  const patches = [];

  for (let yIndex = 0; yIndex < yCount; yIndex += 1) {
    const row = [];
    for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
      const patch = intersectConvexPolygons(outer, rectanglePolygon(
        bounds.xMin + xIndex * tileSize,
        bounds.yMin + yIndex * tileSize,
        Math.min(bounds.xMin + (xIndex + 1) * tileSize, bounds.xMax),
        Math.min(bounds.yMin + (yIndex + 1) * tileSize, bounds.yMax),
      ));
      if (patch.length < 3 || polygonArea(patch) < EPSILON) continue;
      if (patch.every((point) => pointInConvexPolygon(point, inner, 1e-7))) continue;
      row.push(patch);
    }
    if (yIndex % 2 === 1) row.reverse();
    patches.push(...row);
  }
  if (reverse) patches.reverse();

  const bodies = [inner];
  let current = inner;
  for (const patch of patches) {
    const next = convexHull(current.concat(patch));
    if (Math.abs(polygonArea(next) - polygonArea(current)) < EPSILON) continue;
    current = next;
    bodies.push(current);
  }
  if (!polygonsNearlyEqual(bodies.at(-1), outer, 1e-8)) bodies.push(outer);
  else bodies[bodies.length - 1] = outer;
  return bodies;
}

function localizedNet(parent, axis, detail, overlap, tileSize) {
  const bounds = polygonBounds(parent);
  const minimum = axisMinimum(bounds, axis);
  const maximum = axisMaximum(bounds, axis);
  const span = Math.max(EPSILON, maximum - minimum);
  const skeleton = Array.from(
    { length: detail },
    (_, index) => minimum + (span * index) / (detail - 1),
  );
  const curvature = span * 0.52;
  const coarse = skeleton.map((value) => parabolicPrefix(
    parent,
    axis,
    value + overlap,
    curvature,
  ));
  coarse[coarse.length - 1] = parent;

  const bodies = [coarse[0]];
  const coordinates = [skeleton[0]];
  for (let index = 0; index + 1 < coarse.length; index += 1) {
    const station = localizedStation(coarse[index], coarse[index + 1], tileSize);
    bodies.push(...station.slice(1));
    coordinates.push(...Array(station.length - 1).fill(skeleton[index]));
  }
  return { bodies, coordinates };
}

function localizedAntiNet(parent, axis, detail, overlap, tileSize) {
  const reflected = reflectedPolygon(parent, axis);
  const net = localizedNet(reflected, axis, detail, overlap, tileSize);
  return {
    bodies: net.bodies.map((body) => reflectedPolygon(body, axis)).reverse(),
    coordinates: net.coordinates.map((value) => -value).reverse(),
  };
}

function normalizedCoordinates(values) {
  const minimum = values[0];
  const maximum = values.at(-1);
  const span = maximum - minimum;
  if (Math.abs(span) < EPSILON) return values.map(() => 0);
  return values.map((value) => (value - minimum) / span);
}

/** Stretch two nets without changing their order, as in the paper. */
function alignNets(left, right) {
  const leftProgress = normalizedCoordinates(left.coordinates);
  const rightProgress = normalizedCoordinates(right.coordinates);
  let leftIndex = 0;
  let rightIndex = 0;
  const leftBodies = [left.bodies[0]];
  const rightBodies = [right.bodies[0]];
  const progress = [0];

  while (leftIndex + 1 < left.bodies.length || rightIndex + 1 < right.bodies.length) {
    const nextLeft = leftIndex + 1 < left.bodies.length
      ? leftProgress[leftIndex + 1]
      : Infinity;
    const nextRight = rightIndex + 1 < right.bodies.length
      ? rightProgress[rightIndex + 1]
      : Infinity;
    if (Math.abs(nextLeft - nextRight) < 1e-10) {
      leftIndex += 1;
      rightIndex += 1;
    } else if (nextLeft < nextRight) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
    leftBodies.push(left.bodies[leftIndex]);
    rightBodies.push(right.bodies[rightIndex]);
    progress.push(Math.max(leftProgress[leftIndex], rightProgress[rightIndex]));
  }
  return { leftBodies, rightBodies, progress };
}

function stretchSequence(sequence, length) {
  if (sequence.length === length) return sequence;
  if (sequence.length === 1) return Array(length).fill(sequence[0]);
  return Array.from({ length }, (_, index) => sequence[Math.min(
    sequence.length - 1,
    Math.round((index * (sequence.length - 1)) / (length - 1)),
  )]);
}

function makeSouls(entries) {
  return entries.map((entry, index) => {
    let adjacent = entry.body;
    if (index % 2 === 0 && index > 0) adjacent = entries[index - 1].body;
    if (index % 2 === 1 && index + 1 < entries.length) adjacent = entries[index + 1].body;
    return {
      ...entry,
      index,
      core: intersectConvexPolygons(entry.body, adjacent),
    };
  });
}

function createOffspring(parent, axis, detail, overlap, tileSize) {
  const net = localizedNet(parent.core, axis, detail, overlap, tileSize);
  const antiNet = localizedAntiNet(parent.body, axis, detail, overlap, tileSize);
  const aligned = alignNets(net, antiNet);
  const parentBounds = polygonBounds(parent.body);
  const axisSpan = Math.max(
    EPSILON,
    axisMaximum(parentBounds, axis) - axisMinimum(parentBounds, axis),
  );

  const disturbanceVertices = parent.body.filter((point) => (
    !pointInConvexPolygon(point, parent.core, 1e-7)
  ));
  let stationBodies;
  let insertion;
  if (!disturbanceVertices.length || polygonsNearlyEqual(parent.body, parent.core, 1e-8)) {
    stationBodies = [parent.core];
    insertion = Math.floor(aligned.leftBodies.length / 2);
  } else {
    stationBodies = localizedStation(parent.core, parent.body, tileSize, axis === 1);
    const center = disturbanceVertices.reduce(
      (sum, point) => sum + (axis === 0 ? point.x : point.y) / disturbanceVertices.length,
      0,
    );
    const targetProgress = (center - axisMinimum(parentBounds, axis)) / axisSpan;
    insertion = aligned.progress.reduce(
      (best, value, index) => Math.abs(value - targetProgress) < Math.abs(aligned.progress[best] - targetProgress)
        ? index
        : best,
      0,
    );
  }

  const stationParts = stationBodies.map((station) => station.filter((point) => (
    !pointInConvexPolygon(point, parent.core, 1e-7)
  )));
  const left = aligned.leftBodies.slice(0, insertion)
    .concat(Array(stationParts.length).fill(aligned.leftBodies[insertion]))
    .concat(aligned.leftBodies.slice(insertion + 1));
  const right = aligned.rightBodies.slice(0, insertion)
    .concat(Array(stationParts.length).fill(aligned.rightBodies[insertion]))
    .concat(aligned.rightBodies.slice(insertion + 1));
  const parts = Array(insertion).fill(stationParts[0])
    .concat(stationParts)
    .concat(Array(aligned.leftBodies.length - insertion - 1).fill(stationParts.at(-1)));

  const cells = left.map((body, index) => {
    const increasing = convexHull(body.concat(parts[index]));
    return intersectConvexPolygons(increasing, right[index]);
  }).filter((body) => body.length >= 3 && polygonArea(body) > EPSILON);

  return cells.flatMap((body) => [{ body }, { body }]);
}

function refinePopulation(parents, axis, detail, overlap, tileSize) {
  const groups = parents.map((parent) => createOffspring(
    parent,
    axis,
    detail,
    overlap,
    tileSize,
  ));
  const childCount = Math.max(...groups.map(({ length }) => length));
  const entries = [];
  groups.forEach((group, parentIndex) => {
    const stretched = stretchSequence(group, childCount);
    const ordered = parentIndex % 2 === 0 ? stretched : [...stretched].reverse();
    ordered.forEach(({ body }) => entries.push({ body, parentIndex }));
  });
  return { children: makeSouls(entries), childCount };
}

function polygonCentroid(polygon) {
  if (!polygon.length) return { x: 0.5, y: 0.5 };
  return polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }),
    { x: 0, y: 0 },
  );
}

function buildHullIndex(bodies) {
  let leafCount = 1;
  while (leafCount < bodies.length) leafCount *= 2;
  const tree = Array.from({ length: leafCount * 2 }, () => []);
  for (let index = 0; index < bodies.length; index += 1) {
    tree[leafCount + index] = bodies[index];
  }
  for (let index = leafCount - 1; index > 0; index -= 1) {
    tree[index] = convexHull(tree[index * 2].concat(tree[index * 2 + 1]));
  }
  return { tree, leafCount };
}

function queryHull(index, first, last) {
  let left = first + index.leafCount;
  let right = last + index.leafCount;
  const points = [];
  while (left <= right) {
    if (left % 2 === 1) points.push(...index.tree[left++]);
    if (right % 2 === 0) points.push(...index.tree[right--]);
    left = Math.floor(left / 2);
    right = Math.floor(right / 2);
  }
  return convexHull(points);
}

/**
 * A finite visual analogue of Paszkiewicz's fundamental construction:
 * increasing nets, decreasing nets, localized stations, duplication, and
 * anti-ordering. The first generation is thin in x; its offspring are thin in
 * y while staying inside and covering their parents.
 */
export function createNestedPopulation({ target, resolution }) {
  const bounds = polygonBounds(target);
  const span = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const step = span / Math.max(1, resolution - 1);
  const overlap = Math.min(span * 0.5, step * 4.6);
  const tileSize = span * 0.3;
  const root = { body: target, core: target, index: 0 };
  const firstEntries = createOffspring(root, 0, resolution, overlap, tileSize);
  const parents = makeSouls(firstEntries);
  const refinement = refinePopulation(parents, 1, resolution, overlap, tileSize);
  const atoms = refinement.children.map((atom) => ({
    ...atom,
    center: polygonCentroid(atom.body),
  }));
  const levels = [parents, atoms];

  return {
    target,
    resolution,
    branchCount: refinement.childCount,
    parents,
    levels,
    atoms,
    hullIndex: buildHullIndex(atoms.map(({ body }) => body)),
  };
}

export function selectPopulationInterval(population, start, end) {
  const count = population.atoms.length;
  const first = Math.min(count - 1, Math.max(0, Math.floor(start * count)));
  const last = Math.max(
    first,
    Math.min(count - 1, Math.max(0, Math.ceil(end * count) - 1)),
  );
  return {
    first,
    last,
    body: first === 0 && last === count - 1
      ? population.target
      : queryHull(population.hullIndex, first, last),
    firstAtom: population.atoms[first],
    lastAtom: population.atoms[last],
  };
}

export function maxPolygonDiameter(polygons) {
  let maximum = 0;
  for (const polygon of polygons) {
    for (let a = 0; a < polygon.length; a += 1) {
      for (let b = a + 1; b < polygon.length; b += 1) {
        maximum = Math.max(maximum, Math.hypot(
          polygon[a].x - polygon[b].x,
          polygon[a].y - polygon[b].y,
        ));
      }
    }
  }
  return maximum;
}
