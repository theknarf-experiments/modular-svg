import { Graphic } from "@modular-svg/react";
import { useState } from "react";

// Three loads run in parallel; the check waits for whichever finishes last
// (After joins on every leader). Drag the slider: the schedule is re-solved.
export function JoinExample() {
	const [slow, setSlow] = useState(2);
	const loads = [
		{ id: "api", label: "api", over: 1 },
		{ id: "db", label: "db", over: slow },
		{ id: "cdn", label: "cdn", over: 0.6 },
	];

	return (
		<div>
			<label style={{ display: "block", marginBottom: "1rem" }}>
				db takes {slow.toFixed(1)}s
				<input
					type="range"
					min={0.2}
					max={3}
					step={0.1}
					value={slow}
					onChange={(e) => setSlow(Number(e.target.value))}
					style={{ marginLeft: "1rem", verticalAlign: "middle" }}
				/>
			</label>
			<Graphic margin={16} animation={{ loop: true, duration: 5 }}>
				<stackH key="layout" spacing={24} alignment="centerY">
					<stackV key="bars" spacing={10} alignment="left">
						{loads.map((l) => (
							<stackH key={`${l.id}Row`} spacing={8} alignment="centerY">
								<text
									key={`${l.id}Label`}
									width={30}
									font-size={12}
									fill="#555"
								>
									{l.label}
								</text>
								<rect
									key={`${l.id}Bar`}
									width={160}
									height={12}
									rx={3}
									fill="#2A9D8F"
									stroke="none"
								/>
							</stackH>
						))}
					</stackV>
					<circle key="done" r={14} fill="#2A9D8F" stroke="none" />
				</stackH>

				{loads.map((l) => (
					<motion
						key={`${l.id}Load`}
						from={{ width: 0 }}
						steps={[{ to: { width: 160 }, over: 1, ease: "linear" }]}
						over={l.over}
					>
						<ref target={`${l.id}Bar`} />
					</motion>
				))}
				<sameTime at={0.3}>
					{loads.map((l) => (
						<ref key={l.id} target={`${l.id}Load`} />
					))}
				</sameTime>
				<enter key="doneIn" over={0.4} from={{ scale: 0 }} ease="pop">
					<ref target="done" />
				</enter>
				<after gap={0.1}>
					<ref target="doneIn" />
					{loads.map((l) => (
						<ref key={l.id} target={`${l.id}Load`} />
					))}
				</after>
			</Graphic>
		</div>
	);
}
