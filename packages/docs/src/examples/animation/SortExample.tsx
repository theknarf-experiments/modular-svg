import { Graphic } from "@modular-svg/react";

const values = [4, 2, 5, 1, 3];
const id = (v: number) => `bar${v}`;
const REST = "#CBD5E1";
const HOT = "#F28C28";
const STEP = 0.7;

// Bubble sort, run ahead of time: the order after every swap
const swaps: { order: number[]; pair: [number, number] }[] = [];
const sorting = [...values];
for (let end = sorting.length - 1; end > 0; end--)
	for (let i = 0; i < end; i++) {
		const [a, b] = [sorting[i], sorting[i + 1]];
		if (a <= b) continue;
		[sorting[i], sorting[i + 1]] = [b, a];
		swaps.push({ order: [...sorting], pair: [a, b] });
	}

// Every swap is a Modulate holding the row in its new order, so a sort is
// just a list of them. Each phase is solved once however many there are.
// The two bars that trade places light up: several motions take turns on
// one bar's fill, and the Phrase plays all of it there and back, so the
// colours and the swaps undo themselves in exactly the reverse order.
export function SortExample() {
	return (
		<Graphic margin={16} animation={{ loop: true }}>
			<stackH key="bars" spacing={8} alignment="bottom">
				{values.map((v) => (
					<rect
						key={id(v)}
						width={24}
						height={v * 18}
						rx={3}
						fill={REST}
						stroke="none"
					/>
				))}
			</stackH>

			<phrase key="sort" repeat={2} alternate>
				{swaps.map(({ order, pair }, i) => [
					<modulate
						key={`swap${i}`}
						at={0.4 + i * STEP}
						over={0.4}
						ease="inOut"
					>
						<stackH spacing={8} alignment="bottom">
							{order.map((v) => (
								<ref key={v} target={id(v)} />
							))}
						</stackH>
					</modulate>,
					<motion
						key={`light${i}`}
						at={0.3 + i * STEP}
						steps={[
							{ to: { fill: HOT }, over: 0.15 },
							{ wait: 0.3 },
							{ to: { fill: REST }, over: 0.15 },
						]}
					>
						<ref target={id(pair[0])} />
						<ref target={id(pair[1])} />
					</motion>,
				])}
				<rest key="sorted" at={0.4 + swaps.length * STEP} over={0.6} />
			</phrase>
		</Graphic>
	);
}
