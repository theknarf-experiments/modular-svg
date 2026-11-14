import { Graphic } from "@modular-svg/react";

const stages = [
	{ id: "client", label: "Client", note: "sends a request", fill: "#E8F1FF" },
	{ id: "api", label: "API", note: "checks it, enqueues it", fill: "#F3EEFF" },
	{ id: "queue", label: "Queue", note: "soaks up the burst", fill: "#FFF6E0" },
	{
		id: "workers",
		label: "Workers",
		note: "do the slow part",
		fill: "#FFE8E0",
	},
	{ id: "store", label: "Store", note: "keeps the result", fill: "#E6F7EE" },
];
// Along the top, then back underneath
const places = [
	{ x: 0, y: 0 },
	{ x: 250, y: 0 },
	{ x: 500, y: 0 },
	{ x: 500, y: 190 },
	{ x: 250, y: 190 },
];

// A camera is a timed leaf like any motion: Before puts the five in order
// and OnBeat lands each on the next beat. Each frames one stage (padding
// keeps some air round it), so the view pushes in there over the camera's
// span; the arrow into the stage draws as the push begins and its words
// enter as it settles. The last camera refs nothing, which frames the whole
// canvas again: the pull-back. `view` makes the picture 16:9 whatever shape
// the diagram has.
export function ArchitectureTourExample() {
	return (
		<Graphic
			view={{ width: 480, height: 270 }}
			margin={24}
			animation={{ loop: true, stillAt: 3.4 }}
		>
			{stages.map((s, i) => (
				<rect
					key={s.id}
					x={places[i].x}
					y={places[i].y}
					width={150}
					height={64}
					rx={12}
					fill={s.fill}
					stroke="#2D3748"
					stroke-width={2}
				/>
			))}
			{stages.map((s) => (
				<text key={`${s.id}Label`} font-size={17} font-weight={600}>
					{s.label}
				</text>
			))}
			{stages.map((s) => (
				<text key={`${s.id}Note`} font-size={11} fill="#5A6577">
					{s.note}
				</text>
			))}
			{stages.map((s) => (
				<stackV key={`${s.id}Words`} spacing={5} alignment="centerX">
					<ref target={`${s.id}Label`} />
					<ref target={`${s.id}Note`} />
				</stackV>
			))}
			{stages.map((s) => (
				<align key={`${s.id}Inside`} alignment="center">
					<ref target={s.id} />
					<ref target={`${s.id}Words`} />
				</align>
			))}
			{stages.slice(1).map((s, i) => (
				<arrow key={`to-${s.id}`} stroke="#2D3748" stroke-width={2}>
					<ref target={stages[i].id} />
					<ref target={s.id} />
				</arrow>
			))}

			<beat key="beat" bpm={48} />
			<rest key="establish" over={0.6} />
			{stages.map((s) => (
				<camera key={`on-${s.id}`} over={0.9} padding={34}>
					<ref target={s.id} />
				</camera>
			))}
			<camera key="pullBack" over={1.1} />
			<rest key="linger" over={1.2} />
			<before>
				<ref target="establish" />
				{stages.map((s) => (
					<ref key={s.id} target={`on-${s.id}`} />
				))}
				<ref target="pullBack" />
			</before>
			<onBeat>
				<ref target="beat" />
				{stages.map((s) => (
					<ref key={s.id} target={`on-${s.id}`} />
				))}
				<ref target="pullBack" />
			</onBeat>
			<sequence>
				<ref target="pullBack" />
				<ref target="linger" />
			</sequence>

			{stages.map((s) => (
				<enter key={`${s.id}Says`} over={0.5} from={{ opacity: 0, y: 6 }}>
					<ref target={`${s.id}Label`} />
					<ref target={`${s.id}Note`} />
				</enter>
			))}
			{stages.map((s) => (
				<sequence key={`${s.id}Then`} gap={-0.55}>
					<ref target={`on-${s.id}`} />
					<ref target={`${s.id}Says`} />
				</sequence>
			))}
			{stages.slice(1).map((s) => (
				<draw key={`${s.id}Wire`} over={0.7} ease="inOut">
					<ref target={`to-${s.id}`} />
				</draw>
			))}
			{stages.slice(1).map((s) => (
				<sameTime key={`${s.id}With`}>
					<ref target={`on-${s.id}`} />
					<ref target={`${s.id}Wire`} />
				</sameTime>
			))}
		</Graphic>
	);
}
