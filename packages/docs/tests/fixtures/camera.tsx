// Mounted by tests/time.spec.ts on a docs page: a Graphic whose camera is
// state (what it frames, and a playhead), to watch the view in a real browser.
import { Graphic } from "@modular-svg/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

type Hooks = {
	mount: () => void;
	frame: (id: string | null) => void;
	hold: (t: number | undefined) => void;
	tint: (fill: string) => void;
};

const marks = [
	<rect
		key="a"
		x={0}
		y={0}
		width={40}
		height={20}
		fill="#888"
		stroke-width={0}
	/>,
	<rect
		key="b"
		x={360}
		y={180}
		width={40}
		height={20}
		fill="#888"
		stroke-width={0}
	/>,
];

function Views() {
	const [framed, setFramed] = useState<string | null>(null);
	const [playhead, setPlayhead] = useState<number | undefined>(undefined);
	const hooks = window as unknown as Hooks;
	hooks.frame = setFramed;
	hooks.hold = setPlayhead;
	const [fill, setFill] = useState("#888");
	hooks.tint = setFill;
	return (
		<>
			<Graphic id="focus" transition={{ duration: 0.6, ease: "linear" }}>
				{marks}
				<camera key="look" at={0} over={0}>
					{framed !== null && <ref target={framed} />}
				</camera>
			</Graphic>
			<Graphic id="tint" transition animation={{ stillAt: false }}>
				{marks}
				<rect key="lamp" x={180} y={90} width={20} height={10} fill={fill} />
				<camera key="push" at={0} over={4} ease="linear">
					<ref target="b" />
				</camera>
			</Graphic>
			<Graphic id="scrub" playhead={playhead} animation={{ stillAt: false }}>
				{marks}
				<camera key="push" at={0} over={2} ease="linear">
					<ref target="b" />
				</camera>
			</Graphic>
		</>
	);
}

(window as unknown as Hooks).mount = () => {
	const host = document.createElement("div");
	host.id = "views";
	host.style.cssText =
		"position:fixed;top:0;left:0;z-index:9999;background:#fff";
	document.body.append(host);
	createRoot(host).render(<Views />);
};
