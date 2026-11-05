import { Graphic } from "@modular-svg/react";

const steps = [
	{ id: "push", label: "git push", fill: "#E8F1FF" },
	{ id: "ci", label: "Run CI", fill: "#F3EEFF" },
	{ id: "green", label: "Green?", fill: "#FFF6E0" },
	{ id: "ship", label: "Deploy", fill: "#E6F7EE" },
];

// svjeez's review-flow, built from layout and time relations: the chart
// reveals step by step, each arrow drawing as its source lands, and once
// all of it is up a comet travels the route through the boxes themselves.
export function DeployFlowExample() {
	return (
		<Graphic margin={20} animation={{ loop: true, duration: 7, stillAt: 6 }}>
			<stackV key="chart" spacing={36}>
				{steps.map((s) => (
					<background
						key={s.id}
						padding={10}
						fill={s.fill}
						stroke="#444"
						stroke-width={1.5}
						rx={8}
					>
						<text key={`${s.id}Label`} font-size={14}>
							{s.label}
						</text>
					</background>
				))}
			</stackV>
			{steps.slice(1).map((s, i) => (
				<arrow key={`to-${s.id}`} stroke="#444" stroke-width={1.5}>
					<ref target={steps[i].id} />
					<ref target={s.id} />
				</arrow>
			))}
			<circle key="comet" r={6} fill="#F28C28" stroke="none" />
			<align alignment="center">
				<ref target="push" />
				<ref target="comet" />
			</align>

			{steps.map((s) => (
				<enter key={`${s.id}In`} over={0.4} from={{ opacity: 0, y: 8 }}>
					<ref target={s.id} />
				</enter>
			))}
			{steps.slice(1).map((s) => (
				<draw key={`to-${s.id}Draw`} over={0.3}>
					<ref target={`to-${s.id}`} />
				</draw>
			))}
			<sequence key="reveal" at={0.3}>
				<ref target="pushIn" />
				<ref target="to-ciDraw" />
				<ref target="ciIn" />
				<ref target="to-greenDraw" />
				<ref target="greenIn" />
				<ref target="to-shipDraw" />
				<ref target="shipIn" />
			</sequence>

			<enter key="cometIn" over={0.2} from={{ scale: 0 }}>
				<ref target="comet" />
			</enter>
			<travel key="trip" over={1.6} ease="inOut">
				<ref target="comet" />
				<ref target="ci" />
				<ref target="green" />
				<ref target="ship" />
			</travel>
			<exit key="cometOut" over={0.3} to={{ opacity: 0, scale: 2 }}>
				<ref target="comet" />
			</exit>
			<sequence key="tour">
				<ref target="cometIn" />
				<ref target="trip" />
				<ref target="cometOut" />
			</sequence>
			<after gap={0.4}>
				<ref target="tour" />
				<ref target="reveal" />
			</after>
		</Graphic>
	);
}
