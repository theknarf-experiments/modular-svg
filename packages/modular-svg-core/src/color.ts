// Color math for the constraint engine: colors are (h, s, l) solver
// variables; WCAG contrast is computed on relative luminance.

export type Hsl = { h: number; s: number; l: number };

// The CSS named colors, as "name rrggbb" pairs
const NAMED = new Map<string, string>(
	"aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32"
		.split(" ")
		.flatMap((w, i, all) =>
			i % 2 === 0 ? [[w, `#${all[i + 1]}`] as [string, string]] : [],
		),
);

/** sRGB channels and alpha, each 0..1. */
export type Rgba = { r: number; g: number; b: number; a: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// A CSS number, percentage (of `percentOf`) or, for hues, an angle in degrees
function amount(token: string, percentOf: number): number {
	if (token.endsWith("%")) return (Number.parseFloat(token) / 100) * percentOf;
	return Number.parseFloat(token);
}
function hueDegrees(token: string): number {
	const v = Number.parseFloat(token);
	if (token.endsWith("turn")) return v * 360;
	if (token.endsWith("grad")) return v * 0.9;
	if (token.endsWith("rad")) return (v * 180) / Math.PI;
	return v;
}

/**
 * Parse a CSS color: #rgb(a)/#rrggbb(aa), rgb()/rgba(), hsl()/hsla(),
 * oklch(), transparent and the named colors, with comma or space syntax and
 * an optional alpha. Anything else (gradients, url(), currentColor, none)
 * returns undefined and is left alone by the constraint system.
 */
export function parseRgba(value: string): Rgba | undefined {
	const v = value.trim().toLowerCase();
	if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
	const named = NAMED.get(v);
	const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(named ?? v);
	if (hex) {
		const c = hex[1];
		const digits =
			c.length <= 4 ? [...c].map((d) => d + d) : (c.match(/../g) as string[]);
		const [r, g, b, a = "ff"] = digits;
		return {
			r: Number.parseInt(r, 16) / 255,
			g: Number.parseInt(g, 16) / 255,
			b: Number.parseInt(b, 16) / 255,
			a: Number.parseInt(a, 16) / 255,
		};
	}
	const fn = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(v);
	if (!fn) return undefined;
	const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
	if (parts.length < 3 || parts.some((p) => Number.isNaN(Number.parseFloat(p))))
		return undefined;
	const alpha = parts[3] !== undefined ? clamp01(amount(parts[3], 1)) : 1;
	if (fn[1].startsWith("rgb")) {
		const [r, g, b] = parts
			.slice(0, 3)
			.map((p) => clamp01(amount(p, 255) / 255));
		return { r, g, b, a: alpha };
	}
	if (fn[1].startsWith("hsl")) {
		const [r, g, b] = hslToRgb(
			hueDegrees(parts[0]),
			clamp01(amount(parts[1], 1) / (parts[1].endsWith("%") ? 1 : 100)),
			clamp01(amount(parts[2], 1) / (parts[2].endsWith("%") ? 1 : 100)),
		);
		return { r, g, b, a: alpha };
	}
	const [r, g, b] = oklchToRgb(
		amount(parts[0], 1),
		amount(parts[1], 0.4),
		hueDegrees(parts[2]),
	);
	return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: alpha };
}

/** Parse a CSS color into HSL plus alpha (see parseRgba for the syntax). */
export function parseColor(value: string): (Hsl & { a: number }) | undefined {
	const c = parseRgba(value);
	return c && { ...rgbToHsl(c.r, c.g, c.b), a: c.a };
}

// --- OKLab / OKLCH (Björn Ottosson's perceptual color space) ---------------

const toLinear = (c: number) =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
	c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** sRGB (0..1) to OKLCH: lightness 0..1, chroma, hue in degrees. */
export function rgbToOklch(
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const C = Math.hypot(A, B);
	const h =
		C < 1e-7 ? 0 : ((((Math.atan2(B, A) * 180) / Math.PI) % 360) + 360) % 360;
	return [L, C, h];
}

/** OKLCH to sRGB channels; may fall outside 0..1 for out-of-gamut colors. */
export function oklchToRgb(
	L: number,
	C: number,
	h: number,
): [number, number, number] {
	const rad = (h * Math.PI) / 180;
	const [A, B] = [C * Math.cos(rad), C * Math.sin(rad)];
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}

const inGamut = ([r, g, b]: [number, number, number]) =>
	[r, g, b].every((c) => c >= -1e-7 && c <= 1 + 1e-7);

/**
 * OKLCH to displayable sRGB: an out-of-gamut color keeps its lightness and
 * hue and loses chroma until it fits (CSS Color 4's gamut mapping in spirit).
 */
export function oklchToDisplayRgb(
	L: number,
	C: number,
	h: number,
): [number, number, number] {
	const lightness = clamp01(L);
	let rgb = oklchToRgb(lightness, C, h);
	if (!inGamut(rgb)) {
		let [lo, hi] = [0, C];
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut(oklchToRgb(lightness, mid, h))) lo = mid;
			else hi = mid;
		}
		rgb = oklchToRgb(lightness, lo, h);
	}
	return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
}

/** sRGB channels and alpha as #rrggbb, or #rrggbbaa when translucent. */
export function rgbaToHex(r: number, g: number, b: number, a = 1): string {
	const to = (c: number) =>
		Math.round(clamp01(c) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${to(r)}${to(g)}${to(b)}${a < 1 ? to(a) : ""}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
	else if (max === g) h = ((b - r) / d + 2) * 60;
	else h = ((r - g) / d + 4) * 60;
	return { h, s, l };
}

export function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	const hue = ((h % 360) + 360) % 360;
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const channel = (t0: number) => {
		let t = t0;
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const hh = hue / 360;
	return [channel(hh + 1 / 3), channel(hh), channel(hh - 1 / 3)];
}

export function hslToHex(h: number, s: number, l: number): string {
	const [r, g, b] = hslToRgb(h, s, l);
	const to = (c: number) =>
		Math.round(Math.max(0, Math.min(1, c)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${to(r)}${to(g)}${to(b)}`;
}

// WCAG relative luminance of an sRGB color (channels 0..1)
export function luminance(r: number, g: number, b: number): number {
	const lin = (c: number) =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function luminanceOfHsl(h: number, s: number, l: number): number {
	const [r, g, b] = hslToRgb(h, s, l);
	return luminance(r, g, b);
}

// WCAG contrast ratio between two luminances
export function contrastRatio(y1: number, y2: number): number {
	const [hi, lo] = y1 > y2 ? [y1, y2] : [y2, y1];
	return (hi + 0.05) / (lo + 0.05);
}

// The lightness (keeping h and s) that satisfies the contrast ratio against
// a background luminance, staying as close to the current lightness as
// possible; falls back to whichever extreme has the most contrast.
export function contrastingLightness(
	h: number,
	s: number,
	currentL: number,
	bgLuminance: number,
	ratio: number,
): number {
	let best: number | undefined;
	let bestDist = Infinity;
	let extreme = 0;
	let extremeRatio = 0;
	for (let l = 0; l <= 1.0001; l += 0.02) {
		const r = contrastRatio(luminanceOfHsl(h, s, l), bgLuminance);
		if (r > extremeRatio) {
			extremeRatio = r;
			extreme = l;
		}
		if (r >= ratio) {
			const dist = Math.abs(l - currentL);
			if (dist < bestDist) {
				bestDist = dist;
				best = l;
			}
		}
	}
	return best ?? extreme;
}
