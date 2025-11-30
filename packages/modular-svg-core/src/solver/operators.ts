export type LayoutOperator = (cur: Float64Array, next: Float64Array) => void;

export type IndexPair = { xIndex: number; widthIndex: number };

export function alignXCenter(indices: readonly IndexPair[]): LayoutOperator {
	return (cur, next) => {
		let sum = 0;
		for (const { xIndex, widthIndex } of indices) {
			sum += cur[xIndex] + cur[widthIndex] / 2;
		}
		const avg = sum / indices.length;
		for (const { xIndex, widthIndex } of indices) {
			next[xIndex] = avg - cur[widthIndex] / 2;
		}
	};
}

export function alignXCenterTo(
	anchor: IndexPair,
	others: readonly IndexPair[],
): LayoutOperator {
	return (cur, next) => {
		const center = cur[anchor.xIndex] + cur[anchor.widthIndex] / 2;
		for (const { xIndex, widthIndex } of others) {
			next[xIndex] = center - cur[widthIndex] / 2;
		}
	};
}

export function alignXLeft(indices: readonly number[]): LayoutOperator {
	return (cur, next) => {
		let min = Infinity;
		for (const idx of indices) {
			if (cur[idx] < min) min = cur[idx];
		}
		for (const idx of indices) {
			next[idx] = min;
		}
	};
}

export function alignYTop(indices: readonly number[]): LayoutOperator {
	return (cur, next) => {
		let min = Infinity;
		for (const idx of indices) {
			if (cur[idx] < min) min = cur[idx];
		}
		for (const idx of indices) {
			next[idx] = min;
		}
	};
}

export function alignXRight(indices: readonly IndexPair[]): LayoutOperator {
	return (cur, next) => {
		let max = -Infinity;
		for (const { xIndex, widthIndex } of indices) {
			const right = cur[xIndex] + cur[widthIndex];
			if (right > max) max = right;
		}
		for (const { xIndex, widthIndex } of indices) {
			next[xIndex] = max - cur[widthIndex];
		}
	};
}

export type YIndexPair = { yIndex: number; heightIndex: number };

export function alignYCenter(indices: readonly YIndexPair[]): LayoutOperator {
	return (cur, next) => {
		let sum = 0;
		for (const { yIndex, heightIndex } of indices) {
			sum += cur[yIndex] + cur[heightIndex] / 2;
		}
		const avg = sum / indices.length;
		for (const { yIndex, heightIndex } of indices) {
			next[yIndex] = avg - cur[heightIndex] / 2;
		}
	};
}

export function alignYBottom(indices: readonly YIndexPair[]): LayoutOperator {
	return (cur, next) => {
		let max = -Infinity;
		for (const { yIndex, heightIndex } of indices) {
			const bottom = cur[yIndex] + cur[heightIndex];
			if (bottom > max) max = bottom;
		}
		for (const { yIndex, heightIndex } of indices) {
			next[yIndex] = max - cur[heightIndex];
		}
	};
}

export type StackChild = { base: number; node: NodeRecord };

export type StackAlignment = "left" | "centerX" | "right";

export function stackV(
	childIndices: readonly StackChild[],
	containerIndex: number,
	spacing: number,
	alignment: StackAlignment,
): LayoutOperator {
	return (cur, next) => {
		let y = 0;
		let maxWidth = 0;
		for (const { base } of childIndices) {
			const w = cur[base + 2];
			const h = cur[base + 3];
			let x = 0;
			const containerW = cur[containerIndex + 2];
			if (alignment === "centerX") {
				x = (containerW - w) / 2;
			} else if (alignment === "right") {
				x = containerW - w;
			}
			next[base] = x;
			next[base + 1] = y;
			y += h + spacing;
			if (w > maxWidth) maxWidth = w;
		}
		next[containerIndex + 2] = maxWidth;
		const total = childIndices.length;
		next[containerIndex + 3] = y - (total > 0 ? spacing : 0);
	};
}

export function distributeX(
	indices: readonly number[],
	spacing = 0,
): LayoutOperator {
	return (cur, next) => {
		if (indices.length < 2) return;
		if (spacing > 0) {
			const anchor = indices[indices.length - 1];
			let x = cur[anchor];
			next[anchor] = x;
			for (let i = indices.length - 2; i >= 0; i--) {
				const base = indices[i];
				const width = cur[base + 2];
				x -= width + spacing;
				next[base] = x;
			}
		} else {
			let min = cur[indices[0]];
			let max = cur[indices[indices.length - 1]];
			for (const idx of indices) {
				if (cur[idx] < min) min = cur[idx];
				if (cur[idx] > max) max = cur[idx];
			}
			const n = indices.length;
			const gap = (max - min) / (n - 1);
			for (let i = 0; i < n; i++) {
				const idx = indices[i];
				next[idx] = min + i * gap;
			}
		}
	};
}

export function distributeY(
	indices: readonly number[],
	spacing = 0,
): LayoutOperator {
	return (cur, next) => {
		if (indices.length < 2) return;
		if (spacing > 0) {
			const anchor = indices[indices.length - 1];
			let y = cur[anchor];
			next[anchor] = y;
			for (let i = indices.length - 2; i >= 0; i--) {
				const base = indices[i];
				const height = cur[base + 3];
				y -= height + spacing;
				next[base] = y;
			}
		} else {
			let min = cur[indices[0]];
			let max = cur[indices[indices.length - 1]];
			for (const idx of indices) {
				if (cur[idx] < min) min = cur[idx];
				if (cur[idx] > max) max = cur[idx];
			}
			const n = indices.length;
			const gap = (max - min) / (n - 1);
			for (let i = 0; i < n; i++) {
				const idx = indices[i];
				next[idx] = min + i * gap;
			}
		}
	};
}

export function stackH(
	childIndices: readonly StackChild[],
	containerIndex: number,
	spacing: number,
	alignment: "top" | "centerY" | "bottom",
): LayoutOperator {
	return (cur, next) => {
		let x = 0;
		let maxHeight = 0;
		for (const { base } of childIndices) {
			const w = cur[base + 2];
			const h = cur[base + 3];
			let y = 0;
			const containerH = cur[containerIndex + 3];
			if (alignment === "centerY") {
				y = (containerH - h) / 2;
			} else if (alignment === "bottom") {
				y = containerH - h;
			}
			next[base] = x;
			next[base + 1] = y;
			x += w + spacing;
			if (h > maxHeight) maxHeight = h;
		}
		next[containerIndex + 3] = maxHeight;
		const total = childIndices.length;
		next[containerIndex + 2] = x - (total > 0 ? spacing : 0);
	};
}

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
