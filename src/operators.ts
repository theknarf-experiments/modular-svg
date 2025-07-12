export type LayoutOperator = {
	/** Optional Lipschitz constant for convergence analysis */
	readonly lipschitz?: number;
	/** Apply this operator: read from cur, write into next */
	eval(cur: Float64Array, next: Float64Array): void;
};

export type IndexPair = { xIndex: number; widthIndex: number };

export class AlignXCenter implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: IndexPair[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let sum = 0;
		for (const { xIndex, widthIndex } of this.indices) {
			sum += cur[xIndex] + cur[widthIndex] / 2;
		}
		const avg = sum / this.indices.length;
		for (const { xIndex, widthIndex } of this.indices) {
			next[xIndex] = avg - cur[widthIndex] / 2;
		}
	}
}

export class AlignXCenterTo implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly anchor: IndexPair,
		private readonly others: IndexPair[],
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		const center = cur[this.anchor.xIndex] + cur[this.anchor.widthIndex] / 2;
		for (const { xIndex, widthIndex } of this.others) {
			next[xIndex] = center - cur[widthIndex] / 2;
		}
	}
}

export class AlignXLeft implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: number[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let min = Infinity;
		for (const idx of this.indices) {
			if (cur[idx] < min) min = cur[idx];
		}
		for (const idx of this.indices) {
			next[idx] = min;
		}
	}
}

export class AlignYTop implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: number[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let min = Infinity;
		for (const idx of this.indices) {
			if (cur[idx] < min) min = cur[idx];
		}
		for (const idx of this.indices) {
			next[idx] = min;
		}
	}
}

export class AlignXRight implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: IndexPair[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let max = -Infinity;
		for (const { xIndex, widthIndex } of this.indices) {
			const right = cur[xIndex] + cur[widthIndex];
			if (right > max) max = right;
		}
		for (const { xIndex, widthIndex } of this.indices) {
			next[xIndex] = max - cur[widthIndex];
		}
	}
}

export type YIndexPair = { yIndex: number; heightIndex: number };

export class AlignYCenter implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: YIndexPair[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let sum = 0;
		for (const { yIndex, heightIndex } of this.indices) {
			sum += cur[yIndex] + cur[heightIndex] / 2;
		}
		const avg = sum / this.indices.length;
		for (const { yIndex, heightIndex } of this.indices) {
			next[yIndex] = avg - cur[heightIndex] / 2;
		}
	}
}

export class AlignYBottom implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(private readonly indices: YIndexPair[]) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let max = -Infinity;
		for (const { yIndex, heightIndex } of this.indices) {
			const bottom = cur[yIndex] + cur[heightIndex];
			if (bottom > max) max = bottom;
		}
		for (const { yIndex, heightIndex } of this.indices) {
			next[yIndex] = max - cur[heightIndex];
		}
	}
}

export type StackChild = { base: number; node: NodeRecord };

export type StackAlignment = "left" | "centerX" | "right";

export class StackV implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly childIndices: StackChild[],
		private readonly containerIndex: number,
		private readonly spacing: number,
		private readonly alignment: StackAlignment,
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let y = 0;
		let maxWidth = 0;
		for (const { base } of this.childIndices) {
			const w = cur[base + 2];
			const h = cur[base + 3];
			let x = 0;
			const containerW = cur[this.containerIndex + 2];
			if (this.alignment === "centerX") {
				x = (containerW - w) / 2;
			} else if (this.alignment === "right") {
				x = containerW - w;
			}
			next[base] = x;
			next[base + 1] = y;
			y += h + this.spacing;
			if (w > maxWidth) maxWidth = w;
		}
		next[this.containerIndex + 2] = maxWidth;
		const total = this.childIndices.length;
		next[this.containerIndex + 3] = y - (total > 0 ? this.spacing : 0);
	}
}

export class DistributeX implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly indices: number[],
		private readonly spacing = 0,
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		if (this.indices.length < 2) return;
		if (this.spacing > 0) {
			let x = cur[this.indices[0]];
			next[this.indices[0]] = x;
			for (let i = 1; i < this.indices.length; i++) {
				const prevBase = this.indices[i - 1];
				const prevWidth = cur[prevBase + 2];
				x += prevWidth + this.spacing;
				next[this.indices[i]] = x;
			}
		} else {
			let min = cur[this.indices[0]];
			let max = cur[this.indices[this.indices.length - 1]];
			for (const idx of this.indices) {
				if (cur[idx] < min) min = cur[idx];
				if (cur[idx] > max) max = cur[idx];
			}
			const n = this.indices.length;
			const gap = (max - min) / (n - 1);
			for (let i = 0; i < n; i++) {
				const idx = this.indices[i];
				next[idx] = min + i * gap;
			}
		}
	}
}

export class DistributeY implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly indices: number[],
		private readonly spacing = 0,
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		if (this.indices.length < 2) return;
		if (this.spacing > 0) {
			let y = cur[this.indices[0]];
			next[this.indices[0]] = y;
			for (let i = 1; i < this.indices.length; i++) {
				const prevBase = this.indices[i - 1];
				const prevHeight = cur[prevBase + 3];
				y += prevHeight + this.spacing;
				next[this.indices[i]] = y;
			}
		} else {
			let min = cur[this.indices[0]];
			let max = cur[this.indices[this.indices.length - 1]];
			for (const idx of this.indices) {
				if (cur[idx] < min) min = cur[idx];
				if (cur[idx] > max) max = cur[idx];
			}
			const n = this.indices.length;
			const gap = (max - min) / (n - 1);
			for (let i = 0; i < n; i++) {
				const idx = this.indices[i];
				next[idx] = min + i * gap;
			}
		}
	}
}

export class StackH implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly childIndices: StackChild[],
		private readonly containerIndex: number,
		private readonly spacing: number,
		private readonly alignment: "top" | "centerY" | "bottom",
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		let x = 0;
		let maxHeight = 0;
		for (const { base } of this.childIndices) {
			const w = cur[base + 2];
			const h = cur[base + 3];
			let y = 0;
			const containerH = cur[this.containerIndex + 3];
			if (this.alignment === "centerY") {
				y = (containerH - h) / 2;
			} else if (this.alignment === "bottom") {
				y = containerH - h;
			}
			next[base] = x;
			next[base + 1] = y;
			x += w + this.spacing;
			if (h > maxHeight) maxHeight = h;
		}
		next[this.containerIndex + 3] = maxHeight;
		const total = this.childIndices.length;
		next[this.containerIndex + 2] = x - (total > 0 ? this.spacing : 0);
	}
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

export class BackgroundOp implements LayoutOperator {
	readonly lipschitz = 1;
	constructor(
		private readonly childIndex: number,
		private readonly boxIndex: number,
		private readonly padding: number,
	) {}

	eval(cur: Float64Array, next: Float64Array): void {
		const x = cur[this.childIndex];
		const y = cur[this.childIndex + 1];
		const w = cur[this.childIndex + 2];
		const h = cur[this.childIndex + 3];
		next[this.boxIndex] = x - this.padding;
		next[this.boxIndex + 1] = y - this.padding;
		next[this.boxIndex + 2] = w + this.padding * 2;
		next[this.boxIndex + 3] = h + this.padding * 2;
	}
}
