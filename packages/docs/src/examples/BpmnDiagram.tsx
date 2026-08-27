import { Graphic } from "@modular-svg/react";
import * as React from "react";

/** A horizontal band of the pool: who performs the work inside it */
export type Lane = { id: string; label: string };

export type EventKind = "start" | "intermediate" | "end";
export type GatewayKind = "exclusive" | "parallel" | "inclusive";
/** Glyph in a task's top-left corner, saying how the work gets done */
export type TaskMarker = "user" | "service" | "script" | "message";

type Placement = {
	id: string;
	/** grid column; every node in a column shares an x position */
	column: number;
	/** lane id, defaulting to the first lane */
	lane?: string;
};

export type BpmnNode =
	| (Placement & { type: "event"; kind?: EventKind; label?: string })
	| (Placement & { type: "gateway"; kind?: GatewayKind; label?: string })
	| (Placement & { type: "task"; label: string; marker?: TaskMarker });

export type Flow = {
	from: string;
	to: string;
	label?: string;
	/** "default" adds the tick mark for a gateway's fallback branch */
	kind?: "sequence" | "default";
};

export type BpmnDiagramProps = {
	nodes: BpmnNode[];
	flows: Flow[];
	/** the rows nodes are placed in; omit for a single-row process */
	lanes?: Lane[];
	/** draw the pool border and lane headers; on by default with lanes */
	showPool?: boolean;
	poolLabel?: string;
	columnGap?: number;
	laneHeight?: number;
	taskWidth?: number;
	taskHeight?: number;
	fontSize?: number;
};

const EVENT_R = 17;
const GATEWAY_SIZE = 42;
const HEAD = 10;
const MARKER_CELL = 20;
const HEADER_WIDTH = 84;
const TITLE_HEIGHT = 26;
const LOOP_DROP = 34;

const FLOW_STROKE = "#4A4A4A";
const POOL_STROKE = "#7A8189";
const ICON = "#3D5A73";

const EVENT_STYLE: Record<
	EventKind,
	{ fill: string; stroke: string; strokeWidth: number }
> = {
	start: { fill: "#E7F5E9", stroke: "#4C9A54", strokeWidth: 2 },
	intermediate: { fill: "#FFF4E2", stroke: "#B87A1E", strokeWidth: 2 },
	end: { fill: "#FCEBE9", stroke: "#C0392B", strokeWidth: 4 },
};

const slotId = (id: string) => `slot-${id}`;
const shapeId = (id: string) => `n-${id}`;
const colId = (i: number) => `col${i}`;
const railId = (lane: string) => `rail-${lane}`;
const bandId = (lane: string) => `band-${lane}`;
const headId = (i: number) => `flow${i}-head`;
const viaId = (i: number) => `flow${i}-via`;
const midId = (i: number) => `flow${i}-mid`;

// The span relation via createElement (its tag collides with HTML <span>)
function Span(props: { axis: "x" | "y"; children?: React.ReactNode }) {
	return React.createElement("span", props);
}

type Side = "left" | "right" | "top" | "bottom";

const FRACTION: Record<Side, number[]> = {
	left: [0, 0.5],
	right: [1, 0.5],
	top: [0.5, 0],
	bottom: [0.5, 1],
};
const OPPOSITE: Record<Side, Side> = {
	left: "right",
	right: "left",
	top: "bottom",
	bottom: "top",
};
const AXIS: Record<Side, "x" | "y"> = {
	left: "x",
	right: "x",
	top: "y",
	bottom: "y",
};
const CROSS: Record<Side, "centerX" | "centerY"> = {
	left: "centerY",
	right: "centerY",
	top: "centerX",
	bottom: "centerX",
};

// Where a flow leaves its source and enters its target. A forward flow that
// stays in its lane runs straight across; one that changes lane leaves
// through the edge facing the target lane, which is also what keeps a
// gateway's branches from stacking on the same exit point. Same-column flows
// run straight up or down, and a flow to an earlier column loops back
// underneath the pool.
type Route = { exit: Side; enter: Side; loop: boolean };

