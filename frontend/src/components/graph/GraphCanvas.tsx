import { onCleanup, onMount } from "solid-js";
import type { ForceLayout } from "../../graph/layout";
import type { TemporalGraphStore } from "../../graph/temporal";
import type { GraphSelection } from "../../graph/types";
import { STATUS_COLOR } from "../../graph/types";

/**
 * Canvas renderer for the temporal graph.
 *
 * Visual language: the graph is quiet ink on paper — salience drives size
 * and opacity, so structure recedes into texture and important nodes
 * surface on their own. Color is reserved exclusively for states that
 * need attention (running / awaiting / error), which makes salient state
 * readable at any zoom without legends or chrome.
 */

export interface CameraCommand {
	seq: number;
	kind: "fit" | "fly";
	nodeId?: string;
}

interface GraphCanvasProps {
	store: TemporalGraphStore;
	layout: ForceLayout;
	time: () => number;
	selection: () => GraphSelection | null;
	hovered: () => string | null;
	onHover: (id: string | null) => void;
	onSelect: (sel: GraphSelection | null) => void;
	command: () => CameraCommand | null;
}

const BG = "#fafaf9";
const INK = "#1c1917";

function rgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

interface DrawnNode {
	id: string;
	sx: number;
	sy: number;
	r: number;
	salience: number;
	label: string;
}

