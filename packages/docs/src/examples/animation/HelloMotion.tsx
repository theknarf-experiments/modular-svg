import { Graphic } from "@modular-svg/react";

// svjeez's "hello": an arch strokes on, then a dot pops in. The order is a
// chain of relations between motions, not a set of hand-picked start times.
export function HelloMotion() {
	return (
		<Graphic margin={24} animation={{ loop: true, duration: 3 }}>
			<circle key="from" cx={0} cy={70} r={2} fill="#FF5FA8" stroke="none" />
			<circle key="peak" cx={90} cy={0} r={0} fill="none" stroke="none" />
			<circle key="to" cx={180} cy={70} r={2} fill="#FF5FA8" stroke="none" />
			<curve
				key="rise"
				stroke="#FF5FA8"
				stroke-width={4}
				direction="horizontal"
			>
				<ref target="from" />
				<ref target="peak" />
			</curve>
			<curve
				key="fall"
				stroke="#FF5FA8"
				stroke-width={4}
				direction="horizontal"
			>
				<ref target="peak" />
				<ref target="to" />
			</curve>
			<circle key="dot" cx={90} cy={-28} r={8} fill="#3EE6D6" stroke="none" />

			<draw key="up" over={0.6} at={0.2} ease="linear">
				<ref target="rise" />
			</draw>
			<draw key="down" over={0.6}>
				<ref target="fall" />
			</draw>
			<enter key="pop" over={0.5} from={{ scale: 0 }} ease="pop">
				<ref target="dot" />
			</enter>
			<sequence>
				<ref target="up" />
				<ref target="down" />
				<ref target="pop" />
			</sequence>
		</Graphic>
	);
}
