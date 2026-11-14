import { Graphic } from "@modular-svg/react";

const items = ["Bread", "Milk", "Eggs", "Tea"];
const added = "Eggs";

// Home is the finished list, with Eggs in it. The Modulate at 0 stacks the
// list without Eggs, so the scene opens with the gap closed and the card
// around it shorter. Resolve lets that go at the moment Eggs enters: the rows
// below part, the card grows, and the new row fades into the room they made.
export function MakeRoomExample() {
	return (
		<Graphic margin={16} animation={{ loop: true, duration: 3.6, stillAt: 3 }}>
			<background
				key="card"
				padding={12}
				rx={10}
				fill="#F7F7F9"
				stroke="#444"
				stroke-width={1.5}
			>
				<stackV key="list" spacing={8} alignment="left">
					{items.map((item) => (
						<background
							key={item}
							padding={8}
							rx={6}
							fill={item === added ? "#FFF6E0" : "#FFFFFF"}
							stroke="#888"
							stroke-width={1}
						>
							<text key={`${item}Label`} width={96} font-size={14}>
								{item}
							</text>
						</background>
					))}
				</stackV>
			</background>

			<modulate key="without" at={0} over={0}>
				<stackV spacing={8} alignment="left">
					{items
						.filter((item) => item !== added)
						.map((item) => (
							<ref key={item} target={item} />
						))}
				</stackV>
			</modulate>
			<resolve key="part" at={1} over={0.5} ease="inOut" />
			<enter key="arrive" at={1.25} over={0.5} from={{ opacity: 0, x: -12 }}>
				<ref target={added} />
			</enter>
		</Graphic>
	);
}
