# Convex Peano

An interactive computational sketch inspired by Adam Paszkiewicz’s paper [*The Convex Peano Curve Does Exist*](https://arxiv.org/abs/2407.03016).

Choose an interval `[a,b] ⊂ [0,1]`, change the recursive resolution, and watch its approximate image occupy the unit square. The demo uses a Hilbert traversal for a fast finite approximation and explicitly draws the selected image’s convex envelope. It is an analogy for the paper’s construction, not a numerical implementation of its proof.

## Run locally

```sh
npm run dev
```

Then open <http://localhost:4173>.

The project is designed to publish as a GitHub Pages project site at `/convexpeano/`. Because every asset URL is relative, it also works at the local server root.

## How the fast rendering works

At level `n`, the interval selects a contiguous range among `4ⁿ` Hilbert cells. That integer range is decomposed into maximal base-4-aligned blocks. Every block maps to one recursive square, so only `O(n)` rectangles and hull candidates need to be drawn while dragging—even at level 10 (1,048,576 cells).

## Validate

```sh
npm run check
```
