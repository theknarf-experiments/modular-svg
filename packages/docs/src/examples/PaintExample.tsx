import { Graphic } from "@modular-svg/react";

const tags = ["layout", "color", "time", "motion"];

// Fill and stroke are separate colors. DistinctColors picks the fills; each
// border is the same color darkened onto the stroke (paint="stroke" on the
// ref), and each label is a deeper shade of its tag's hue.
export function PaintExample() {
	return (
		<Graphic margin={12}>
			<stackH key="tags" spacing={10} alignment="centerY">
				{tags.map((t) => (
					<background key={t} padding={8} rx={14} stroke-width={2}>
						<text key={`${t}Label`} font-size={14}>
							{t}
						</text>
					</background>
				))}
			</stackH>
			<distinctColors chroma={0.1} lightness={0.9}>
				{tags.map((t) => (
					<ref key={t} target={t} />
				))}
			</distinctColors>
			{tags.map((t) => (
				<darken key={`${t}Border`} amount={0.35}>
					<ref target={t} />
					<ref target={t} paint="stroke" />
				</darken>
			))}
			{tags.map((t) => (
				<darken key={`${t}Ink`} amount={0.55}>
					<ref target={t} />
					<ref target={`${t}Label`} />
				</darken>
			))}
		</Graphic>
	);
}
