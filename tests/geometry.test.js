import test from "node:test";
import assert from "node:assert/strict";

import {
  createPopulation,
  createTargetPolygon,
  isConvexPolygon,
  pointInConvexPolygon,
  polygonArea,
  selectPopulationInterval,
} from "../geometry.js";

const target = createTargetPolygon();

test("the target and every population member are convex", () => {
  assert.equal(isConvexPolygon(target), true);

  for (const sliceCount of [8, 16, 32, 64, 128, 256]) {
    const population = createPopulation({ target, sliceCount });
    assert.equal(population.members.length, sliceCount * 2);
    for (const slice of population.slices) {
      assert.equal(isConvexPolygon(slice.growingNet), true);
      assert.equal(isConvexPolygon(slice.shrinkingAntiNet), true);
      assert.equal(isConvexPolygon(slice.body), true);
      assert.ok(polygonArea(slice.body) > 0);
    }
  }
});

test("every displayed interval body is intrinsically convex", () => {
  const population = createPopulation({ target, sliceCount: 64 });
  for (let start = 0; start <= 20; start += 1) {
    for (let end = start; end <= 20; end += 1) {
      const selection = selectPopulationInterval(population, start / 20, end / 20);
      assert.equal(isConvexPolygon(selection.body), true);
      assert.ok(polygonArea(selection.body) >= 0);
    }
  }
});

test("the net/anti-net intersection equals the union of consecutive bodies", () => {
  const sliceCount = 24;
  const population = createPopulation({ target, sliceCount });
  const memberCount = population.members.length;

  for (const [firstSlice, lastSlice] of [[0, 0], [2, 7], [6, 18], [0, 23], [20, 23]]) {
    const start = (firstSlice * 2) / memberCount;
    const end = ((lastSlice + 1) * 2) / memberCount;
    const selection = selectPopulationInterval(population, start, end);

    for (let xIndex = 0; xIndex <= 60; xIndex += 1) {
      for (let yIndex = 0; yIndex <= 60; yIndex += 1) {
        const point = { x: xIndex / 60, y: yIndex / 60 };
        if (!pointInConvexPolygon(point, target)) continue;
        const inConsecutiveUnion = population.slices
          .slice(firstSlice, lastSlice + 1)
          .some((slice) => pointInConvexPolygon(point, slice.body));
        const inConstructedBody = pointInConvexPolygon(point, selection.body);
        assert.equal(inConstructedBody, inConsecutiveUnion);
      }
    }
  }
});

test("growing an interval never decreases its body area", () => {
  const population = createPopulation({ target, sliceCount: 96 });
  let previousArea = 0;
  for (let end = 0.2; end <= 1.0001; end += 0.02) {
    const area = polygonArea(selectPopulationInterval(population, 0.2, Math.min(1, end)).body);
    assert.ok(area + 1e-10 >= previousArea);
    previousArea = area;
  }
});
