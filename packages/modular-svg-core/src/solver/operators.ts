export type LayoutOperator = (cur: Float64Array, next: Float64Array) => void;

export type NodeRecord = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	type?: "rect" | "circle" | "text" | "arrow";
	r?: number;
	text?: string;
	/** id of source node for arrows */
	from?: string;
	/** id of target node for arrows */
	to?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
};

// A relation child: the node's own slot base plus the bases of every node in
// its structural subtree (including itself). Moving a child moves its whole
// subtree by the same delta, which is what makes nested containers compose
// in the flat coordinate space.
export type SubtreeChild = { base: number; subtree: readonly number[] };

export type StackAlignment = "left" | "centerX" | "right";
export type StackAlignmentH = "top" | "centerY" | "bottom";
export type AlignmentX = "left" | "centerX" | "right";
export type AlignmentY = "top" | "centerY" | "bottom";

// Slot layout: base+0 = x, base+1 = y, base+2 = width, base+3 = height.

function moveSubtree(
	cur: Float64Array,
	next: Float64Array,
	child: SubtreeChild,
	slotOffset: 0 | 1,
	delta: number,
): void {
	if (delta === 0) return;
	for (const base of child.subtree) {
		next[base + slotOffset] = cur[base + slotOffset] + delta;
	}
}

function alignCoordX(
	cur: Float64Array,
	base: number,
	alignment: AlignmentX,
): number {
	if (alignment === "left") return cur[base];
	if (alignment === "centerX") return cur[base] + cur[base + 2] / 2;
	return cur[base] + cur[base + 2];
}

function alignCoordY(
	cur: Float64Array,
	base: number,
	alignment: AlignmentY,
): number {
	if (alignment === "top") return cur[base + 1];
	if (alignment === "centerY") return cur[base + 1] + cur[base + 3] / 2;
	return cur[base + 1] + cur[base + 3];
}

function targetXFromLine(
	cur: Float64Array,
	base: number,
	alignment: AlignmentX,
	line: number,
): number {
	if (alignment === "left") return line;
	if (alignment === "centerX") return line - cur[base + 2] / 2;
	return line - cur[base + 2];
}

function targetYFromLine(
	cur: Float64Array,
	base: number,
	alignment: AlignmentY,
	line: number,
): number {
	if (alignment === "top") return line;
	if (alignment === "centerY") return line - cur[base + 3] / 2;
	return line - cur[base + 3];
}

// Write the container's bbox as the union of its children's target bboxes.
function writeUnion(
	next: Float64Array,
	containerIndex: number,
	xs: number[],
	ys: number[],
	widths: number[],
	heights: number[],
): void {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < xs.length; i++) {
		if (xs[i] < minX) minX = xs[i];
		if (ys[i] < minY) minY = ys[i];
		if (xs[i] + widths[i] > maxX) maxX = xs[i] + widths[i];
		if (ys[i] + heights[i] > maxY) maxY = ys[i] + heights[i];
	}
	if (xs.length === 0) return;
	next[containerIndex] = minX;
	next[containerIndex + 1] = minY;
	next[containerIndex + 2] = maxX - minX;
	next[containerIndex + 3] = maxY - minY;
}

// Bluefish-style stack: children are packed along the main axis with fixed
// spacing and aligned across it. If a child's position is owned by another
// relation (anchor), the run is placed so that child stays fixed; otherwise
// the run anchors on the container's current position. The container's bbox
// becomes the union of its children.
function stack(
	horizontal: boolean,
	children: readonly SubtreeChild[],
	containerIndex: number,
	spacing: number,
	alignment: AlignmentX | AlignmentY,
	mainAnchor: number | null,
	crossAnchor: number | null,
): LayoutOperator {
	const mainSlot = horizontal ? 0 : 1;
	const extentSlot = horizontal ? 2 : 3;
	return (cur, next) => {
		if (children.length === 0) return;

		// Cumulative offsets along the main axis
		const offsets: number[] = [];
		let acc = 0;
		for (const c of children) {
			offsets.push(acc);
			acc += cur[c.base + extentSlot] + spacing;
		}

		const start =
			mainAnchor !== null
				? cur[children[mainAnchor].base + mainSlot] - offsets[mainAnchor]
				: cur[containerIndex + mainSlot];

		// Cross-axis alignment line
		const line =
			crossAnchor !== null
				? horizontal
					? alignCoordY(
							cur,
							children[crossAnchor].base,
							alignment as AlignmentY,
						)
					: alignCoordX(
							cur,
							children[crossAnchor].base,
							alignment as AlignmentX,
						)
				: horizontal
					? alignCoordY(cur, containerIndex, alignment as AlignmentY)
					: alignCoordX(cur, containerIndex, alignment as AlignmentX);

		const xs: number[] = [];
		const ys: number[] = [];
		const ws: number[] = [];
		const hs: number[] = [];

		for (let i = 0; i < children.length; i++) {
			const c = children[i];
			const main = start + offsets[i];
			const cross = horizontal
				? targetYFromLine(cur, c.base, alignment as AlignmentY, line)
				: targetXFromLine(cur, c.base, alignment as AlignmentX, line);
			const targetX = horizontal ? main : cross;
			const targetY = horizontal ? cross : main;

			if (i !== mainAnchor) {
				moveSubtree(
					cur,
					next,
					c,
					mainSlot as 0 | 1,
					main - cur[c.base + mainSlot],
				);
			}
			if (i !== crossAnchor) {
				const crossSlot = (horizontal ? 1 : 0) as 0 | 1;
				moveSubtree(cur, next, c, crossSlot, cross - cur[c.base + crossSlot]);
			}

			// Union uses the target positions except for anchored slots, which
			// keep their current values.
			xs.push(
				i === (horizontal ? mainAnchor : crossAnchor) ? cur[c.base] : targetX,
			);
			ys.push(
				i === (horizontal ? crossAnchor : mainAnchor)
					? cur[c.base + 1]
					: targetY,
			);
			ws.push(cur[c.base + 2]);
			hs.push(cur[c.base + 3]);
		}

		writeUnion(next, containerIndex, xs, ys, ws, hs);
	};
}

