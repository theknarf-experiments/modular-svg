import { Canvas } from "@modular-svg/react";
import * as React from "react";

export type Message = {
	from: string;
	to: string;
	label: string;
	reply?: boolean;
};
/** Which messages activate an actor: from first index to last index */
export type Activation = { actor: string; from: number; to: number };

export type SequenceDiagramProps = {
	actors: string[];
	messages: Message[];
	activations?: Activation[];
	/** horizontal gap between actors; make room for the longest label */
	actorSpacing?: number;
	/** vertical gap between consecutive messages */
	messageGap?: number;
	/** font size for actor names and message labels */
	fontSize?: number;
};

const boxId = (actor: string) => `actor-${actor}`;
const bottomId = (actor: string) => `actor-${actor}-bottom`;
const anchorId = (i: number, end: "from" | "to") => `msg${i}-${end}`;
const labelId = (i: number) => `msg${i}-label`;
const arrowId = (i: number) => `msg${i}-arrow`;

// The message end that touches this actor's lifeline
function anchorOn(messages: Message[], actor: string, i: number): string {
	return anchorId(i, messages[i].from === actor ? "from" : "to");
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

// Ids are scoped to this component's own Canvas, so several diagrams can
// live on one page without colliding.
export function SequenceDiagram({
	actors,
	messages,
	activations = [],
	actorSpacing = 170,
	messageGap = 40,
	fontSize = 13,
}: SequenceDiagramProps) {
	return (
		<Canvas
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
					{actors.map((a) => (
						<ActorBox key={a} id={boxId(a)} name={a} fontSize={fontSize} />
					))}
				</stackH>
				{actors.map((a) => (
					<ActorBox
						key={`${a}-b`}
						id={bottomId(a)}
						name={a}
						fontSize={fontSize}
					/>
				))}

				{/* Lifelines: dashed lines from each top box to its bottom copy */}
				{actors.map((a) => (
					<Lifeline key={`${a}-lifeline`} actor={a} />
				))}

				{/* Activation bars (nodes now, spanned to their messages below) */}
				{activations.map((act) => (
					<rect
						key={`act-${act.actor}`}
						width={10}
						fill="#E8E8E8"
						stroke="#999"
						stroke-width={1}
					/>
				))}

				{/* Messages: anchors on the lifelines, a label, and an arrow */}
				{messages.map((m, i) => {
					const selfMessage = m.from === m.to;
					return (
						<React.Fragment key={`msg-${m.label}`}>
							<Anchor id={anchorId(i, "from")} />
							<align alignment="centerX">
								<ref target={boxId(m.from)} />
								<ref target={anchorId(i, "from")} />
							</align>
							{i === 0 ? (
								<distribute axis="y" spacing={50}>
									<ref target="actors" />
									<ref target={anchorId(0, "from")} />
								</distribute>
							) : (
								<distribute axis="y" spacing={messageGap}>
									<ref target={anchorId(i - 1, "from")} />
									<ref target={anchorId(i, "from")} />
								</distribute>
							)}
							{!selfMessage && (
								<>
									<Anchor id={anchorId(i, "to")} />
									<align alignment="centerY">
										<ref target={anchorId(i, "from")} />
										<ref target={anchorId(i, "to")} />
									</align>
									<align alignment="centerX">
										<ref target={boxId(m.to)} />
										<ref target={anchorId(i, "to")} />
									</align>
								</>
							)}

							<text key={labelId(i)} font-size={fontSize}>
								{m.label}
							</text>
							{selfMessage ? (
								<distribute axis="x" spacing={12}>
									<ref target={anchorId(i, "from")} />
									<ref target={labelId(i)} />
								</distribute>
							) : (
								<align alignment="centerX">
									<group>
										<ref target={anchorId(i, "from")} />
										<ref target={anchorId(i, "to")} />
									</group>
									<ref target={labelId(i)} />
								</align>
							)}
							<distribute axis="y" spacing={4}>
								<ref target={labelId(i)} />
								<ref target={anchorId(i, "from")} />
							</distribute>

							{!selfMessage && (
								<arrow
									key={arrowId(i)}
									stroke="#333"
									stroke-width={1.5}
									stroke-dasharray={m.reply ? "5 3" : undefined}
									padStart={0}
									padEnd={0}
								>
									<ref target={anchorId(i, "from")} />
									<ref target={anchorId(i, "to")} />
								</arrow>
							)}
						</React.Fragment>
					);
				})}

				{/* Bottom boxes hang below the last message */}
				{actors.map((a) => (
					<React.Fragment key={`${a}-bottom-pos`}>
						<align alignment="centerX">
							<ref target={boxId(a)} />
							<ref target={bottomId(a)} />
						</align>
						<distribute axis="y" spacing={40}>
							<ref target={anchorId(messages.length - 1, "from")} />
							<ref target={bottomId(a)} />
						</distribute>
					</React.Fragment>
				))}

				{/* Activation bars: centered on the lifeline, spanning their
				    messages vertically via the span relation */}
				{activations.map((act) => (
					<React.Fragment key={`act-${act.actor}-pos`}>
						<align alignment="centerX">
							<ref target={boxId(act.actor)} />
							<ref target={`act-${act.actor}`} />
						</align>
						<Span axis="y">
							<group>
								<ref target={anchorOn(messages, act.actor, act.from)} />
								<ref target={anchorOn(messages, act.actor, act.to)} />
							</group>
							<ref target={`act-${act.actor}`} />
						</Span>
					</React.Fragment>
				))}
			</group>
		</Canvas>
	);
}
