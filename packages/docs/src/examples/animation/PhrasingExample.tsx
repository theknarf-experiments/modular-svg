import { Graphic } from "@modular-svg/react";

const steps = [
	{ id: "parse", caption: "Parse the scene into nodes and refs" },
	{ id: "solve", caption: "Relations become operators; the solver iterates" },
	{ id: "render", caption: "Solved spans compile to keyframes" },
];

// Phrasing borrowed from music, on a 100 bpm beat:
// - the boxes cascade with an eased Stagger, so the entrance settles
// - each arrow is a pickup: OnBeat align="end" lands its tip on a beat
// - each caption starts as its arrow lands, and is legato: it holds until
//   the next caption starts
// - the last caption lasts four beats (Stretch beats)
export function PhrasingExample() {
	return (
		<Graphic margin={16} animation={{ loop: true }}>
			<stackV key="explainer" spacing={24}>
				<stackH key="row" spacing={48} alignment="centerY">
					{steps.map((s) => (
						<background
							key={s.id}
							padding={10}
							rx={8}
							fill="#F3EEFF"
							stroke="#6C5CE7"
							stroke-width={1.5}
						>
							<text key={`${s.id}Label`} font-size={14}>
								{s.id}
							</text>
						</background>
					))}
				</stackH>
				<group key="captions">
					{steps.map((s) => (
						<text key={`${s.id}Caption`} font-size={13} fill="#555">
							{s.caption}
						</text>
					))}
					<align alignment="center">
						{steps.map((s) => (
							<ref key={s.id} target={`${s.id}Caption`} />
						))}
					</align>
				</group>
			</stackV>
			{steps.slice(1).map((s, i) => (
				<arrow key={`to-${s.id}`} stroke="#6C5CE7" stroke-width={1.5}>
					<ref target={steps[i].id} />
					<ref target={s.id} />
				</arrow>
			))}

			<beat key="beat" bpm={100} />

			{steps.map((s) => (
				<enter key={`${s.id}In`} over={0.5} from={{ opacity: 0, y: 12 }}>
					<ref target={s.id} />
				</enter>
			))}
			<stagger total={1.2} ease={[0.25, 0.6, 0.5, 1]} at={0.2}>
				{steps.map((s) => (
					<ref key={s.id} target={`${s.id}In`} />
				))}
			</stagger>

			{steps.slice(1).map((s) => (
				<draw key={`to-${s.id}Draw`} over={0.3}>
					<ref target={`to-${s.id}`} />
				</draw>
			))}
			{steps.slice(1).map((s, i) => (
				<before key={`order-${s.id}`}>
					<ref target={`${steps[i].id}In`} />
					<ref target={`to-${s.id}Draw`} />
				</before>
			))}
			<onBeat align="end">
				<ref target="beat" />
				{steps.slice(1).map((s) => (
					<ref key={s.id} target={`to-${s.id}Draw`} />
				))}
			</onBeat>

			{steps.map((s) => (
				<motion
					key={`${s.id}Say`}
					from={{ opacity: 0 }}
					steps={[
						{ to: { opacity: 1 }, over: 0.15 },
						{ wait: 0.7 },
						{ to: { opacity: 0 }, over: 0.15 },
					]}
				>
					<ref target={`${s.id}Caption`} />
				</motion>
			))}
			<sameTime>
				<ref target="parseIn" />
				<ref target="parseSay" />
			</sameTime>
			{steps.slice(1).map((s) => (
				<sequence key={`say-${s.id}`}>
					<ref target={`to-${s.id}Draw`} />
					<ref target={`${s.id}Say`} />
				</sequence>
			))}
			<legato>
				{steps.map((s) => (
					<ref key={s.id} target={`${s.id}Say`} />
				))}
			</legato>
			<stretch beats={4}>
				<ref target="beat" />
				<ref target="renderSay" />
			</stretch>
		</Graphic>
	);
}
