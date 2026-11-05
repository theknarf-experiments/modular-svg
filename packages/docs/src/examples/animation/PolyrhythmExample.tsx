import { Graphic } from "@modular-svg/react";

// Three against two: the top beat is set at 90 bpm, the bottom one is locked
// to it so that two of its beats take as long as three of the top's. Each
// pulse loops once per its own beat; they meet on every downbeat.
export function PolyrhythmExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 4 }}>
			<stackV key="lanes" spacing={20}>
				<stackH key="threeRow" spacing={12} alignment="centerY">
					<text key="threeLabel" font-size={13} width={20}>
						3
					</text>
					<circle key="threeDot" r={12} fill="#0984E3" stroke="none" />
				</stackH>
				<stackH key="twoRow" spacing={12} alignment="centerY">
					<text key="twoLabel" font-size={13} width={20}>
						2
					</text>
					<circle key="twoDot" r={12} fill="#D63031" stroke="none" />
				</stackH>
			</stackV>

			<beat key="three" bpm={90} />
			<beat key="two" />
			<polyrhythm of={[3, 2]}>
				<ref target="three" />
				<ref target="two" />
			</polyrhythm>

			<motion
				key="threePulse"
				from={{ scale: 1.5 }}
				steps={[{ to: { scale: 1 }, over: 1 }]}
				loop
			>
				<ref target="threeDot" />
			</motion>
			<motion
				key="twoPulse"
				from={{ scale: 1.5 }}
				steps={[{ to: { scale: 1 }, over: 1 }]}
				loop
			>
				<ref target="twoDot" />
			</motion>
			<stretch>
				<ref target="three" />
				<ref target="threePulse" />
			</stretch>
			<stretch>
				<ref target="two" />
				<ref target="twoPulse" />
			</stretch>
		</Graphic>
	);
}
