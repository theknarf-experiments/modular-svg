import { Graphic } from "@modular-svg/react";

// Top to bottom, as the stack lists them
const blocks = [
	{ id: "a", fill: "#F28C28", width: 84 },
	{ id: "b", fill: "#2FB8A0", width: 106 },
	{ id: "c", fill: "#4C7DF0", width: 128 },
	{ id: "d", fill: "#7C5CF0", width: 150 },
];
// Bottom first: the order they land in
const falling = [...blocks].reverse();

// A motion that refs a camera moves the view itself. Each block falls (an
// Enter from above, easing in like gravity) so that its end lands on a beat,
// and a Shake on the camera starts as it lands: its amplitude is in screen
// pixels, whatever the zoom. Under all of it the camera pushes in on the
// stack for the whole bar, linearly, so the zoom has an even pace.
export function ImpactExample() {
	return (
		<Graphic
			view={{ width: 480, height: 270 }}
			margin={12}
			animation={{ loop: true, stillAt: 3.2 }}
		>
			<stackV key="scene" spacing={0} alignment="centerX">
				<rect
					key="sky"
					width={10}
					height={46}
					fill="none"
					stroke="none"
					stroke-width={0}
				/>
				<stackV key="stack" spacing={3} alignment="centerX">
					{blocks.map((b) => (
						<rect
							key={b.id}
							width={b.width}
							height={34}
							rx={5}
							fill={b.fill}
							stroke="none"
							stroke-width={0}
						/>
					))}
				</stackV>
				<rect
					key="ground"
					width={460}
					height={5}
					rx={2.5}
					fill="#2D3748"
					stroke="none"
					stroke-width={0}
				/>
			</stackV>

			<beat key="beat" bpm={84} />
			<bar key="take" beats={4} count={1.75}>
				<ref target="beat" />
			</bar>
			<camera key="push" ease="linear" padding={30}>
				<ref target="stack" />
			</camera>
			<stretch>
				<ref target="take" />
				<ref target="push" />
			</stretch>

			{falling.map((b) => (
				<enter
					key={`${b.id}Falls`}
					over={0.32}
					ease="in"
					from={{ y: -260, opacity: 1 }}
				>
					<ref target={b.id} />
				</enter>
			))}
			<before>
				{falling.map((b) => (
					<ref key={b.id} target={`${b.id}Falls`} />
				))}
			</before>
			<onBeat align="end" offset={1}>
				<ref target="beat" />
				{falling.map((b) => (
					<ref key={b.id} target={`${b.id}Falls`} />
				))}
			</onBeat>
			{falling.map((b, i) => (
				<shake
					key={`${b.id}Lands`}
					over={0.3}
					amplitude={{ y: 5 + i * 2 }}
					rate={34}
				>
					<ref target="push" />
				</shake>
			))}
			{falling.map((b) => (
				<sequence key={`${b.id}Hit`}>
					<ref target={`${b.id}Falls`} />
					<ref target={`${b.id}Lands`} />
				</sequence>
			))}
			<rest key="settle" over={0.9} />
			<sequence>
				<ref target="take" />
				<ref target="settle" />
			</sequence>
		</Graphic>
	);
}
