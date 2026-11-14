import { Graphic } from "@modular-svg/react";

const docks = ["d1", "d2", "d3"];

const station = (key: string, label: string, fill: string) => (
	<background
		key={key}
		padding={10}
		rx={8}
		fill={fill}
		stroke="#444"
		stroke-width={1.5}
	>
		<text key={`${key}Label`} font-size={14}>
			{label}
		</text>
	</background>
);

// The parcel is a group, and a Travel moves it from dock to dock. Nothing
// says the arrows move: they are drawn from the sender to the parcel and
// from the parcel to the receiver, so they are redrawn between wherever
// those are while the Travel plays. The Phrase runs the trip there and
// back, and the arrows go with it.
export function CourierExample() {
	return (
		<Graphic margin={20} animation={{ loop: true }}>
			<stackV key="yard" spacing={64}>
				{station("sender", "Sender", "#E8F1FF")}
				<stackH key="docks" spacing={70}>
					{docks.map((d) => (
						<rect
							key={d}
							width={64}
							height={34}
							rx={6}
							fill="#F5F5F5"
							stroke="#BBB"
							stroke-width={1}
							stroke-dasharray="4 3"
						/>
					))}
				</stackH>
				{station("receiver", "Receiver", "#E6F7EE")}
			</stackV>
			<background key="parcel" padding={7} rx={5} fill="#F28C28" stroke="none">
				<text key="parcelLabel" font-size={12} fill="#fff">
					parcel
				</text>
			</background>
			<align alignment="center">
				<ref target="d1" />
				<ref target="parcel" />
			</align>
			<arrow key="sent" stroke="#444" stroke-width={1.5}>
				<ref target="sender" />
				<ref target="parcel" />
			</arrow>
			<arrow key="due" stroke="#444" stroke-width={1.5}>
				<ref target="parcel" />
				<ref target="receiver" />
			</arrow>

			<phrase key="round" repeat={2} alternate>
				<rest key="wait" over={0.4} />
				<travel key="trip" over={1.6} ease="inOut">
					<ref target="parcel" />
					<ref target="d2" />
					<ref target="d3" />
				</travel>
				<rest key="stay" over={0.4} />
				<sequence>
					<ref target="wait" />
					<ref target="trip" />
					<ref target="stay" />
				</sequence>
			</phrase>
		</Graphic>
	);
}
