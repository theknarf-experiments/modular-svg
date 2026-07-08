import { Graphic } from "@modular-svg/react";
import * as React from "react";

export type Actor = string | { id: string; label: string };

export type ArrowHead = "arrow" | "open" | "cross" | "none" | "both";

export type MessageItem = {
	from: string;
	to: string;
	label: string;
	/** shaft style; dotted is mermaid's reply/return style */
	line?: "solid" | "dotted";
	/** head style: filled arrow (default), open async head, lost-message
	 * cross, none, or heads on both ends */
	head?: ArrowHead;
};

export type NoteItem = {
	note: "leftOf" | "rightOf" | "over";
	/** one actor, or two for a spanning "over" note */
	actors: string[];
	text: string;
};

/** Items occupy vertical slots in order, like lines of mermaid syntax */
export type Item = MessageItem | NoteItem;

/** Which items activate an actor: from first index to last index */
export type Activation = { actor: string; from: number; to: number };

/** A labeled frame (loop/alt/opt/par) or plain highlight rect around a
 * range of items and a set of actors */
export type Frame = {
	kind: "loop" | "alt" | "opt" | "par" | "rect";
	label?: string;
	from: number;
	to: number;
	/** actors the frame spans horizontally; defaults to all */
	actors?: string[];
	/** fill for kind "rect" highlights */
	fill?: string;
	/** alt/par section boundaries: a dashed divider above item `at` */
	dividers?: { at: number; label?: string }[];
};

export type SequenceDiagramProps = {
	actors: Actor[];
	items: Item[];
	activations?: Activation[];
	frames?: Frame[];
	/** prefix messages with sequence numbers, like mermaid's autonumber */
	autonumber?: boolean;
	/** horizontal gap between actors; make room for the longest label */
	actorSpacing?: number;
	/** vertical gap between consecutive items */
	messageGap?: number;
	/** font size for actor names and message labels */
	fontSize?: number;
};

const isMessage = (item: Item): item is MessageItem => "from" in item;

const boxId = (actor: string) => `actor-${actor}`;
const bottomId = (actor: string) => `actor-${actor}-bottom`;
const rowId = (i: number) => `item${i}`;
const toAnchorId = (i: number) => `item${i}-to`;
const labelId = (i: number) => `item${i}-label`;

// The row anchor sits on the lifeline of a message's sender or a note's
// first actor; the message target gets a second anchor on its own lifeline.
function rowActor(item: Item): string {
	return isMessage(item) ? item.from : item.actors[0];
}

function anchorFor(items: Item[], actor: string, i: number): string {
	const item = items[i];
	if (isMessage(item) && item.to === actor && item.from !== actor) {
		return toAnchorId(i);
	}
	return rowId(i);
}

function ActorBox({
	id,
	name,
	fontSize,
}: {
	id: string;
	name: string;
	fontSize: number;
}) {
	return (
		<background
			key={id}
			padding={8}
			fill="#ECECFF"
			stroke="#555"
			stroke-width={1}
		>
			<text font-size={fontSize}>{name}</text>
		</background>
	);
}

// An invisible point on a lifeline where a message starts or ends
function Anchor({ id }: { id: string }) {
	return <rect key={id} width={0} height={0} stroke-width={0} />;
}

// The span relation via createElement (its tag collides with HTML <span>)
function Span(props: { axis: "x" | "y"; children?: React.ReactNode }) {
	return React.createElement("span", props);
}

// Dashed lifeline between an actor's top and bottom boxes (the line tag's
// fractional target prop collides with SVG's string target in TypeScript)
function Lifeline({ actor }: { actor: string }) {
	return React.createElement(
		"line",
		{
			key: `${actor}-lifeline`,
			stroke: "#999",
			"stroke-width": 1,
			"stroke-dasharray": "4 4",
			source: [0.5, 1],
			target: [0.5, 0],
		},
		React.createElement("ref", { target: boxId(actor) }),
		React.createElement("ref", { target: bottomId(actor) }),
	);
}

