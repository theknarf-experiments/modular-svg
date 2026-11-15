#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import {
	buildSceneFromJson,
	checkSolution,
	layoutToSvg,
	solveLayout,
	validate,
} from "../packages/modular-svg-core/src/index.ts";

async function readInput(arg?: string): Promise<string> {
	if (arg && arg !== "-") {
		return await readFile(arg, "utf8");
	}
	if (process.stdin.isTTY) {
		console.error("Usage: modular-svg <scene.json|-> [output.svg|-]");
		process.exit(1);
	}
	let data = "";
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

const program = new Command();
program
	.name("modular-svg")
	.argument("[input]", "scene JSON file or '-' to read from stdin")
	.argument("[output]", "output SVG file or '-' for stdout")
	.option("-m, --margin <number>", "margin around the SVG", "3")
	.option("-d, --duration <seconds>", "animation length (default: last motion)")
	.option("-l, --loop", "replay the animation forever")
	.option("--width <px>", "output width; the canvas is fitted into it")
	.option("--height <px>", "output height; the canvas is fitted into it")
	.option("--aspect <ratio>", "output width over height, as a number")
	.action(
		async (input: string | undefined, output: string | undefined, opts) => {
			const raw = await readInput(input);
			const data = JSON.parse(raw);
			try {
				await validate(data);
			} catch (err) {
				console.error(
					`Invalid scene: ${err instanceof Error ? err.message : err}`,
				);
				process.exit(1);
			}
			const scene = buildSceneFromJson(data);
			const layout = solveLayout(scene);
			for (const w of [...scene.warnings, ...checkSolution(scene, layout)])
				console.error(`warning: ${w}`);
			const svg = layoutToSvg(layout, scene.nodes, Number(opts.margin), {
				animation: {
					loop: !!opts.loop,
					...(opts.duration ? { duration: Number(opts.duration) } : {}),
				},
				...(opts.width || opts.height || opts.aspect
					? {
							view: Object.fromEntries(
								(["width", "height", "aspect"] as const)
									.filter((side) => opts[side])
									.map((side) => [side, Number(opts[side])]),
							),
						}
					: {}),
			});
			if (output && output !== "-") {
				await writeFile(output, svg);
			} else {
				process.stdout.write(svg);
			}
		},
	);

program.parseAsync(process.argv).catch((err) => {
	console.error(err);
	process.exit(1);
});
