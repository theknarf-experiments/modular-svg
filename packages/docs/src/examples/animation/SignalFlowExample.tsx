import { Graphic } from "@modular-svg/react";

const wires = [
	{ from: "api", to: "auth" },
	{ from: "auth", to: "db" },
	{ from: "api", to: "queue" },
	{ from: "queue", to: "db" },
];

const service = (key: string, label: string, fill: string) => (
	<background
		key={key}
		padding={12}
		rx={10}
		fill={fill}
		stroke="#2D3748"
		stroke-width={1.5}
	>
		<text key={`${key}Label`} font-size={14}>
			{label}
		</text>
	</background>
);

// The wires are Curves between the services, and each packet's Travel refs
// its wire with route="along": the packet rides the curve as it is drawn,
// wherever layout put the services. Before puts the trips in order and OnBeat
// lands each on the next beat; every arrival rings its service with an
// elastic ease, and the Phrase plays the whole exchange twice.
export function SignalFlowExample() {
	return (
		<Graphic margin={24} animation={{ loop: true }}>
			<stackH key="system" spacing={96} alignment="centerY">
				{service("api", "API", "#E8F1FF")}
				<stackV key="workers" spacing={84}>
					{service("auth", "Auth", "#F3EEFF")}
					{service("queue", "Queue", "#FFF6E0")}
				</stackV>
				{service("db", "Database", "#E6F7EE")}
			</stackH>
			{wires.map((w, i) => (
				<curve key={`wire${i}`} stroke="#A9B2BF" stroke-width={2}>
					<ref target={w.from} />
					<ref target={w.to} />
				</curve>
			))}
			{wires.map((_, i) => (
				<circle
					key={`packet${i}`}
					r={5.5}
					fill="#F28C28"
					stroke="#fff"
					stroke-width={1.5}
				/>
			))}
			{wires.map((w, i) => (
				<align key={`park${i}`} alignment="center">
					<ref target={w.from} />
					<ref target={`packet${i}`} />
				</align>
			))}

			<phrase key="exchange" repeat={2}>
				<beat key="beat" bpm={110} />
				{wires.map((_, i) => (
					<travel key={`trip${i}`} route="along" over={0.5} ease="inOut">
						<ref target={`packet${i}`} />
						<ref target={`wire${i}`} />
					</travel>
				))}
				{/* A packet shows only while it is on its wire */}
				{wires.map((_, i) => (
					<motion
						key={`show${i}`}
						from={{ opacity: 0 }}
						steps={[
							{ set: { opacity: 1 } },
							{ wait: 1 },
							{ set: { opacity: 0 } },
						]}
					>
						<ref target={`packet${i}`} />
					</motion>
				))}
				{wires.map((_, i) => (
					<stretch key={`ride${i}`}>
						<ref target={`trip${i}`} />
						<ref target={`show${i}`} />
					</stretch>
				))}
				{/* The service swells as the packet lands, then rings back to size */}
				{wires.map((w, i) => (
					<motion
						key={`ring${i}`}
						steps={[
							{ to: { scale: 1.16 }, over: 0.08, ease: "out" },
							{ to: { scale: 1 }, over: 0.6, ease: "elastic" },
						]}
					>
						<ref target={w.to} />
					</motion>
				))}
				{wires.map((_, i) => (
					<sequence key={`arrive${i}`}>
						<ref target={`trip${i}`} />
						<ref target={`ring${i}`} />
					</sequence>
				))}
				<before>
					{wires.map((_, i) => (
						<ref key={i} target={`trip${i}`} />
					))}
				</before>
				<onBeat>
					<ref target="beat" />
					{wires.map((_, i) => (
						<ref key={i} target={`trip${i}`} />
					))}
				</onBeat>
				<rest key="breath" over={0.6} />
				<sequence>
					<ref target="ring3" />
					<ref target="breath" />
				</sequence>
			</phrase>
		</Graphic>
	);
}
