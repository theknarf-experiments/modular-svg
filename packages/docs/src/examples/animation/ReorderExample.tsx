import { Graphic } from "@modular-svg/react";

const people = [
	{ id: "ada", label: "Ada", fill: "#E8F1FF" },
	{ id: "grace", label: "Grace", fill: "#F3EEFF" },
	{ id: "alan", label: "Alan", fill: "#FFF6E0" },
	{ id: "edsger", label: "Edsger", fill: "#E6F7EE" },
];

const order = (ids: string[]) => (
	<stackV spacing={8} alignment="left">
		{ids.map((id) => (
			<ref key={id} target={id} />
		))}
	</stackV>
);

// The board's stack is the home layout. A Modulate holds a layout relation
// for part of the timeline: from its start on, its stack places the rows
// instead of the board's, and every row slides to its new slot over the
// Modulate's span. The next Modulate takes over from the first, and Resolve
// lets go of them all, so the rows go home.
export function ReorderExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 4.4 }}>
			<stackV key="board" spacing={8} alignment="left">
				{people.map((p) => (
					<background
						key={p.id}
						padding={8}
						rx={6}
						fill={p.fill}
						stroke="#444"
						stroke-width={1.5}
					>
						<text key={`${p.id}Name`} width={84} font-size={14}>
							{p.label}
						</text>
					</background>
				))}
			</stackV>

			<modulate key="shuffle" at={0.6} over={0.6} ease="inOut">
				{order(["alan", "ada", "edsger", "grace"])}
			</modulate>
			<modulate key="again" at={1.9} over={0.6} ease="inOut">
				{order(["edsger", "grace", "alan", "ada"])}
			</modulate>
			<resolve key="home" at={3.2} over={0.6} ease="inOut" />
		</Graphic>
	);
}
