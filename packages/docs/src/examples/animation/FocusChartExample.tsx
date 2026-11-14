import { Graphic } from "@modular-svg/react";
import { useState } from "react";

const months = [
	{ id: "jan", label: "Jan", value: 42 },
	{ id: "feb", label: "Feb", value: 58 },
	{ id: "mar", label: "Mar", value: 35 },
	{ id: "apr", label: "Apr", value: 77 },
	{ id: "may", label: "May", value: 64 },
	{ id: "jun", label: "Jun", value: 91 },
	{ id: "jul", label: "Jul", value: 83 },
	{ id: "aug", label: "Aug", value: 49 },
	{ id: "sep", label: "Sep", value: 27 },
	{ id: "oct", label: "Oct", value: 70 },
];

// The camera here is state, not a timeline: it cuts (`at={0} over={0}`) to
// whatever it refs, and React decides what that is. Graphic's `transition`
// then moves the view from where it was to where the new scene has it, the
// same way it tweens marks. With nothing to ref, the camera frames the whole
// chart again.
export function FocusChartExample() {
	const [focus, setFocus] = useState<string | null>(null);

	return (
		<div>
			<p style={{ fontSize: "13px", color: "#666", marginTop: 0 }}>
				Click a bar to look closer; click it again to step back.
			</p>
			<Graphic
				view={{ width: 480, height: 270 }}
				margin={24}
				transition={{ duration: 0.7, ease: "inOut" }}
			>
				<stackH key="bars" spacing={14} alignment="bottom">
					{months.map((m) => (
						<rect
							key={m.id}
							width={34}
							height={m.value * 1.2}
							rx={4}
							fill={focus === null || focus === m.id ? "#4C7DF0" : "#C9D6F5"}
							stroke="none"
							stroke-width={0}
							cursor="pointer"
							onClick={() => setFocus(focus === m.id ? null : m.id)}
						/>
					))}
				</stackH>
				{months.map((m) => (
					<text
						key={`${m.id}Value`}
						font-size={12}
						font-weight={600}
						fill="#2D3748"
						pointer-events="none"
					>
						{String(m.value)}
					</text>
				))}
				{months.map((m) => (
					<text
						key={`${m.id}Label`}
						font-size={11}
						fill="#5A6577"
						pointer-events="none"
					>
						{m.label}
					</text>
				))}
				{months.map((m) => (
					<stackV key={`${m.id}Column`} spacing={6} alignment="centerX">
						<ref target={`${m.id}Value`} />
						<ref target={m.id} />
						<ref target={`${m.id}Label`} />
					</stackV>
				))}

				<camera key="look" at={0} over={0} padding={22}>
					{focus !== null && <ref target={`${focus}Column`} />}
				</camera>
			</Graphic>
		</div>
	);
}
