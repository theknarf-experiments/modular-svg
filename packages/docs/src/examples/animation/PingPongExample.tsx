import { Graphic } from "@modular-svg/react";

const DROP = 48;

// A phrase is a clock: the fall and the flash are placed in its own time
// (both start at 0 and last 0.6s), and the phrase plays that as a unit.
// `repeat` keeps going until the scene ends and `alternate` runs every other
// pass backwards, so the accelerating fall comes back as a decelerating rise
// and the pad's three-step flash steps back down, with no cut at the turn.
export function PingPongExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 4.8 }}>
			<stackV key="court" spacing={DROP} alignment="centerX">
				<circle key="ball" r={10} fill="#6C5CE7" stroke="none" />
				<rect
					key="pad"
					width={90}
					height={10}
					rx={5}
					fill="#E9ECEF"
					stroke="none"
				/>
			</stackV>

			<phrase key="bounce" repeat alternate>
				<motion key="fall" steps={[{ to: { y: DROP }, over: 0.6, ease: "in" }]}>
					<ref target="ball" />
				</motion>
				<motion
					key="flash"
					steps={[{ to: { fill: "#F28C28" }, over: 0.6, ease: "steps(3)" }]}
				>
					<ref target="pad" />
				</motion>
			</phrase>
		</Graphic>
	);
}
