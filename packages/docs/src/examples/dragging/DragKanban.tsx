import { solveScene } from "@modular-svg/react";
import { type Draggable, DraggableRenderer, translate } from "dragology";

const columns = ["todo", "doing", "done"] as const;
type Column = (typeof columns)[number];
/** Cards by id, ids being what Dragology matches elements across states by */
type State = Record<Column, string[]>;

const labels: Record<string, string> = {
	docs: "write docs",
	bug: "fix the bug",
	review: "review",
	ship: "ship it",
};

const Card = ({ id }: { id: string }) => (
	<background
		key={`card-${id}`}
		padding={8}
		fill="white"
		stroke="#d1d5db"
		stroke-width={1}
		rx={6}
	>
		<text key={`label-${id}`}>{labels[id] ?? id}</text>
	</background>
);

const Lane = ({ column, cards }: { column: Column; cards: string[] }) => (
	<background
		key={`column-${column}`}
		padding={12}
		fill="#f3f4f6"
		stroke="none"
		rx={10}
	>
		<stackV spacing={8} alignment="left">
			<text key={`title-${column}`} font-size={12} fill="#6b7280">
				{column.toUpperCase()}
			</text>
			{cards.map((id) => (
				<Card key={id} id={id} />
			))}
		</stackV>
	</background>
);

/** Columns grow with their cards; the board only says how things stack. */
export const Scene = (state: State) => (
	<stackH key="board" spacing={16} alignment="top">
		{columns.map((column) => (
			<Lane key={column} column={column} cards={state[column]} />
		))}
	</stackH>
);

/** Every board where `card` sits somewhere, the rest in their order. */
export const placements = (state: State, card: string): State[] => {
	const without = Object.fromEntries(
		columns.map((c) => [c, state[c].filter((x) => x !== card)]),
	) as State;
	return columns.flatMap((column) =>
		without[column].concat([""]).map((_, i) => ({
			...without,
			[column]: [
				...without[column].slice(0, i),
				card,
				...without[column].slice(i),
			],
		})),
	);
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
	const { box, marks } = solveScene(<Scene {...state} />, {
		pin: {
			node: "board",
			x: 10,
			y: 10,
		},
		position: "transform",
	});
	const cards = columns.flatMap((column) => state[column]);
	return (
		<g>
			{marks((id) => id.startsWith("column-") || id.startsWith("title-"))}
			{cards.map((card) => {
				const at = box(`card-${card}`);
				return (
					<g
						id={`drag-${card}`}
						transform={translate(at.x, at.y)}
						dragologyZIndex={draggedId === `drag-${card}` ? "/1" : false}
						style={{ cursor: "grab" }}
						dragologyOnDrag={() =>
							d.closest(placements(state, card)).withFloating()
						}
					>
						{marks((id) => id === `card-${card}` || id === `label-${card}`, {
							origin: at,
							ids: false,
						})}
					</g>
				);
			})}
		</g>
	);
};

export function DragKanban() {
	return (
		<DraggableRenderer
			draggable={draggable}
			initialState={{
				todo: ["docs", "bug"],
				doing: ["review"],
				done: ["ship"],
			}}
			width={520}
			height={260}
		/>
	);
}