function routeFor(
	from: { column: number; lane: number },
	to: { column: number; lane: number },
): Route {
	if (to.column > from.column) {
		if (to.lane === from.lane)
			return { exit: "right", enter: "left", loop: false };
		return {
			exit: to.lane > from.lane ? "bottom" : "top",
			enter: "left",
			loop: false,
		};
	}
	if (to.column < from.column)
		return { exit: "bottom", enter: "bottom", loop: true };
	return to.lane > from.lane
		? { exit: "bottom", enter: "top", loop: false }
		: { exit: "top", enter: "bottom", loop: false };
}

const headPath = (enter: Side) => {
	const h = HEAD;
	if (enter === "left") return `M 0,0 L ${h},${h / 2} L 0,${h} Z`;
	if (enter === "right") return `M ${h},0 L 0,${h / 2} L ${h},${h} Z`;
	if (enter === "top") return `M 0,0 L ${h / 2},${h} L ${h},0 Z`;
	return `M 0,${h} L ${h / 2},0 L ${h},${h} Z`;
};

// A square-toothed gear outline, drawn as one polygon so its bounds come
// out right (the parser measures paths from their line segments)
const gearPath = (r: number, teeth = 6, depth = 0.26) => {
	const steps = teeth * 4;
	const points: string[] = [];
	for (let i = 0; i < steps; i++) {
		const angle = (i * 2 * Math.PI) / steps;
		const radius = i % 4 < 2 ? r : r * (1 - depth);
		points.push(
			`${(r + radius * Math.cos(angle)).toFixed(2)},${(r + radius * Math.sin(angle)).toFixed(2)}`,
		);
	}
	return `M ${points.join(" L ")} Z`;
};

// An invisible point pinned to one edge of a node: the anchor arrowheads and
// default-flow ticks align against, so they can sit outside the shape
function EdgePoint({
	id,
	node,
	side,
}: {
	id: string;
	node: string;
	side: Side;
}) {
	return (
		<React.Fragment>
			<rect key={id} width={0} height={0} stroke-width={0} />
			<align axis={AXIS[side]} alignment={side}>
				<ref target={node} />
				<ref target={id} />
			</align>
			<align alignment={CROSS[side]}>
				<ref target={node} />
				<ref target={id} />
			</align>
		</React.Fragment>
	);
}

// Aligned against an edge point on the opposite side, so the tip lands on
// the point and the body sits outside the shape
function OutsideEdge({
	id,
	point,
	side,
	children,
}: {
	id: string;
	point: string;
	side: Side;
	children: React.ReactNode;
}) {
	return (
		<React.Fragment>
			{children}
			<align axis={AXIS[side]} alignment={OPPOSITE[side]}>
				<ref target={point} />
				<ref target={id} />
			</align>
			<align alignment={CROSS[side]}>
				<ref target={point} />
				<ref target={id} />
			</align>
		</React.Fragment>
	);
}

function TaskMarkerGlyph({ marker }: { marker: TaskMarker }) {
	if (marker === "user") {
		// head over shoulders: a stack keeps the two parts in relation
		return (
			<stackV spacing={1} alignment="center">
				<circle r={3.2} fill="none" stroke={ICON} stroke-width={1.3} />
				<path
					d="M 0,4 L 1.4,0 L 7.6,0 L 9,4 Z"
					fill="none"
					stroke={ICON}
					stroke-width={1.3}
				/>
			</stackV>
		);
	}
	if (marker === "service") {
		return (
			<path d={gearPath(6.5)} fill="none" stroke={ICON} stroke-width={1.3} />
		);
	}
	if (marker === "script") {
		return (
			<path
				d="M 1,0 L 11,0 L 11,13 L 1,13 Z M 3.5,3.5 L 8.5,3.5 M 3.5,6.5 L 8.5,6.5 M 3.5,9.5 L 7,9.5"
				fill="none"
				stroke={ICON}
				stroke-width={1.2}
			/>
		);
	}
	return (
		<path
			d="M 0,0 L 13,0 L 13,9.5 L 0,9.5 Z M 0,0 L 6.5,5 L 13,0"
			fill="none"
			stroke={ICON}
			stroke-width={1.2}
		/>
	);
}

