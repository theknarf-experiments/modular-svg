import { Canvas } from "@modular-svg/react";
import { useState } from "react";

const planets = [
	{ id: "mercury", label: "Mercury", r: 15, fill: "#EBE3CF" },
	{ id: "venus", label: "Venus", r: 36, fill: "#DC933C" },
	{ id: "earth", label: "Earth", r: 38, fill: "#179DD7" },
	{ id: "mars", label: "Mars", r: 21, fill: "#F1CF8E" },
];

// The key on the circle becomes its stable id, so refs can target it
function Planet({ id, r, fill }: { id: string; r: number; fill: string }) {
	return <circle key={id} r={r} fill={fill} stroke="black" stroke-width={3} />;
}

export function PlanetExample() {
	const [target, setTarget] = useState("mercury");
	const label = planets.find((p) => p.id === target)?.label ?? target;

	return (
		<div>
			<label style={{ display: "block", marginBottom: "1rem" }}>
				Label planet:
				<select
					aria-label="Label planet"
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					style={{ marginLeft: "0.5rem", padding: "4px 8px" }}
				>
					{planets.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
				</select>
			</label>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={20}
			>
				<group>
					<background padding={10}>
						<stackH key="planets" spacing={50} alignment="centerY">
							{planets.map((p) => (
								<Planet key={p.id} id={p.id} r={p.r} fill={p.fill} />
							))}
						</stackH>
					</background>

					<align key="alignLabel" axis="x" alignment="center">
						<text key="label" fill="black">
							{label}
						</text>
						<ref target={target} />
					</align>

					<distribute key="distVertical" axis="y" spacing={60}>
						<ref target="label" />
						<ref target={target} />
					</distribute>

					<arrow key="arrow1" stroke="black" stroke-width={2}>
						<ref target="label" />
						<ref target={target} />
					</arrow>
				</group>
			</Canvas>
		</div>
	);
}