// Message shaft between the two anchors
function Shaft({
	id,
	from,
	to,
	dotted,
}: {
	id: string;
	from: string;
	to: string;
	dotted: boolean;
}) {
	return React.createElement(
		"line",
		{
			key: id,
			stroke: "#333",
			"stroke-width": 1.5,
			"stroke-dasharray": dotted ? "5 3" : undefined,
		},
		React.createElement("ref", { target: from }),
		React.createElement("ref", { target: to }),
	);
}

// Arrow heads are small linear paths aligned onto an anchor
const HEAD = 9;
function headPath(style: "arrow" | "open" | "cross", pointsRight: boolean) {
	const h = HEAD;
	if (style === "cross") {
		return `M 0,0 L ${h},${h} M ${h},0 L 0,${h}`;
	}
	const tipX = pointsRight ? h : 0;
	const backX = pointsRight ? 0 : h;
	const shape = `M ${backX},0 L ${tipX},${h / 2} L ${backX},${h}`;
	return style === "arrow" ? `${shape} Z` : shape;
}

function Head({
	id,
	anchor,
	style,
	pointsRight,
}: {
	id: string;
	anchor: string;
	style: "arrow" | "open" | "cross";
	pointsRight: boolean;
}) {
	const filled = style === "arrow";
	return (
		<React.Fragment>
			<path
				key={id}
				d={headPath(style, pointsRight)}
				fill={filled ? "#333" : "none"}
				stroke="#333"
				stroke-width={filled ? 0 : 1.5}
			/>
			<align alignment="centerY">
				<ref target={anchor} />
				<ref target={id} />
			</align>
			{/* the tip touches the anchor point */}
			<align axis="x" alignment={pointsRight ? "right" : "left"}>
				<ref target={anchor} />
				<ref target={id} />
			</align>
		</React.Fragment>
	);
}

// Invisible padded box used as a span source, so frames extend slightly
// past what they enclose
function Pad({
	id,
	padding,
	targets,
}: {
	id: string;
	padding: number;
	targets: string[];
}) {
	return (
		<background key={id} padding={padding} fill="transparent" stroke-width={0}>
			{targets.map((t) => (
				<ref key={t} target={t} />
			))}
		</background>
	);
}

