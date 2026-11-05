import { Graphic, useCues, useSolution } from "@modular-svg/react";
import { useState } from "react";

// MIDI note numbers and lengths in seconds
const notes = [
	{ pitch: 60, over: 0.2 },
	{ pitch: 64, over: 0.7 },
	{ pitch: 67, over: 0.2 },
	{ pitch: 72, over: 0.2 },
	{ pitch: 71, over: 1.2 },
	{ pitch: 67, over: 0.2 },
	{ pitch: 64, over: 0.4 },
	{ pitch: 60, over: 0.2 },
];

function play(audio: AudioContext, pitch: number, seconds: number) {
	const osc = audio.createOscillator();
	const gain = audio.createGain();
	osc.type = "triangle";
	osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
	const now = audio.currentTime;
	gain.gain.setValueAtTime(0.2, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.15, seconds));
	osc.connect(gain).connect(audio.destination);
	osc.start(now);
	osc.stop(now + Math.max(0.15, seconds));
}

// The solver already knows when every ref happens. onSolve hands that out,
// and useCues calls back as the animation's own clock passes each hit, so
// sound (or anything else) rides on the solved schedule without the solver
// or the React package knowing about audio.
export function SoundExample() {
	const [solution, onSolve] = useSolution();
	const [audio, setAudio] = useState<AudioContext>();

	useCues(
		solution,
		Object.fromEntries(
			notes.map((n, i) => [
				`hit${i}`,
				() => audio && play(audio, n.pitch, n.over),
			]),
		),
	);

	return (
		<div>
			<button
				type="button"
				onClick={() => setAudio((a) => a ?? new AudioContext())}
				style={{ marginBottom: "1rem" }}
			>
				{audio ? "Sound is on" : "Turn sound on"}
			</button>
			<Graphic margin={16} animation={{ loop: true }} onSolve={onSolve}>
				<stackH key="notes" spacing={10} alignment="bottom">
					{notes.map((n, i) => (
						<rect
							key={`note${i}`}
							width={24}
							height={(n.pitch - 54) * 4}
							rx={4}
							fill="#6C5CE7"
							stroke="none"
						/>
					))}
				</stackH>
				<beat key="beat" bpm={120} />
				{notes.map((n, i) => (
					<enter
						key={`hit${i}`}
						over={n.over}
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
			</Graphic>
			{solution && (
				<p style={{ fontSize: "12px", color: "#666", fontFamily: "monospace" }}>
					{notes
						.map((_, i) => `${solution.spans[`hit${i}`]?.start.toFixed(2)}s`)
						.join(" · ")}
					{" / "}
					{solution.duration.toFixed(2)}s loop
				</p>
			)}
		</div>
	);
}
