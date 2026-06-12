import { onCleanup, onMount } from "solid-js";
import { fmtClock } from "../../graph/format";
import type { TemporalGraphStore } from "../../graph/temporal";
import type { GraphNodeStatus } from "../../graph/types";
import { STATUS_COLOR } from "../../graph/types";

/**
 * The temporal overview: a full-width strip where stacked bands show how
 * many nodes were in each state at every moment of the run, and a thin
 * lane above marks the instants of salient transitions (errors, requests
 * for input). The same strip is the scrubber — the graph above always
 * shows the moment under the playhead.
 */

interface TimelineProps {
	store: TemporalGraphStore;
	time: () => number;
	domain: () => { t0: number; t1: number } | null;
	onScrub: (t: number) => void;
}

const INK = "#1c1917";
const LANE_H = 12;
const BAND_TOP = 14;
const BAND_BOTTOM = 56;

const BAND_ORDER: GraphNodeStatus[] = [
	"completed",
	"idle",
	"running",
	"awaiting",
	"error",
];
const BAND_FILL: Record<string, string> = {
	completed: "rgba(28,25,23,0.09)",
	idle: "rgba(168,162,158,0.12)",
	running: "rgba(37,99,235,0.30)",
	awaiting: "rgba(217,119,6,0.55)",
	error: "rgba(220,38,38,0.55)",
};

