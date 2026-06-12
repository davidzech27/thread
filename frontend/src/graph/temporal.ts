import { createSignal } from "solid-js";
import type {
	EdgeSample,
	GraphEvent,
	GraphNodeStatus,
	NodeSample,
	TemporalEdge,
	TemporalNode,
	Transition,
} from "./types";

/** Binary search: index of the last sample with `t <= time`, or -1. */
function lastIndexAt(samples: { t: number }[], time: number): number {
	let lo = 0;
	let hi = samples.length - 1;
	let ans = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].t <= time) {
			ans = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return ans;
}

export function edgeId(source: string, target: string): string {
	return `${source}→${target}`;
}

/**
 * Holds a graph's full history and answers "what did the graph look like
 * at time t". Mutation is imperative for render-loop performance; a single
 * version signal lets Solid components react to changes.
 */
export class TemporalGraphStore {
	nodes = new Map<string, TemporalNode>();
	edges = new Map<string, TemporalEdge>();
	/** Status changes in chronological order (includes births). */
	transitions: Transition[] = [];
	t0: number | null = null;
	tEnd: number | null = null;

	private versionSignal = createSignal(0);
	/** Reactive read; bumped once per applied batch. */
	version = this.versionSignal[0];

	private bump() {
		this.versionSignal[1]((v) => v + 1);
	}

	clear() {
		this.nodes.clear();
		this.edges.clear();
		this.transitions = [];
		this.t0 = null;
		this.tEnd = null;
		this.bump();
	}

	apply(events: GraphEvent[]) {
		if (events.length === 0) return;
		for (const ev of events) {
			if (this.t0 === null || ev.t < this.t0) this.t0 = ev.t;
			if (this.tEnd === null || ev.t > this.tEnd) this.tEnd = ev.t;
			if (ev.type === "node") this.applyNode(ev);
			else if (ev.type === "edge") this.applyEdge(ev);
			else this.applyContent(ev);
		}
		this.bump();
	}

	private applyNode(ev: Extract<GraphEvent, { type: "node" }>) {
		let node = this.nodes.get(ev.id);
		if (!node) {
			node = {
				id: ev.id,
				label: ev.label ?? ev.id,
				born: ev.t,
				parentId: ev.parent,
				samples: [],
			};
			this.nodes.set(ev.id, node);
		} else {
			if (ev.label) node.label = ev.label;
			if (ev.parent && !node.parentId) node.parentId = ev.parent;
		}
		const prev = node.samples[node.samples.length - 1];
		const sample: NodeSample = {
			t: ev.t,
			status: ev.status ?? prev?.status ?? "idle",
			salience: ev.salience ?? prev?.salience ?? 0.3,
			meta: ev.meta,
		};
		// Collapse same-timestamp updates instead of stacking duplicates.
		if (prev && prev.t === sample.t) {
			prev.status = sample.status;
			prev.salience = sample.salience;
			if (sample.meta) prev.meta = { ...prev.meta, ...sample.meta };
			return;
		}
		node.samples.push(sample);
		if (!prev || prev.status !== sample.status) {
			this.transitions.push({ t: ev.t, nodeId: node.id, status: sample.status });
		}
	}

	private applyEdge(ev: Extract<GraphEvent, { type: "edge" }>) {
		const id = edgeId(ev.source, ev.target);
		let edge = this.edges.get(id);
		if (!edge) {
			edge = {
				id,
				source: ev.source,
				target: ev.target,
				kind: ev.kind ?? "link",
				born: ev.t,
				samples: [],
			};
			this.edges.set(id, edge);
		}
		const prev = edge.samples[edge.samples.length - 1];
		const sample: EdgeSample = {
			t: ev.t,
			salience: ev.salience ?? prev?.salience ?? 0.3,
		};
		if (prev && prev.t === sample.t) {
			prev.salience = sample.salience;
			return;
		}
		edge.samples.push(sample);
	}

	private applyContent(ev: Extract<GraphEvent, { type: "content" }>) {
		const node = this.nodes.get(ev.id);
		if (node) node.content = (node.content ?? "") + ev.append;
	}

	nodeAt(node: TemporalNode, t: number): NodeSample | null {
		if (t < node.born) return null;
		const i = lastIndexAt(node.samples, t);
		return i >= 0 ? node.samples[i] : null;
	}

	edgeAt(edge: TemporalEdge, t: number): EdgeSample | null {
		if (t < edge.born) return null;
		const i = lastIndexAt(edge.samples, t);
		return i >= 0 ? edge.samples[i] : null;
	}

	/** Both endpoints must exist (and not be removed) for an edge to show. */
	edgeVisibleAt(edge: TemporalEdge, t: number): EdgeSample | null {
		const sample = this.edgeAt(edge, t);
		if (!sample) return null;
		const s = this.nodes.get(edge.source);
		const d = this.nodes.get(edge.target);
		if (!s || !d) return null;
		const ss = this.nodeAt(s, t);
		const ds = this.nodeAt(d, t);
		if (!ss || !ds || ss.status === "removed" || ds.status === "removed")
			return null;
		return sample;
	}

	countsAt(t: number): Record<GraphNodeStatus, number> & { edges: number } {
		const counts = {
			idle: 0,
			running: 0,
			awaiting: 0,
			completed: 0,
			error: 0,
			removed: 0,
			edges: 0,
		};
		for (const node of this.nodes.values()) {
			const s = this.nodeAt(node, t);
			if (s) counts[s.status]++;
		}
		for (const edge of this.edges.values()) {
			if (this.edgeVisibleAt(edge, t)) counts.edges++;
		}
		return counts;
	}

	topSalient(t: number, n: number): { node: TemporalNode; sample: NodeSample }[] {
		const out: { node: TemporalNode; sample: NodeSample }[] = [];
		for (const node of this.nodes.values()) {
			const sample = this.nodeAt(node, t);
			if (sample && sample.status !== "removed") out.push({ node, sample });
		}
		out.sort((a, b) => b.sample.salience - a.sample.salience);
		return out.slice(0, n);
	}

	/** Metadata as of time t, merged across samples. */
	metaAt(node: TemporalNode, t: number): Record<string, string | number> {
		const merged: Record<string, string | number> = {};
		for (const s of node.samples) {
			if (s.t > t) break;
			if (s.meta) Object.assign(merged, s.meta);
		}
		return merged;
	}

	nodesWithStatusAt(t: number, status: GraphNodeStatus): TemporalNode[] {
		const out: { node: TemporalNode; salience: number }[] = [];
		for (const node of this.nodes.values()) {
			const s = this.nodeAt(node, t);
			if (s && s.status === status) out.push({ node, salience: s.salience });
		}
		out.sort((a, b) => b.salience - a.salience);
		return out.map((x) => x.node);
	}

	recentTransitions(t: number, n: number): Transition[] {
		const i = lastIndexAt(
			this.transitions as unknown as { t: number }[],
			t,
		);
		const start = Math.max(0, i + 1 - n);
		return this.transitions.slice(start, i + 1).reverse();
	}
}
