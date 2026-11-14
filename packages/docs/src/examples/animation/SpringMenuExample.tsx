import { Graphic } from "@modular-svg/react";
import { useState } from "react";

const items = [
	{ id: "inbox", label: "Inbox", count: 3, detail: "Three unread threads" },
	{ id: "drafts", label: "Drafts", count: 1, detail: "One reply to finish" },
	{ id: "sent", label: "Sent", count: 8, detail: "Eight sent this week" },
	{ id: "archive", label: "Archive", count: 2, detail: "Two filed today" },
];

// Click a card. At home the ring wraps the card that was open; a Modulate
// with a spring ease moves it to the one you picked, so it runs past and
// settles. The detail panel opens on a spring too, and its badge drops in
// with a bounce: a ball landing, which never passes the place it lands on.
// The first time round the cards themselves spring in under a Stagger.
export function SpringMenuExample() {
	const [pick, setPick] = useState({ now: 0, was: 0, run: 0 });
	const open = items[pick.now];
	const first = pick.run === 0;

	return (
		<div>
			<p style={{ fontSize: "13px", color: "#666", marginTop: 0 }}>
				Click a card to open it.
			</p>
			<Graphic key={pick.run} margin={24}>
				<stackH key="menu" spacing={36} alignment="top">
					<stackV key="cards" spacing={10}>
						{items.map((item, i) => (
							<background
								key={item.id}
								padding={11}
								rx={9}
								fill={i === pick.now ? "#FFF3E6" : "#F6F7F9"}
								stroke="#C9CED6"
								stroke-width={1}
								onClick={() =>
									setPick((p) => ({ now: i, was: p.now, run: p.run + 1 }))
								}
							>
								<text
									key={`${item.id}Label`}
									width={96}
									font-size={14}
									pointer-events="none"
								>
									{item.label}
								</text>
							</background>
						))}
					</stackV>
					<background
						key="panel"
						padding={16}
						rx={12}
						fill="#FFFFFF"
						stroke="#F28C28"
						stroke-width={1.5}
					>
						<stackV key="detail" spacing={10} alignment="left">
							<text key="title" font-size={18} font-weight="bold" width={170}>
								{open.label}
							</text>
							<text key="line" font-size={13} fill="#666" width={170}>
								{open.detail}
							</text>
						</stackV>
					</background>
				</stackH>
				<background
					key="ring"
					padding={4}
					rx={12}
					fill="none"
					stroke="#F28C28"
					stroke-width={2.5}
					pointer-events="none"
				>
					<ref target={items[pick.was].id} />
				</background>
				<background
					key="badge"
					padding={5}
					rx={11}
					fill="#E5484D"
					stroke="none"
				>
					<text
						key="count"
						font-size={12}
						font-weight="bold"
						fill="#fff"
						width={12}
						text-anchor="middle"
						dx={6}
					>
						{String(open.count)}
					</text>
				</background>
				<align alignment="topRight">
					<ref target="panel" />
					<ref target="badge" />
				</align>

				{first &&
					items.map((item) => (
						<enter
							key={`${item.id}In`}
							over={0.6}
							from={{ opacity: 0, x: -28 }}
							ease="spring"
						>
							<ref target={item.id} />
						</enter>
					))}
				{first && (
					<enter
						key="ringIn"
						at={0.55}
						over={0.3}
						from={{ opacity: 0, scale: 1.3 }}
					>
						<ref target="ring" />
					</enter>
				)}
				{first && (
					<stagger key="cascade" spacing={0.09} at={0.1}>
						{items.map((item) => (
							<ref key={item.id} target={`${item.id}In`} />
						))}
					</stagger>
				)}
				<modulate
					key="select"
					at={first ? 0.6 : 0}
					over={0.7}
					ease={{ kind: "spring", bounce: 0.45 }}
				>
					<background padding={4}>
						<ref target="ring" />
						<ref target={open.id} />
					</background>
				</modulate>
				<enter
					key="openPanel"
					over={0.6}
					from={{ opacity: 0, scale: 0.85 }}
					ease="spring"
				>
					<ref target="panel" />
				</enter>
				<enter
					key="land"
					over={0.8}
					from={{ opacity: 0, y: -60 }}
					ease="bounce"
				>
					<ref target="badge" />
				</enter>
				<sameTime>
					<ref target="select" />
					<ref target="openPanel" />
				</sameTime>
				<sequence gap={-0.35}>
					<ref target="openPanel" />
					<ref target="land" />
				</sequence>
			</Graphic>
		</div>
	);
}
