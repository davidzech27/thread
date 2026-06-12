import type { TemporalGraphStore } from "./temporal";

/**
 * Force layout over the *union* graph (every node that ever exists).
 * Computing one stable layout for the whole history — rather than
 * re-laying-out per timestep — means scrubbing through time never makes
 * nodes jump; time only changes what is visible.
 *
 * Placement: new nodes start on a radial ring by depth, inside an angular
 * wedge inherited from their parent, so subtrees fan out pre-separated
 * and relaxation only has to untangle locally. Repulsion uses a uniform
 * spatial hash (O(n · local density) per tick) with clamped distances and
 * capped velocities so dense clusters never explode.
 *
 * Dependency-free and deterministic: per-id hashes replace randomness, so
 * the same history always produces the same picture.
 */

export interface LayoutNode {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	depth: number;
	angle: number;
}

const RING_GAP = 95;
const EDGE_LENGTH = 54;
const REPULSION = 1900;
const REPULSION_RADIUS = 175;
const MIN_DIST = 6;
const MAX_VELOCITY = 26;
const SPRING = 0.05;
const CENTER_PULL = 0.008;
const FRICTION = 0.6;
const MIN_ALPHA = 0.004;

/** Deterministic per-id jitter so reloads produce identical layouts. */
function hashUnit(id: string, salt: number): number {
	let h = 2166136261 ^ salt;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return ((h >>> 0) % 100000) / 100000;
}

export class ForceLayout {
	nodes = new Map<string, LayoutNode>();
	private links: { a: LayoutNode; b: LayoutNode }[] = [];
	private linkKeys = new Set<string>();
	private degree = new Map<string, number>();
	private rootCount = 0;
	private alpha = 0;

	get settled(): boolean {
		return this.alpha < MIN_ALPHA;
	}

	clear() {
		this.nodes.clear();
		this.links = [];
		this.linkKeys.clear();
		this.degree.clear();
		this.rootCount = 0;
		this.alpha = 0;
	}

	/** Fold any new nodes/edges from the store into the simulation. */
	sync(store: TemporalGraphStore) {
		let added = 0;
		for (const node of store.nodes.values()) {
			if (this.nodes.has(node.id)) continue;
			added++;
			const parent = node.parentId
				? this.nodes.get(node.parentId)
				: undefined;
			let depth: number;
			let angle: number;
			let radius: number;
			if (parent) {
				depth = parent.depth + 1;
				// Children scatter inside a wedge around the parent's
				// direction; the wedge narrows with depth so cousins
				// don't cross.
				const spread = 2.4 / Math.pow(depth, 1.1);
				angle = parent.angle + (hashUnit(node.id, 1) - 0.5) * spread;
				radius = depth * RING_GAP * (0.85 + 0.3 * hashUnit(node.id, 2));
			} else {
				depth = 0;
				angle = hashUnit(node.id, 1) * Math.PI * 2;
				// First root sits at the origin; later roots (new runs)
				// land on an outer ring so histories don't overlap.
				radius =
					this.rootCount === 0
						? 0
						: 700 + 350 * hashUnit(node.id, 3);
				this.rootCount++;
			}
			this.nodes.set(node.id, {
				id: node.id,
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
				vx: 0,
				vy: 0,
				depth,
				angle,
			});
		}
		for (const edge of store.edges.values()) {
			if (this.linkKeys.has(edge.id)) continue;
			const a = this.nodes.get(edge.source);
			const b = this.nodes.get(edge.target);
			if (!a || !b) continue;
			this.linkKeys.add(edge.id);
			this.links.push({ a, b });
			this.degree.set(a.id, (this.degree.get(a.id) ?? 0) + 1);
			this.degree.set(b.id, (this.degree.get(b.id) ?? 0) + 1);
			added++;
		}
		if (added > 0)
			this.alpha = Math.max(this.alpha, added > 100 ? 0.55 : 0.3);
	}

	/** Run ticks until the time budget (ms) is spent or the layout settles. */
	relax(budgetMs: number): boolean {
		if (this.settled || this.nodes.size === 0) return false;
		const deadline = performance.now() + budgetMs;
		do {
			this.tick();
		} while (this.alpha >= MIN_ALPHA && performance.now() < deadline);
		return true;
	}

	private tick() {
		const alpha = this.alpha;
		const nodes = [...this.nodes.values()];

		// Spatial hash for short-range repulsion.
		const cell = REPULSION_RADIUS;
		const grid = new Map<number, LayoutNode[]>();
		for (const node of nodes) {
			const key =
				(Math.floor(node.x / cell) * 73856093) ^
				(Math.floor(node.y / cell) * 19349663);
			const bucket = grid.get(key);
			if (bucket) bucket.push(node);
			else grid.set(key, [node]);
		}

		const r2 = REPULSION_RADIUS * REPULSION_RADIUS;
		const min2 = MIN_DIST * MIN_DIST;
		for (const a of nodes) {
			const gx = Math.floor(a.x / cell);
			const gy = Math.floor(a.y / cell);
			for (let ix = gx - 1; ix <= gx + 1; ix++) {
				for (let iy = gy - 1; iy <= gy + 1; iy++) {
					const bucket = grid.get((ix * 73856093) ^ (iy * 19349663));
					if (!bucket) continue;
					for (const b of bucket) {
						if (b === a) continue;
						let dx = a.x - b.x;
						let dy = a.y - b.y;
						let d2 = dx * dx + dy * dy;
						if (d2 >= r2) continue;
						if (d2 < 1) {
							// Coincident nodes: split deterministically.
							const j = hashUnit(a.id, 7) * Math.PI * 2;
							dx = Math.cos(j);
							dy = Math.sin(j);
							d2 = 1;
						}
						if (d2 < min2) d2 = min2;
						const d = Math.sqrt(d2);
						const f = (REPULSION / d2) * alpha;
						a.vx += (dx / d) * f;
						a.vy += (dy / d) * f;
					}
				}
			}
		}

		for (const { a, b } of this.links) {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const d = Math.sqrt(dx * dx + dy * dy) || 1;
			// Hubs get longer spokes so their children ring out cleanly.
			const deg = Math.max(
				this.degree.get(a.id) ?? 1,
				this.degree.get(b.id) ?? 1,
			);
			const target = EDGE_LENGTH + 3.5 * Math.min(14, deg);
			const f = (d - target) * SPRING * alpha;
			const fx = (dx / d) * f;
			const fy = (dy / d) * f;
			a.vx += fx;
			a.vy += fy;
			b.vx -= fx;
			b.vy -= fy;
		}

		for (const node of nodes) {
			node.vx -= node.x * CENTER_PULL * alpha;
			node.vy -= node.y * CENTER_PULL * alpha;
			node.vx *= FRICTION;
			node.vy *= FRICTION;
			const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
			if (speed > MAX_VELOCITY) {
				node.vx = (node.vx / speed) * MAX_VELOCITY;
				node.vy = (node.vy / speed) * MAX_VELOCITY;
			}
			node.x += node.vx;
			node.y += node.vy;
		}

		this.alpha *= nodes.length > 1500 ? 0.988 : 0.985;
	}
}