export function BpmnDiagram({
	nodes,
	flows,
	lanes,
	showPool,
	poolLabel,
	columnGap = 34,
	laneHeight = 92,
	taskWidth = 116,
	taskHeight = 58,
	fontSize = 12,
}: BpmnDiagramProps) {
	const laneList: Lane[] =
		lanes !== undefined && lanes.length > 0 ? lanes : [{ id: "_", label: "" }];
	const pooled = showPool ?? (lanes !== undefined && lanes.length > 0);
	const laneOrder = new Map(laneList.map((l, i) => [l.id, i]));
	const titleRail = "_title";

	const nodeWidth = (n: BpmnNode) =>
		n.type === "task"
			? taskWidth
			: n.type === "gateway"
				? GATEWAY_SIZE
				: EVENT_R * 2;
	const nodeHeight = (n: BpmnNode) =>
		n.type === "task"
			? taskHeight
			: n.type === "gateway"
				? GATEWAY_SIZE
				: EVENT_R * 2;

	const columnCount = Math.max(...nodes.map((n) => n.column)) + 1;
	const columnWidths = Array.from({ length: columnCount }, (_, i) =>
		Math.max(0, ...nodes.filter((n) => n.column === i).map(nodeWidth)),
	);

	const placement = new Map(
		nodes.map((n) => [
			n.id,
			{ column: n.column, lane: laneOrder.get(n.lane ?? laneList[0].id) ?? 0 },
		]),
	);
	const laneIdOf = (n: BpmnNode) => n.lane ?? laneList[0].id;

	return (
		<Graphic
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
				maxWidth: "100%",
				overflow: "auto",
			}}
			margin={15}
		>
			<group>
				{/* Pool chrome, declared first so everything else paints over it.
				    Its geometry is copied on from the rails further down. */}
				{pooled && (
					<>
						<rect
							key="pool"
							fill="#FFFFFF"
							stroke={POOL_STROKE}
							stroke-width={2}
						/>
						{laneList.map((l) => (
							<rect
								key={bandId(l.id)}
								fill="none"
								stroke="#B4BBC2"
								stroke-width={1}
							/>
						))}
						{poolLabel && (
							<>
								<rect
									key="title"
									fill="#E2E7EC"
									stroke={POOL_STROKE}
									stroke-width={1}
								/>
								<text key="title-label" font-size={fontSize + 1} fill="#3A4148">
									{poolLabel}
								</text>
							</>
						)}
					</>
				)}

				{/* Lane rails: fixed-height rows that give every node its y. With a
				    pool they double as the visible lane headers. */}
				<stackV key="rails" spacing={0} alignment="left">
					{poolLabel && pooled && (
						<rect
							key={railId(titleRail)}
							width={HEADER_WIDTH}
							height={TITLE_HEIGHT}
							fill="transparent"
							stroke-width={0}
						/>
					)}
					{laneList.map((l) => (
						<rect
							key={railId(l.id)}
							width={pooled ? HEADER_WIDTH : 0}
							height={laneHeight}
							fill={pooled ? "#F1F4F7" : "transparent"}
							stroke={pooled ? "#B4BBC2" : undefined}
							stroke-width={pooled ? 1 : 0}
						/>
					))}
				</stackV>

				{pooled &&
					laneList.map((l) => (
						<React.Fragment key={`lane-label-${l.id}`}>
							<text key={`label-${l.id}`} font-size={fontSize} fill="#3A4148">
								{l.label}
							</text>
							<align alignment="center">
								<ref target={railId(l.id)} />
								<ref target={`label-${l.id}`} />
							</align>
						</React.Fragment>
					))}

				{/* Column rails: invisible boxes as wide as their widest node, so
				    the gap between columns stays constant whatever they hold */}
				<stackH key="cols" spacing={columnGap}>
					{columnWidths.map((w, i) => (
						<rect
							key={colId(i)}
							width={w}
							height={0}
							fill="transparent"
							stroke-width={0}
						/>
					))}
					{/* trailing breathing room inside the pool */}
					<rect key="col-end" width={columnGap} height={0} stroke-width={0} />
				</stackH>
				<distribute axis="x" spacing={columnGap}>
					<ref target="rails" />
					<ref target="cols" />
				</distribute>

				{/* One invisible box per node, sized like the shape that will fill
				    it and pinned to its column (x) and its lane rail (y). Flows
				    reference these, so the shapes declared afterwards paint over
				    the flow ends without any z-order juggling. */}
				{nodes.map((n) => (
					<React.Fragment key={slotId(n.id)}>
						<rect
							key={slotId(n.id)}
							width={nodeWidth(n)}
							height={nodeHeight(n)}
							fill="transparent"
							stroke-width={0}
						/>
						<align alignment="centerX">
							<ref target={colId(n.column)} />
							<ref target={slotId(n.id)} />
						</align>
						<align alignment="centerY">
							<ref target={railId(laneIdOf(n))} />
							<ref target={slotId(n.id)} />
						</align>
					</React.Fragment>
				))}

				{flows.map((f, i) => {
					const from = placement.get(f.from);
					const to = placement.get(f.to);
					if (!from || !to) return null;
					const route = routeFor(from, to);
					if (route.loop) {
						// A rework loop dives under the pool through a waypoint
						// centred between the two nodes
						return (
							<React.Fragment key={`flow${i}`}>
								<rect key={viaId(i)} width={0} height={0} stroke-width={0} />
								<align alignment="centerX">
									<group>
										<ref target={slotId(f.from)} />
										<ref target={slotId(f.to)} />
									</group>
									<ref target={viaId(i)} />
								</align>
								<distribute axis="y" spacing={LOOP_DROP}>
									<ref target="rails" />
									<ref target={viaId(i)} />
								</distribute>
								<curve
									key={`flow${i}-down`}
									stroke={FLOW_STROKE}
									stroke-width={1.6}
									source={FRACTION.bottom}
									target={[0.5, 0.5]}
									direction="vertical"
								>
									<ref target={slotId(f.from)} />
									<ref target={viaId(i)} />
								</curve>
								<curve
									key={`flow${i}-up`}
									stroke={FLOW_STROKE}
									stroke-width={1.6}
									source={[0.5, 0.5]}
									target={FRACTION.bottom}
									direction="vertical"
								>
									<ref target={viaId(i)} />
									<ref target={slotId(f.to)} />
								</curve>
							</React.Fragment>
						);
					}
					return (
						<curve
							key={`flow${i}`}
							stroke={FLOW_STROKE}
							stroke-width={1.6}
							source={FRACTION[route.exit]}
							target={FRACTION[route.enter]}
							direction={AXIS[route.enter] === "x" ? "horizontal" : "vertical"}
						>
							<ref target={slotId(f.from)} />
							<ref target={slotId(f.to)} />
						</curve>
					);
				})}

				{/* Shapes, each centred on its slot */}
				{nodes.map((n) => (
					<React.Fragment key={n.id}>
						{n.type === "event" && (
							<EventShape
								id={shapeId(n.id)}
								slot={slotId(n.id)}
								kind={n.kind ?? "start"}
							/>
						)}
						{n.type === "gateway" && (
							<GatewayShape
								id={shapeId(n.id)}
								slot={slotId(n.id)}
								kind={n.kind ?? "exclusive"}
							/>
						)}
						{n.type === "task" && (
							<TaskShape
								id={shapeId(n.id)}
								slot={slotId(n.id)}
								label={n.label}
								width={taskWidth}
								height={taskHeight}
								fontSize={fontSize}
							/>
						)}

						{n.type === "task" && n.marker && (
							<align alignment="topLeft">
								<ref target={slotId(n.id)} />
								<align alignment="center">
									<rect
										width={MARKER_CELL}
										height={MARKER_CELL}
										fill="transparent"
										stroke-width={0}
									/>
									<TaskMarkerGlyph marker={n.marker} />
								</align>
							</align>
						)}

						{/* Events and gateways caption themselves underneath */}
						{n.type !== "task" && n.label && (
							<>
								<stackV
									key={`${shapeId(n.id)}-cap`}
									spacing={2}
									alignment="center"
								>
									{n.label.split("\n").map((line, li) => (
										<text
											key={`${shapeId(n.id)}-cap${li}`}
											font-size={fontSize - 1}
											fill="#3A4148"
										>
											{line}
										</text>
									))}
								</stackV>
								<align alignment="centerX">
									<ref target={slotId(n.id)} />
									<ref target={`${shapeId(n.id)}-cap`} />
								</align>
								<distribute axis="y" spacing={6}>
									<ref target={slotId(n.id)} />
									<ref target={`${shapeId(n.id)}-cap`} />
								</distribute>
							</>
						)}
					</React.Fragment>
				))}

				{/* Arrowheads, default-branch ticks and flow labels go on top */}
				{flows.map((f, i) => {
					const from = placement.get(f.from);
					const to = placement.get(f.to);
					if (!from || !to) return null;
					const route = routeFor(from, to);
					const enter = route.enter;
					const exit = route.exit;
					// A curve leaves along the axis it arrives on, so that - not
					// the exit edge - is where the default marker has to sit for
					// it to land on the line
					const tickSide: Side = AXIS[enter] === "x" ? "right" : exit;
					return (
						<React.Fragment key={`deco${i}`}>
							<EdgePoint
								id={`${headId(i)}-pt`}
								node={slotId(f.to)}
								side={enter}
							/>
							<OutsideEdge
								id={headId(i)}
								point={`${headId(i)}-pt`}
								side={enter}
							>
								<path
									key={headId(i)}
									d={headPath(enter)}
									fill={FLOW_STROKE}
									stroke-width={0}
								/>
							</OutsideEdge>

							{f.kind === "default" && (
								<>
									<EdgePoint
										id={`flow${i}-tick-pt`}
										node={slotId(f.from)}
										side={exit}
									/>
									<OutsideEdge
										id={`flow${i}-tick`}
										point={`flow${i}-tick-pt`}
										side={tickSide}
									>
										<path
											key={`flow${i}-tick`}
											d="M 0,9 L 9,0"
											fill="none"
											stroke={FLOW_STROKE}
											stroke-width={1.6}
										/>
									</OutsideEdge>
								</>
							)}

							{f.label && (
								<>
									{!route.loop && (
										<>
											<rect
												key={midId(i)}
												width={0}
												height={0}
												stroke-width={0}
											/>
											<align alignment="center">
												<group>
													<ref target={slotId(f.from)} />
													<ref target={slotId(f.to)} />
												</group>
												<ref target={midId(i)} />
											</align>
										</>
									)}
									{/* transparent padding lifts the text clear of the line */}
									<background
										key={`flow${i}-label`}
										padding={4}
										fill="transparent"
										stroke-width={0}
									>
										<text font-size={fontSize - 1} fill="#4A4A4A">
											{f.label}
										</text>
									</background>
									<align axis="y" alignment={route.loop ? "top" : "bottom"}>
										<ref target={route.loop ? viaId(i) : midId(i)} />
										<ref target={`flow${i}-label`} />
									</align>
									<align alignment="centerX">
										<ref target={route.loop ? viaId(i) : midId(i)} />
										<ref target={`flow${i}-label`} />
									</align>
								</>
							)}
						</React.Fragment>
					);
				})}

				{/* Pool geometry, copied from the rails and columns onto the chrome
				    declared at the top */}
				{pooled && (
					<>
						<Span axis="x">
							<group key="pool-extent">
								<ref target="rails" />
								<ref target="cols" />
							</group>
							<ref target="pool" />
						</Span>
						<Span axis="y">
							<ref target="rails" />
							<ref target="pool" />
						</Span>
						{laneList.map((l) => (
							<React.Fragment key={`band-pos-${l.id}`}>
								<Span axis="x">
									<ref target="pool" />
									<ref target={bandId(l.id)} />
								</Span>
								<Span axis="y">
									<ref target={railId(l.id)} />
									<ref target={bandId(l.id)} />
								</Span>
							</React.Fragment>
						))}
						{poolLabel && (
							<>
								<Span axis="x">
									<ref target="pool" />
									<ref target="title" />
								</Span>
								<Span axis="y">
									<ref target={railId(titleRail)} />
									<ref target="title" />
								</Span>
								<align alignment="center">
									<ref target="title" />
									<ref target="title-label" />
								</align>
							</>
						)}
					</>
				)}
			</group>
		</Graphic>
	);
}

