import { Graphic } from "@modular-svg/react";
import { useState } from "react";

// The beat and the note lengths are state. Change the tempo or click a note
// to toggle it long/short: Before + OnBeat re-solve where every note lands,
// and the new schedule plays from the top.
export function TempoExample() {
	const [bpm, setBpm] = useState(120);
	const [long, setLong] = useState<boolean[]>([
		false,
		true,
		false,
		false,
		true,
		false,
	]);

	return (
		<div>
			<label style={{ display: "block", marginBottom: "1rem" }}>
				{bpm} bpm
				<input
					type="range"
					min={60}
					max={200}
					step={10}
					value={bpm}
					onChange={(e) => setBpm(Number(e.target.value))}
					style={{ marginLeft: "1rem", verticalAlign: "middle" }}
				/>
			</label>
			<Graphic margin={16} animation={{ loop: true }}>
				<stackV key="score" spacing={18}>
					<circle key="metronome" r={6} fill="#333" stroke="none" />
					<stackH key="notes" spacing={10} alignment="bottom">
						{long.map((isLong, i) => (
							<rect
								key={`note${i}`}
								width={isLong ? 56 : 24}
								height={36}
								rx={4}
								fill={isLong ? "#E17055" : "#6C5CE7"}
								stroke="none"
								onClick={() =>
									setLong((ls) => ls.map((l, j) => (j === i ? !l : l)))
								}
							/>
						))}
					</stackH>
				</stackV>

				<beat key="beat" bpm={bpm} />
				{long.map((isLong, i) => (
					<enter
						key={`hit${i}`}
						over={isLong ? 0.9 : 0.2}
						from={{ scale: 0.4, opacity: 0.2 }}
						ease="pop"
					>
						<ref target={`note${i}`} />
					</enter>
				))}
				<before>
					{long.map((_, i) => (
						<ref key={i} target={`hit${i}`} />
					))}
				</before>
				<onBeat>
					<ref target="beat" />
					{long.map((_, i) => (
						<ref key={i} target={`hit${i}`} />
					))}
				</onBeat>
				<motion
					key="pulse"
					from={{ scale: 1.6 }}
					steps={[{ to: { scale: 1 }, over: 1 }]}
					loop
				>
					<ref target="metronome" />
				</motion>
				<stretch>
					<ref target="beat" />
					<ref target="pulse" />
				</stretch>
			</Graphic>
		</div>
	);
}
