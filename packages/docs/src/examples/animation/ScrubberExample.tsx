import { Graphic } from "@modular-svg/react";
import { useEffect, useMemo, useState } from "react";

const DURATION = 4;
const words = ["layout", "color", "time"];

// React owns the clock: `playhead` holds every motion at a time, so a slider
// scrubs the solved schedule and play is just a ticking state. The scene is
// memoized, so ticking only seeks; nothing is re-solved.
export function ScrubberExample() {
	const [t, setT] = useState(0);
	const [playing, setPlaying] = useState(true);

	useEffect(() => {
		if (!playing) return;
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			setT((prev) => (prev + (now - last) / 1000) % DURATION);
			last = now;
			frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	}, [playing]);

	const scene = useMemo(
		() => (
			<>
				<stackH key="words" spacing={16} alignment="centerY">
					{words.map((w) => (
						<background
							key={w}
							padding={10}
							rx={8}
							fill="#F3EEFF"
							stroke="#6C5CE7"
							stroke-width={1.5}
						>
							<text key={`${w}Label`} font-size={16}>
								{w}
							</text>
						</background>
					))}
				</stackH>
				{words.map((w) => (
					<enter
						key={`${w}In`}
						over={0.6}
						from={{ opacity: 0, y: 16, scale: 0.8 }}
						ease="pop"
					>
						<ref target={w} />
					</enter>
				))}
				<stagger spacing={0.35} at={0.2}>
					{words.map((w) => (
						<ref key={w} target={`${w}In`} />
					))}
				</stagger>
				<shake key="nudge" over={0.5} amplitude={{ rotate: 6 }}>
					<ref target="words" />
				</shake>
				<after gap={0.4}>
					<ref target="nudge" />
					<ref target="timeIn" />
				</after>
			</>
		),
		[],
	);

	return (
		<div>
			<div
				style={{
					display: "flex",
					gap: "0.75rem",
					alignItems: "center",
					marginBottom: "1rem",
				}}
			>
				<button type="button" onClick={() => setPlaying((p) => !p)}>
					{playing ? "Pause" : "Play"}
				</button>
				<input
					type="range"
					min={0}
					max={DURATION}
					step={0.01}
					value={t}
					onChange={(e) => {
						setPlaying(false);
						setT(Number(e.target.value));
					}}
				/>
				<code>{t.toFixed(2)}s</code>
			</div>
			<Graphic margin={16} animation={{ duration: DURATION }} playhead={t}>
				{scene}
			</Graphic>
		</div>
	);
}
