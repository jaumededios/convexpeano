# Mathematical model for a convex Peano visualization

This note is the correctness contract for the next implementation. It follows
the structure of Adam Paszkiewicz's *The Convex Peano Curve Does Exist*, while
allowing the finite numerical construction to be adaptive rather than using the
paper's deliberately uniform worst-case constants.

## 1. The curve is the limit, not a line through cells

At level `j`, let

\[
  \mathcal P_j=(T_{j,1},\ldots,T_{j,N_j})
\]

be an ordered family of compact convex bodies. The paper needs four properties:

1. `P_j` covers the target `T`.
2. Every consecutive union
   \(T_{j,k}\cup\cdots\cup T_{j,l}\) is convex.
3. Every parent is exactly the union of one contiguous block of children.
4. The largest cell diameter tends to zero.

Equal partitions of `[0,1]` use the same indices. For a parameter `u`, the
nested cells containing its level-by-level parameter intervals shrink to one
point; that point is `f(u)`. The equality

\[
 f\left([ (K-1)/N_j,K/N_j ]\right)=T_{j,K}
\]

comes from the entire infinite refinement below `T_{j,K}`. A centroid of
`T_{j,K}` is not the finite-stage value of the curve, and joining centroids does
not preserve interval images.

## 2. Populations and souls

A **population** is an ordered family whose every consecutive union is convex.
Testing only individual cells or adjacent overlaps is insufficient.

The paper certifies populations through **souls** `(t,t1)`:

- `t` is a convex base;
- `t1` is a disturbance;
- `t \ t1` is also convex.

In a regular sequence, every base occurs twice. The odd/even disturbances are
the differences toward the preceding/following base. A consistency condition
keeps opposing disturbances equal, separated, or absorbed by intervening
bases. Regularity plus consistency implies that the bases form a population.

The duplicated cells are therefore structural. They encode entry and exit
information needed when the children of alternate parents are reversed.

## 3. One directional offspring

For a parent soul `(t,t1)` and a chosen axis, the paper constructs:

- an increasing convex net `A_i` for the undisturbed core `t \ t1`;
- a station that inserts the small disturbance `t1` into that net;
- a decreasing convex anti-net `B_i` for the full base `t`;
- stretches of both sequences so their spatial skeletons remain aligned.

The unduplicated child bodies have the essential form

\[
 C_i=A_i\cap B_i.
\]

The net and anti-net are wide enough to cover `t`, but their intersection is
thin in the chosen axis. Each `C_i` is then duplicated. Offspring blocks are
concatenated in alternating forward/reverse order.

The station and its dependence rules make the last child geometry of one
parent compatible with the first child geometry of the next. Omitting this
step produces an ordinary serpentine grid: individual cells are convex, but a
partial row plus a partial neighboring row has a non-convex union.

## 4. Alternating refinement

An x-thin generation alone still has large y-diameter. The next generation is
y-thin, the next x-thin, and so on. The directional bounds are monotone under
refinement, so choosing tolerances `gamma_j -> 0` makes the full diameter tend
to zero.

The browser's resolution states must therefore be prefixes of one nested tree.
They cannot be independently regenerated populations, and neither directional
station count may remain bounded as resolution increases.

## 5. A valid finite curve approximant

For adjacent cells `T_i,T_{i+1}`, choose a portal in their intersection. Inside
each convex `T_i`, join its incoming and outgoing portals. This gives a
continuous level path that stays inside the population. Recursively replace
the portion inside each parent with its child traversal.

This path still has empty area at every finite depth. The convex footprint of a
parameter interval is represented by the union of all complete level cells in
that interval plus the recursively refined endpoint cells. As depth increases,
the portal path becomes dense in the same footprint.

Thus a future line-only view must draw a very deep recursive portal path or a
dense sample of the limiting selector. Convexity should be checked against the
cell footprint, not inferred from the appearance of a shallow polyline.

## 6. Proposed numerical construction

Use the paper's invariants as exact requirements but make the geometric choices
adaptive for the one target being displayed:

1. Represent every base as a convex polygon with robust intersection, hull,
   containment, and area operations.
2. Represent a disturbance implicitly as `base \ core`; do not approximate it
   by a convex polygon.
3. Build cap nets and anti-nets from supporting disks or half-planes.
4. Build a station as a certified nested chain from `core` to `base`, adding
   spatially separated small increments.
5. Align net skeletons, intersect them, duplicate the results, and anti-order
   parent blocks.
6. Retain parent/child ranges to create a genuinely nested tree across all
   resolution settings.
7. Adaptively increase station length or overlap only when an invariant fails.

This is faithful to the proof's mechanism without attempting to instantiate
its enormous uniform bounds, whose purpose is existence for every admissible
target rather than an economical drawing of one rounded square.

## 7. Acceptance tests before visualization

The mathematical engine is not ready until all of these pass for every exposed
depth:

- every base and core is convex with non-empty interior;
- every soul satisfies `core subset base`;
- every offspring block covers its parent exactly;
- every child belongs to exactly one contiguous parent block;
- regularity and consistency certificates survive anti-ordering;
- every consecutive union is convex at small exhaustive test sizes;
- x- and y-diameters decrease on alternating generations;
- maximum full diameter decreases after every pair of generations;
- adjacent cells have non-empty intersections and portal paths stay inside;
- every resolution is a prefix of the same refinement tree.

Only after these tests pass should segment count, rendering density, or slider
performance be optimized.

## 8. Station experiments

Three finite stations have been compared:

- Grid patches followed by convex hulls are inexpensive, but a hull update can
  expose a long remote edge. Small tiles do not by themselves bound the actual
  disturbance diameter.
- Adding outer-boundary vertices in cyclic order has the same failure when an
  added point sees a long supporting face of the inner polygon.
- Relaxing the supporting half-planes of the inner body toward the support
  values of the outer body gives an exact convex, nested station. It does not
  yet give the paper's locality estimate: moving one support adds a thin strip,
  but that strip can run along a long supporting face. Reducing the relaxation
  step controls the strip's thickness without necessarily controlling its
  diameter.

The support-relaxation station is useful as a diagnostic baseline, not yet a
finished replacement for the paper's station. Curved caps must be sampled and
ordered so that both the relaxation width and exposed-face length shrink. The
other engineering problem is combinatorial growth: a faithful station may
contain hundreds of states, and materializing the full Cartesian offspring
tree is not viable. The tree will need a procedural/lazy representation, with
exact parent ranges and only the requested parameter branches or screen-level
samples expanded.