export function SequenceDiagram({
	actors,
	items,
	activations = [],
	frames = [],
	autonumber = false,
	actorSpacing = 170,
	messageGap = 40,
	fontSize = 13,
}: SequenceDiagramProps) {
	const normalized = actors.map((a) =>
		typeof a === "string" ? { id: a, label: a } : a,
	);
	const actorIds = normalized.map((a) => a.id);
	const order = new Map(actorIds.map((id, i) => [id, i]));

	let msgNo = 0;
	const numbered = items.map((item) => {
		if (!isMessage(item)) return { item, label: undefined };
		msgNo++;
		const label = autonumber ? `${msgNo}. ${item.label}` : item.label;
		return { item, label };
	});

	return (
		<Graphic
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={15}
		>
			<group>
				{/* Actor boxes, top and bottom (painted first: declared first) */}
				<stackH key="actors" spacing={actorSpacing} alignment="top">
					{normalized.map((a) => (
						<ActorBox
							key={a.id}
							id={boxId(a.id)}
							name={a.label}
							fontSize={fontSize}
						/>
					))}
				</stackH>
				{normalized.map((a) => (
					<ActorBox
						key={`${a.id}-b`}
						id={bottomId(a.id)}
						name={a.label}
						fontSize={fontSize}
					/>
				))}

				{/* Lifelines */}
				{actorIds.map((a) => (
					<Lifeline key={`${a}-lifeline`} actor={a} />
				))}

				{/* Frame rects and tabs (painted under bars and messages) */}
				{frames.map((f, fi) => {
					const id = `frame${fi}`;
					const highlight = f.kind === "rect";
					return (
						<React.Fragment key={id}>
							<rect
								key={id}
								fill={highlight ? (f.fill ?? "rgba(255,220,120,0.25)") : "none"}
								stroke={highlight ? "#0000" : "#666"}
								stroke-width={highlight ? 0 : 1}
							/>
							{!highlight && (
								<>
									<background
										key={`${id}-tab`}
										padding={3}
										fill="#EEE"
										stroke="#666"
										stroke-width={1}
									>
										<text font-size={fontSize - 2}>{f.kind}</text>
									</background>
									{f.label && (
										<text
											key={`${id}-cond`}
											font-size={fontSize - 2}
											fill="#555"
										>
											{`[${f.label}]`}
										</text>
									)}
								</>
							)}
						</React.Fragment>
					);
				})}

				{/* Activation bars */}
				{activations.map((act) => (
					<rect
						key={`act-${act.actor}`}
						width={10}
						fill="#E8E8E8"
						stroke="#999"
						stroke-width={1}
					/>
				))}

				{/* Items: a row anchor each, then message or note content */}
				{numbered.map(({ item, label }, i) => {
					const prev = i === 0 ? "actors" : rowId(i - 1);
					const spacing = i === 0 ? 50 : messageGap;
					const common = (
						<>
							<Anchor id={rowId(i)} />
							<align alignment="centerX">
								<ref target={boxId(rowActor(item))} />
								<ref target={rowId(i)} />
							</align>
							<distribute axis="y" spacing={spacing}>
								<ref target={prev} />
								<ref target={rowId(i)} />
							</distribute>
						</>
					);

					if (!isMessage(item)) {
						const over = item.note === "over";
						return (
							<React.Fragment key={rowId(i)}>
								{common}
								{over ? (
									<>
										<rect
											key={`${rowId(i)}-note`}
											height={fontSize + 12}
											fill="#FFF5AD"
											stroke="#AAAA33"
											stroke-width={1}
										/>
										<Span axis="x">
											<group>
												{item.actors.map((a) => (
													<ref key={a} target={boxId(a)} />
												))}
											</group>
											<ref target={`${rowId(i)}-note`} />
										</Span>
										<align alignment="centerY">
											<ref target={rowId(i)} />
											<ref target={`${rowId(i)}-note`} />
										</align>
										<text key={labelId(i)} font-size={fontSize}>
											{item.text}
										</text>
										<align alignment="center">
											<ref target={`${rowId(i)}-note`} />
											<ref target={labelId(i)} />
										</align>
									</>
								) : (
									<>
										<background
											key={`${rowId(i)}-note`}
											padding={6}
											fill="#FFF5AD"
											stroke="#AAAA33"
											stroke-width={1}
										>
											<text font-size={fontSize}>{item.text}</text>
										</background>
										<align alignment="centerY">
											<ref target={rowId(i)} />
											<ref target={`${rowId(i)}-note`} />
										</align>
										{item.note === "rightOf" ? (
											<distribute axis="x" spacing={12}>
												<ref target={rowId(i)} />
												<ref target={`${rowId(i)}-note`} />
											</distribute>
										) : (
											<distribute axis="x" spacing={12}>
												<ref target={`${rowId(i)}-note`} />
												<ref target={rowId(i)} />
											</distribute>
										)}
									</>
								)}
							</React.Fragment>
						);
					}

					const selfMessage = item.from === item.to;
					const head = item.head ?? "arrow";
					const pointsRight =
						(order.get(item.to) ?? 0) > (order.get(item.from) ?? 0);
					return (
						<React.Fragment key={rowId(i)}>
							{common}
							{!selfMessage && (
								<>
									<Anchor id={toAnchorId(i)} />
									<align alignment="centerY">
										<ref target={rowId(i)} />
										<ref target={toAnchorId(i)} />
									</align>
									<align alignment="centerX">
										<ref target={boxId(item.to)} />
										<ref target={toAnchorId(i)} />
									</align>
								</>
							)}

							<text key={labelId(i)} font-size={fontSize}>
								{label ?? item.label}
							</text>
							{selfMessage ? (
								<distribute axis="x" spacing={12}>
									<ref target={rowId(i)} />
									<ref target={labelId(i)} />
								</distribute>
							) : (
								<align alignment="centerX">
									<group>
										<ref target={rowId(i)} />
										<ref target={toAnchorId(i)} />
									</group>
									<ref target={labelId(i)} />
								</align>
							)}
							<distribute axis="y" spacing={4}>
								<ref target={labelId(i)} />
								<ref target={rowId(i)} />
							</distribute>

							{!selfMessage && (
								<>
									<Shaft
										id={`${rowId(i)}-shaft`}
										from={rowId(i)}
										to={toAnchorId(i)}
										dotted={item.line === "dotted"}
									/>
									{head !== "none" && (
										<Head
											id={`${rowId(i)}-head`}
											anchor={toAnchorId(i)}
											style={head === "both" ? "arrow" : head}
											pointsRight={pointsRight}
										/>
									)}
									{head === "both" && (
										<Head
											id={`${rowId(i)}-headback`}
											anchor={rowId(i)}
											style="arrow"
											pointsRight={!pointsRight}
										/>
									)}
								</>
							)}
						</React.Fragment>
					);
				})}

				{/* Bottom boxes hang below the last item */}
				{actorIds.map((a) => (
					<React.Fragment key={`${a}-bottom-pos`}>
						<align alignment="centerX">
							<ref target={boxId(a)} />
							<ref target={bottomId(a)} />
						</align>
						<distribute axis="y" spacing={40}>
							<ref target={rowId(items.length - 1)} />
							<ref target={bottomId(a)} />
						</distribute>
					</React.Fragment>
				))}

				{/* Activation bars: on the lifeline, spanning their item range */}
				{activations.map((act) => (
					<React.Fragment key={`act-${act.actor}-pos`}>
						<align alignment="centerX">
							<ref target={boxId(act.actor)} />
							<ref target={`act-${act.actor}`} />
						</align>
						<Span axis="y">
							<group>
								<ref target={anchorFor(items, act.actor, act.from)} />
								<ref target={anchorFor(items, act.actor, act.to)} />
							</group>
							<ref target={`act-${act.actor}`} />
						</Span>
					</React.Fragment>
				))}

				{/* Frames: spanned to padded boxes around their actors and rows */}
				{frames.map((f, fi) => {
					const id = `frame${fi}`;
					const frameActors = f.actors ?? actorIds;
					return (
						<React.Fragment key={`${id}-pos`}>
							<Pad
								id={`${id}-xpad`}
								padding={16}
								targets={frameActors.map(boxId)}
							/>
							<Pad
								id={`${id}-ypad`}
								padding={14}
								targets={[
									anchorFor(items, rowActor(items[f.from]), f.from),
									anchorFor(items, rowActor(items[f.to]), f.to),
								]}
							/>
							<Span axis="x">
								<ref target={`${id}-xpad`} />
								<ref target={id} />
							</Span>
							<Span axis="y">
								<ref target={`${id}-ypad`} />
								<ref target={id} />
							</Span>
							{f.kind !== "rect" && (
								<>
									<align alignment="topLeft">
										<ref target={id} />
										<ref target={`${id}-tab`} />
									</align>
									{f.label && (
										<>
											<distribute axis="x" spacing={8}>
												<ref target={`${id}-tab`} />
												<ref target={`${id}-cond`} />
											</distribute>
											<align alignment="centerY">
												<ref target={`${id}-tab`} />
												<ref target={`${id}-cond`} />
											</align>
										</>
									)}
								</>
							)}
							{(f.dividers ?? []).map((d, di) => (
								<React.Fragment key={`${id}-div${di}`}>
									<rect
										key={`${id}-div${di}`}
										height={0}
										fill="none"
										stroke="#666"
										stroke-width={1}
										stroke-dasharray="4 3"
									/>
									<Span axis="x">
										<ref target={id} />
										<ref target={`${id}-div${di}`} />
									</Span>
									<distribute axis="y" spacing={messageGap / 2}>
										<ref target={`${id}-div${di}`} />
										<ref target={rowId(d.at)} />
									</distribute>
									{d.label && (
										<>
											<text
												key={`${id}-div${di}-label`}
												font-size={fontSize - 2}
												fill="#555"
											>
												{`[${d.label}]`}
											</text>
											<align alignment="centerX">
												<ref target={`${id}-div${di}`} />
												<ref target={`${id}-div${di}-label`} />
											</align>
											<distribute axis="y" spacing={2}>
												<ref target={`${id}-div${di}-label`} />
												<ref target={`${id}-div${di}`} />
											</distribute>
										</>
									)}
								</React.Fragment>
							))}
						</React.Fragment>
					);
				})}
			</group>
		</Graphic>
	);
}
