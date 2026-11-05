import { Graphic } from "@modular-svg/react";

const phases = [
	{ id: "queued", fill: "#E9ECEF", stroke: "#ADB5BD" },
	{ id: "building", fill: "#FFE8A3", stroke: "#F0A500" },
	{ id: "passed", fill: "#C7F0D2", stroke: "#2F9E44" },
];

// Fill and stroke are channels like any other. Each phase is its own
// motion on the chip; motions on one color lane merge as long as they don't
// overlap, and the labels swap in step with them.
export function StatusExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 6 }}>
			<rect
				key="chip"
				width={150}
				height={44}
				rx={22}
				fill={phases[0].fill}
				stroke={phases[0].stroke}
				stroke-width={2}
			/>
			{phases.map((p) => (
				<text key={p.id} font-size={15} fill="#333">
					{p.id}
				</text>
			))}
			<align alignment="center">
				<ref target="chip" />
				{phases.map((p) => (
					<ref key={p.id} target={p.id} />
				))}
			</align>

			{phases.slice(1).map((p) => (
				<motion
					key={`to-${p.id}`}
					over={0.6}
					steps={[
						{ to: { fill: p.fill, stroke: p.stroke }, over: 1, ease: "inOut" },
					]}
				>
					<ref target="chip" />
				</motion>
			))}
			{/* each label enters with its phase and leaves as the next begins */}
			<exit key="queuedOut" over={0.3}>
				<ref target="queued" />
			</exit>
			<enter key="buildingIn" over={0.3}>
				<ref target="building" />
			</enter>
			<exit key="buildingOut" over={0.3}>
				<ref target="building" />
			</exit>
			<enter key="passedIn" over={0.3}>
				<ref target="passed" />
			</enter>
			{/* an attention blink: hard cuts to red and back, with the hold ease */}
			<motion
				key="flash"
				steps={[
					{ to: { stroke: "#E03131" }, over: 0.15, ease: "hold" },
					{ wait: 0.3 },
					{ to: { stroke: phases[2].stroke }, over: 0.15, ease: "hold" },
				]}
			>
				<ref target="chip" />
			</motion>

			<sequence gap={1} at={0.6}>
				<ref target="to-building" />
				<ref target="to-passed" />
				<ref target="flash" />
			</sequence>
			<sameTime>
				<ref target="to-building" />
				<ref target="queuedOut" />
				<ref target="buildingIn" />
			</sameTime>
			<sameTime>
				<ref target="to-passed" />
				<ref target="buildingOut" />
				<ref target="passedIn" />
			</sameTime>
		</Graphic>
	);
}