// Every shape declares its outline, then claims its slot, and only then
// positions whatever sits on top of it: a relation anchors on its first
// already-positioned child, so the outline has to be pinned first.
function OnSlot({ id, slot }: { id: string; slot: string }) {
	return (
		<align alignment="center">
			<ref target={slot} />
			<ref target={id} />
		</align>
	);
}

function EventShape({
	id,
	slot,
	kind,
}: {
	id: string;
	slot: string;
	kind: EventKind;
}) {
	const style = EVENT_STYLE[kind];
	return (
		<React.Fragment>
			<circle
				key={id}
				r={EVENT_R}
				fill={style.fill}
				stroke={style.stroke}
				stroke-width={style.strokeWidth}
			/>
			<OnSlot id={id} slot={slot} />
			{/* the double ring that marks an intermediate event */}
			{kind === "intermediate" && (
				<>
					<circle
						key={`${id}-ring`}
						r={EVENT_R - 4}
						fill="none"
						stroke={style.stroke}
						stroke-width={2}
					/>
					<align alignment="center">
						<ref target={id} />
						<ref target={`${id}-ring`} />
					</align>
				</>
			)}
		</React.Fragment>
	);
}

const diamond = (s: number) =>
	`M ${s / 2},0 L ${s},${s / 2} L ${s / 2},${s} L 0,${s / 2} Z`;

