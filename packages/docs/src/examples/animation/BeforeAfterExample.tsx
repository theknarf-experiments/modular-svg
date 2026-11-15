import { Graphic } from "@modular-svg/react";

const data = [
	{ id: "mon", label: "Mon", value: 38 },
	{ id: "tue", label: "Tue", value: 64 },
	{ id: "wed", label: "Wed", value: 51 },
	{ id: "thu", label: "Thu", value: 92 },
	{ id: "fri", label: "Fri", value: 77 },
	{ id: "sat", label: "Sat", value: 45 },
	{ id: "sun", label: "Sun", value: 29 },
];
const best = Math.max(...data.map((d) => d.value));

// One chart, drawn twice: as a first draft and as designed.
function chart(after: boolean) {
	const k = (id: string) => `${after ? "after" : "before"}-${id}`;
	return (
		<background
			key={k("card")}
			padding={22}
			rx={after ? 14 : 0}
			fill={after ? "#FFFFFF" : "#EDEDED"}
			stroke={after ? "#E3E7EE" : "#9A9A9A"}
			stroke-width={1}
		>
			<stackV key={k("body")} spacing={14} alignment="left">
				<text
					key={k("title")}
					font-size={after ? 17 : 15}
					font-weight={after ? 700 : 400}
					fill={after ? "#1F2A44" : "#555555"}
					width={200}
				>
					{after ? "Orders this week" : "orders_by_day"}
				</text>
				<stackH key={k("bars")} spacing={12} alignment="bottom">
					{data.map((d) => (
						<stackV key={k(d.id)} spacing={6} alignment="centerX">
							<rect
								key={k(`${d.id}Bar`)}
								width={36}
								height={d.value * 1.4}
								rx={after ? 5 : 0}
								fill={
									after ? (d.value === best ? "#F28C28" : "#4C7DF0") : "#B5B5B5"
								}
								stroke={after ? "none" : "#7A7A7A"}
								stroke-width={after ? 0 : 1}
							/>
							<text
								key={k(`${d.id}Label`)}
								font-size={11}
								fill={after ? "#5A6577" : "#777777"}
								width={22}
							>
								{d.label}
							</text>
						</stackV>
					))}
				</stackH>
			</stackV>
		</background>
	);
}

// Before and after, with a slider. The designed chart is the content of a
// Clip and shows inside its shape; the draft is the content of an inverse
// Clip and shows outside its own. The two shapes are twin rects that end on
// the same line, and one Motion refs both and the handle, so the cut and the
// line that marks it move as one. (A mark shapes one clip, hence the twin.)
export function BeforeAfterExample() {
	const cover = {
		width: 900,
		height: 400,
	};
	return (
		<Graphic margin={14} animation={{ loop: true, stillAt: 0.9 }}>
			<clip key="designed">
				<rect key="wipe" {...cover} />
				{chart(true)}
			</clip>
			<clip key="draft" inverse>
				<rect key="twin" {...cover} />
				{chart(false)}
			</clip>
			<align alignment="topLeft">
				<ref target="after-card" />
				<ref target="before-card" />
			</align>

			<group key="handle">
				<rect
					key="line"
					width={3}
					height={250}
					fill="#1F2A44"
					stroke="none"
					stroke-width={0}
				/>
				<circle
					key="knob"
					r={13}
					fill="#FFFFFF"
					stroke="#1F2A44"
					stroke-width={3}
				/>
				<path
					key="grip"
					d="M 0,0 L -4,4 L 0,8 M 7,0 L 11,4 L 7,8"
					fill="none"
					stroke="#1F2A44"
					stroke-width={2}
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</group>
			<align alignment="center">
				<ref target="after-card" />
				<ref target="line" />
				<ref target="knob" />
				<ref target="grip" />
			</align>
			<align alignment="centerRight">
				<ref target="line" />
				<ref target="wipe" />
				<ref target="twin" />
			</align>

			<motion
				key="slide"
				at={0.4}
				loop
				steps={[
					{ to: { x: 125 }, over: 1.4, ease: "inOut" },
					{ wait: 0.5 },
					{ to: { x: -125 }, over: 2.4, ease: "inOut" },
					{ wait: 0.5 },
					{ to: { x: 0 }, over: 1.4, ease: "inOut" },
				]}
			>
				<ref target="wipe" />
				<ref target="twin" />
				<ref target="handle" />
			</motion>
		</Graphic>
	);
}
