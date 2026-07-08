// Color math for the constraint engine: colors are (h, s, l) solver
// variables; WCAG contrast is computed on relative luminance.

export type Hsl = { h: number; s: number; l: number };

const NAMED: Record<string, string> = {
	black: "#000000",
	white: "#ffffff",
	red: "#ff0000",
	green: "#008000",
	blue: "#0000ff",
	gray: "#808080",
	grey: "#808080",
	orange: "#ffa500",
	purple: "#800080",
	yellow: "#ffff00",
};

// Parse a CSS color into HSL. Supports #rgb, #rrggbb, rgb()/rgba(), and a
// small named set; anything else (gradients, url(), transparent) returns
// undefined and is left alone by the constraint system.
export function parseColor(value: string): Hsl | undefined {
	const v = NAMED[value.toLowerCase()] ?? value;
	let r: number;
	let g: number;
	let b: number;
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
	if (hex) {
		const c = hex[1];
		if (c.length === 3) {
			r = Number.parseInt(c[0] + c[0], 16);
			g = Number.parseInt(c[1] + c[1], 16);
			b = Number.parseInt(c[2] + c[2], 16);
		} else {
			r = Number.parseInt(c.slice(0, 2), 16);
			g = Number.parseInt(c.slice(2, 4), 16);
			b = Number.parseInt(c.slice(4, 6), 16);
		}
	} else if (rgb) {
		r = Number(rgb[1]);
		g = Number(rgb[2]);
		b = Number(rgb[3]);
	} else {
		return undefined;
	}
	return rgbToHsl(r / 255, g / 255, b / 255);
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
