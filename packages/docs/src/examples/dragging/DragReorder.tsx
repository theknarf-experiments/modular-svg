import { solveScene } from "@modular-svg/react";
import { type Draggable, DraggableRenderer, translate } from "dragology";

type State = { words: string[] };

/** Each word is a chip as wide as its text, so moving one moves the rest. */
export const Scene = ({ words }: State) => (
	<stackH key="sentence" spacing={8}>
		{words.map((word) => (
			<background
				key={`chip-${word}`}
				padding={8}
				fill="#e0e7ff"
				stroke="#6366f1"
				stroke-width={1.5}
				rx={6}
			>
				<text key={`label-${word}`}>{word}</text>
			</background>
		))}
	</stackH>
);

export const moved = <T,>(items: T[], from: number, to: number): T[] => {
	const rest = items.filter((_, i) => i !== from);
	return [...rest.slice(0, to), items[from], ...rest.slice(to)];
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
	const { box, marks } = solveScene(<Scene {...state} />, {
		pin: {
			node: "sentence",
			x: 10,
			y: 10,
		},
		position: "transform",
	});
	return (
		<g>
			{state.words.map((word, i) => {
				const chip = box(`chip-${word}`);
				return (
					<g
						id={`word-${word}`}
						transform={translate(chip.x, chip.y)}
						dragologyZIndex={draggedId === `word-${word}` ? "/1" : false}
						style={{ cursor: "grab" }}
						dragologyOnDrag={() =>
							d
								.closest(
									state.words.map((_, j) => ({
										words: moved(state.words, i, j),
									})),
								)
								.withFloating()
						}
					>
						{marks((id) => id === `chip-${word}` || id === `label-${word}`, {
							origin: chip,
							ids: false,
						})}
					</g>
				);
			})}
		</g>
	);
};

export function DragReorder() {
	return (
		<DraggableRenderer
			draggable={draggable}
			initialState={{ words: ["quick", "the", "fox", "brown", "jumps"] }}
			width={420}
			height={70}
		/>
	);
}
