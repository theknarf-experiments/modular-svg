import { Graphic } from "@modular-svg/react";

const depots = [
	{ id: "harbour", label: "Harbour", cx: 30, cy: 250 },
	{ id: "mill", label: "Mill", cx: 170, cy: 70 },
	{ id: "market", label: "Market", cx: 330, cy: 230 },
	{ id: "bridge", label: "Bridge", cx: 470, cy: 60 },
	{ id: "depot", label: "Depot", cx: 610, cy: 210 },
];
// One road through every depot, flat as it passes each
const road =
	"M 30 250 C 90 250 110 70 170 70 S 270 230 330 230 S 410 60 470 60 S 550 210 610 210";

// Dots to move past: without them a tight shot of a moving thing stands still
const land = Array.from({ length: 14 * 7 }, (_, i) => ({
	x: 10 + (i % 14) * 48 + ((i * 37) % 17),
	y: 20 + Math.floor(i / 14) * 42 + ((i * 53) % 19),
}));

// The chase camera frames the parcel with `follow`, so it keeps up with
// where the Travel takes it (a camera otherwise frames a mark where layout
// has it, and an entering mark would make it bob). It pushes in from the
// whole map, rides the road with the parcel, and at the last depot a second
// camera, which refs nothing, cuts back to everything. Both play in a
// Phrase: every pass starts from the view the scene had, the wide one, so
// the repeat has no seam.
export function TrackingShotExample() {
	return (
		<Graphic
			view={{ width: 480, height: 270 }}
			margin={20}
			animation={{ loop: true, stillAt: 2.6 }}
		>
			{land.map((p, i) => (
				<circle
					key={`land${i}`}
					cx={p.x}
					cy={p.y}
					r={1.6}
					fill="#D3D9E2"
					stroke="none"
				/>
			))}
			<path
				key="road"
				d={road}
				fill="none"
				stroke="#B7C0CC"
				stroke-width={5}
				stroke-linecap="round"
			/>
			<path
				key="lane"
				d={road}
				fill="none"
				stroke="#fff"
				stroke-width={1}
				stroke-dasharray="5 7"
			/>
			{depots.map((d) => (
				<circle
					key={d.id}
					cx={d.cx}
					cy={d.cy}
					r={8}
					fill="#fff"
					stroke="#2D3748"
					stroke-width={2.5}
				/>
			))}
			{depots.map((d) => (
				<text
					key={`${d.id}Label`}
					font-size={11}
					font-weight={600}
					fill="#2D3748"
				>
					{d.label}
				</text>
			))}
			{depots.map((d) => (
				<stackV key={`${d.id}Sign`} spacing={7} alignment="centerX">
					<ref target={d.id} />
					<ref target={`${d.id}Label`} />
				</stackV>
			))}
			<rect
				key="cargo"
				width={18}
				height={12}
				rx={3}
				fill="#F28C28"
				stroke="#8A4B0F"
				stroke-width={1.5}
			/>
			<align alignment="center">
				<ref target="harbour" />
				<ref target="cargo" />
			</align>

			<phrase key="take" repeat={2}>
				<rest key="establish" over={0.5} />
				<camera key="chase" over={1} padding={48} follow>
					<ref target="cargo" />
				</camera>
				<travel key="trip" route="along" orient over={5.2} ease="inOut">
					<ref target="cargo" />
					<ref target="road" />
				</travel>
				<camera key="arrived" over={0} />
				<rest key="look" over={1.3} />
				<sequence>
					<ref target="establish" />
					<ref target="chase" />
				</sequence>
				<sequence gap={-0.6}>
					<ref target="chase" />
					<ref target="trip" />
				</sequence>
				<sequence gap={0.25}>
					<ref target="trip" />
					<ref target="arrived" />
					<ref target="look" />
				</sequence>
			</phrase>
		</Graphic>
	);
}
