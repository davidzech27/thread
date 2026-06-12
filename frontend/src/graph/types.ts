/**
 * Temporal graph primitives.
 *
 * A graph's history is an append-only log of upsert events. Every node and
 * edge keeps a sparse timeline of samples so the full graph state can be
 * reconstructed at any instant `t` — which is what lets the view scrub,
 * play back, and follow live data with one code path.
 */

export type GraphNodeStatus =
	| "idle"
	| "running"
	| "awaiting"
	| "completed"
	| "error"
	| "removed";

/** States that warrant attention get the only color in the UI. */
export const ATTENTION_STATUSES: GraphNodeStatus[] = [
	"running",
	"awaiting",
	"error",
];

export interface NodeSample {
	t: number;
	status: GraphNodeStatus;
	/** 0..1 — drives size and opacity in the canvas. */
	salience: number;
	/** Sparse metadata; merged chronologically when inspected. */
	meta?: Record<string, string | number>;
}

export interface EdgeSample {
	t: number;
	salience: number;
}

export interface TemporalNode {
	id: string;
	label: string;
	born: number;
	parentId?: string;
	samples: NodeSample[];
	/** Latest streamed content (not versioned — shown in the sidebar). */
	content?: string;
}

export interface TemporalEdge {
	id: string;
	source: string;
	target: string;
	kind: string;
	born: number;
	samples: EdgeSample[];
}

/** A status change, kept for the timeline tick lane and event feed. */
export interface Transition {
	t: number;
	nodeId: string;
	status: GraphNodeStatus;
}

export type GraphEvent =
	| {
			type: "node";
			t: number;
			id: string;
			label?: string;
			parent?: string;
			status?: GraphNodeStatus;
			salience?: number;
			meta?: Record<string, string | number>;
	  }
	| {
			type: "edge";
			t: number;
			source: string;
			target: string;
			kind?: string;
			salience?: number;
	  }
	| { type: "content"; t: number; id: string; append: string };

export type GraphSelection =
	| { kind: "node"; id: string }
	| { kind: "edge"; id: string };

export const STATUS_COLOR: Record<GraphNodeStatus, string> = {
	running: "#2563eb",
	awaiting: "#d97706",
	error: "#dc2626",
	completed: "#1c1917",
	idle: "#a8a29e",
	removed: "transparent",
};

export const STATUS_LABEL: Record<GraphNodeStatus, string> = {
	running: "running",
	awaiting: "awaiting input",
	error: "error",
	completed: "completed",
	idle: "idle",
	removed: "removed",
};
