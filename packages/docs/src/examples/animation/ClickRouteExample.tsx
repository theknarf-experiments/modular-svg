import { Graphic } from "@modular-svg/react";
import { useState } from "react";

const steps = ["commit", "review", "build", "test", "deploy"];

// Click a stage: the comet's Travel waypoints are just the refs after it,
// so the route (and its timing) comes straight from React state. A new key
// on the Graphic replays the scene for every click. Labels and the moving
// dot let clicks through to the stage underneath.
export function ClickRouteExample() {
	const [from, setFrom] = useState(0);
	const [run, setRun] = useState(0);
	const ahead = steps.slice(from + 1);

	return (
		<div>
			<p style={{ fontSize: "13px", color: "#666", marginTop: 0 }}>
				Click any stage to send a change from there.
			</p>
			<Graphic key={run} margin={16}>
				<stackH key="pipeline" spacing={28} alignment="centerY">
					{steps.map((s, i) => (
						<background
							key={s}
							padding={10}
							rx={8}
							fill={i === from ? "#FFE8CC" : "#F5F5F5"}
							stroke="#555"
							stroke-width={1.5}
							onClick={() => {
								setFrom(i);
								setRun((r) => r + 1);
							}}
						>
							<text key={`${s}Label`} font-size={13} pointer-events="none">
								{s}
							</text>
						</background>
					))}
				</stackH>
				{steps.slice(1).map((s, i) => (
					<arrow key={`to-${s}`} stroke="#999" stroke-width={1.5}>
						<ref target={steps[i]} />
						<ref target={s} />
					</arrow>
				))}
				<circle
					key="change"
					r={6}
					fill="#F28C28"
					stroke="none"
					pointer-events="none"
				/>
				<align alignment="center">
					<ref target={steps[from]} />
					<ref target="change" />
				</align>

				<enter key="appear" over={0.3} from={{ scale: 0 }} ease="pop">
					<ref target="change" />
				</enter>
				{ahead.length > 0 && (
					<travel key="trip" over={0.45 * ahead.length} ease="inOut">
						<ref target="change" />
						{ahead.map((s) => (
							<ref key={s} target={s} />
						))}
					</travel>
				)}
				<enter key="landed" over={0.4} from={{ scale: 1.15 }} ease="pop">
					<ref target="deploy" />
				</enter>
				<sequence gap={0.1}>
					<ref target="appear" />
					{ahead.length > 0 && <ref target="trip" />}
					<ref target="landed" />
				</sequence>
			</Graphic>
		</div>
	);
}