const GATEWAY_SYMBOL: Record<GatewayKind, string> = {
	exclusive: "M 0,0 L 13,13 M 13,0 L 0,13",
	parallel: "M 8,0 L 8,16 M 0,8 L 16,8",
	inclusive: "",
};

function GatewayShape({
	id,
	slot,
	kind,
}: {
	id: string;
	slot: string;
	kind: GatewayKind;
}) {
	return (
		<React.Fragment>
			<path
				key={id}
				d={diamond(GATEWAY_SIZE)}
				fill="#FDF6DD"
				stroke="#B8912F"
				stroke-width={2}
			/>
			<OnSlot id={id} slot={slot} />
			{kind === "inclusive" ? (
				<circle
					key={`${id}-sym`}
					r={8}
					fill="none"
					stroke="#8A6D1F"
					stroke-width={2.4}
				/>
			) : (
				<path
					key={`${id}-sym`}
					d={GATEWAY_SYMBOL[kind]}
					fill="none"
					stroke="#8A6D1F"
					stroke-width={2.4}
				/>
			)}
			<align alignment="center">
				<ref target={id} />
				<ref target={`${id}-sym`} />
			</align>
		</React.Fragment>
	);
}

function TaskShape({
	id,
	slot,
	label,
	width,
	height,
	fontSize,
}: {
	id: string;
	slot: string;
	label: string;
	width: number;
	height: number;
	fontSize: number;
}) {
	// no text wrapping in the layout engine, so newlines are the line breaks
	const lines = label.split("\n");
	return (
		<React.Fragment>
			<rect
				key={id}
				width={width}
				height={height}
				rx={10}
				fill="#FFFFFF"
				stroke="#4E7CA8"
				stroke-width={2}
			/>
			<OnSlot id={id} slot={slot} />
			<stackV key={`${id}-text`} spacing={3} alignment="center">
				{lines.map((line, i) => (
					<text key={`${id}-line${i}`} font-size={fontSize} fill="#20303D">
						{line}
					</text>
				))}
			</stackV>
			<align alignment="center">
				<ref target={id} />
				<ref target={`${id}-text`} />
			</align>
		</React.Fragment>
	);
}
