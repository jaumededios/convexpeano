# Convex Peano

A minimal interactive visualization inspired by Adam Paszkiewicz’s [*The Convex Peano Curve Does Exist*](https://arxiv.org/abs/2407.03016).

The browser builds alternating populations from increasing convex nets, decreasing anti-nets, localized stations, duplicated bodies, and anti-ordering. Children stay inside and cover their parent; increasing the resolution makes the finest bodies smaller. The canvas joins the centers of consecutive bodies to form a continuous polygonal approximant and renders only the subpath selected by the interval slider.

This is a visual analogue of the paper’s nested populations, stations, and anti-ordering—not a literal numerical execution of the full existential proof.

## Run and test

```sh
npm run dev
npm run check
```
