// Patches that must be in place BEFORE bluefish-js is imported.
//
// bluefish-js ships a self-contained browser bundle (Solid client runtime,
// paper.js, text measurement) that touches DOM APIs at module scope. Under
// vitest's jsdom environment three things are missing or wrong:
//
// 1. paper.js sniffs the user agent; "jsdom" is mapped to node and triggers a
//    broken node-canvas require inside the bundle. Pretend to be Chrome.
// 2. Text measurement uses canvas 2D measureText with actualBoundingBox* and
//    fontBoundingBox* metrics; jsdom has no 2D context. Stub deterministic
//    metrics (0.5em per character, matching modular-svg's heuristic) so text layout is reproducible.
// 3. Bluefish's Text measures words via SVG getComputedTextLength, which
//    jsdom doesn't implement. Same deterministic metric.

Object.defineProperty(window.navigator, "userAgent", {
	value:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
	configurable: true,
});

(
	window.SVGElement.prototype as unknown as {
		getComputedTextLength: () => number;
	}
).getComputedTextLength = function (this: SVGElement) {
	const fontSize = Number.parseFloat(
		(this as unknown as { style?: { fontSize?: string } }).style?.fontSize ||
			this.getAttribute?.("font-size") ||
			"14",
	);
	return (this.textContent ?? "").length * fontSize * 0.5;
};

const origGetContext = window.HTMLCanvasElement.prototype.getContext;
window.HTMLCanvasElement.prototype.getContext = function (
	this: HTMLCanvasElement,
	type: string,
	// biome-ignore lint/suspicious/noExplicitAny: matching the DOM signature
): any {
	if (type !== "2d")
		return (origGetContext as (t: string) => unknown)?.call(this, type) ?? null;
	const base = {
		font: "",
		textBaseline: "alphabetic",
		canvas: this,
		measureText(text: string) {
			const fontSize = Number.parseFloat(
				/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? "14",
			);
			const width = text.length * fontSize * 0.5;
			return {
				width,
				actualBoundingBoxLeft: 0,
				actualBoundingBoxRight: width,
				actualBoundingBoxAscent: fontSize * 0.7,
				actualBoundingBoxDescent: fontSize * 0.2,
				fontBoundingBoxAscent: fontSize * 0.8,
				fontBoundingBoxDescent: fontSize * 0.2,
			};
		},
	};
	// Everything else (save, restore, clearRect, ... used by bundled paper.js)
	// is a no-op.
	return new Proxy(base, {
		get(target, prop) {
			if (prop in target) return target[prop as keyof typeof target];
			return () => undefined;
		},
		set(target, prop, value) {
			(target as Record<string | symbol, unknown>)[prop] = value;
			return true;
		},
	});
};
