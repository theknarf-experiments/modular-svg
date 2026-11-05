import { Graphic } from "@modular-svg/react";

const hats = Array.from({ length: 8 }, (_, i) => `hat${i}`);
const rush = Array.from({ length: 8 }, (_, i) => `rush${i}`);

// Bars are spans on the beat you can sequence: a bar of swung eighths,
// then a second beat that starts where that bar ends and speeds up, then a
// fermata on the final chord before the loop comes around.
export function GrooveExample() {
	return (
		<Graphic margin={16} animation={{ loop: true }}>
			<stackV key="tracks" spacing={18} alignment="left">
				<stackH key="hatRow" spacing={8}>
					{hats.map((h) => (
						<circle key={h} r={7} fill="#00B894" stroke="none" />
					))}
				</stackH>
				<stackH key="rushRow" spacing={8}>
					{rush.map((r) => (
						<circle key={r} r={7} fill="#E17055" stroke="none" />
					))}
				</stackH>
				<rect
					key="chord"
					width={142}
					height={18}
					rx={4}
					fill="#6C5CE7"
					stroke="none"
				/>
			</stackV>

			<beat key="beat" bpm={100} />
			<bar key="groove">
				<ref target="beat" />
			</bar>
			{/* no offset, so it can be placed: it starts as the groove ends and
			    speeds up from 100 to 200 bpm over four beats */}
			<beat key="rushing" bpm={100} toBpm={200} ramp={4} />
			<sequence>
				<ref target="groove" />
				<ref target="rushing" />
			</sequence>

			{/* swung eighths: Before keeps order, OnBeat swings every second one */}
			{hats.map((h) => (
				<enter key={`${h}In`} over={0.12} from={{ scale: 0 }} ease="pop">
					<ref target={h} />
				</enter>
			))}
			<before>
				{hats.map((h) => (
					<ref key={h} target={`${h}In`} />
				))}
			</before>
			<onBeat division={2} swing={2 / 3}>
				<ref target="beat" />
				{hats.map((h) => (
					<ref key={h} target={`${h}In`} />
				))}
			</onBeat>

			{/* the accelerando: same Before + OnBeat, on a beat whose tempo ramps */}
			{rush.map((r) => (
				<enter key={`${r}In`} over={0.12} from={{ scale: 0 }} ease="pop">
					<ref target={r} />
				</enter>
			))}
			<before>
				{rush.map((r) => (
					<ref key={r} target={`${r}In`} />
				))}
			</before>
			<onBeat division={2}>
				<ref target="rushing" />
				{rush.map((r) => (
					<ref key={r} target={`${r}In`} />
				))}
			</onBeat>

			<after>
				<ref target="rush0In" />
				<ref target="groove" />
			</after>

			{/* the chord rings on the next bar line, held by a fermata */}
			<enter key="chordIn" over={0.4} from={{ opacity: 0, scale: 0.9 }}>
				<ref target="chord" />
			</enter>
			<bar key="last">
				<ref target="beat" />
			</bar>
			<before>
				<ref target="rush7In" />
				<ref target="last" />
			</before>
			<sameTime>
				<ref target="last" />
				<ref target="chordIn" />
			</sameTime>
			<fermata key="ring" hold={1.5}>
				<ref target="chordIn" />
			</fermata>
		</Graphic>
	);
}
