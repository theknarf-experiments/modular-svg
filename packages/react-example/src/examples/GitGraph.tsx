import { Canvas } from "@modular-svg/react";
import * as React from "react";

export type Branch = { name: string; color?: string };

export type Commit = {
	id: string;
	branch: string;
	/** parent commit ids; two parents make a merge commit */
	parents?: string[];
	tag?: string;
};

export type GitGraphProps = {
	/** lane order (top to bottom when horizontal, left to right when vertical) */
	branches: Branch[];
	/** commits in topological order */
	commits: Commit[];
	/** horizontal chains commits left-to-right (mermaid LR, default);
	 * vertical chains them top-to-bottom (mermaid TB) */
	direction?: "horizontal" | "vertical";
	commitSpacing?: number;
	laneSpacing?: number;
	fontSize?: number;
};

const DEFAULT_COLORS = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B3"];

const laneId = (branch: string) => `lane-${branch}`;
const anchorId = (commit: string) => `commit-${commit}`;

// Edges reference invisible anchors declared before them, so the visible
// circles (declared after) paint on top without any z-order juggling
function Edge({
	id,
	from,
	to,
	color,
}: {
	id: string;
	from: string;
	to: string;
	color: string;
}) {
	return React.createElement(
		"line",
		{ key: id, stroke: color, "stroke-width": 2 },
		React.createElement("ref", { target: anchorId(from) }),
		React.createElement("ref", { target: anchorId(to) }),
	);
}

export function GitGraph({
	branches,
	commits,
	direction = "horizontal",
	commitSpacing = 50,
	laneSpacing = 34,
	fontSize = 12,
}: GitGraphProps) {
	const color = new Map(
		branches.map((b, i) => [
			b.name,
			b.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
		]),
	);
	const horizontal = direction === "horizontal";
	// the axis commits chain along, and the axis lanes align across
	const chainAxis = horizontal ? "x" : "y";
	const laneAlign = horizontal ? "centerY" : "centerX";

	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={15}
		>
			<group>
				{/* Branch label pills define the lanes */}
				{horizontal ? (
					<stackV key="lanes" spacing={laneSpacing} alignment="right">
						{branches.map((b) => (
							<background
								key={laneId(b.name)}
								padding={4}
								fill={color.get(b.name)}
								stroke-width={0}
								rx={6}
							>
								<text font-size={fontSize} fill="white">
									{b.name}
								</text>
							</background>
						))}
					</stackV>
				) : (
					<stackH key="lanes" spacing={laneSpacing} alignment="bottom">
						{branches.map((b) => (
							<background
								key={laneId(b.name)}
								padding={4}
								fill={color.get(b.name)}
								stroke-width={0}
								rx={6}
							>
								<text font-size={fontSize} fill="white">
									{b.name}
								</text>
							</background>
						))}
					</stackH>
				)}

				{/* Invisible commit anchors: one column per commit, on its lane */}
				{commits.map((c, i) => (
					<React.Fragment key={anchorId(c.id)}>
						<rect key={anchorId(c.id)} width={0} height={0} stroke-width={0} />
						<align alignment={laneAlign}>
							<ref target={laneId(c.branch)} />
							<ref target={anchorId(c.id)} />
						</align>
						<distribute axis={chainAxis} spacing={i === 0 ? 28 : commitSpacing}>
							<ref target={i === 0 ? "lanes" : anchorId(commits[i - 1].id)} />
							<ref target={anchorId(c.id)} />
						</distribute>
					</React.Fragment>
				))}

				{/* Edges (under), then commit circles, ids, and tags (over) */}
				{commits.flatMap((c) =>
					(c.parents ?? []).map((p) => (
						<Edge
							key={`edge-${p}-${c.id}`}
							id={`edge-${p}-${c.id}`}
							from={p}
							to={c.id}
							color={color.get(c.branch) ?? "#333"}
						/>
					)),
				)}

				{commits.map((c) => (
					<React.Fragment key={`commit-${c.id}-dot`}>
						<circle
							key={`${anchorId(c.id)}-dot`}
							r={8}
							fill={color.get(c.branch)}
							stroke="#333"
							stroke-width={1.5}
						/>
						<align alignment="center">
							<ref target={anchorId(c.id)} />
							<ref target={`${anchorId(c.id)}-dot`} />
						</align>

						<text
							key={`${anchorId(c.id)}-id`}
							font-size={fontSize - 2}
							fill="#555"
						>
							{c.id}
						</text>
						<align alignment={horizontal ? "centerX" : "centerY"}>
							<ref target={anchorId(c.id)} />
							<ref target={`${anchorId(c.id)}-id`} />
						</align>
						<distribute axis={horizontal ? "y" : "x"} spacing={12}>
							<ref target={anchorId(c.id)} />
							<ref target={`${anchorId(c.id)}-id`} />
						</distribute>

						{c.tag && (
							<>
								<background
									key={`${anchorId(c.id)}-tag`}
									padding={3}
									fill="#FFF3C4"
									stroke="#C9A227"
									stroke-width={1}
									rx={4}
								>
									<text font-size={fontSize - 2}>{c.tag}</text>
								</background>
								<align alignment={horizontal ? "centerX" : "centerY"}>
									<ref target={anchorId(c.id)} />
									<ref target={`${anchorId(c.id)}-tag`} />
								</align>
								<distribute axis={horizontal ? "y" : "x"} spacing={16}>
									<ref target={`${anchorId(c.id)}-tag`} />
									<ref target={anchorId(c.id)} />
								</distribute>
								{React.createElement(
									"line",
									{
										key: `${anchorId(c.id)}-tagline`,
										stroke: "#C9A227",
										"stroke-width": 1,
									},
									React.createElement("ref", {
										target: `${anchorId(c.id)}-tag`,
									}),
									React.createElement("ref", { target: anchorId(c.id) }),
								)}
							</>
						)}
					</React.Fragment>
				))}
			</group>
		</Canvas>
	);
}
