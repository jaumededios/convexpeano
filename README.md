# Convex Peano

A minimal interactive visualization inspired by Adam Paszkiewicz’s [*The Convex Peano Curve Does Exist*](https://arxiv.org/abs/2407.03016).

The renderer visualizes a finite ordered population of overlapping convex bodies. It follows the paper’s local net/anti-net mechanism:

```text
tᵢ = Aᵢ ∩ Bᵢ
⋃(i=k…l) tᵢ = Aₗ ∩ Bₖ
```

Here `Aᵢ` is an increasing family of convex cones and `Bᵢ` is a decreasing one. Therefore the displayed image of every selected interval is an intersection of convex sets—not a hull computed after rendering. Each base is repeated twice, mirroring Step II of Lemma 3.3.8 before the paper’s anti-ordering and alternating refinements.

This is a finite visualization of the construction mechanism, not a numerical realization of the paper’s full infinite curve.

## Run and test

```sh
npm run dev
npm run check
```