export function Timeline(props: TimelineProps) {
	let wrap!: HTMLDivElement;
	let canvas!: HTMLCanvasElement;

	onMount(() => {
		const ctx = canvas.getContext("2d")!;
		let width = 0;
		let height = 0;
		let dpr = window.devicePixelRatio || 1;
		let bands: HTMLCanvasElement | null = null;
		let bandsVersion = -1;
		let bandsDomainKey = "";
		let lastRebuild = 0;
		let hoverX: number | null = null;
		let scrubbing = false;
		let lastDrawKey = "";
		let raf = 0;

		const resize = () => {
			const rect = wrap.getBoundingClientRect();
			width = Math.max(1, rect.width);
			height = Math.max(1, rect.height);
			dpr = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			bandsVersion = -1; // force band cache rebuild at new size
			lastDrawKey = "";
		};
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		resize();

		const xOf = (t: number, d: { t0: number; t1: number }) =>
			d.t1 > d.t0 ? ((t - d.t0) / (d.t1 - d.t0)) * width : 0;
		const tOf = (x: number, d: { t0: number; t1: number }) =>
			d.t0 + (Math.max(0, Math.min(width, x)) / width) * (d.t1 - d.t0);

		/**
		 * Counts-per-state series via one chronological sweep over the
		 * store's transition log — O(transitions + buckets), so rebuilds
		 * stay cheap even with thousands of nodes.
		 */
		const rebuildBands = (d: { t0: number; t1: number }) => {
			bands = document.createElement("canvas");
			bands.width = Math.round(width * dpr);
			bands.height = Math.round(height * dpr);
			const bctx = bands.getContext("2d")!;
			bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			const B = Math.max(60, Math.min(480, Math.floor(width / 3)));
			const span = Math.max(1, d.t1 - d.t0);
			const series: Record<string, Float64Array> = {};
			for (const s of BAND_ORDER) series[s] = new Float64Array(B);
			const totals = new Float64Array(B);

			const counts: Record<string, number> = {
				idle: 0,
				running: 0,
				awaiting: 0,
				completed: 0,
				error: 0,
				removed: 0,
			};
			const current = new Map<string, GraphNodeStatus>();
			const transitions = props.store.transitions;
			let ti = 0;
			for (let b = 0; b < B; b++) {
				const tEnd = d.t0 + ((b + 1) / B) * span;
				while (ti < transitions.length && transitions[ti].t <= tEnd) {
					const tr = transitions[ti++];
					const prev = current.get(tr.nodeId);
					if (prev) counts[prev]--;
					current.set(tr.nodeId, tr.status);
					counts[tr.status]++;
				}
				let total = 0;
				for (const s of BAND_ORDER) {
					series[s][b] = counts[s];
					total += counts[s];
				}
				totals[b] = total;
			}

			let maxTotal = 1;
			for (let b = 0; b < B; b++) if (totals[b] > maxTotal) maxTotal = totals[b];
			const bandH = BAND_BOTTOM - BAND_TOP;
			const yScale = bandH / maxTotal;
			const bw = width / B;

			// Stacked fills, attention states on top so they stay visible.
			const stackBase = new Float64Array(B);
			for (const s of BAND_ORDER) {
				bctx.beginPath();
				bctx.moveTo(0, BAND_BOTTOM - stackBase[0] * yScale);
				for (let b = 0; b < B; b++)
					bctx.lineTo(b * bw, BAND_BOTTOM - stackBase[b] * yScale);
				bctx.lineTo(width, BAND_BOTTOM - stackBase[B - 1] * yScale);
				for (let b = B - 1; b >= 0; b--) {
					stackBase[b] += series[s][b];
					bctx.lineTo(b * bw, BAND_BOTTOM - stackBase[b] * yScale);
				}
				bctx.closePath();
				bctx.fillStyle = BAND_FILL[s];
				bctx.fill();
			}

			// Total contour — the "shape of the run" in one line.
			bctx.beginPath();
			for (let b = 0; b < B; b++) {
				const y = BAND_BOTTOM - totals[b] * yScale;
				if (b === 0) bctx.moveTo(0, y);
				bctx.lineTo(b * bw, y);
			}
			bctx.strokeStyle = "rgba(28,25,23,0.25)";
			bctx.lineWidth = 1;
			bctx.stroke();

			// Salient-transition ticks in the top lane.
			for (const tr of transitions) {
				if (tr.status !== "error" && tr.status !== "awaiting") continue;
				const x = Math.round(xOf(tr.t, d)) + 0.5;
				bctx.beginPath();
				bctx.moveTo(x, 2);
				bctx.lineTo(x, LANE_H - 2);
				bctx.strokeStyle =
					tr.status === "error"
						? "rgba(220,38,38,0.55)"
						: "rgba(217,119,6,0.55)";
				bctx.lineWidth = 1;
				bctx.stroke();
			}

			// Sparse time labels.
			bctx.font = "9px ui-sans-serif, system-ui, sans-serif";
			bctx.fillStyle = "rgba(120,113,108,0.9)";
			bctx.textBaseline = "top";
			bctx.textAlign = "left";
			bctx.fillText("0:00", 4, BAND_BOTTOM + 4);
			bctx.textAlign = "center";
			bctx.fillText(fmtClock(span / 2), width / 2, BAND_BOTTOM + 4);
			bctx.textAlign = "right";
			bctx.fillText(fmtClock(span), width - 4, BAND_BOTTOM + 4);
			bctx.textAlign = "left";
		};

		const draw = () => {
			const d = props.domain();
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);
			if (!d) return;
			if (bands) ctx.drawImage(bands, 0, 0, width, height);

			if (hoverX !== null && !scrubbing) {
				ctx.strokeStyle = "rgba(28,25,23,0.2)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(Math.round(hoverX) + 0.5, 0);
				ctx.lineTo(Math.round(hoverX) + 0.5, BAND_BOTTOM);
				ctx.stroke();
			}

			const x = Math.round(xOf(props.time(), d)) + 0.5;
			ctx.strokeStyle = INK;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, BAND_BOTTOM);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(x, 5, 3, 0, Math.PI * 2);
			ctx.fillStyle = INK;
			ctx.fill();

			if (hoverX !== null || scrubbing) {
				const labelT = scrubbing ? props.time() : tOf(hoverX!, d);
				const lx = scrubbing ? x : hoverX!;
				const text = fmtClock(labelT - d.t0);
				ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
				const tw = ctx.measureText(text).width;
				const bx = Math.max(2, Math.min(width - tw - 10, lx + 6));
				ctx.fillStyle = "rgba(250,250,249,0.95)";
				ctx.fillRect(bx - 3, 1, tw + 8, 13);
				ctx.fillStyle = INK;
				ctx.textBaseline = "top";
				ctx.fillText(text, bx, 3);
			}
		};

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			const d = props.domain();
			if (!d) {
				if (lastDrawKey !== "empty") {
					lastDrawKey = "empty";
					draw();
				}
				return;
			}
			const v = props.store.version();
			const dKey = `${d.t0}|${Math.round(d.t1 / 1000)}`;
			if (
				(v !== bandsVersion || dKey !== bandsDomainKey) &&
				now - lastRebuild > 300
			) {
				bandsVersion = v;
				bandsDomainKey = dKey;
				lastRebuild = now;
				rebuildBands(d);
				lastDrawKey = "";
			}
			const key = `${props.time()}|${hoverX}|${scrubbing}|${dKey}`;
			if (key !== lastDrawKey) {
				lastDrawKey = key;
				draw();
			}
		};
		raf = requestAnimationFrame(frame);

		const toX = (e: PointerEvent) =>
			e.clientX - canvas.getBoundingClientRect().left;

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			const d = props.domain();
			if (!d) return;
			scrubbing = true;
			canvas.setPointerCapture(e.pointerId);
			props.onScrub(tOf(toX(e), d));
		};
		const onPointerMove = (e: PointerEvent) => {
			const d = props.domain();
			if (!d) return;
			if (scrubbing) props.onScrub(tOf(toX(e), d));
			else hoverX = toX(e);
		};
		const onPointerUp = (e: PointerEvent) => {
			scrubbing = false;
			canvas.releasePointerCapture(e.pointerId);
		};
		const onLeave = () => {
			hoverX = null;
		};
		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("pointerleave", onLeave);

		onCleanup(() => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		});
	});

	return (
		<div ref={wrap} class="relative h-full w-full cursor-ew-resize">
			<canvas ref={canvas} />
		</div>
	);
}
