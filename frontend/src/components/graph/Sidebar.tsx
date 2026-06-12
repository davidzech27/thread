import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { fmtClock, fmtNum } from "../../graph/format";
import type { TemporalGraphStore } from "../../graph/temporal";
import type {
	GraphNodeStatus,
	GraphSelection,
	TemporalNode,
} from "../../graph/types";
import { STATUS_COLOR, STATUS_LABEL } from "../../graph/types";

/**
 * The inspector: all of the graph's detailed state lives here, keeping
 * the canvas itself free of chrome. With nothing selected it summarizes
 * the run at the current instant; with a node or edge pinned it shows
 * that element's full state and history.
 */

interface SidebarProps {
	store: TemporalGraphStore;
	time: () => number;
	selection: () => GraphSelection | null;
	onSelect: (sel: GraphSelection | null) => void;
	onFly: (id: string) => void;
}

function Dot(props: { status: GraphNodeStatus; class?: string }) {
	return (
		<span
			class={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${props.class ?? ""}`}
			style={{
				"background-color": STATUS_COLOR[props.status],
				opacity:
					props.status === "completed"
						? 0.55
						: props.status === "idle"
							? 0.45
							: 0.9,
			}}
		/>
	);
}

function SectionTitle(props: { children: JSX.Element }) {
	return (
		<div class="px-4 pt-5 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">
			{props.children}
		</div>
	);
}

function Row(props: { label: string; value: JSX.Element }) {
	return (
		<div class="flex items-baseline justify-between gap-3 px-4 py-[5px]">
			<span class="text-[11px] text-stone-400">{props.label}</span>
			<span class="text-right font-mono text-[11px] text-stone-700 tabular-nums break-all">
				{props.value}
			</span>
		</div>
	);
}

export function Sidebar(props: SidebarProps) {
	const t0 = () => props.store.t0 ?? props.time();
	const clock = (t: number) => fmtClock(t - t0());

	const selectedNode = createMemo<TemporalNode | null>(() => {
		props.store.version();
		const sel = props.selection();
		if (sel?.kind !== "node") return null;
		return props.store.nodes.get(sel.id) ?? null;
	});

	const selectedEdge = createMemo(() => {
		props.store.version();
		const sel = props.selection();
		if (sel?.kind !== "edge") return null;
		return props.store.edges.get(sel.id) ?? null;
	});

	const nodeRow = (node: TemporalNode, extra?: string) => {
		const sample = props.store.nodeAt(node, props.time());
		if (!sample) return null;
		return (
			<button
				type="button"
				class="flex w-full items-center gap-2 px-4 py-[5px] text-left hover:bg-stone-50"
				onClick={() => {
					props.onSelect({ kind: "node", id: node.id });
					props.onFly(node.id);
				}}
			>
				<Dot status={sample.status} />
				<span class="min-w-0 flex-1 truncate text-[11px] text-stone-700">
					{node.label}
				</span>
				<Show when={extra}>
					<span class="font-mono text-[10px] text-stone-400">{extra}</span>
				</Show>
			</button>
		);
	};

	// ── Summary (nothing selected) ──────────────────────────────────────
	const Summary = () => {
		const counts = createMemo(() => {
			props.store.version();
			return props.store.countsAt(props.time());
		});
		const top = createMemo(() => {
			props.store.version();
			return props.store.topSalient(props.time(), 10);
		});
		const recent = createMemo(() => {
			props.store.version();
			return props.store.recentTransitions(props.time(), 12);
		});
		const visibleTotal = () =>
			counts().idle +
			counts().running +
			counts().awaiting +
			counts().completed +
			counts().error;

		return (
			<>
				<SectionTitle>run</SectionTitle>
				<Row label="nodes" value={fmtNum(visibleTotal())} />
				<Row label="edges" value={fmtNum(counts().edges)} />
				<Row label="elapsed" value={clock(props.time())} />

				<SectionTitle>state</SectionTitle>
				<For
					each={
						["running", "awaiting", "error", "completed", "idle"] as GraphNodeStatus[]
					}
				>
					{(status) => (
						<div class="flex items-center justify-between px-4 py-[5px]">
							<span class="flex items-center gap-2 text-[11px] text-stone-500">
								<Dot status={status} />
								{STATUS_LABEL[status]}
							</span>
							<span class="font-mono text-[11px] text-stone-700 tabular-nums">
								{fmtNum(counts()[status])}
							</span>
						</div>
					)}
				</For>

				<Show when={top().length > 0}>
					<SectionTitle>most salient</SectionTitle>
					<For each={top()}>
						{(item) => nodeRow(item.node, item.sample.salience.toFixed(2))}
					</For>
				</Show>

				<Show when={recent().length > 0}>
					<SectionTitle>recent activity</SectionTitle>
					<For each={recent()}>
						{(tr) => {
							const node = props.store.nodes.get(tr.nodeId);
							return (
								<button
									type="button"
									class="flex w-full items-center gap-2 px-4 py-[5px] text-left hover:bg-stone-50"
									onClick={() =>
										props.onSelect({ kind: "node", id: tr.nodeId })
									}
								>
									<span class="font-mono text-[10px] text-stone-400 tabular-nums">
										{clock(tr.t)}
									</span>
									<Dot status={tr.status} />
									<span class="min-w-0 flex-1 truncate text-[11px] text-stone-600">
										{node?.label ?? tr.nodeId}
									</span>
								</button>
							);
						}}
					</For>
				</Show>

				<div class="px-4 pt-6 pb-4 text-[10px] leading-relaxed text-stone-300">
					space play / pause · ← → step · f fit
					<br />
					click node or edge to inspect · esc to clear
				</div>
			</>
		);
	};

	// ── Node detail ─────────────────────────────────────────────────────
	const NodeDetail = (p: { node: TemporalNode }) => {
		const sample = createMemo(() => {
			props.store.version();
			return props.store.nodeAt(p.node, props.time());
		});
		const meta = createMemo(() => {
			props.store.version();
			return props.store.metaAt(p.node, props.time());
		});
		const statusChanges = createMemo(() => {
			props.store.version();
			const out: { t: number; status: GraphNodeStatus }[] = [];
			for (const s of p.node.samples) {
				if (s.t > props.time()) break;
				const prev = out[out.length - 1];
				if (!prev || prev.status !== s.status)
					out.push({ t: s.t, status: s.status });
			}
			return out;
		});
		/** Lifetime as colored segments — the node's history at a glance. */
		const segments = createMemo(() => {
			const changes = statusChanges();
			const span = props.time() - p.node.born;
			if (changes.length === 0 || span <= 0) return [];
			return changes.map((c, i) => {
				const end = i + 1 < changes.length ? changes[i + 1].t : props.time();
				return {
					status: c.status,
					pct: Math.max(0.5, ((end - c.t) / span) * 100),
				};
			});
		});
		const children = createMemo(() => {
			props.store.version();
			const out: TemporalNode[] = [];
			for (const n of props.store.nodes.values())
				if (n.parentId === p.node.id && n.born <= props.time()) out.push(n);
			return out;
		});
		const links = createMemo(() => {
			props.store.version();
			const out: { node: TemporalNode; kind: string }[] = [];
			for (const e of props.store.edges.values()) {
				if (e.kind === "spawn") continue;
				if (e.source !== p.node.id && e.target !== p.node.id) continue;
				if (!props.store.edgeVisibleAt(e, props.time())) continue;
				const otherId = e.source === p.node.id ? e.target : e.source;
				const other = props.store.nodes.get(otherId);
				if (other) out.push({ node: other, kind: e.kind });
			}
			return out;
		});
		const parent = () =>
			p.node.parentId ? props.store.nodes.get(p.node.parentId) : undefined;
		const statusFor = () => {
			const s = sample();
			if (!s) return null;
			const since = statusChanges()[statusChanges().length - 1];
			return { ...s, since: since ? props.time() - since.t : 0 };
		};
		const contentAvailable = () =>
			p.node.content && p.node.content.trim().length > 0;

		return (
			<Show when={sample()} fallback={<NotYet born={p.node.born} clock={clock} />}>
				<div class="flex items-center justify-between gap-2 px-4 pt-4">
					<div class="min-w-0">
						<div class="truncate text-[13px] font-medium text-stone-800">
							{p.node.label}
						</div>
						<div class="truncate font-mono text-[10px] text-stone-400">
							{p.node.id}
						</div>
					</div>
					<button
						type="button"
						class="shrink-0 rounded px-1.5 py-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
						onClick={() => props.onSelect(null)}
					>
						×
					</button>
				</div>

				<div class="flex items-center gap-2 px-4 pt-3">
					<Dot status={statusFor()!.status} />
					<span class="text-[11px] text-stone-700">
						{STATUS_LABEL[statusFor()!.status]}
					</span>
					<span class="font-mono text-[10px] text-stone-400 tabular-nums">
						for {fmtClock(statusFor()!.since)}
					</span>
				</div>

				<div class="px-4 pt-3">
					<div class="flex items-center justify-between pb-1">
						<span class="text-[10px] uppercase tracking-[0.14em] text-stone-400">
							salience
						</span>
						<span class="font-mono text-[10px] text-stone-500 tabular-nums">
							{sample()!.salience.toFixed(2)}
						</span>
					</div>
					<div class="h-[3px] w-full overflow-hidden rounded-full bg-stone-100">
						<div
							class="h-full rounded-full bg-stone-700"
							style={{ width: `${sample()!.salience * 100}%` }}
						/>
					</div>
				</div>

				<Show when={segments().length > 0}>
					<div class="px-4 pt-3">
						<div class="flex h-[4px] w-full overflow-hidden rounded-full">
							<For each={segments()}>
								{(seg) => (
									<div
										style={{
											width: `${seg.pct}%`,
											"background-color": STATUS_COLOR[seg.status],
											opacity:
												seg.status === "completed"
													? 0.35
													: seg.status === "idle"
														? 0.25
														: 0.75,
										}}
									/>
								)}
							</For>
						</div>
					</div>
				</Show>

				<SectionTitle>timing</SectionTitle>
				<Row label="born" value={clock(p.node.born)} />
				<Row label="age" value={fmtClock(props.time() - p.node.born)} />

				<Show when={Object.keys(meta()).length > 0}>
					<SectionTitle>state</SectionTitle>
					<For each={Object.entries(meta())}>
						{([key, value]) => <Row label={key} value={String(value)} />}
					</For>
				</Show>

				<Show when={contentAvailable()}>
					<SectionTitle>content</SectionTitle>
					<div class="mx-4 max-h-44 overflow-y-auto rounded border border-stone-100 bg-stone-50/60 px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-stone-600 graph-scroll">
						{p.node.content}
					</div>
				</Show>

				<Show when={parent() || children().length > 0 || links().length > 0}>
					<SectionTitle>
						connections
						<span class="ml-1.5 normal-case tracking-normal text-stone-300">
							{(parent() ? 1 : 0) + children().length + links().length}
						</span>
					</SectionTitle>
					<Show when={parent()}>{nodeRow(parent()!, "parent")}</Show>
					<For each={children().slice(0, 40)}>{(c) => nodeRow(c)}</For>
					<Show when={children().length > 40}>
						<div class="px-4 py-1 text-[10px] text-stone-400">
							+{children().length - 40} more
						</div>
					</Show>
					<For each={links()}>{(l) => nodeRow(l.node, l.kind)}</For>
				</Show>

				<SectionTitle>history</SectionTitle>
				<For each={statusChanges().slice(-14).reverse()}>
					{(c) => (
						<div class="flex items-center gap-2 px-4 py-[4px]">
							<span class="font-mono text-[10px] text-stone-400 tabular-nums">
								{clock(c.t)}
							</span>
							<Dot status={c.status} />
							<span class="text-[11px] text-stone-600">
								{STATUS_LABEL[c.status]}
							</span>
						</div>
					)}
				</For>
				<div class="pb-5" />
			</Show>
		);
	};

	const NotYet = (p: { born: number; clock: (t: number) => string }) => (
		<div class="px-4 pt-5 text-[11px] text-stone-400">
			This node doesn't exist yet at the current time — it is born at{" "}
			<span class="font-mono">{p.clock(p.born)}</span>.
		</div>
	);

	// ── Edge detail ─────────────────────────────────────────────────────
	const EdgeDetail = (p: { edge: NonNullable<ReturnType<typeof selectedEdge>> }) => {
		const sample = createMemo(() => {
			props.store.version();
			return props.store.edgeAt(p.edge, props.time());
		});
		const endpoint = (id: string) => {
			const node = props.store.nodes.get(id);
			return node ? nodeRow(node) : null;
		};
		return (
			<>
				<div class="flex items-center justify-between gap-2 px-4 pt-4">
					<div class="text-[13px] font-medium text-stone-800">
						{p.edge.kind} edge
					</div>
					<button
						type="button"
						class="shrink-0 rounded px-1.5 py-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
						onClick={() => props.onSelect(null)}
					>
						×
					</button>
				</div>
				<SectionTitle>endpoints</SectionTitle>
				{endpoint(p.edge.source)}
				<div class="px-4 py-0.5 text-center text-[10px] text-stone-300">↓</div>
				{endpoint(p.edge.target)}
				<SectionTitle>state</SectionTitle>
				<Row label="kind" value={p.edge.kind} />
				<Row label="born" value={clock(p.edge.born)} />
				<Show when={sample()}>
					<Row label="salience" value={sample()!.salience.toFixed(2)} />
				</Show>
			</>
		);
	};

	return (
		<div class="flex h-full w-[300px] shrink-0 flex-col border-l border-stone-200 bg-white">
			<div class="flex-1 overflow-y-auto graph-scroll">
				<Show when={selectedNode()}>
					{(node) => <NodeDetail node={node()} />}
				</Show>
				<Show when={!selectedNode() && selectedEdge()}>
					{(edge) => <EdgeDetail edge={edge()} />}
				</Show>
				<Show when={!selectedNode() && !selectedEdge()}>
					<Summary />
				</Show>
			</div>
		</div>
	);
}
