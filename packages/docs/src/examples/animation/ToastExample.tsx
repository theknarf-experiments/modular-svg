import { Graphic } from "@modular-svg/react";

// svjeez's toast, timed by relations instead of absolute times: lengthen any
// motion and everything after it moves along.
export function ToastExample() {
	return (
		<Graphic animation={{ loop: true, duration: 5, stillAt: 2 }}>
			<rect
				key="bg"
				x={0}
				y={0}
				width={320}
				height={120}
				fill="#111318"
				stroke="none"
			/>
			<background
				key="card"
				padding={14}
				fill="#1E2230"
				stroke="#3EE6D6"
				stroke-width={1}
				rx={12}
			>
				<stackH key="toast" spacing={14} alignment="centerY">
					<group key="badge">
						<circle key="disc" r={14} fill="#3EE6D6" stroke="none" />
						<path
							key="check"
							d="M0 5l5 5 9-10"
							fill="none"
							stroke="#111318"
							stroke-width={3}
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<align alignment="center">
							<ref target="disc" />
							<ref target="check" />
						</align>
					</group>
					<text key="label" font-size={16} fill="#E6E8EE">
						Changes saved
					</text>
				</stackH>
			</background>
			<align alignment="center">
				<ref target="bg" />
				<ref target="card" />
			</align>

			<enter
				key="cardIn"
				at={0.3}
				over={0.5}
				from={{ opacity: 0, y: 24 }}
				ease="pop"
			>
				<ref target="card" />
			</enter>
			<enter key="discIn" over={0.3} from={{ scale: 0 }} ease="pop">
				<ref target="disc" />
			</enter>
			<draw key="checkIn" over={0.4}>
				<ref target="check" />
			</draw>
			<enter key="labelIn" over={0.5} from={{ opacity: 0, x: -8 }}>
				<ref target="label" />
			</enter>
			<shake key="nudge" over={0.4} amplitude={{ rotate: 12 }}>
				<ref target="badge" />
			</shake>
			<exit key="cardOut" over={0.4} to={{ opacity: 0, y: -12 }} ease="in">
				<ref target="card" />
			</exit>

			{/* the disc pops while the card is still settling */}
			<sequence gap={-0.2}>
				<ref target="cardIn" />
				<ref target="discIn" />
			</sequence>
			<sequence>
				<ref target="discIn" />
				<ref target="checkIn" />
			</sequence>
			<sameTime>
				<ref target="checkIn" />
				<ref target="labelIn" />
			</sameTime>
			<sequence gap={0.3}>
				<ref target="checkIn" />
				<ref target="nudge" />
			</sequence>
			<sequence gap={2}>
				<ref target="nudge" />
				<ref target="cardOut" />
			</sequence>
		</Graphic>
	);
}
