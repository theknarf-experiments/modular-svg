import { Graphic } from "@modular-svg/react";

const stages = [
	{ id: "draft", fill: "#E8F1FF" },
	{ id: "review", fill: "#F3EEFF" },
	{ id: "merge", fill: "#E6F7EE" },
];

// A component with a timeline of its own: boxes and arrows revealed in
// sequence. It knows nothing about how it will be played.
function Reveal() {
	return (
		<>
			<stackH key="flow" spacing={44} alignment="centerY">
				{stages.map((s) => (
					<background
						key={s.id}
						padding={10}
						rx={8}
						fill={s.fill}
						stroke="#444"
						stroke-width={1.5}
					>
						<text key={`${s.id}Label`} font-size={14}>
							{s.id}
						</text>
					</background>
				))}
			</stackH>
			{stages.slice(1).map((s, i) => (
				<arrow key={`to-${s.id}`} stroke="#444" stroke-width={1.5}>
					<ref target={stages[i].id} />
					<ref target={s.id} />
				</arrow>
			))}

			{stages.map((s) => (
				<enter key={`${s.id}In`} over={0.4} from={{ opacity: 0, y: 10 }}>
					<ref target={s.id} />
				</enter>
			))}
			{stages.slice(1).map((s) => (
				<draw key={`to-${s.id}Draw`} over={0.3}>
					<ref target={`to-${s.id}`} />
				</draw>
			))}
			<sequence key="reveal">
				<ref target="draftIn" />
				<ref target="to-reviewDraw" />
				<ref target="reviewIn" />
				<ref target="to-mergeDraw" />
				<ref target="mergeIn" />
			</sequence>
		</>
	);
}

// The phrase takes `reveal` and a rest, and plays the pair twice, the second
// pass backwards: there, hold, and back. From outside it is a leaf like any
// motion, so Stretch can fit all of it into eight beats; the reveal inside
// just runs at whatever speed that takes.
export function RetimeExample() {
	return (
		<Graphic margin={20} animation={{ loop: true, stillAt: 2.5 }}>
			<Reveal />

			<beat key="beat" bpm={96} />
			<phrase key="thereAndBack" repeat={2} alternate>
				<sequence>
					<ref target="reveal" />
					<rest over={0.5} />
				</sequence>
			</phrase>
			<stretch beats={8}>
				<ref target="beat" />
				<ref target="thereAndBack" />
			</stretch>
		</Graphic>
	);
}
