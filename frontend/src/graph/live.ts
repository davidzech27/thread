import type { TemporalGraphStore } from "./temporal";
import type { GraphEvent, GraphNodeStatus } from "./types";

/**
 * Adapts the backend's WebSocket messages into temporal graph events, so
 * the activity view records live runs with full scrub-back history.
 */

const STATUS_MAP: Record<string, GraphNodeStatus> = {
	idle: "idle",
	running: "running",
	completed: "completed",
	error: "error",
	awaiting_user: "awaiting",
	deleted: "removed",
};

function salienceFor(status: GraphNodeStatus, isRoot: boolean): number {
	if (isRoot) return 1;
	switch (status) {
		case "awaiting":
			return 0.85;
		case "error":
			return 0.8;
		case "running":
			return 0.6;
		case "completed":
			return 0.3;
		default:
			return 0.35;
	}
}

export function applyServerMessage(store: TemporalGraphStore, msg: any) {
	const t = Date.now();
	const events: GraphEvent[] = [];

	if (msg.type === "agent-state" && msg.state?.agentId) {
		const { agentId, parentId, status: rawStatus, result } = msg.state;
		const status = STATUS_MAP[rawStatus] ?? "running";
		const isRoot = !parentId;
		const isNew = !store.nodes.has(agentId);
		events.push({
			type: "node",
			t,
			id: agentId,
			label: isNew
				? isRoot
					? "master"
					: `agent ${agentId.substring(0, 8)}`
				: undefined,
			parent: parentId ?? undefined,
			status,
			salience: salienceFor(status, isRoot),
		});
		if (isNew && parentId) {
			events.push({
				type: "edge",
				t,
				source: parentId,
				target: agentId,
				kind: "spawn",
				salience: 0.5,
			});
		}
		if (result && isNew) events.push({ type: "content", t, id: agentId, append: result });
	} else if (msg.type === "text-delta" && msg.agentId) {
		const delta = msg.delta || msg.textDelta || "";
		if (delta) events.push({ type: "content", t, id: msg.agentId, append: delta });
	} else if (msg.type === "user-query" && msg.agentId) {
		const node = store.nodes.get(msg.agentId);
		events.push({
			type: "node",
			t,
			id: msg.agentId,
			status: "awaiting",
			salience: salienceFor("awaiting", !node?.parentId),
			meta: { question: msg.prompt },
		});
	}

	if (events.length > 0) store.apply(events);
}
