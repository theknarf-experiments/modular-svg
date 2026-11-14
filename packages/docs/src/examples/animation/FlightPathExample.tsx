import { Graphic } from "@modular-svg/react";

const cities = [
	{ id: "osl", label: "OSL", cx: 14, cy: 132 },
	{ id: "cph", label: "CPH", cx: 134, cy: 52 },
	{ id: "ber", label: "BER", cx: 254, cy: 122 },
	{ id: "vie", label: "VIE", cx: 374, cy: 42 },
	{ id: "ath", label: "ATH", cx: 474, cy: 102 },
];
// One curve through every city, flat as it passes each
const course = `M 14 132 C 54 132 94 52 134 52 S 214 122 254 122 S 334 42 374 42 S 444 102 474 102`;

const circuit = [
	{ id: "n", cx: 620, cy: 30 },
	{ id: "e", cx: 676, cy: 86 },
	{ id: "s", cx: 620, cy: 142 },
	{ id: "w", cx: 564, cy: 86 },
];

// A dart drawn facing right; orient turns it to face along its route
const plane = (key: string, fill: string) => (
	<path
		key={key}
		d="M 0 0 L 22 8 L 0 16 L 5 8 Z"
		fill={fill}
		stroke="none"
		stroke-width={0}
	/>
);

// Left: the plane rides the course itself (route="along"), turning with it
// (orient), while a Draw stretched to the trip strokes the same path, so the
// trail keeps exactly to the plane, and the last city rings as it lands.
// Right: a holding pattern. The route is one smooth curve through the four
// beacons (route="smooth"); it ends where the plane began, so it closes and
// the loop has no seam.
export function FlightPathExample() {
	return (
		<Graphic margin={28} animation={{ loop: true, duration: 6, stillAt: 3.1 }}>
			<path
				key="planned"
				d={course}
				fill="none"
				stroke="#C9CED6"
				stroke-width={1.5}
				stroke-dasharray="2 6"
				stroke-linecap="round"
			/>
			<path
				key="trail"
				d={course}
				fill="none"
				stroke="#F28C28"
				stroke-width={2.5}
				stroke-linecap="round"
			/>
			{cities.map((c) => (
				<circle
					key={c.id}
					cx={c.cx}
					cy={c.cy}
					r={6}
					fill="#fff"
					stroke="#2D3748"
					stroke-width={2}
				/>
			))}
			{cities.map((c) => (
				<text
					key={`${c.id}Label`}
					font-size={11}
					font-family="monospace"
					fill="#667"
				>
					{c.label}
				</text>
			))}
			{cities.map((c) => (
				<stackV key={`${c.id}Tag`} spacing={8} alignment="centerX">
					<ref target={c.id} />
					<ref target={`${c.id}Label`} />
				</stackV>
			))}
			{plane("plane", "#2D3748")}
			<align alignment="center">
				<ref target="osl" />
				<ref target="plane" />
			</align>

			{circuit.map((b) => (
				<circle
					key={b.id}
					cx={b.cx}
					cy={b.cy}
					r={4}
					fill="#C9CED6"
					stroke="none"
				/>
			))}
			{plane("holding", "#F28C28")}
			<align alignment="center">
				<ref target="n" />
				<ref target="holding" />
			</align>

			<travel
				key="flight"
				route="along"
				orient
				at={0.5}
				over={3.6}
				ease="inOut"
			>
				<ref target="plane" />
				<ref target="planned" />
			</travel>
			<draw key="wake" ease="inOut">
				<ref target="trail" />
			</draw>
			<stretch>
				<ref target="flight" />
				<ref target="wake" />
			</stretch>
			<motion
				key="touchdown"
				steps={[
					{ to: { scale: 1.7 }, over: 0.1, ease: "out" },
					{ to: { scale: 1 }, over: 0.8, ease: "elastic" },
				]}
			>
				<ref target="ath" />
			</motion>
			<sequence gap={-0.15}>
				<ref target="flight" />
				<ref target="touchdown" />
			</sequence>

			<travel key="circle" route="smooth" orient over={3} ease="linear" loop>
				<ref target="holding" />
				<ref target="e" />
				<ref target="s" />
				<ref target="w" />
				<ref target="n" />
			</travel>
		</Graphic>
	);
}
