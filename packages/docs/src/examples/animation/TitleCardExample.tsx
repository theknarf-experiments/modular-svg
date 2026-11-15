import { Graphic } from "@modular-svg/react";

// A lower third. The rule draws on; the name rises from behind it, which is a
// Clip: its first child is the window (never drawn), the name is what shows
// inside, and the Enter slides the name while the window stays put. The role
// wipes on with a crop channel, which needs no Clip: `cropRight: 1` hides the
// whole mark from its right edge and the Enter brings that back to 0. A
// Stagger sets the three off one after the other. The backdrop is clipped
// too: a rounded frame cuts the circle that runs off its edge.
export function TitleCardExample() {
	return (
		<Graphic animation={{ loop: true, stillAt: 2 }}>
			<clip key="footage">
				<rect key="frame" x={0} y={0} width={480} height={230} rx={12} />
				<rect
					key="sky"
					width={480}
					height={230}
					fill="#172033"
					stroke="none"
					stroke-width={0}
				/>
				<circle key="glow" r={150} fill="#22304D" stroke="none" />
				<circle key="sun" r={46} fill="#F28C28" stroke="none" opacity={0.9} />
			</clip>
			<align alignment="centerRight">
				<ref target="frame" />
				<ref target="glow" />
			</align>
			<align alignment="center">
				<ref target="glow" />
				<ref target="sun" />
			</align>

			<background
				key="inset"
				padding={30}
				fill="none"
				stroke="none"
				stroke-width={0}
			>
				<stackV key="third" spacing={9} alignment="left">
					<clip key="nameWindow">
						<rect key="slot" width={320} height={41} />
						<text key="name" font-size={32} font-weight={700} fill="#FFFFFF">
							Ada Lovelace
						</text>
					</clip>
					<path
						key="rule"
						d="M 0,0 H 300"
						stroke="#F28C28"
						stroke-width={3}
						stroke-linecap="round"
					/>
					<text key="role" font-size={15} fill="#C9D3E0" width={300}>
						Notes on the Analytical Engine, 1843
					</text>
				</stackV>
			</background>
			<align alignment="bottomLeft">
				<ref target="frame" />
				<ref target="inset" />
			</align>

			<draw key="ruleOn" over={0.5} ease="inOut">
				<ref target="rule" />
			</draw>
			<enter key="nameUp" over={0.6} from={{ y: 42 }}>
				<ref target="name" />
			</enter>
			<enter key="roleOn" over={0.6} from={{ cropRight: 1 }} ease="inOut">
				<ref target="role" />
			</enter>
			<stagger at={0.4} spacing={0.3}>
				<ref target="ruleOn" />
				<ref target="nameUp" />
				<ref target="roleOn" />
			</stagger>
			<exit key="away" at={3.4} over={0.4}>
				<ref target="third" />
			</exit>
			<rest at={3.8} over={0.4} />
		</Graphic>
	);
}
