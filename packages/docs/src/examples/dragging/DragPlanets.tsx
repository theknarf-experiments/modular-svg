import { solveScene } from "@modular-svg/react";
import { type Draggable, DraggableRenderer, param, translate } from "dragology";
import { moved } from "./DragReorder";

const planets = {
	mercury: { label: "Mercury", r: 15, fill: "#EBE3CF" },
	venus: { label: "Venus", r: 36, fill: "#DC933C" },
	earth: { label: "Earth", r: 38, fill: "#179DD7" },
	mars: { label: "Mars", r: 21, fill: "#F1CF8E" },
};
type Planet = keyof typeof planets;
type State = {
	order: Planet[];
	target: Planet;
	/** where the label is while it is dragged, in scene coordinates */
	held?: { x: number; y: number };
};

/**
 * The Diagrams page's planets, with the order and the labelled planet as
 * state. A held label is placed where it is held instead of over its planet;
 * the arrow is drawn from wherever it is either way.
 */
export const Scene = ({ order, target, held }: State) => (
	<group>
		<background key="bg" padding={10}>
			<stackH key="planets" spacing={50} alignment="centerY">
				{order.map((id) => (
					<circle
						key={id}
						r={planets[id].r}
						fill={planets[id].fill}
						stroke="black"
						stroke-width={3}
					/>
				))}
			</stackH>
		</background>

		<text key="label" fill="black" x={held?.x} y={held?.y}>
			{planets[target].label}
		</text>
		{!held && (
			<>
				<align key="alignLabel" axis="x" alignment="center">
					<ref target="label" />
					<ref target={target} />
				</align>
				<distribute key="distVertical" axis="y" spacing={60}>
					<ref target="label" />
					<ref target={target} />
				</distribute>
			</>
		)}

		<arrow key="arrow" stroke="black" stroke-width={2}>
			<ref target="label" />
			<ref target={target} />
		</arrow>
	</group>
);

const pin = { node: "bg", x: 15, y: 90 };

/** The planet whose centre is horizontally closest to the label's. */
export const nearest = (state: State): Planet => {
	const { box } = solveScene(<Scene {...state} />, {
		pin,
		position: "transform",
	});
	const centre = (id: string) => box(id).x + box(id).width / 2;
	const label = centre("label");
	return state.order.reduce((a, b) =>
		Math.abs(centre(a) - label) <= Math.abs(centre(b) - label) ? a : b,
	);
};

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
	const { box, marks, toScene } = solveScene(<Scene {...state} />, {
		pin,
		position: "transform",
	});
	const label = box("label");
	const lifted = (id: string) => (draggedId === id ? "/1" : false);
	return (
		<g>
			{marks((id) => id === "bg" || id.startsWith("arrow"))}
			{state.order.map((id, i) => {
				const at = box(id);
				return (
					<g
						id={`drag-${id}`}
						transform={translate(at.x, at.y)}
						dragologyZIndex={lifted(`drag-${id}`)}
						style={{ cursor: "grab" }}
						dragologyOnDrag={() =>
							d
								.closest(
									state.order.map((_, j) => ({
										...state,
										order: moved(state.order, i, j),
									})),
								)
								.withFloating()
						}
					>
						{marks((m) => m === id, { origin: at, ids: false })}
					</g>
				);
			})}
			{/* Held, the label goes where it is dragged; the solver keeps the arrow
			    on it and the nearest planet, and on drop it settles over that one */}
			<g
				id="drag-label"
				transform={translate(label.x, label.y)}
				dragologyZIndex={lifted("drag-label")}
				style={{ cursor: "grab" }}
				dragologyOnDrag={() =>
					d
						.vary({ ...state, held: toScene(label) }, [
							param("held", "x"),
							param("held", "y"),
						])
						.during((s) => ({ ...s, target: nearest(s) }))
						.onDrop(({ held: _, ...s }) => s)
				}
			>
				{marks((m) => m === "label", { origin: label, ids: false })}
			</g>
		</g>
	);
};

export function DragPlanets() {
	return (
		<DraggableRenderer
			draggable={draggable}
			initialState={{
				order: ["mercury", "venus", "earth", "mars"],
				target: "mercury",
			}}
			width={420}
			height={240}
		/>
	);
}
