import { Graphic } from "@modular-svg/react";

const toms = ["#74B9FF", "#55A3F0", "#3B8BDB"];

// The beat belongs to the scene; the fill is a Phrase with a time of its
// own, played at twice the speed once the kit has come in. Inside it the
// toms are staggered in the phrase's seconds, and the crash waits for them
// and then lands on the scene's beat: OnBeat only reads the beat, so it can
// read it from the time around the phrase, seen through the phrase's start
// and rate. The slider sways one beat there and one back: a looping motion
// with `alternate`.
export function DrumFillExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 2.5 }}>
			<stackV key="stage" spacing={20} alignment="left">
				<stackH key="clock" spacing={24} alignment="centerY">
					<circle key="metronome" r={6} fill="#333" stroke="none" />
					<rect
						key="slider"
						width={12}
						height={12}
						rx={3}
						fill="#B2BEC3"
						stroke="none"
					/>
				</stackH>
				<stackH key="kit" spacing={10} alignment="centerY">
					{toms.map((fill, i) => (
						<circle key={`tom${i}`} r={11} fill={fill} stroke="none" />
					))}
					<circle key="crash" r={16} fill="#F28C28" stroke="none" />
				</stackH>
			</stackV>

			<beat key="beat" bpm={120} />
			<motion
				key="pulse"
				from={{ scale: 1.6 }}
				steps={[{ to: { scale: 1 }, over: 1, ease: "out" }]}
				loop
			>
				<ref target="metronome" />
			</motion>
			<motion
				key="sway"
				steps={[{ to: { x: 60 }, over: 1, ease: "inOut" }]}
				loop
				alternate
			>
				<ref target="slider" />
			</motion>
			<stretch>
				<ref target="beat" />
				<ref target="pulse" />
				<ref target="sway" />
			</stretch>

			<enter key="count" over={0.7} from={{ opacity: 0 }}>
				<ref target="clock" />
			</enter>
			<phrase key="fill" rate={2}>
				<stagger spacing={0.2}>
					{toms.map((_, i) => (
						<enter
							key={`hit${i}`}
							over={0.3}
							from={{ scale: 0.4, opacity: 0.2 }}
							ease="pop"
						>
							<ref target={`tom${i}`} />
						</enter>
					))}
				</stagger>
				<enter
					key="crashIn"
					over={0.6}
					from={{ scale: 0.4, opacity: 0.2 }}
					ease="pop"
				>
					<ref target="crash" />
				</enter>
				<after>
					<ref target="crashIn" />
					<ref target="hit2" />
				</after>
				<onBeat>
					<ref target="beat" />
					<ref target="crashIn" />
				</onBeat>
			</phrase>
			<sequence>
				<ref target="count" />
				<ref target="fill" />
			</sequence>
		</Graphic>
	);
}
