import { Graphic } from "@modular-svg/react";

const swatches = ["s0", "s1", "s2", "s3", "s4"];

// Color relations and time together: DistinctColors picks the hues, and the
// motions animate to whatever it picked - { ref: id } names another node's
// solved color. The swatches bloom from grey to their own hue in a stagger,
// then a cursor travels the row and takes each swatch's color as it arrives.
export function PaletteExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 6 }}>
			<stackV key="palette" spacing={18}>
				<stackH key="row" spacing={12}>
					{swatches.map((s) => (
						<rect key={s} width={40} height={40} rx={8} stroke="none" />
					))}
				</stackH>
				<stackH key="marks" spacing={12}>
					{swatches.map((s) => (
						<rect
							key={`${s}Mark`}
							width={40}
							height={0}
							fill="none"
							stroke="none"
						/>
					))}
				</stackH>
			</stackV>
			<distinctColors>
				{swatches.map((s) => (
					<ref key={s} target={s} />
				))}
			</distinctColors>
			<circle
				key="cursor"
				r={10}
				fill="#ddd"
				stroke="#333"
				stroke-width={1.5}
			/>
			<align alignment="center">
				<ref target="s0Mark" />
				<ref target="cursor" />
			</align>

			{swatches.map((s) => (
				<motion
					key={`${s}Bloom`}
					from={{ fill: "#E9ECEF" }}
					steps={[{ to: { fill: { ref: s } }, over: 0.5, ease: "inOut" }]}
				>
					<ref target={s} />
				</motion>
			))}
			<stagger spacing={0.15} at={0.3}>
				{swatches.map((s) => (
					<ref key={s} target={`${s}Bloom`} />
				))}
			</stagger>

			<travel key="sweep" over={3} ease="inOut">
				<ref target="cursor" />
				{swatches.slice(1).map((s) => (
					<ref key={s} target={`${s}Mark`} />
				))}
			</travel>
			{/* it starts in the first swatch's color and takes one more per leg;
			    Stretch fits the steps to the sweep */}
			<motion
				key="tint"
				from={{ fill: { ref: "s0" } }}
				steps={swatches
					.slice(1)
					.map((s) => ({ to: { fill: { ref: s } }, over: 1 }))}
			>
				<ref target="cursor" />
			</motion>
			<stretch>
				<ref target="sweep" />
				<ref target="tint" />
			</stretch>
			<after gap={0.3}>
				<ref target="sweep" />
				<ref target="s4Bloom" />
			</after>
		</Graphic>
	);
}
