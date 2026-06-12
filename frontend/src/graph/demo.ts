import type { GraphEvent, GraphNodeStatus } from "./types";

/**
 * A recorded synthetic run: one root task fans out into branches, each
 * branch into waves of workers, with errors, retries, cross-references
 * and user-input pauses along the way. Roughly 1,300 nodes over ~6.5
 * simulated minutes — enough volume to exercise the view at scale.
 * Seeded, so every load looks identical.
 */

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const BRANCH_TOPICS = [
	"market risk",
	"credit exposure",
	"liquidity",
	"supply chain",
	"compliance",
	"cyber posture",
	"counterparty",
	"regulatory watch",
	"litigation",
];

const OPS = [
	"fetch",
	"parse",
	"scan",
	"diff",
	"rank",
	"extract",
	"verify",
	"cluster",
	"embed",
	"summarize",
];

const SUBJECTS = [
	"edgar/10-K",
	"fx-exposure",
	"rate-curves",
	"credit-notes",
	"board-minutes",
	"esg-filings",
	"vendor-ledger",
	"covenants",
	"macro-brief",
	"incident-log",
	"swap-book",
	"audit-trail",
	"news-wire",
	"position-deltas",
	"term-sheets",
	"filings-q3",
];

const SNIPPETS = [
	"Cross-checked against prior quarter; two deltas exceed the 5% threshold and were flagged for the aggregation pass.",
	"Source retrieved and normalized. 1,284 rows after dedupe; schema matches the v3 contract.",
	"Confidence is moderate — the upstream filing is amended twice and footnote 14 conflicts with the summary table.",
	"No anomalies found above the materiality threshold. Marking this lane clean.",
	"Extraction complete. Three covenants reference floating-rate baskets that the model should treat as correlated.",
];

interface Worker {
	id: string;
	end: number;
}

