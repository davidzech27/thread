import {
	For,
	Show,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";
import { generateDemo } from "../../graph/demo";
import { fmtClock, fmtNum } from "../../graph/format";
import { ForceLayout } from "../../graph/layout";
import type { TemporalGraphStore } from "../../graph/temporal";
import type { GraphNodeStatus, GraphSelection } from "../../graph/types";
import { STATUS_COLOR } from "../../graph/types";
import { GraphCanvas } from "./GraphCanvas";
import type { CameraCommand } from "./GraphCanvas";
import { Sidebar } from "./Sidebar";
import { Timeline } from "./Timeline";

/**
 * The activity view: canvas graph + status chips (the at-a-glance state
 * readout), inspector sidebar, and the timeline scrubber. Owns time —
 * playback, scrubbing, and following live data.
 */

interface GraphViewProps {
	store: TemporalGraphStore;
	live: () => boolean;
	onPrompt?: (prompt: string) => void;
}

const SPEEDS = [1, 8, 32];
const ATTENTION_CHIPS: GraphNodeStatus[] = ["running", "awaiting", "error"];

export function GraphView(props: GraphViewProps) {
	const [t, setT] = createSignal(props.store.tEnd ?? Date.now());
	const [playing, setPlaying] = createSignal(false);
	const [speed, setSpeed] = createSignal(SPEEDS[1]);
	const [follow, setFollow] = createSignal(true);
	const [selection, setSelection] = createSignal<GraphSelection | null>(null);
	const [hovered, setHovered] = createSignal<string | null>(null);
	const [cameraCmd, setCameraCmd] = createSignal<CameraCommand | null>(null);
	let cmdSeq = 0;
	const layout = new ForceLayout();

	const isEmpty = createMemo(() => {
		props.store.version();
		return props.store.nodes.size === 0;
	});

	const domain = () => {
		if (props.store.t0 === null) return null;
		return {
			t0: props.store.t0,
			t1: Math.max(props.store.tEnd ?? props.store.t0, t()),
		};
	};

	// Coarse time: sidebar/chips recompute at 4 Hz during playback instead
	// of every frame.
	const tCoarse = createMemo(() => Math.ceil(t() / 250) * 250);

	const counts = createMemo(() => {
		props.store.version();
		return props.store.countsAt(tCoarse());
	});
	const visibleNodes = () =>
		counts().idle +
		counts().running +
		counts().awaiting +
		counts().completed +
		counts().error;

	// ── Playback ────────────────────────────────────────────────────────
	let raf = 0;
	let lastFrame = performance.now();
	onMount(() => {
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			const dt = now - lastFrame;
			lastFrame = now;
			if (props.live() && follow()) {
				// ~8 Hz is plenty for a live playhead and keeps the canvas
				// from redrawing every frame while idle.
				const now2 = Date.now();
				if (now2 - t() >= 120) setT(now2);
				return;
			}
			if (!playing()) return;
			const d = domain();
			if (!d) return;
			const next = t() + dt * speed();
			if (next >= d.t1) {
				if (props.live()) {
					setFollow(true);
				} else {
					setT(d.t1);
					setPlaying(false);
				}
			} else {
				setT(next);
			}
		};
		raf = requestAnimationFrame(frame);
		onCleanup(() => cancelAnimationFrame(raf));
	});

	const scrub = (time: number) => {
		setFollow(false);
		setPlaying(false);
		setT(time);
	};

	const togglePlay = () => {
		const d = domain();
		if (!d) return;
		if (playing()) {
			setPlaying(false);
			return;
		}
		setFollow(false);
		if (t() >= d.t1 - 1) setT(d.t0);
		setPlaying(true);
	};

	const step = (deltaMs: number) => {
		const d = domain();
		if (!d) return;
		setPlaying(false);
		setFollow(false);
		setT(Math.max(d.t0, Math.min(d.t1, t() + deltaMs)));
	};

	const command = (kind: CameraCommand["kind"], nodeId?: string) =>
		setCameraCmd({ seq: ++cmdSeq, kind, nodeId });

	const cycleIdx: Partial<Record<GraphNodeStatus, number>> = {};
	const cycleStatus = (status: GraphNodeStatus) => {
		const nodes = props.store.nodesWithStatusAt(t(), status);
		if (nodes.length === 0) return;
		const i = (cycleIdx[status] ?? -1) + 1;
		cycleIdx[status] = i % nodes.length;
		const node = nodes[i % nodes.length];
		setSelection({ kind: "node", id: node.id });
		command("fly", node.id);
	};

	const loadDemo = () => {
		props.store.clear();
		layout.clear();
		setSelection(null);
		props.store.apply(generateDemo());
		setFollow(false);
		setT(props.store.t0!);
		setSpeed(8);
		setPlaying(true);
	};

	// ── Keyboard ────────────────────────────────────────────────────────
	const onKeyDown = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
		if (e.key === " ") {
			e.preventDefault();
			togglePlay();
		} else if (e.key === "f") {
			command("fit");
		} else if (e.key === "Escape") {
			setSelection(null);
		} else if (e.key === "ArrowLeft") {
			step(e.shiftKey ? -10000 : -1000);
		} else if (e.key === "ArrowRight") {
			step(e.shiftKey ? 10000 : 1000);
		}
	};
	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onKeyDown));
	});

	// ── Pieces ──────────────────────────────────────────────────────────
	const Chip = (p: { status: GraphNodeStatus }) => (
		<Show when={counts()[p.status] > 0}>
			<button
				type="button"
				class="pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 hover:bg-stone-200/50"
				title={`next ${p.status} node`}
				onClick={() => cycleStatus(p.status)}
			>
				<span
					class="h-[7px] w-[7px] rounded-full"
					classList={{ "animate-pulse": p.status !== "error" }}
					style={{ "background-color": STATUS_COLOR[p.status] }}
				/>
				<span class="font-mono text-[11px] text-stone-600 tabular-nums">
					{fmtNum(counts()[p.status])}
				</span>
				<span class="text-[11px] text-stone-400">{p.status}</span>
			</button>
		</Show>
	);

	const PlayIcon = () => (
		<svg width="9" height="10" viewBox="0 0 9 10" class="fill-stone-600">
			<path d="M0.5 0.8 L8.5 5 L0.5 9.2 Z" />
		</svg>
	);
	const PauseIcon = () => (
		<svg width="9" height="10" viewBox="0 0 9 10" class="fill-stone-600">
			<rect x="0.5" y="0.5" width="2.6" height="9" />
			<rect x="5.9" y="0.5" width="2.6" height="9" />
		</svg>
	);

	let promptInput!: HTMLInputElement;
	const submitPrompt = () => {
		const value = promptInput.value.trim();
		if (!value || !props.onPrompt) return;
		props.onPrompt(value);
		promptInput.value = "";
		setFollow(true);
	};

	return (
		<div class="absolute inset-0 flex flex-col bg-[#fafaf9] text-stone-800">
			<div class="relative flex min-h-0 flex-1">
				<div class="relative min-w-0 flex-1">
					<GraphCanvas
						store={props.store}
						layout={layout}
						time={t}
						selection={selection}
						hovered={hovered}
						onHover={setHovered}
						onSelect={setSelection}
						command={cameraCmd}
					/>

					{/* Floating header: identity, totals, and the one-line
					    attention readout. */}
					<div class="pointer-events-none absolute top-0 right-0 left-0 flex items-start justify-between px-4 pt-3.5">
						<div class="flex min-w-0 items-center gap-3">
							<span class="text-[11px] font-medium tracking-[0.28em] text-stone-400 select-none">
								thread
							</span>
							<Show when={!isEmpty()}>
								<span class="text-[11px] text-stone-400 tabular-nums select-none">
									{fmtNum(visibleNodes())} nodes · {fmtNum(counts().edges)}{" "}
									edges
								</span>
								<div class="flex items-center gap-0.5">
									<For each={ATTENTION_CHIPS}>
										{(status) => <Chip status={status} />}
									</For>
								</div>
							</Show>
						</div>
						<div class="flex items-center gap-2 pr-24">
							<span
								class="h-[6px] w-[6px] rounded-full"
								style={{
									"background-color": props.live() ? "#10b981" : "#d6d3d1",
								}}
							/>
							<span class="text-[10px] text-stone-400 select-none">
								{props.live() ? "live" : "offline"}
							</span>
						</div>
					</div>

					<Show when={isEmpty()}>
						<div class="absolute inset-0 flex flex-col items-center justify-center gap-5">
							<div class="text-xs tracking-[0.4em] text-stone-300 uppercase select-none">
								thread
							</div>
							<div class="text-[11px] text-stone-400 select-none">
								no activity yet
							</div>
							<Show when={props.live() && props.onPrompt}>
								<input
									ref={promptInput}
									type="text"
									placeholder="describe a task and press enter…"
									class="w-80 border-b border-stone-200 bg-transparent px-1 pb-1.5 text-center text-xs text-stone-700 placeholder-stone-300 outline-none focus:border-stone-400"
									style={{ cursor: "text" }}
									onKeyDown={(e) => e.key === "Enter" && submitPrompt()}
								/>
							</Show>
							<button
								type="button"
								class="rounded-full border border-stone-200 px-3.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-white hover:text-stone-700"
								onClick={loadDemo}
							>
								load demo run
							</button>
						</div>
					</Show>
				</div>

				<Sidebar
					store={props.store}
					time={tCoarse}
					selection={selection}
					onSelect={setSelection}
					onFly={(id) => command("fly", id)}
				/>
			</div>

			{/* Timeline strip: playback controls + the temporal overview. */}
			<div class="flex h-[72px] shrink-0 border-t border-stone-200 bg-white">
				<div class="flex shrink-0 items-center gap-1 border-r border-stone-100 px-3">
					<button
						type="button"
						class="flex h-7 w-7 items-center justify-center rounded-full hover:bg-stone-100"
						title="play / pause (space)"
						onClick={togglePlay}
					>
						<Show when={playing()} fallback={<PlayIcon />}>
							<PauseIcon />
						</Show>
					</button>
					<button
						type="button"
						class="h-7 rounded-full px-2 font-mono text-[11px] text-stone-500 tabular-nums hover:bg-stone-100"
						title="playback speed"
						onClick={() =>
							setSpeed(SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length])
						}
					>
						{speed()}×
					</button>
					<Show when={props.live()}>
						<button
							type="button"
							class="flex h-7 items-center gap-1.5 rounded-full px-2 text-[11px] hover:bg-stone-100"
							classList={{
								"text-stone-800": follow(),
								"text-stone-400": !follow(),
							}}
							title="follow live"
							onClick={() => {
								setPlaying(false);
								setFollow(true);
							}}
						>
							<span
								class="h-[6px] w-[6px] rounded-full"
								classList={{
									"bg-emerald-500": follow(),
									"bg-stone-300": !follow(),
								}}
							/>
							live
						</button>
					</Show>
					<button
						type="button"
						class="h-7 rounded-full px-2 text-[11px] text-stone-500 hover:bg-stone-100"
						title="fit graph (f)"
						onClick={() => command("fit")}
					>
						fit
					</button>
					<Show when={domain()}>
						<span class="pl-1 font-mono text-[10px] text-stone-400 tabular-nums select-none">
							{fmtClock(t() - domain()!.t0)} /{" "}
							{fmtClock(domain()!.t1 - domain()!.t0)}
						</span>
					</Show>
				</div>
				<div class="min-w-0 flex-1">
					<Timeline
						store={props.store}
						time={t}
						domain={domain}
						onScrub={scrub}
					/>
				</div>
			</div>
		</div>
	);
}
