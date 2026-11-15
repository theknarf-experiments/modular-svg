import { Graphic } from "@modular-svg/react";

const quotes = [
	{ id: "acme", symbol: "ACME", change: "+2.4%" },
	{ id: "glob", symbol: "GLOB", change: "-0.8%" },
	{ id: "initech", symbol: "INTC", change: "+1.1%" },
	{ id: "umbra", symbol: "UMBR", change: "+5.6%" },
	{ id: "hooli", symbol: "HOOL", change: "-3.2%" },
	{ id: "vandelay", symbol: "VNDL", change: "+0.3%" },
];
// Every quote takes the same room, so one lap is a whole number of them
const PITCH = 132;
const LAP = quotes.length * PITCH;

// A ticker. The strip is two laps of quotes in one long StackH; the Clip
// shows it through a fixed window, and a looping Motion slides the strip
// left by exactly one lap, so the loop has no seam. The strip is 1500px
// long, yet the canvas is the size of the bar: content only counts where its
// clip can show it. `feather` softens the window's edge, so quotes fade in
// and out at the ends.
export function TickerExample() {
	return (
		<Graphic animation={{ loop: true, stillAt: 2 }}>
			<rect
				key="bar"
				width={480}
				height={44}
				rx={8}
				fill="#111827"
				stroke="none"
				stroke-width={0}
			/>
			<clip key="ticker" feather={7}>
				<rect key="window" width={440} height={70} />
				<stackH key="strip" spacing={0}>
					{[0, 1].flatMap((lap) =>
						quotes.map((q) => (
							<stackH key={`${q.id}${lap}`} spacing={8}>
								<text
									key={`${q.id}${lap}Symbol`}
									font-size={15}
									font-weight={700}
									fill="#FFFFFF"
									width={48}
								>
									{q.symbol}
								</text>
								<text
									key={`${q.id}${lap}Change`}
									font-size={15}
									fill={q.change.startsWith("+") ? "#3DDC97" : "#FF6B6B"}
									width={PITCH - 56}
								>
									{q.change}
								</text>
							</stackH>
						)),
					)}
				</stackH>
			</clip>
			<align alignment="center">
				<ref target="bar" />
				<ref target="window" />
			</align>
			<align alignment="centerLeft">
				<ref target="window" />
				<ref target="strip" />
			</align>

			<motion
				key="roll"
				loop
				steps={[{ to: { x: -LAP }, over: 9, ease: "linear" }]}
			>
				<ref target="strip" />
			</motion>
		</Graphic>
	);
}
