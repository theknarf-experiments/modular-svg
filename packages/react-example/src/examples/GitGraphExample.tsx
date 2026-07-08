import { type Branch, type Commit, GitGraph } from "./GitGraph";

const branches: Branch[] = [
	{ name: "main" },
	{ name: "develop" },
	{ name: "feature" },
];

// Commits in topological order; two parents make a merge commit
const commits: Commit[] = [
	{ id: "a1f9", branch: "main" },
	{ id: "b7c2", branch: "main", parents: ["a1f9"] },
	{ id: "c3d8", branch: "develop", parents: ["b7c2"] },
	{ id: "d9e4", branch: "feature", parents: ["c3d8"] },
	{ id: "e5f0", branch: "develop", parents: ["c3d8"] },
	{ id: "f1a6", branch: "develop", parents: ["e5f0", "d9e4"] },
	{ id: "g7b3", branch: "main", parents: ["b7c2", "f1a6"], tag: "v1.0" },
];

export function GitGraphExample() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Horizontal (LR)</h3>
				<GitGraph branches={branches} commits={commits} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Vertical (TB)</h3>
				<GitGraph branches={branches} commits={commits} direction="vertical" />
			</div>
		</div>
	);
}
