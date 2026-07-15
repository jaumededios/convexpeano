import test from "node:test";
import assert from "node:assert/strict";

import {
  createNestedPopulation,
  createPopulationCurve,
  createPopulationPortalCurve,
  createTargetPolygon,
  intersectConvexPolygons,
  isConvexPolygon,
  maxPolygonDiameter,
  pointInConvexPolygon,
  polygonArea,
  selectPopulationInterval,
  supportStation,
} from "../geometry.js";

const target = createTargetPolygon(40);

function intervalCoverage(population, start, end, gridSize = 38) {
  const selection = selectPopulationInterval(population, start, end);
  const atoms = population.atoms.slice(selection.first, selection.last + 1).map((atom) => {
    const xs = atom.body.map(({ x }) => x);
    const ys = atom.body.map(({ y }) => y);
    return {
      body: atom.body,
      bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    };
  });
  let hullPoints = 0;
  let missingPoints = 0;
  for (let yIndex = 0; yIndex <= gridSize; yIndex += 1) {
    for (let xIndex = 0; xIndex <= gridSize; xIndex += 1) {
      const point = { x: xIndex / gridSize, y: yIndex / gridSize };
      if (!pointInConvexPolygon(point, selection.body)) continue;
      hullPoints += 1;
      const covered = atoms.some(({ body, bounds }) => (
        point.x >= bounds[0]
        && point.y >= bounds[1]
        && point.x <= bounds[2]
        && point.y <= bounds[3]
        && pointInConvexPolygon(point, body)
      ));
      if (!covered) missingPoints += 1;
    }
  }
  return missingPoints / Math.max(1, hullPoints);
}

test("every body and rendered interval is convex", () => {
  assert.equal(isConvexPolygon(target), true);
  for (const resolution of [3, 7, 13]) {
    const population = createNestedPopulation({ target, resolution });
    assert.equal(population.levels.length, 2);
    assert.ok(population.parents.length > 1);
    assert.equal(population.atoms.length, population.parents.length * population.branchCount);
    for (const { body } of [...population.parents, ...population.atoms]) {
      assert.equal(isConvexPolygon(body), true);
      assert.ok(polygonArea(body) > 0);
    }
    for (const [start, end] of [[0, 0], [0.12, 0.68], [0.49, 0.51], [0, 1]]) {
      assert.equal(isConvexPolygon(selectPopulationInterval(population, start, end).body), true);
    }
  }
});

test("coarse and fine station counts can be refined independently", () => {
  const coupled = createNestedPopulation({ target, resolution: 10 });
  const layered = createNestedPopulation({ target, resolution: 10, coarseResolution: 4 });
  assert.equal(layered.coarseResolution, 4);
  assert.ok(layered.parents.length < coupled.parents.length);
  assert.ok(layered.atoms.length > layered.parents.length * 10);
});

test("support relaxation produces a nested convex station with exact endpoints", () => {
  const inner = target.map((point) => ({
    x: 0.5 + (point.x - 0.5) * 0.72,
    y: 0.5 + (point.y - 0.5) * 0.72,
  }));
  const station = supportStation(inner, target, 0.025);
  assert.ok(station.length > 2);
  assert.ok(Math.abs(polygonArea(station[0]) - polygonArea(inner)) < 1e-10);
  assert.ok(Math.abs(polygonArea(station.at(-1)) - polygonArea(target)) < 1e-10);
  for (let index = 0; index < station.length; index += 1) {
    assert.equal(isConvexPolygon(station[index]), true);
    if (!index) continue;
    assert.ok(polygonArea(station[index]) >= polygonArea(station[index - 1]) - 1e-10);
    for (const point of station[index - 1]) {
      assert.equal(pointInConvexPolygon(point, station[index], 1e-7), true);
    }
  }
});

test("every child stays in and collectively covers its parent", () => {
  const population = createNestedPopulation({ target, resolution: 11 });
  for (let parentIndex = 0; parentIndex < population.parents.length; parentIndex += 1) {
    const parent = population.parents[parentIndex].body;
    const children = population.atoms.filter((atom) => atom.parentIndex === parentIndex);
    assert.equal(children.length, population.branchCount);
    for (const child of children) {
      for (const vertex of child.body) {
        assert.equal(pointInConvexPolygon(vertex, parent, 1e-7), true);
      }
    }

    for (let xIndex = 0; xIndex <= 14; xIndex += 1) {
      for (let yIndex = 0; yIndex <= 14; yIndex += 1) {
        const point = { x: xIndex / 14, y: yIndex / 14 };
        if (!pointInConvexPolygon(point, parent)) continue;
        assert.equal(children.some(({ body }) => pointInConvexPolygon(point, body)), true);
      }
    }
  }
});

test("consecutive atoms overlap, allowing a continuous limiting traversal", () => {
  for (const resolution of [3, 11, 18]) {
    const { atoms } = createNestedPopulation({ target, resolution });
    for (let index = 1; index < atoms.length; index += 1) {
      const overlap = intersectConvexPolygons(atoms[index - 1].body, atoms[index].body);
      const sharesPoint = atoms[index - 1].body.some((point) => (
        pointInConvexPolygon(point, atoms[index].body)
      )) || atoms[index].body.some((point) => (
        pointInConvexPolygon(point, atoms[index - 1].body)
      ));
      assert.ok(overlap.length >= 3 || sharesPoint, `missing overlap at ${resolution}:${index}`);
    }
  }
});

test("the legacy center path samples a point from every ordered atom", () => {
  const population = createNestedPopulation({ target, resolution: 10 });
  const curve = createPopulationCurve(population);
  assert.equal(curve.length, population.atoms.length);
  for (let index = 0; index < population.atoms.length; index += 1) {
    assert.equal(pointInConvexPolygon(curve[index], population.atoms[index].body, 1e-7), true);
  }
});

test("the portal approximant keeps every segment inside its assigned atom", () => {
  const population = createNestedPopulation({ target, resolution: 8 });
  const curve = createPopulationPortalCurve(population);
  assert.equal(curve.length, population.atoms.length + 1);
  for (let index = 0; index < population.atoms.length; index += 1) {
    for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
      const point = {
        x: curve[index].x + (curve[index + 1].x - curve[index].x) * amount,
        y: curve[index].y + (curve[index + 1].y - curve[index].y) * amount,
      };
      assert.equal(
        pointInConvexPolygon(point, population.atoms[index].body, 1e-7),
        true,
        `portal segment ${index} left its atom`,
      );
    }
  }
});

test("the finest body diameter decreases as station resolution rises", () => {
  let previous = Infinity;
  for (const resolution of [7, 8, 10, 14, 18, 22]) {
    const population = createNestedPopulation({ target, resolution });
    const diameter = maxPolygonDiameter(population.atoms.map(({ body }) => body));
    assert.ok(diameter < previous, `${diameter} did not shrink below ${previous}`);
    previous = diameter;
  }
  assert.ok(previous < 0.45);
});

test("sampled consecutive unions fill their convex envelope", () => {
  const population = createNestedPopulation({ target, resolution: 13 });
  for (const [start, end] of [
    [0, 0.1],
    [0.9, 1],
    [0.12, 0.68],
    [0.33, 0.67],
    [0.49, 0.51],
    [0.231, 0.237],
    [0.71, 0.83],
  ]) {
    assert.ok(intervalCoverage(population, start, end) <= 0.005);
  }

  const full = selectPopulationInterval(population, 0, 1).body;
  assert.ok(Math.abs(polygonArea(full) - polygonArea(target)) < 1e-10);
});
