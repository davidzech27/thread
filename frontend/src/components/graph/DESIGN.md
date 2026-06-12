# Activity view — design notes

A minimalist way to watch large graphs evolve over time. Built for
thousands of nodes/edges of varying salience, with rich per-element
state, while staying quiet enough to read at a glance.

## Principles

**Ink for structure, color for attention.** Nodes are circles on paper;
salience drives size (√-scaled radius) and opacity, so unimportant
structure recedes into texture instead of being hidden. The only color
in the view marks states that need attention — blue `running`, amber
`awaiting input`, red `error`. Completed work goes back to neutral ink;
idle nodes are stroke-only. This is the high-level state overview: at
any zoom, what matters is exactly what is colored.

**Time is an axis, not a refresh.** The graph's history is an
append-only event log (`graph/temporal.ts`); every node/edge keeps a
sparse timeline of samples, so the whole graph can be reconstructed at
any instant. The strip along the bottom is both overview and control:

- stacked bands count nodes per state over the entire run — the shape
  of the run in one glance (ramp-up, error clusters, wind-down);
- the thin lane above it ticks the exact instants of salient
  transitions (errors, input requests);
- the same strip is the scrubber: drag to time-travel, play back at
  1×/8×/32×, or pin to `live`.

**Layout is computed once, over the union graph.** All nodes that ever
exist are laid out together (`graph/layout.ts`), so scrubbing never
makes nodes jump — time only changes visibility and state. New nodes
spawn inside an angular wedge inherited from their parent on a radial
ring per depth, then a budgeted force relaxation (spatial-hash
repulsion, capped velocities, hub-aware edge lengths) untangles
locally. Deterministic: per-id hashes replace randomness.

**Detail lives in the sidebar; the canvas stays clean.** Selecting a
node shows its status (and how long it has held it), a salience meter,
a status-history band of its lifetime, merged metadata at the current
time, streamed content, connections, and an event log. Selecting an
edge shows endpoints and kind. With nothing selected the sidebar
summarizes the run at the playhead: totals, per-state counts, the
most-salient list, and a recent-activity feed — all clickable.

**The chip row is the one-line readout.** Top-left, outside the
sidebar: node/edge totals plus a chip per nonzero attention state
(`● 86 running · ● 3 awaiting · ● 2 error`). Clicking a chip cycles the
camera through those nodes, most salient first.

## Behaviors

- Camera auto-frames the growing graph until you pan/zoom; `f`,
  double-click, or the `fit` button hand framing back.
- Hover rings a node and forces its label; selection lifts the 1-hop
  neighborhood and dims the rest.
- Labels are budgeted by zoom, granted to the most salient visible
  nodes, and collision-rejected — text never stacks.
- Keyboard: `space` play/pause · `←/→` step (`shift` ×10) · `f` fit ·
  `esc` clear selection.
- Live runs are recorded as they stream (`graph/live.ts`); scrub back
  any time, then hit `live` to rejoin the present.

## Performance

Canvas 2D, no DOM per element. Edges batch into a handful of `Path2D`
strokes by quantized opacity; per-frame state lookups are binary
searches over per-node timelines; the strip's bands rebuild in one
O(transitions + buckets) sweep on a cached offscreen canvas. The render
loop draws only when something changed (time, camera, hover, data,
pulse animation), so an idle view costs nothing.
