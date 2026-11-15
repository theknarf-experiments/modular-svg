// Mounted by tests/time.spec.ts on a docs page: two Graphics of one clipped
// scene, each with a playhead of its own, and one whose window is state.
import { Graphic } from "@modular-svg/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

type Hooks = {
	mount: () => void;
	hold: (which: "one" | "two", t: number | undefined) => void;
	open: (width: number) => void;
};

const content = (
	<rect
		key="inside"
		x={0}
		y={0}
		width={100}
		height={20}
		fill="#ff0000"
		stroke-width={0}
	/>
);

// The same scene twice: a window that opens from the left over two seconds
function Wipe({ id, playhead }: { id: string; playhead: number | undefined }) {
	return (
		<Graphic id={id} playhead={playhead} animation={{ stillAt: false }}>
			<clip key="c">
				<rect key="window" x={0} y={0} width={100} height={20} />
				{content}
			</clip>
			<motion
				key="open"
				from={{ width: 0 }}
				steps={[{ to: { width: 100 }, over: 2, ease: "linear" }]}
			>
				<ref target="window" />
			</motion>
		</Graphic>
	);
}

function Clips() {
	const [held, setHeld] = useState<Record<string, number | undefined>>({});
	const [width, setWidth] = useState(20);
	const hooks = window as unknown as Hooks;
	hooks.hold = (which, t) => setHeld((h) => ({ ...h, [which]: t }));
	hooks.open = setWidth;
	return (
		<>
			<Wipe id="one" playhead={held.one} />
			<Wipe id="two" playhead={held.two} />
			<Graphic id="state" transition={{ duration: 0.6, ease: "linear" }}>
				<clip key="c">
					<rect key="window" x={0} y={0} width={width} height={20} />
					{content}
				</clip>
			</Graphic>
		</>
	);
}

(window as unknown as Hooks).mount = () => {
	const host = document.createElement("div");
	host.id = "clips";
	host.style.cssText =
		"position:fixed;top:0;left:0;z-index:9999;background:#fff";
	document.body.append(host);
	createRoot(host).render(<Clips />);
};