export function GraphCanvas(props: GraphCanvasProps) {
	let canvas!: HTMLCanvasElement;
	let wrap!: HTMLDivElement;

	onMount(() => {
		const ctx = canvas.getContext("2d")!;
		let width = 0;
		let height = 0;
		let dpr = window.devicePixelRatio || 1;

		// Camera: world point at viewport center + zoom.
		let cx = 0;
		let cy = 0;
		let k = 1;
		let camAnim: {
			from: { cx: number; cy: number; k: number };
			to: { cx: number; cy: number; k: number };
			start: number;
			dur: number;
		} | null = null;

		let dirty = true;
		let lastVersion = -1;
		let lastTime = Number.NaN;
		let lastCmdSeq = 0;
		let lastSelection: GraphSelection | null = null;
		let lastHover: string | null = null;
		let pulseActive = false;
		let didInitialFit = false;
		let raf = 0;

		let drawnNodes: DrawnNode[] = [];
		const birthAnims = new Map<string, number>();

		const resize = () => {
			const rect = wrap.getBoundingClientRect();
			width = Math.max(1, rect.width);
			height = Math.max(1, rect.height);
			dpr = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			dirty = true;
		};
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		resize();

		const visibleBBox = (t: number) => {
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			let any = false;
			for (const node of props.store.nodes.values()) {
				const sample = props.store.nodeAt(node, t);
				if (!sample || sample.status === "removed") continue;
				const p = props.layout.nodes.get(node.id);
				if (!p) continue;
				any = true;
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			return any ? { minX, minY, maxX, maxY } : null;
		};

		const animateTo = (to: { cx: number; cy: number; k: number }, dur = 480) => {
			camAnim = { from: { cx, cy, k }, to, start: performance.now(), dur };
		};

		const fitTarget = () => {
			const box = visibleBBox(props.time());
			if (!box) return null;
			const pad = 80;
			const w = Math.max(box.maxX - box.minX, 60);
			const h = Math.max(box.maxY - box.minY, 60);
			return {
				cx: (box.minX + box.maxX) / 2,
				cy: (box.minY + box.maxY) / 2,
				k: Math.min(
					2.2,
					Math.max(
						0.035,
						Math.min((width - pad * 2) / w, (height - pad * 2) / h),
					),
				),
			};
		};

		// The camera tracks the growing graph until the user pans or zooms;
		// "fit" / double-click hands framing back to it.
		let autoFrame = true;

		const fit = (animated: boolean) => {
			const target = fitTarget();
			if (!target) return;
			if (animated) animateTo(target, 600);
			else {
				cx = target.cx;
				cy = target.cy;
				k = target.k;
			}
			autoFrame = true;
			dirty = true;
		};

		const flyTo = (nodeId: string) => {
			const p = props.layout.nodes.get(nodeId);
			if (!p) return;
			autoFrame = false;
			animateTo({ cx: p.x, cy: p.y, k: Math.max(k, 1.0) });
		};

		// ── Interaction ─────────────────────────────────────────────────
		let dragging = false;
		let moved = 0;
		let px = 0;
		let py = 0;

		const toScreen = (e: PointerEvent | MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		};

		const hitNode = (sx: number, sy: number): DrawnNode | null => {
			let best: DrawnNode | null = null;
			let bestD = Infinity;
			for (const n of drawnNodes) {
				const dx = n.sx - sx;
				const dy = n.sy - sy;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d <= Math.max(n.r + 3, 7) && d < bestD) {
					bestD = d;
					best = n;
				}
			}
			return best;
		};

		const hitEdge = (sx: number, sy: number): string | null => {
			const t = props.time();
			let best: string | null = null;
			let bestD = 6;
			for (const edge of props.store.edges.values()) {
				if (!props.store.edgeVisibleAt(edge, t)) continue;
				const a = props.layout.nodes.get(edge.source);
				const b = props.layout.nodes.get(edge.target);
				if (!a || !b) continue;
				const ax = (a.x - cx) * k + width / 2;
				const ay = (a.y - cy) * k + height / 2;
				const bx = (b.x - cx) * k + width / 2;
				const by = (b.y - cy) * k + height / 2;
				const dx = bx - ax;
				const dy = by - ay;
				const len2 = dx * dx + dy * dy;
				if (len2 < 1) continue;
				const u = Math.max(
					0,
					Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / len2),
				);
				const ex = ax + u * dx - sx;
				const ey = ay + u * dy - sy;
				const d = Math.sqrt(ex * ex + ey * ey);
				if (d < bestD) {
					bestD = d;
					best = edge.id;
				}
			}
			return best;
		};

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			dragging = true;
			moved = 0;
			const p = toScreen(e);
			px = p.x;
			py = p.y;
			canvas.setPointerCapture(e.pointerId);
		};

		const onPointerMove = (e: PointerEvent) => {
			const p = toScreen(e);
			if (dragging) {
				const dx = p.x - px;
				const dy = p.y - py;
				moved += Math.abs(dx) + Math.abs(dy);
				if (moved > 3) {
					camAnim = null;
					autoFrame = false;
					cx -= dx / k;
					cy -= dy / k;
					dirty = true;
				}
				px = p.x;
				py = p.y;
				return;
			}
			const hit = hitNode(p.x, p.y);
			const id = hit?.id ?? null;
			if (id !== lastHover) {
				props.onHover(id);
				canvas.style.cursor = id ? "pointer" : "default";
			}
		};

		const onPointerUp = (e: PointerEvent) => {
			if (!dragging) return;
			dragging = false;
			canvas.releasePointerCapture(e.pointerId);
			if (moved <= 4) {
				const p = toScreen(e);
				const node = hitNode(p.x, p.y);
				if (node) props.onSelect({ kind: "node", id: node.id });
				else {
					const edge = hitEdge(p.x, p.y);
					props.onSelect(edge ? { kind: "edge", id: edge } : null);
				}
			}
		};

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			camAnim = null;
			autoFrame = false;
			const p = toScreen(e);
			const wx = (p.x - width / 2) / k + cx;
			const wy = (p.y - height / 2) / k + cy;
			k = Math.min(3, Math.max(0.025, k * Math.exp(-e.deltaY * 0.0016)));
			cx = wx - (p.x - width / 2) / k;
			cy = wy - (p.y - height / 2) / k;
			dirty = true;
		};

		const onDblClick = () => fit(true);

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("pointerleave", () => {
			if (lastHover !== null) props.onHover(null);
		});
		canvas.addEventListener("wheel", onWheel, { passive: false });
		canvas.addEventListener("dblclick", onDblClick);

		// ── Render loop ─────────────────────────────────────────────────
		const draw = (now: number) => {
			const t = props.time();
			const store = props.store;
			const layout = props.layout;
			const selection = props.selection();
			const hover = props.hovered();

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = BG;
			ctx.fillRect(0, 0, width, height);

			// Selection neighborhood: everything else recedes while a
			// node or edge is pinned.
			let focusNodes: Set<string> | null = null;
			let focusEdges: Set<string> | null = null;
			if (selection) {
				focusNodes = new Set();
				focusEdges = new Set();
				if (selection.kind === "node") {
					focusNodes.add(selection.id);
					for (const edge of store.edges.values()) {
						if (edge.source !== selection.id && edge.target !== selection.id)
							continue;
						if (!store.edgeVisibleAt(edge, t)) continue;
						focusEdges.add(edge.id);
						focusNodes.add(edge.source);
						focusNodes.add(edge.target);
					}
				} else {
					const edge = store.edges.get(selection.id);
					if (edge) {
						focusEdges.add(edge.id);
						focusNodes.add(edge.source);
						focusNodes.add(edge.target);
					}
				}
			}

			// Edges, batched by quantized style to keep stroke calls low.
			const margin = 80;
			const buckets = new Map<number, Path2D>();
			const focusPath = new Path2D();
			let hasFocusEdges = false;
			for (const edge of store.edges.values()) {
				const sample = store.edgeVisibleAt(edge, t);
				if (!sample) continue;
				const a = layout.nodes.get(edge.source);
				const b = layout.nodes.get(edge.target);
				if (!a || !b) continue;
				const ax = (a.x - cx) * k + width / 2;
				const ay = (a.y - cy) * k + height / 2;
				const bx = (b.x - cx) * k + width / 2;
				const by = (b.y - cy) * k + height / 2;
				if (
					(ax < -margin && bx < -margin) ||
					(ax > width + margin && bx > width + margin) ||
					(ay < -margin && by < -margin) ||
					(ay > height + margin && by > height + margin)
				)
					continue;

				if (focusEdges?.has(edge.id)) {
					focusPath.moveTo(ax, ay);
					focusPath.lineTo(bx, by);
					hasFocusEdges = true;
					continue;
				}

				const sStat = store.nodeAt(store.nodes.get(edge.source)!, t)?.status;
				const dStat = store.nodeAt(store.nodes.get(edge.target)!, t)?.status;
				const active =
					sStat === "running" ||
					dStat === "running" ||
					sStat === "awaiting" ||
					dStat === "awaiting";
				let alpha = 0.05 + 0.2 * sample.salience;
				if (active) alpha = Math.min(0.45, alpha * 2.2);
				if (focusNodes) alpha *= 0.25;
				const q = Math.min(7, Math.max(0, Math.round(alpha * 16)));
				if (q === 0) continue;
				let path = buckets.get(q);
				if (!path) {
					path = new Path2D();
					buckets.set(q, path);
				}
				path.moveTo(ax, ay);
				path.lineTo(bx, by);
			}
			ctx.lineWidth = Math.max(0.5, Math.min(1.4, 0.8 * k));
			for (const [q, path] of buckets) {
				ctx.strokeStyle = rgba(INK, q / 16);
				ctx.stroke(path);
			}
			if (hasFocusEdges) {
				ctx.lineWidth = Math.max(1, Math.min(1.8, 1.1 * k));
				ctx.strokeStyle = rgba(INK, 0.55);
				ctx.stroke(focusPath);
			}

			// Nodes.
			drawnNodes = [];
			let attentionVisible = false;
			const phase = now / 1000;
			for (const node of store.nodes.values()) {
				const sample = store.nodeAt(node, t);
				if (!sample || sample.status === "removed") continue;
				const p = layout.nodes.get(node.id);
				if (!p) continue;
				const sx = (p.x - cx) * k + width / 2;
				const sy = (p.y - cy) * k + height / 2;
				if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40)
					continue;

				const sal = sample.salience;
				let r = (2.2 + 6.5 * Math.sqrt(sal)) * k;
				const anim = birthAnims.get(node.id);
				if (anim !== undefined) {
					const u = (now - anim) / 340;
					if (u >= 1) birthAnims.delete(node.id);
					else r *= easeOutCubic(Math.max(0.05, u));
				}
				r = Math.max(0.7, r);

				const dimmed = focusNodes !== null && !focusNodes.has(node.id);
				const dim = dimmed ? 0.22 : 1;
				const status = sample.status;

				if (status === "running" || status === "awaiting") {
					attentionVisible = true;
					if (!dimmed && r > 1.1) {
						const slow = status === "awaiting";
						const wave = Math.sin(phase * (slow ? 2.4 : 4.2) * Math.PI);
						ctx.beginPath();
						ctx.arc(sx, sy, r + 2.5 + 1.4 * wave + 1.4, 0, Math.PI * 2);
						ctx.strokeStyle = rgba(
							STATUS_COLOR[status],
							0.16 + 0.09 * wave + 0.09,
						);
						ctx.lineWidth = 1.2;
						ctx.stroke();
					}
				}

				ctx.beginPath();
				ctx.arc(sx, sy, r, 0, Math.PI * 2);
				if (status === "idle") {
					ctx.strokeStyle = rgba(INK, (0.28 + 0.3 * sal) * dim);
					ctx.lineWidth = 1;
					ctx.stroke();
				} else if (status === "completed") {
					ctx.fillStyle = rgba(INK, (0.22 + 0.58 * sal) * dim);
					ctx.fill();
				} else {
					ctx.fillStyle = rgba(STATUS_COLOR[status], 0.92 * dim);
					ctx.fill();
				}

				drawnNodes.push({ id: node.id, sx, sy, r, salience: sal, label: node.label });
			}

			// Selection / hover rings.
			const ring = (id: string, alpha: number, pad: number) => {
				const n = drawnNodes.find((d) => d.id === id);
				if (!n) return;
				ctx.beginPath();
				ctx.arc(n.sx, n.sy, n.r + pad, 0, Math.PI * 2);
				ctx.strokeStyle = rgba(INK, alpha);
				ctx.lineWidth = 1.4;
				ctx.stroke();
			};
			if (selection?.kind === "node") ring(selection.id, 0.85, 3.5);
			if (hover && hover !== (selection as any)?.id) ring(hover, 0.45, 3);

			// Labels: only the most salient few earn text; the budget grows
			// as you zoom in. Collision-rejected so text never stacks.
			ctx.font =
				"11px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
			ctx.textBaseline = "middle";
			const budget = Math.max(4, Math.min(18, Math.round(5 + k * 9)));
			const candidates = drawnNodes
				.filter((d) => d.r >= 2.4 && d.salience >= 0.12)
				.sort((a, b) => b.salience - a.salience);
			const forced = new Set<string>();
			if (hover) forced.add(hover);
			if (selection?.kind === "node") forced.add(selection.id);
			const ordered = [
				...candidates.filter((d) => forced.has(d.id)),
				...candidates.filter((d) => !forced.has(d.id)),
			];
			const placed: { x: number; y: number; w: number; h: number }[] = [];
			let used = 0;
			for (const d of ordered) {
				if (used >= budget && !forced.has(d.id)) break;
				const dimmed = focusNodes !== null && !focusNodes.has(d.id);
				if (dimmed && !forced.has(d.id)) continue;
				let text = d.label;
				if (text.length > 30) text = `${text.slice(0, 29)}…`;
				const tw = ctx.measureText(text).width;
				const lx = d.sx + d.r + 6;
				const ly = d.sy;
				const rect = { x: lx - 2, y: ly - 8, w: tw + 4, h: 16 };
				if (
					placed.some(
						(p) =>
							rect.x < p.x + p.w &&
							rect.x + rect.w > p.x &&
							rect.y < p.y + p.h &&
							rect.y + rect.h > p.y,
					)
				)
					continue;
				placed.push(rect);
				used++;
				ctx.strokeStyle = "rgba(250,250,249,0.9)";
				ctx.lineWidth = 3;
				ctx.lineJoin = "round";
				ctx.strokeText(text, lx, ly);
				ctx.fillStyle = rgba(
					INK,
					forced.has(d.id) ? 0.9 : 0.4 + 0.4 * d.salience,
				);
				ctx.fillText(text, lx, ly);
			}

			pulseActive = attentionVisible;
		};

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);

			// Poll inputs — the loop is the single scheduler, so reactive
			// churn never causes redundant draws.
			const v = props.store.version();
			if (v !== lastVersion) {
				lastVersion = v;
				props.layout.sync(props.store);
				dirty = true;
			}

			if (props.layout.relax(5)) dirty = true;

			const cmd = props.command();
			if (cmd && cmd.seq !== lastCmdSeq) {
				lastCmdSeq = cmd.seq;
				if (cmd.kind === "fit") fit(true);
				else if (cmd.kind === "fly" && cmd.nodeId) flyTo(cmd.nodeId);
			}

			if (camAnim) {
				const u = Math.min(1, (now - camAnim.start) / camAnim.dur);
				const e = easeInOutCubic(u);
				cx = camAnim.from.cx + (camAnim.to.cx - camAnim.from.cx) * e;
				cy = camAnim.from.cy + (camAnim.to.cy - camAnim.from.cy) * e;
				k = camAnim.from.k + (camAnim.to.k - camAnim.from.k) * e;
				if (u >= 1) camAnim = null;
				dirty = true;
			}

			const t = props.time();
			if (t !== lastTime) {
				// Scale-in newborns only during continuous playback, not on
				// far scrub jumps.
				const dt = t - lastTime;
				if (Number.isFinite(lastTime) && dt > 0 && dt <= 1500) {
					for (const node of props.store.nodes.values()) {
						if (node.born > lastTime && node.born <= t)
							birthAnims.set(node.id, now);
					}
				}
				lastTime = t;
				dirty = true;
			}

			const sel = props.selection();
			if (sel !== lastSelection) {
				lastSelection = sel;
				dirty = true;
			}
			const hov = props.hovered();
			if (hov !== lastHover) {
				lastHover = hov;
				dirty = true;
			}

			if (!didInitialFit && props.store.nodes.size > 0) {
				didInitialFit = true;
				fit(false);
			}
			if (props.store.nodes.size === 0) {
				didInitialFit = false;
				autoFrame = true;
			}

			// Ease toward the ideal framing while auto-framing is on.
			if (autoFrame && didInitialFit && !camAnim && !dragging) {
				const target = fitTarget();
				if (target) {
					const dcx = target.cx - cx;
					const dcy = target.cy - cy;
					const dk = target.k - k;
					if (
						Math.abs(dcx) * k > 0.5 ||
						Math.abs(dcy) * k > 0.5 ||
						Math.abs(dk) / k > 0.002
					) {
						cx += dcx * 0.07;
						cy += dcy * 0.07;
						k += dk * 0.07;
						dirty = true;
					}
				}
			}

			if (dirty || pulseActive || birthAnims.size > 0 || camAnim) {
				dirty = false;
				draw(now);
			}
		};
		raf = requestAnimationFrame(frame);

		onCleanup(() => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		});
	});

	return (
		<div ref={wrap} class="absolute inset-0 overflow-hidden">
			<canvas ref={canvas} />
		</div>
	);
}
