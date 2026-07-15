import test from "node:test";
import assert from "node:assert/strict";

import {
  blocksToSquares,
  convexHull,
  decomposeInterval,
  hilbertIndexToXY,
  squareCorners,
} from "../geometry.js";

test("Hilbert coordinates visit every grid cell exactly once", () => {
  for (let order = 1; order <= 6; order += 1) {
    const total = 4 ** order;
    const visited = new Set();
    for (let index = 0; index < total; index += 1) {
      const { x, y } = hilbertIndexToXY(order, index);
      visited.add(`${x}:${y}`);
    }
    assert.equal(visited.size, total);
  }
});

test("successive Hilbert coordinates share an edge", () => {
  const order = 7;
  for (let index = 1; index < 4 ** order; index += 1) {
    const a = hilbertIndexToXY(order, index - 1);
    const b = hilbertIndexToXY(order, index);
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1);
  }
});

test("interval decomposition is exact and base-4 aligned", () => {
  const total = 4 ** 8;
  const blocks = decomposeInterval(123, 52_019, total);
  assert.equal(blocks[0].start, 123);
  assert.equal(blocks.at(-1).start + blocks.at(-1).count, 52_019);
  assert.equal(blocks.reduce((sum, block) => sum + block.count, 0), 52_019 - 123);

  for (const block of blocks) {
    assert.equal(block.start % block.count, 0);
    assert.equal(Number.isInteger(Math.log(block.count) / Math.log(4)), true);
  }
});

test("each recursive index block maps to one square", () => {
  const order = 5;
  const total = 4 ** order;
  const blocks = decomposeInterval(17, total - 9, total);
  const squares = blocksToSquares(order, blocks);

  blocks.forEach((block, blockIndex) => {
    const square = squares[blockIndex];
    const side = 2 ** order;
    const minX = square.x * side;
    const minY = square.y * side;
    const maxX = minX + square.size * side;
    const maxY = minY + square.size * side;

    for (let index = block.start; index < block.start + block.count; index += 1) {
      const point = hilbertIndexToXY(order, index);
      assert.ok(point.x >= minX && point.x < maxX);
      assert.ok(point.y >= minY && point.y < maxY);
    }
  });
});

test("convex hull wraps square blocks and drops interior points", () => {
  const squares = [
    { x: 0, y: 0, size: 0.5 },
    { x: 0.5, y: 0, size: 0.5 },
  ];
  const hull = convexHull(squares.flatMap(squareCorners));
  assert.deepEqual(hull, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0, y: 0.5 },
  ]);
});
