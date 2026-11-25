import { solveScene } from "@modular-svg/react";
import {
	type Draggable,
	DraggableRenderer,
	inOrder,
	param,
	translate,
} from "dragology";

type Node = { label: string; x: number; y: number };
type State = { nodes: Record<string, Node> };

const edges = [
	["idea", "draft"],
	["draft", "review"],
	["idea", "ship"],
	["review", "ship"],
];

const [WIDTH, HEIGHT] = [460, 240];

/**
 * Only the labels are placed by the state. Their boxes and the arrows between
 * them are relations, so dragging a node re-solves both.
 */
export const Scene = ({ nodes }: State) => (
	<group>
		{Object.entries(nodes).map(([id, { label, x, y }]) => (
			<background
				key={`node-${id}`}
				padding={10}
				fill="#ecfccb"
				stroke="#65a30d"
				stroke-width={1.5}
				rx={8}
			>
				<text key={`label-${id}`} x={x} y={y}>
					{label}
				</text>
			</background>
		))}
		{edges.map(([from, to]) => (
			<arrow
				key={`edge-${from}-${to}`}
				stroke="#4b5563"
				stroke-width={2}
				padStart={4}
				padEnd={4}
			>
				<ref target={`node-${from}`} />
				<ref target={`node-${to}`} />
			</arrow>
		))}
	</group>
);

const draggable: Draggable<State> = ({ state, d }) => {
	const { box, marks } = solveScene(<Scene {...state} />, {
		position: "transform",
	});
	return (
		<g>
			{marks((id) => id.startsWith("edge-"))}
			{Object.keys(state.nodes).map((id) => {
				const at = box(`node-${id}`);
				return (
					<g
						id={`drag-${id}`}
						transform={translate(at.x, at.y)}
						style={{ cursor: "grab" }}
						dragologyOnDrag={() =>
							d.vary(
								state,
								[param("nodes", id, "x"), param("nodes", id, "y")],
								{
									constraint: (s) => [
										inOrder([20, s.nodes[id].x, WIDTH - 100]),
										inOrder([20, s.nodes[id].y, HEIGHT - 30]),
									],
								},
							)
						}
					>
						{marks((m) => m === `node-${id}` || m === `label-${id}`, {
							origin: at,
							ids: false,
						})}
					</g>
				);
			})}
		</g>
	);
};

export function DragFlowchart() {
	return (
		<DraggableRenderer
			draggable={draggable}
			initialState={{
				nodes: {
					idea: { label: "idea", x: 30, y: 100 },
					draft: { label: "draft", x: 150, y: 40 },
					review: { label: "review", x: 280, y: 100 },
					ship: { label: "ship", x: 380, y: 190 },
				},
			}}
			width={WIDTH}
			height={HEIGHT}
		/>
	);
}
