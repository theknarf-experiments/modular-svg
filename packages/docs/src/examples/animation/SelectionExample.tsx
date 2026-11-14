import { Graphic } from "@modular-svg/react";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const around = (padding: number, ...picked: string[]) => (
	<background padding={padding}>
		<ref target="pick" />
		{picked.map((day) => (
			<ref key={day} target={day} />
		))}
	</background>
);

// At home the frame wraps Monday. A Background inside a Modulate restates a
// box that is already there: its first ref is the box, the rest are what it
// wraps while the Modulate holds. The first one stretches the frame over three
// days, the second (which wins, being later) moves it to the end of the week
// with more room around it, and Resolve lets both go.
export function SelectionExample() {
	return (
		<Graphic
			margin={20}
			animation={{ loop: true, duration: 4.4, stillAt: 1.4 }}
		>
			<stackH key="week" spacing={10}>
				{days.map((day) => (
					<background
						key={day}
						padding={8}
						rx={6}
						fill="#FFFFFF"
						stroke="#888"
						stroke-width={1}
					>
						<text key={`${day}Label`} font-size={14}>
							{day}
						</text>
					</background>
				))}
			</stackH>
			<background
				key="pick"
				padding={4}
				rx={9}
				fill="none"
				stroke="#F28C28"
				stroke-width={2.5}
			>
				<ref target="Mon" />
			</background>

			<modulate key="three" at={0.6} over={0.5} ease="inOut">
				{around(4, "Mon", "Tue", "Wed")}
			</modulate>
			<modulate key="weekend" at={1.9} over={0.5} ease="inOut">
				{around(9, "Thu", "Fri")}
			</modulate>
			<resolve key="back" at={3.2} over={0.5} ease="inOut" />
		</Graphic>
	);
}