export function generateDemo(): GraphEvent[] {
	const rng = mulberry32(0x7e3a1);
	const events: GraphEvent[] = [];
	const T0 = Date.UTC(2026, 0, 12, 9, 0, 0);
	const at = (s: number) => T0 + Math.round(s * 1000);
	const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
	const range = (lo: number, hi: number) => lo + rng() * (hi - lo);
	const model = () => (rng() < 0.8 ? "haiku-4.5" : "sonnet-4.6");

	let seq = 0;
	const nid = (prefix: string) => `${prefix}-${(seq++).toString(36)}`;

	const node = (
		t: number,
		id: string,
		patch: Partial<Extract<GraphEvent, { type: "node" }>>,
	) => events.push({ type: "node", t, id, ...patch });
	const edge = (
		t: number,
		source: string,
		target: string,
		kind: string,
		salience: number,
	) => events.push({ type: "edge", t, source, target, kind, salience });
	const content = (t: number, id: string, text: string) =>
		events.push({ type: "content", t, id, append: text });

	/** Completion: salience steps down, then settles into the background. */
	const complete = (
		tEnd: number,
		id: string,
		base: number,
		status: GraphNodeStatus,
		meta?: Record<string, string | number>,
	) => {
		const hold = status === "error" ? Math.max(0.78, base) : base * 0.55;
		node(at(tEnd), id, { status, salience: hold, meta });
		node(at(tEnd + range(14, 26)), id, {
			status,
			salience: status === "error" ? 0.6 : base * 0.34,
		});
	};

	const spawnWorker = (
		tStart: number,
		parentId: string,
		base: number,
		tier: 1 | 2,
		allWorkers: Worker[],
	): Worker => {
		const id = nid(tier === 1 ? "w" : "m");
		const label = `${pick(OPS)}: ${pick(SUBJECTS)}`;
		const life = tier === 1 ? range(25, 70) : range(8, 35);
		const tEnd = tStart + life;
		const sal = base + range(-0.06, 0.06);

		node(at(tStart), id, {
			label,
			parent: parentId,
			status: "running",
			salience: Math.min(1, sal + 0.15),
			meta: { model: model() },
		});
		edge(at(tStart), parentId, id, "spawn", sal);

		// Mid-life metadata tick.
		const tokens = Math.round(range(800, 42000));
		node(at(tStart + life * range(0.4, 0.7)), id, {
			status: "running",
			salience: Math.min(1, sal + 0.15),
			meta: { tokens },
		});

		// Occasional cross-reference to earlier work in another lane.
		if (tier === 2 && rng() < 0.07 && allWorkers.length > 8) {
			const other = allWorkers[Math.floor(rng() * allWorkers.length)];
			if (other.id !== id && other.id !== parentId)
				edge(at(tStart + life * 0.5), id, other.id, "ref", 0.14);
		}

		const failed = rng() < 0.04;
		const doneMeta = {
			tokens: Math.round(tokens * range(1.2, 2.4)),
			costUsd: Number(range(0.002, 0.31).toFixed(3)),
			durationMs: Math.round(life * 1000),
			...(failed ? { error: "tool timeout (python)" } : {}),
		};
		complete(tEnd, id, sal, failed ? "error" : "completed", doneMeta);
		if (rng() < 0.3)
			content(at(tEnd - 1), id, pick(SNIPPETS));

		// Most failures get retried by a sibling a few seconds later.
		if (failed && rng() < 0.6) {
			const retryId = nid("r");
			const tr = tEnd + range(3, 7);
			const rEnd = tr + life * range(0.5, 0.9);
			node(at(tr), retryId, {
				label: `retry: ${label}`,
				parent: parentId,
				status: "running",
				salience: Math.min(1, sal + 0.2),
				meta: { model: model(), retries: 1 },
			});
			edge(at(tr), parentId, retryId, "spawn", sal);
			edge(at(tr), id, retryId, "retry", 0.45);
			complete(rEnd, retryId, sal, "completed", {
				tokens: Math.round(tokens * 1.4),
			});
			allWorkers.push({ id: retryId, end: rEnd });
			return { id, end: rEnd };
		}
		return { id, end: tEnd };
	};

	// ── Root ────────────────────────────────────────────────────────────
	const root = "root";
	node(at(0), root, {
		label: "synthesize: quarterly risk assessment",
		status: "running",
		salience: 1,
		meta: { model: "sonnet-4.6", priority: "high" },
	});
	content(
		at(2),
		root,
		"Decomposing the assessment into nine lanes. Each lane fans out " +
			"retrieval and verification workers, then reports back for the " +
			"final synthesis pass.",
	);

	const allWorkers: Worker[] = [];
	let awaitingBudget = 7;
	const branchEnds: number[] = [];

	BRANCH_TOPICS.forEach((topic, bi) => {
		const bId = `branch-${bi}`;
		const bStart = 4 + bi * 9 + range(0, 4);
		const bSal = 0.72 + range(-0.05, 0.08);
		node(at(bStart), bId, {
			label: `plan: ${topic}`,
			parent: root,
			status: "running",
			salience: bSal + 0.15,
			meta: { model: "sonnet-4.6", lane: topic },
		});
		edge(at(bStart), root, bId, "spawn", 0.8);
		content(
			at(bStart + 3),
			bId,
			`Scoping the ${topic} lane: enumerate sources, fan out retrieval, verify against prior quarter, then summarize.`,
		);

		// Two waves of tier-1 workers; a few branches get a late third wave.
		const waves = rng() < 0.35 ? 3 : 2;
		let branchEnd = bStart;
		for (let w = 0; w < waves; w++) {
			const waveStart = bStart + 6 + w * range(55, 90);
			const tier1Count = Math.round(range(4, 8));
			for (let i = 0; i < tier1Count; i++) {
				const t1Start = waveStart + range(0, 28);
				const t1 = spawnWorker(t1Start, bId, 0.42, 1, allWorkers);
				allWorkers.push(t1);
				branchEnd = Math.max(branchEnd, t1.end);

				// A handful of workers pause for user input mid-run.
				if (awaitingBudget > 0 && rng() < 0.09) {
					awaitingBudget--;
					const qt = t1Start + range(6, 14);
					const resume = qt + range(10, 28);
					node(at(qt), t1.id, {
						status: "awaiting",
						salience: 0.85,
						meta: { question: "Ambiguous source — use the amended filing?" },
					});
					node(at(resume), t1.id, {
						status: "running",
						salience: 0.6,
						meta: { answer: "use amended" },
					});
				}

				const tier2Count = Math.round(range(2, 9));
				for (let j = 0; j < tier2Count; j++) {
					const t2 = spawnWorker(
						t1Start + range(3, 22),
						t1.id,
						0.2,
						2,
						allWorkers,
					);
					allWorkers.push(t2);
					branchEnd = Math.max(branchEnd, t2.end);
				}
			}
		}

		const bEnd = branchEnd + range(5, 12);
		content(
			at(bEnd - 1),
			bId,
			`${topic} lane complete. Findings ranked and forwarded to the synthesis pass.`,
		);
		complete(bEnd, bId, bSal, "completed", {
			costUsd: Number(range(0.4, 2.8).toFixed(2)),
		});
		edge(at(bEnd), bId, root, "report", 0.5);
		branchEnds.push(bEnd);
	});

	// ── Synthesis & wind-down ───────────────────────────────────────────
	const rootEnd = Math.max(...branchEnds) + 9;
	node(at(rootEnd - 6), root, {
		status: "running",
		salience: 1,
		meta: { phase: "synthesis" },
	});
	content(
		at(rootEnd - 2),
		root,
		"\n\nAll nine lanes reported. Aggregate exposure is within tolerance; " +
			"two covenant clusters and one vendor dependency are flagged for " +
			"review. Full memo attached to the run record.",
	);
	node(at(rootEnd), root, {
		status: "completed",
		salience: 0.95,
		meta: { totalCostUsd: 14.62, verdict: "2 flags, within tolerance" },
	});
	node(at(rootEnd + 18), root, { status: "completed", salience: 0.8 });

	events.sort((a, b) => a.t - b.t);
	return events;
}
