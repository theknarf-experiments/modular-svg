import type { LayoutOperator, NodeRecord } from "./operators";

export type Scene = {
	nodes: NodeRecord[];
	operators: LayoutOperator[];
};

export type LayoutResult = Record<
	string,
	{ x: number; y: number; width: number; height: number }
>;

export function compileScene(scene: Scene): {
	indexMap: Map<string, number>;
	cur: Float64Array;
	operators: LayoutOperator[];
} {
	const indexMap = new Map<string, number>();
	scene.nodes.forEach((n, i) => {
		indexMap.set(n.id, i * 4);
	});
	const cur = new Float64Array(scene.nodes.length * 4);
	scene.nodes.forEach((n) => {
		const base = indexMap.get(n.id) as number;
		cur[base] = n.x;
		cur[base + 1] = n.y;
		cur[base + 2] = n.width;
		cur[base + 3] = n.height;
	});
	return { indexMap, cur, operators: scene.operators };
}

export function solveLayout(
	scene: Scene,
	opts?: { maxIter?: number; epsilon?: number; damping?: number },
): LayoutResult {
	const { indexMap, cur, operators } = compileScene(scene);
	const maxIter = opts?.maxIter ?? 100;
	const epsilon = opts?.epsilon ?? 1e-6;
	const lambda = opts?.damping ?? 0.5;
	const next = new Float64Array(cur.length);
	let iter = 0;
	let residual = Infinity;
	while (iter < maxIter && residual > epsilon) {
		residual = 0;
		for (const op of operators) {
			next.set(cur);
			op.eval(cur, next);
			for (let i = 0; i < cur.length; i++) {
				const diff = next[i] - cur[i];
				const abs = Math.abs(diff);
				if (abs > residual) residual = abs;
				cur[i] += lambda * diff;
			}
		}
		iter++;
	}
	const result: LayoutResult = {};
	for (const n of scene.nodes) {
		const base = indexMap.get(n.id) as number;
		result[n.id] = {
			x: cur[base],
			y: cur[base + 1],
			width: cur[base + 2],
			height: cur[base + 3],
		};
	}
	return result;
}
