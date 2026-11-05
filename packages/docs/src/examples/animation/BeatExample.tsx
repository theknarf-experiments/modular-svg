import { Graphic } from "@modular-svg/react";

const notes = [0.2, 0.7, 0.2, 0.2, 1.2, 0.2, 0.4, 0.2];

// A beat is a node like any other. Each note must come after the one before
// it (Before) and land on a beat (OnBeat): short notes take the next beat,
// long ones push the next note further down the grid. The metronome's pulse
// is stretched to one beat and loops.
export function BeatExample() {
	return (
		<Graphic margin={16} animation={{ loop: true }}>
			<stackV key="score" spacing={18}>
				<circle key="metronome" r={6} fill="#333" stroke="none" />
				<stackH key="notes" spacing={10} alignment="bottom">
					{notes.map((len, i) => (
						<rect
							key={`note${i}`}
							width={24}
							height={20 + len * 40}
							rx={4}
							fill="#6C5CE7"
							stroke="none"
						/>
					))}
				</stackH>
			</stackV>

			<beat key="beat" bpm={120} />
			{notes.map((len, i) => (
				<enter
					key={`hit${i}`}
					over={len}
					from={{ scale: 0.4, opacity: 0.2 }}
					ease="pop"
				>
					<ref target={`note${i}`} />
				</enter>
			))}
			<before>
				{notes.map((_, i) => (
					<ref key={`b${i}`} target={`hit${i}`} />
				))}
			</before>
			<onBeat>
				<ref target="beat" />
				{notes.map((_, i) => (
					<ref key={`o${i}`} target={`hit${i}`} />
				))}
			</onBeat>

			<motion
				key="pulse"
				from={{ scale: 1.6 }}
				steps={[{ to: { scale: 1 }, over: 1, ease: "out" }]}
				loop
			>
				<ref target="metronome" />
			</motion>
			<stretch>
				<ref target="beat" />
				<ref target="pulse" />
			</stretch>
		</Graphic>
	);
}
