import { Graphic } from "@modular-svg/react";

const stars = [
	{ id: "s1", x: 60, y: 44, r: 2 },
	{ id: "s2", x: 128, y: 86, r: 1.5 },
	{ id: "s3", x: 210, y: 36, r: 2.5 },
	{ id: "s4", x: 292, y: 70, r: 1.5 },
	{ id: "s5", x: 96, y: 150, r: 1.5 },
	{ id: "s6", x: 250, y: 132, r: 2 },
];

// A scene change through an iris. The night scene is the content of a Clip
// whose shape is a circle centred on the button; an Enter scales the circle
// up from nothing (a motion on the shape moves the cut, and it pivots on the
// circle's own centre), so night opens out of the button over the day scene.
// The Phrase plays that there and back. The circle is far larger than the
// picture, but a shape is never drawn and never sizes the canvas.
export function IrisExample() {
	return (
		<Graphic animation={{ loop: true, stillAt: 1.15 }}>
			<rect
				key="day"
				x={0}
				y={0}
				width={420}
				height={230}
				rx={12}
				fill="#EAF3FF"
				stroke="none"
				stroke-width={0}
			/>
			<circle key="sun" cx={330} cy={64} r={30} fill="#F2B428" stroke="none" />
			<background
				key="dayInset"
				padding={32}
				fill="none"
				stroke="none"
				stroke-width={0}
			>
				<stackV key="dayCopy" spacing={12} alignment="left">
					<text key="dayTitle" font-size={26} font-weight={700} fill="#1F2A44">
						Good morning
					</text>
					<text key="dayNote" font-size={14} fill="#5A6577">
						Sunrise was at 6:42
					</text>
					<background
						key="button"
						padding={10}
						rx={16}
						fill="#1F2A44"
						stroke="none"
					>
						<text key="buttonLabel" font-size={13} fill="#FFFFFF" width={76}>
							Night mode
						</text>
					</background>
				</stackV>
			</background>
			<align alignment="centerLeft">
				<ref target="day" />
				<ref target="dayInset" />
			</align>

			<clip key="iris">
				<circle key="hole" r={372} />
				<rect
					key="night"
					width={420}
					height={230}
					rx={12}
					fill="#141B2E"
					stroke="none"
					stroke-width={0}
				/>
				{stars.map((s) => (
					<circle
						key={s.id}
						cx={s.x}
						cy={s.y}
						r={s.r}
						fill="#FFFFFF"
						stroke="none"
					/>
				))}
				<circle
					key="moon"
					cx={330}
					cy={64}
					r={30}
					fill="#E8ECF6"
					stroke="none"
				/>
				<circle
					key="shade"
					cx={343}
					cy={56}
					r={26}
					fill="#141B2E"
					stroke="none"
				/>
				<stackV key="nightCopy" spacing={12} alignment="left">
					<text
						key="nightTitle"
						font-size={26}
						font-weight={700}
						fill="#FFFFFF"
					>
						Good night
					</text>
					<text key="nightNote" font-size={14} fill="#9AA7C2">
						Moonrise is at 21:08
					</text>
					<background
						key="back"
						padding={10}
						rx={16}
						fill="#F2B428"
						stroke="none"
					>
						<text key="backLabel" font-size={13} fill="#1F2A44" width={76}>
							Day mode
						</text>
					</background>
				</stackV>
			</clip>
			<align alignment="topLeft">
				<ref target="dayCopy" />
				<ref target="nightCopy" />
			</align>
			<align alignment="center">
				<ref target="button" />
				<ref target="hole" />
			</align>

			<phrase key="there" at={0.6} repeat={2} alternate>
				<enter key="open" over={1.1} from={{ scale: 0 }} ease="inOut">
					<ref target="hole" />
				</enter>
				<rest key="stay" over={1.2} />
				<sequence>
					<ref target="open" />
					<ref target="stay" />
				</sequence>
			</phrase>
			<rest at={5.2} over={0.6} />
		</Graphic>
	);
}
