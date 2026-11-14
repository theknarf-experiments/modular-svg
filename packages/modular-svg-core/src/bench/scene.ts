// A scene that grows with n and uses every solver domain: a grid of marks in
// stacks, arrows between neighbours, distinct and copied fills with darker
// borders, and an enter per mark staggered by row, rows in sequence. With
// `phrases`, every row's stagger plays inside a phrase of its own. With
// `modulations`, the layout changes four times: the rows turn upside down,
// two rows reverse, the first of them shuffles again, and all of it resolves.
// With `springs`, every enter is a spring and a dot per row rides a smooth,
// oriented route through the row's marks. With `cameras`, the view pushes in
// on every row in turn, following its marks, and pulls back at the end.
const ref = (target: string, paint?: string) => ({
	type: "Ref",
	target,
	...(paint ? { paint } : {}),
});

export function scaleScene(
	n: number,
	opts: {
		phrases?: boolean;
		modulations?: boolean;
		springs?: boolean;
		cameras?: boolean;
	} = {},
): Record<string, unknown> {
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
			props: {
				over: 0.3,
				from: { opacity: 0, y: 6 },
				...(opts.springs ? { ease: "spring" } : {}),
			},
			children: [ref(id)],
		});
	if (opts.springs)
		for (let r = 0; r < rows; r++)
			children.push(
				{ type: "Circle", id: `dot${r}`, props: { r: 3 } },
				{
					type: "Travel",
					id: `trip${r}`,
					props: { route: "smooth", orient: true, ease: "spring", over: 2 },
					children: [ref(`dot${r}`), ...row(r).map((id) => ref(id))],
				},
			);
	for (let r = 0; r < rows; r++) {
		const stagger = {
			type: "Stagger",
			id: `st${r}`,
			props: { spacing: 0.05 },
			children: row(r).map((id) => ref(`${id}In`)),
		};
		children.push(
			opts.phrases
				? {
						type: "Phrase",
						id: `ph${r}`,
						props: { repeat: 2, alternate: true },
						children: [stagger],
					}
				: stagger,
		);
	}
	children.push({
		type: "Sequence",
		props: { gap: 0.1 },
		children: Array.from({ length: rows }, (_, r) =>
			ref(opts.phrases ? `ph${r}` : `st${r}`),
		),
	});
	if (opts.modulations) {
		const restack = (
			id: string,
			at: number,
			type: string,
			spacing: number,
			members: string[],
		) => ({
			type: "Modulate",
			id,
			props: { at, over: 0.4 },
			children: [
				{ type, props: { spacing }, children: members.map((m) => ref(m)) },
			],
		});
		const rowIds = Array.from({ length: rows }, (_, r) => `row${r}`);
		children.push(
			restack("flip", 0, "StackV", 20, [...rowIds].reverse()),
			restack("reverse0", 1, "StackH", 30, [...row(0)].reverse()),
			restack("reverse1", 2, "StackH", 30, [...row(1)].reverse()),
			restack("rotate0", 3, "StackH", 30, [
				...row(0).slice(3),
				...row(0).slice(0, 3),
			]),
			{ type: "Resolve", id: "settle", props: { at: 4, over: 0.4 } },
		);
	}
	if (opts.cameras)
		children.push(
			...Array.from({ length: rows }, (_, r) => ({
				type: "Camera",
				id: `cam${r}`,
				props: { over: 0.2, padding: 10, follow: true },
				children: [ref(`row${r}`)],
			})),
			{ type: "Camera", id: "wide", props: { over: 0.2 } },
			{
				type: "Sequence",
				children: [
					...Array.from({ length: rows }, (_, r) => ref(`cam${r}`)),
					ref("wide"),
				],
			},
		);
	return { type: "Group", id: "root", children };
}

/**
 * A step-by-step visualisation: one stack of `n` marks that `changes`
 * modulations reorder in turn, each resolved before the next.
 */
export function reorderScene(
	n: number,
	changes: number,
): Record<string, unknown> {
	const ids = Array.from({ length: n }, (_, i) => `m${i}`);
	const children: unknown[] = [
		{
			type: "StackV",
			id: "list",
			props: { spacing: 4 },
			children: ids.map((id) => ({
				type: "Rect",
				id,
				props: { width: 24, height: 8 },
			})),
		},
	];
	for (let i = 0; i < changes; i++) {
		const turn = 1 + (i % (n - 1));
		children.push(
			{
				type: "Modulate",
				id: `step${i}`,
				props: { at: i, over: 0.4 },
				children: [
					{
						type: "StackV",
						props: { spacing: 4 },
						children: [...ids.slice(turn), ...ids.slice(0, turn)].map((id) =>
							ref(id),
						),
					},
				],
			},
			{ type: "Resolve", id: `back${i}`, props: { at: i + 0.5, over: 0.4 } },
		);
	}
	return { type: "Group", id: "root", children };
}
