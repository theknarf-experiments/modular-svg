// Mounted by tests/clocks.spec.ts on a docs page: a Graphic whose state the
// test changes, to watch its tweens and its two clocks in a real browser.
import { Graphic } from "@modular-svg/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

type Mode = "first-motion" | "page-transition";

function Clocks({ mode }: { mode: Mode }) {
	const [changed, setChanged] = useState(false);
	(window as unknown as { change: () => void }).change = () => setChanged(true);
	const pulses = mode === "page-transition" || changed;
	return (
		<Graphic
			transition={{ duration: 0.6, ease: "linear" }}
			animation={{ loop: true }}
		>
			<stackH spacing={changed ? 10 : 40}>
				<rect key="a" width={20} height={20} fill="#888" stroke-width={0} />
				<rect
					key="b"
					width={20}
					height={20}
					fill="#888"
					stroke-width={0}
					opacity={changed ? 0.5 : 1}
				/>
			</stackH>
			{pulses && (
				<motion key="pulse" loop steps={[{ to: { scale: 1.2 }, over: 1 }]}>
					<ref target="a" />
				</motion>
			)}
		</Graphic>
	);
}

(window as unknown as { mount: (mode: Mode) => void }).mount = (mode) => {
	const host = document.createElement("div");
	host.id = "clocks";
	host.style.cssText =
		"position:fixed;top:0;left:0;z-index:9999;background:#fff";
	document.body.append(host);
	if (mode === "page-transition") {
		const style = document.createElement("style");
		style.textContent = "#clocks #b{transition:opacity 3s}";
		document.head.append(style);
	}
	createRoot(host).render(<Clocks mode={mode} />);
};
