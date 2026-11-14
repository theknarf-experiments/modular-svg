import { Graphic } from "@modular-svg/react";

const workers = ["w1", "w2", "w3"];

const under = (worker: string) => (
	<stackV spacing={12}>
		<ref target={worker} />
		<ref target="job" />
	</stackV>
);

// The job sits under a worker and its arrow runs to the log. Each Modulate
// re-seats the job under the next worker: the worker comes first, so it is
// what stays, and the arrow follows on its own because it is drawn between
// wherever its two ends are. The hops follow one another (Before) and land
// on the beat (OnBeat). All of that plays inside a Phrase, which runs it
// there and back, so the job is handed down the row and up again.
export function HandoffExample() {
	return (
		<Graphic margin={20} animation={{ loop: true }}>
			<stackV key="floor" spacing={70}>
				<stackH key="row" spacing={36}>
					{workers.map((w, i) => (
						<background
							key={w}
							padding={10}
							rx={8}
							fill="#E8F1FF"
							stroke="#444"
							stroke-width={1.5}
						>
							<text key={`${w}Label`} font-size={14}>
								{`Worker ${i + 1}`}
							</text>
						</background>
					))}
				</stackH>
				<background
					key="log"
					padding={10}
					rx={8}
					fill="#E6F7EE"
					stroke="#444"
					stroke-width={1.5}
				>
					<text key="logLabel" font-size={14}>
						Log
					</text>
				</background>
			</stackV>
			<rect
				key="job"
				width={18}
				height={18}
				rx={4}
				fill="#F28C28"
				stroke="none"
			/>
			{under("w1")}
			<arrow key="report" stroke="#444" stroke-width={1.5}>
				<ref target="job" />
				<ref target="log" />
			</arrow>

			<phrase key="round" repeat={2} alternate>
				<beat key="beat" bpm={80} />
				<rest key="wait" over={0.4} />
				<modulate key="to2" over={0.35} ease="inOut">
					{under("w2")}
				</modulate>
				<modulate key="to3" over={0.35} ease="inOut">
					{under("w3")}
				</modulate>
				<rest key="stay" over={0.4} />
				<before>
					<ref target="wait" />
					<ref target="to2" />
					<ref target="to3" />
					<ref target="stay" />
				</before>
				<onBeat>
					<ref target="beat" />
					<ref target="to2" />
					<ref target="to3" />
					<ref target="stay" />
				</onBeat>
			</phrase>
		</Graphic>
	);
}
