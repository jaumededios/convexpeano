/** Convert a Hilbert-curve index to an integer grid coordinate. */
export function hilbertIndexToXY(order, index) {
  const side = 2 ** order;
  let x = 0;
  let y = 0;
  let t = Math.max(0, Math.min(side * side - 1, Math.floor(index)));

  for (let scale = 1; scale < side; scale *= 2) {
    const rx = 1 & Math.floor(t / 2);
    const ry = 1 & (t ^ rx);

    if (ry === 0) {
      if (rx === 1) {
        x = scale - 1 - x;
        y = scale - 1 - y;
      }
      [x, y] = [y, x];
    }

    x += scale * rx;
    y += scale * ry;
    t = Math.floor(t / 4);
  }

  return { x, y };
}

/**
 * Split an integer interval into maximal base-4-aligned blocks.
 * Each block is one recursive Hilbert square, so drawing cost is O(order).
 */
export function decomposeInterval(start, end, total) {
  let cursor = Math.max(0, Math.min(total, Math.floor(start)));
  const limit = Math.max(cursor, Math.min(total, Math.ceil(end)));
  const blocks = [];

  while (cursor < limit) {
    const remaining = limit - cursor;
    let count = 1;

    while (count * 4 <= remaining && cursor % (count * 4) === 0) {
      count *= 4;
    }

    blocks.push({ start: cursor, count });
    cursor += count;
  }

  return blocks;
}

/** Turn recursive index blocks into normalized square bounds. */
export function blocksToSquares(order, blocks) {
  const gridSide = 2 ** order;

  return blocks.map((block) => {
    const blockSide = Math.sqrt(block.count);
    const point = hilbertIndexToXY(order, block.start);
    const x = Math.floor(point.x / blockSide) * blockSide;
    const y = Math.floor(point.y / blockSide) * blockSide;

    return {
      x: x / gridSide,
      y: y / gridSide,
      size: blockSide / gridSide,
      count: block.count,
      start: block.start,
    };
  });
}

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** Andrew's monotone-chain convex hull. */
export function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point.x}:${point.y}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y);

  if (unique.length <= 1) return unique;

  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }

  const upper = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function squareCorners(square) {
  return [
    { x: square.x, y: square.y },
    { x: square.x + square.size, y: square.y },
    { x: square.x + square.size, y: square.y + square.size },
    { x: square.x, y: square.y + square.size },
  ];
}
