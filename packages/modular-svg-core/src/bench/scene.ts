// A scene that grows with n and uses every solver domain: a grid of marks in
// stacks, arrows between neighbours, distinct and copied fills with darker
// borders, and an enter per mark staggered by row, rows in sequence.
const ref = (target: string, paint?: string) => ({
	type: "Ref",
	target,
	...(paint ? { paint } : {}),
});

export function scaleScene(n: number): Record<string, unknown> {
	const rows = Math.ceil(n / 10);
	const ids = Array.from({ length: n }, (_, i) => `m${i}`);
	const row = (r: number) => ids.slice(r * 10, r * 10 + 10);
	const children: unknown[] = [
		{
			type: "StackV",
			id: "grid",
			props: { spacing: 20 },
			children: Array.from({ length: rows }, (_, r) => ({
				type: "StackH",
				id: `row${r}`,
				props: { spacing: 30 },
				children: row(r).map((id) => ({
					type: "Rect",
					id,
					props: { width: 24, height: 16 },
				})),
			})),
		},
	];
	for (let i = 1; i < n; i++)
		children.push({
			type: "Arrow",
			id: `a${i}`,
			children: [ref(ids[i - 1]), ref(ids[i])],
		});
	children.push({
		type: "DistinctColors",
		children: ids.slice(0, 12).map((id) => ref(id)),
	});
	for (let i = 12; i < n; i++)
		children.push({
			type: "SameColor",
			children: [ref(ids[i % 12]), ref(ids[i])],
		});
	for (const id of ids)
		children.push({
			type: "Darken",
			props: { amount: 0.3 },
			children: [ref(id), ref(id, "stroke")],
		});
	for (const id of ids)
		children.push({
			type: "Enter",
			id: `${id}In`,
			props: { over: 0.3, from: { opacity: 0, y: 6 } },
			children: [ref(id)],
		});
	for (let r = 0; r < rows; r++)
		children.push({
			type: "Stagger",
			id: `st${r}`,
			props: { spacing: 0.05 },
			children: row(r).map((id) => ref(`${id}In`)),
		});
	children.push({
		type: "Sequence",
		props: { gap: 0.1 },
		children: Array.from({ length: rows }, (_, r) => ref(`st${r}`)),
	});
	return { type: "Group", id: "root", children };
}
