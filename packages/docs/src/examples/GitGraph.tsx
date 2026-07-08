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

const laneId = (branch: string) => `lane-${branch}`;
const labelId = (branch: string) => `lane-${branch}-label`;
const anchorId = (commit: string) => `commit-${commit}`;
const dotId = (commit: string) => `commit-${commit}-dot`;
const edgeId = (from: string, to: string) => `edge-${from}-${to}`;

// Edges reference invisible anchors declared before them, so the visible
// circles (declared after) paint on top without any z-order juggling.
// The stroke color is left to the constraint solver (SameColor), so no
// color is set here.
function Edge({
	id,
	from,
	to,
	direction,
}: {
	id: string;
	from: string;
	to: string;
	direction: "horizontal" | "vertical";
}) {
	return (
		<curve key={id} stroke-width={2} direction={direction}>
			<ref target={anchorId(from)} />
			<ref target={anchorId(to)} />
		</curve>
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
	const horizontal = direction === "horizontal";
	// the axis commits chain along, and the axis lanes align across
	const chainAxis = horizontal ? "x" : "y";
	const laneAlign = horizontal ? "centerY" : "centerX";

	// Every element that should follow a branch's color, grouped by branch:
	// the commit dots on that branch and the edges landing on those commits.
	const branchElements = new Map<string, string[]>(
		branches.map((b) => [b.name, []]),
	);
	for (const c of commits) {
		branchElements.get(c.branch)?.push(dotId(c.id));
		for (const p of c.parents ?? []) {
			branchElements.get(c.branch)?.push(edgeId(p, c.id));
		}
	}

	const LanePill = ({ branch }: { branch: Branch }) => (
		<background
			key={laneId(branch.name)}
			padding={4}
			fill={branch.color}
			stroke-width={0}
			rx={6}
		>
			<text key={labelId(branch.name)} font-size={fontSize}>
				{branch.name}
			</text>
		</background>
	);

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
							<LanePill key={b.name} branch={b} />
						))}
					</stackV>
				) : (
					<stackH key="lanes" spacing={laneSpacing} alignment="bottom">
						{branches.map((b) => (
							<LanePill key={b.name} branch={b} />
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
							key={edgeId(p, c.id)}
							id={edgeId(p, c.id)}
							from={p}
							to={c.id}
							direction={horizontal ? "horizontal" : "vertical"}
						/>
					)),
				)}

				{commits.map((c) => (
					<React.Fragment key={`commit-${c.id}-dot`}>
						<circle key={dotId(c.id)} r={8} stroke="#333" stroke-width={1.5} />
						<align alignment="center">
							<ref target={anchorId(c.id)} />
							<ref target={dotId(c.id)} />
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

				{/* Color constraints (declared last so every dot and edge they
				    reference already exists): pick a distinct color per branch,
				    copy it onto that branch's dots and edges, and make each
				    label readable against its pill */}
				<distinctColors>
					{branches.map((b) => (
						<ref key={b.name} target={laneId(b.name)} />
					))}
				</distinctColors>
				{branches.map((b) => (
					<sameColor key={`same-${b.name}`}>
						<ref target={laneId(b.name)} />
						{(branchElements.get(b.name) ?? []).map((el) => (
							<ref key={el} target={el} />
						))}
					</sameColor>
				))}
				{branches.map((b) => (
					<contrast key={`contrast-${b.name}`} ratio={4.5}>
						<ref target={labelId(b.name)} />
						<ref target={laneId(b.name)} />
					</contrast>
				))}
			</group>
		</Canvas>
	);
}
