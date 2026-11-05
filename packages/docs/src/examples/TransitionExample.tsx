import { Graphic } from "@modular-svg/react";
import { useState } from "react";

const start = ["fetch", "parse", "solve", "render"];
const extra = ["cache", "verify", "ship"];

// Every state change is a new layout. With transition, marks tween from
// where they were solved before to where they are solved now - positions,
// sizes, connector shapes and colors - instead of jumping. Marks that
// appear fade in, and marks that go fade out.
export function TransitionExample() {
	const [vertical, setVertical] = useState(false);
	const [order, setOrder] = useState(start);
	const [hue, setHue] = useState(30);
	const Stack = vertical ? "stackV" : "stackH";

	return (
		<div>
			<div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
				<button type="button" onClick={() => setVertical((v) => !v)}>
					Flip direction
				</button>
				<button
					type="button"
					onClick={() => setOrder((o) => [...o.slice(1), o[0]])}
				>
					Rotate order
				</button>
				<button type="button" onClick={() => setHue((h) => (h + 70) % 360)}>
					Recolor
				</button>
				<button
					type="button"
					onClick={() =>
						setOrder((o) => {
							const next = extra.find((e) => !o.includes(e));
							return next ? [...o, next] : o;
						})
					}
				>
					Add step
				</button>
				<button
					type="button"
					onClick={() => setOrder((o) => (o.length > 2 ? o.slice(0, -1) : o))}
				>
					Remove step
				</button>
			</div>
			<Graphic margin={16} transition={{ duration: 0.5, ease: "inOut" }}>
				<Stack key="flow" spacing={vertical ? 24 : 40}>
					{order.map((step) => (
						<background
							key={step}
							padding={10}
							rx={8}
							stroke="#333"
							stroke-width={1.5}
						>
							<text key={`${step}Label`} font-size={14}>
								{step}
							</text>
						</background>
					))}
				</Stack>
				<distinctColors startHue={hue} lightness={0.85}>
					{order.map((step) => (
						<ref key={step} target={step} />
					))}
				</distinctColors>
				{/* edges are keyed by position, so they reshape rather than pop */}
				{order.slice(1).map((step, i) => (
					<arrow key={`edge${i}`} stroke="#333" stroke-width={1.5}>
						<ref target={order[i]} />
						<ref target={step} />
					</arrow>
				))}
			</Graphic>
		</div>
	);
}
