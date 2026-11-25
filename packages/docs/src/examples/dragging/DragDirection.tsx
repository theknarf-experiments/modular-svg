import { solveScene } from "@modular-svg/react";
import { type Draggable, DraggableRenderer, translate } from "dragology";

type State = { direction: "stackH" | "stackV" };

/** modular-svg decides where the boxes sit in either direction. */
export const Scene = ({ direction }: State) => {
	const boxes = (
		<>
			<rect
				key="a"
				width={60}
				height={40}
				fill="#f9a8d4"
				stroke="none"
				stroke-width={0}
				rx={6}
			/>
			<rect
				key="b"
				width={40}
				height={60}
				fill="#fde68a"
				stroke="none"
				stroke-width={0}
				rx={6}
			/>
			<rect
				key="c"
				width={50}
				height={50}
				fill="#a5f3fc"
				stroke="none"
				stroke-width={0}
				rx={6}
			/>
		</>
	);
	return direction === "stackH" ? (
		<stackH spacing={12}>{boxes}</stackH>
	) : (
		<stackV spacing={12}>{boxes}</stackV>
	);
};

const draggable: Draggable<State> = ({ state, d }) => {
	const { box, marks } = solveScene(<Scene {...state} />, {
		pin: {
			node: "a",
			x: 10,
			y: 30,
		},
		position: "transform",
	});
	const last = box("c");
	return (
		<g>
			{marks((id) => id !== "c")}
			{/* Dragology blends the two solved layouts as the box is dragged */}
			<g
				id="handle"
				transform={translate(last.x, last.y)}
				style={{ cursor: "grab" }}
				dragologyOnDrag={() =>
					d.between([{ direction: "stackH" }, { direction: "stackV" }])
				}
			>
				{marks((id) => id === "c", { origin: last, ids: false })}
			</g>
		</g>
	);
};

export function DragDirection() {
	return (
		<DraggableRenderer
			draggable={draggable}
			initialState={{ direction: "stackH" }}
			width={240}
			height={220}
		/>
	);
}
