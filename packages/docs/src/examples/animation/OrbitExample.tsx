import { Graphic } from "@modular-svg/react";

const R = 70;
const D = 6;
const ellipse = Array.from({ length: 48 }, (_, i) => {
	const a = (2 * Math.PI * i) / 48;
	return `${i === 0 ? "M" : "L"}${(R * Math.cos(a)).toFixed(2)} ${(0.4 * R * Math.sin(a)).toFixed(2)}`;
}).join(" ");

// svjeez's orbit: a sampled function of time, a looping spin and a seeded
// wiggle. The ring's spin is stretched to a clock of half an orbit.
export function OrbitExample() {
	return (
		<Graphic animation={{ loop: true }}>
			<rect
				key="space"
				x={0}
				y={0}
				width={240}
				height={160}
				fill="#0B0D12"
				stroke="none"
			/>
			<path
				key="track"
				d={`${ellipse} Z`}
				fill="none"
				stroke="#2A2F3D"
				stroke-width={1}
				stroke-dasharray="3 5"
			/>
			<circle key="planet" r={26} fill="#FF5FA8" stroke="none" />
			<rect
				key="ring"
				width={68}
				height={4}
				rx={2}
				fill="#FFD166"
				stroke="none"
			/>
			<circle key="moon" r={7} fill="#3EE6D6" stroke="none" />
			<align alignment="center">
				<ref target="space" />
				<ref target="track" />
				<ref target="planet" />
				<ref target="ring" />
				<ref target="moon" />
			</align>

			<sampled
				key="orbit"
				over={D}
				fn={(t) => ({
					x: R * Math.cos((2 * Math.PI * t) / D),
					y: 0.4 * R * Math.sin((2 * Math.PI * t) / D),
				})}
				tolerance={{ translate: 0.5 }}
			>
				<ref target="moon" />
			</sampled>
			<wiggle key="breathe" amplitude={{ scale: 0.04 }} seed="planet" rate={3}>
				<ref target="planet" />
			</wiggle>
			<motion
				key="spin"
				from={{ rotate: 0 }}
				steps={[{ to: { rotate: 360 }, over: 1, ease: "linear" }]}
				loop
			>
				<ref target="ring" />
			</motion>
			{/* a beat is a reusable clock: the spin takes one period, half an orbit */}
			<beat key="halfOrbit" period={D / 2} />
			<stretch>
				<ref target="halfOrbit" />
				<ref target="spin" />
			</stretch>
		</Graphic>
	);
}
