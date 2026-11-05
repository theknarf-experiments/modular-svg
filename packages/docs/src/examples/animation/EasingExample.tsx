import { type Ease, Graphic } from "@modular-svg/react";

const curves: [string, Ease][] = [
	["linear", "linear"],
	["in", "in"],
	["out", "out"],
	["inOut", "inOut"],
	["pop", "pop"],
	["hold", "hold"],
	["steps(4)", "steps(4)"],
	["bezier", [0.2, 0.8, 0.2, 1]],
];

// svjeez's easing gallery. Each dot travels to a ref at the end of its
// track, and SameTime starts every trip together.
export function EasingExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 3, stillAt: 2 }}>
			<stackV key="rows" spacing={14} alignment="left">
				{curves.map(([label], i) => (
					<stackH key={`row${i}`} spacing={12} alignment="centerY">
						<text
							key={`label${i}`}
							width={70}
							font-size={11}
							font-family="monospace"
							fill="#555"
						>
							{label}
						</text>
						<group key={`lane${i}`}>
							<rect
								key={`track${i}`}
								width={270}
								height={2}
								fill="#ddd"
								stroke="none"
							/>
							<circle key={`dot${i}`} r={6} fill="#F28C28" stroke="none" />
							<circle key={`end${i}`} r={6} fill="none" stroke="none" />
							<align alignment="centerLeft">
								<ref target={`track${i}`} />
								<ref target={`dot${i}`} />
							</align>
							<align alignment="centerRight">
								<ref target={`track${i}`} />
								<ref target={`end${i}`} />
							</align>
						</group>
					</stackH>
				))}
			</stackV>
			{curves.map(([, ease], i) => (
				<travel key={`trip${i}`} over={1.6} ease={ease}>
					<ref target={`dot${i}`} />
					<ref target={`end${i}`} />
				</travel>
			))}
			<sameTime at={0.4}>
				{curves.map(([label], i) => (
					<ref key={label} target={`trip${i}`} />
				))}
			</sameTime>
		</Graphic>
	);
}