export function stackV(
	children: readonly SubtreeChild[],
	containerIndex: number,
	spacing: number,
	alignment: AlignmentX,
	mainAnchor: number | null = null,
	crossAnchor: number | null = null,
): LayoutOperator {
	return stack(
		false,
		children,
		containerIndex,
		spacing,
		alignment,
		mainAnchor,
		crossAnchor,
	);
}

export function stackH(
	children: readonly SubtreeChild[],
	containerIndex: number,
	spacing: number,
	alignment: AlignmentY,
	mainAnchor: number | null = null,
	crossAnchor: number | null = null,
): LayoutOperator {
	return stack(
		true,
		children,
		containerIndex,
		spacing,
		alignment,
		mainAnchor,
		crossAnchor,
	);
}

// Bluefish-style align: the anchor child (first child whose position is
// owned, falling back to the first child) supplies the alignment line; every
// other child is moved onto it.
export function alignX(
	children: readonly SubtreeChild[],
	alignment: AlignmentX,
	anchor: number,
): LayoutOperator {
	return (cur, next) => {
		const line = alignCoordX(cur, children[anchor].base, alignment);
		for (let i = 0; i < children.length; i++) {
			if (i === anchor) continue;
			const target = targetXFromLine(cur, children[i].base, alignment, line);
			moveSubtree(cur, next, children[i], 0, target - cur[children[i].base]);
		}
	};
}

export function alignY(
	children: readonly SubtreeChild[],
	alignment: AlignmentY,
	anchor: number,
): LayoutOperator {
	return (cur, next) => {
		const line = alignCoordY(cur, children[anchor].base, alignment);
		for (let i = 0; i < children.length; i++) {
			if (i === anchor) continue;
			const target = targetYFromLine(cur, children[i].base, alignment, line);
			moveSubtree(
				cur,
				next,
				children[i],
				1,
				target - cur[children[i].base + 1],
			);
		}
	};
}

// Distribute along an axis. With spacing > 0 the children are packed with
// exactly that edge-to-edge gap, anchored on the anchor child (first owned,
// falling back to the first child). With spacing <= 0 the children spread
// evenly between the current outermost positions (an extension; Bluefish
// requires spacing or total).
function distribute(
	horizontal: boolean,
	children: readonly SubtreeChild[],
	spacing: number,
	anchor: number,
): LayoutOperator {
	const slot = (horizontal ? 0 : 1) as 0 | 1;
	const extentSlot = horizontal ? 2 : 3;
	return (cur, next) => {
		if (children.length < 2) return;
		if (spacing > 0) {
			const offsets: number[] = [];
			let acc = 0;
			for (const c of children) {
				offsets.push(acc);
				acc += cur[c.base + extentSlot] + spacing;
			}
			const start = cur[children[anchor].base + slot] - offsets[anchor];
			for (let i = 0; i < children.length; i++) {
				if (i === anchor) continue;
				const target = start + offsets[i];
				moveSubtree(
					cur,
					next,
					children[i],
					slot,
					target - cur[children[i].base + slot],
				);
			}
		} else {
			let min = Infinity;
			let max = -Infinity;
			for (const c of children) {
				const v = cur[c.base + slot];
				if (v < min) min = v;
				if (v > max) max = v;
			}
			const n = children.length;
			const gap = (max - min) / (n - 1);
			for (let i = 0; i < n; i++) {
				const target = min + i * gap;
				moveSubtree(
					cur,
					next,
					children[i],
					slot,
					target - cur[children[i].base + slot],
				);
			}
		}
	};
}

export function distributeX(
	children: readonly SubtreeChild[],
	spacing = 0,
	anchor = 0,
): LayoutOperator {
	return distribute(true, children, spacing, anchor);
}

export function distributeY(
	children: readonly SubtreeChild[],
	spacing = 0,
	anchor = 0,
): LayoutOperator {
	return distribute(false, children, spacing, anchor);
}

export function backgroundOp(
	childIndex: number,
	boxIndex: number,
	padding: number,
): LayoutOperator {
	return (cur, next) => {
		const x = cur[childIndex];
		const y = cur[childIndex + 1];
		const w = cur[childIndex + 2];
		const h = cur[childIndex + 3];
		next[boxIndex] = x - padding;
		next[boxIndex + 1] = y - padding;
		next[boxIndex + 2] = w + padding * 2;
		next[boxIndex + 3] = h + padding * 2;
	};
}

// Container bbox = union of children's current bboxes (Group, Align,
// Distribute and other relation nodes that don't lay out their children).
export function unionOp(
	childBases: readonly number[],
	containerIndex: number,
): LayoutOperator {
	return (cur, next) => {
		const xs: number[] = [];
		const ys: number[] = [];
		const ws: number[] = [];
		const hs: number[] = [];
		for (const base of childBases) {
			xs.push(cur[base]);
			ys.push(cur[base + 1]);
			ws.push(cur[base + 2]);
			hs.push(cur[base + 3]);
		}
		writeUnion(next, containerIndex, xs, ys, ws, hs);
	};
}
