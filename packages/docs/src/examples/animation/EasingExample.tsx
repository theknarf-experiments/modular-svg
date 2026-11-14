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
	["anticipate", "anticipate"],
	["anticipateOvershoot", "anticipateOvershoot"],
	["spring", "spring"],
	["stiff spring", { kind: "spring", bounce: 0.1 }],
	["bounce", "bounce"],
	["elastic", "elastic"],
];

// svjeez's easing gallery. Each dot travels to a ref at the end of its
// track, and SameTime starts every trip together. The last rows leave the
// track: a spring or an elastic runs past the end and comes back, and an
// anticipating ease first pulls away from where it is going.
export function EasingExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 3, stillAt: 2 }}>
			<stackV key="rows" spacing={14} alignment="left">
				{curves.map(([label], i) => (
					<stackH key={`row${i}`} spacing={40} alignment="centerY">
						<text
							key={`label${i}`}
							width={128}
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
						{/* room for the eases that run past the end */}
						<rect
							key={`room${i}`}
							width={70}
							height={2}
							fill="none"
							stroke="none"
						/>
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
