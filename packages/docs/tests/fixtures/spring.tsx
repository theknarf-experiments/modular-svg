// Mounted by tests/time.spec.ts on a docs page: a Graphic whose transition
// eases on a spring, to watch the tween overshoot and land in a real browser.
import { Graphic } from "@modular-svg/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

function Sprung() {
	const [changed, setChanged] = useState(false);
	(window as unknown as { change: () => void }).change = () => setChanged(true);
	return (
		<Graphic transition={{ duration: 0.8, ease: "spring" }}>
			<stackH spacing={changed ? 10 : 110}>
				<rect key="a" width={20} height={20} fill="#888" stroke-width={0} />
				<rect key="b" width={20} height={20} fill="#888" stroke-width={0} />
			</stackH>
		</Graphic>
	);
}

(window as unknown as { mount: () => void }).mount = () => {
	const host = document.createElement("div");
	host.id = "sprung";
	host.style.cssText =
		"position:fixed;top:0;left:0;z-index:9999;background:#fff";
	document.body.append(host);
	createRoot(host).render(<Sprung />);
};
