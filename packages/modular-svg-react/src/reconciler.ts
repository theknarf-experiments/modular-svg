import type { LayoutOperator, NodeRecord } from "@modular-svg/core";
import { buildSceneFromJson } from "@modular-svg/core";
import type * as React from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";

// Instance represents a node in our scene graph
type Instance = {
	type: string;
	key?: string;
	props: Record<string, unknown>;
	children: Instance[];
	parent?: Instance;
	textContent?: string; // For text elements with string children
};

// Container holds the root instances (can be multiple for fragments)
type Container = {
	rootInstances: Instance[];
};

// Text instance (we don't support text nodes in our scene)
type TextInstance = null;

// Type for HostConfig
type Type = string;
type Props = Record<string, unknown>;
type HydratableInstance = never;
type PublicInstance = Instance;
type HostContext = object;
type UpdatePayload = Props;
type ChildSet = never;
type TimeoutHandle = number;
type NoTimeout = -1;
type SuspenseInstance = never;

// Helper to convert instance tree to JSON for core library
function instanceToJson(instance: Instance): Record<string, unknown> {
	const { type, key, props, children } = instance;

	// Capitalize first letter for core library (e.g., "circle" -> "Circle")
	// Handle camelCase types like "stackH" -> "StackH"
	const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

	// Filter out text pseudo-instances and collect text content
	const realChildren = children.filter((child) => child.type !== "__text__");
	const textContent = children
		.filter((child) => child.type === "__text__")
		.map((child) => child.props.textContent)
		.join("");

	// Special handling for text elements - add text content to props
	let finalProps = { ...props };
	if (type === "text" && textContent && !finalProps.text) {
		finalProps = { ...finalProps, text: textContent };
	}

	// Special handling for ref elements - target should be at top level
	if (type === "ref" && props.target) {
		return {
			type: capitalizedType,
			target: props.target,
		};
	}

	return {
		type: capitalizedType,
		key,
		props: finalProps,
		children: realChildren.map(instanceToJson),
	};
}

// HostConfig implementation
const hostConfig: Reconciler.HostConfig<
	Type,
	Props,
	Container,
	Instance,
	TextInstance,
	SuspenseInstance,
	HydratableInstance,
	PublicInstance,
	HostContext,
	UpdatePayload,
	ChildSet,
	TimeoutHandle,
	NoTimeout
> = {
	// Configuration
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: false,

	// Context
	getRootHostContext(_rootContainer: Container): HostContext {
		return {};
	},

	getChildHostContext(
		parentHostContext: HostContext,
		_type: Type,
		_rootContainer: Container,
	): HostContext {
		return parentHostContext;
	},

	// Instance creation
	createInstance(
		type: Type,
		props: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
		internalHandle: Reconciler.OpaqueHandle,
	): Instance {
		const { children, ...rest } = props;

		// Get key from fiber handle (React doesn't pass key in props)
		const fiber = internalHandle as { key?: unknown };
		const key = fiber?.key;

		return {
			type,
			key: typeof key === "string" ? key : undefined,
			props: rest,
			children: [],
		};
	},

	createTextInstance(
		text: string,
		_rootContainer: Container,
		_hostContext: HostContext,
		_internalHandle: Reconciler.OpaqueHandle,
	): TextInstance {
		// Text nodes are captured by their parent <text> element
		// We create a pseudo-instance to hold the text content
		return {
			type: "__text__",
			key: undefined,
			props: { textContent: text },
			children: [],
		} as unknown as TextInstance;
	},

	// Tree manipulation - appendChild, appendInitialChild, etc.
	appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		parent.children.push(child);
		child.parent = parent;
	},

	appendChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		parent.children.push(child);
		child.parent = parent;
	},

	appendChildToContainer(
		container: Container,
		child: Instance | TextInstance,
	): void {
		if (child === null) return;
		container.rootInstances.push(child);
	},

	removeChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		const index = parent.children.indexOf(child);
		if (index !== -1) {
			parent.children.splice(index, 1);
			child.parent = undefined;
		}
	},

	removeChildFromContainer(
		container: Container,
		child: Instance | TextInstance,
	): void {
		if (child === null) return;
		const index = container.rootInstances.indexOf(child);
		if (index !== -1) {
			container.rootInstances.splice(index, 1);
		}
	},

	insertBefore(
		parent: Instance,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance,
	): void {
		if (child === null || beforeChild === null) return;
		const index = parent.children.indexOf(beforeChild);
		if (index !== -1) {
			parent.children.splice(index, 0, child);
			child.parent = parent;
		}
	},

	insertInContainerBefore(
		container: Container,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance,
	): void {
		if (child === null || beforeChild === null) return;
		const index = container.rootInstances.indexOf(beforeChild);
		if (index !== -1) {
			container.rootInstances.splice(index, 0, child);
		} else {
			container.rootInstances.push(child);
		}
	},

	// Updates
	prepareUpdate(
		_instance: Instance,
		_type: Type,
		oldProps: Props,
		newProps: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
	): UpdatePayload | null {
		// Return update payload if props changed
		if (oldProps !== newProps) {
			return newProps;
		}
		return null;
	},

	commitUpdate(
		instance: Instance,
		updatePayload: UpdatePayload,
		_type: Type,
		_oldProps: Props,
		_newProps: Props,
		_internalHandle: Reconciler.OpaqueHandle,
	): void {
		const { children, key, ...rest } = updatePayload;
		instance.props = rest;
		if (key) instance.key = key as string;
	},

	commitTextUpdate(
		_textInstance: TextInstance,
		_oldText: string,
		_newText: string,
	): void {
		// Not supported
	},

	// Finalization
	finalizeInitialChildren(
		_instance: Instance,
		_type: Type,
		_props: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
	): boolean {
		return false;
	},

	// Commit phase
	prepareForCommit(_containerInfo: Container): Record<string, unknown> | null {
		return null;
	},

	resetAfterCommit(_containerInfo: Container): void {
		// Could trigger scene rebuild here if needed
	},

	// Clearing
	clearContainer(container: Container): void {
		container.rootInstances = [];
	},

	// Text content
	shouldSetTextContent(_type: Type, _props: Props): boolean {
		return false;
	},

	resetTextContent(_instance: Instance): void {
		// Not needed
	},

	// Hydration (not supported)
	canHydrateInstance(): null {
		return null;
	},

	canHydrateTextInstance(): null {
		return null;
	},

	isSuspenseInstancePending(): boolean {
		return false;
	},

	isSuspenseInstanceFallback(): boolean {
		return false;
	},

	registerSuspenseInstanceRetry(): void {
		// Not needed
	},

	getInstanceFromNode(): null {
		return null;
	},

	beforeActiveInstanceBlur(): void {
		// Not needed
	},

	afterActiveInstanceBlur(): void {
		// Not needed
	},

	prepareScopeUpdate(): void {
		// Not needed
	},

	getInstanceFromScope(): null {
		return null;
	},

	detachDeletedInstance(): void {
		// Not needed
	},

	// Public instance
	getPublicInstance(instance: Instance): PublicInstance {
		return instance;
	},

	preparePortalMount(): void {
		// Not needed
	},

	// Scheduling
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	noTimeout: -1 as NoTimeout,

	getCurrentEventPriority(): number {
		return DefaultEventPriority;
	},

	// Additional required methods for newer react-reconciler
	hideInstance(_instance: Instance): void {
		// Not needed
	},

	hideTextInstance(_textInstance: TextInstance): void {
		// Not needed
	},

	unhideInstance(_instance: Instance, _props: Props): void {
		// Not needed
	},

	unhideTextInstance(_textInstance: TextInstance, _text: string): void {
		// Not needed
	},

	// Micro-tasks
	supportsMicrotasks: true,
	scheduleMicrotask:
		typeof queueMicrotask === "function"
			? queueMicrotask
			: (callback: () => void) => Promise.resolve().then(callback),
};

// Create the reconciler
const reconciler = Reconciler(hostConfig);

// ReconcilerRoot type
export type ReconcilerRoot = {
	render: (element: React.ReactNode) => Promise<void>;
	unmount: () => Promise<void>;
	getScene: () => { nodes: NodeRecord[]; operators: LayoutOperator[] };
};

// Create root function
export function createRoot(): ReconcilerRoot {
	const container: Container = { rootInstances: [] };

	const fiberRoot = reconciler.createContainer(
		container,
		0, // ConcurrentRoot
		null, // hydration callbacks
		false, // isStrictMode
		null, // concurrentUpdatesByDefaultOverride
		"", // identifierPrefix
		() => {}, // onRecoverableError
		null, // transitionCallbacks
	);

	return {
		async render(element: React.ReactNode): Promise<void> {
			reconciler.updateContainer(element, fiberRoot, null, () => {});
			// Wait for updates to flush
			await new Promise((resolve) => setTimeout(resolve, 0));
		},

		async unmount(): Promise<void> {
			reconciler.updateContainer(null, fiberRoot, null, () => {});
			await new Promise((resolve) => setTimeout(resolve, 0));
		},

		getScene(): { nodes: NodeRecord[]; operators: LayoutOperator[] } {
			if (container.rootInstances.length === 0) {
				return { nodes: [], operators: [] };
			}

			// If we have multiple root instances (e.g., from fragment), wrap in Group
			let json: Record<string, unknown>;
			if (container.rootInstances.length === 1) {
				json = instanceToJson(container.rootInstances[0]);
			} else {
				// Multiple children - wrap in a Group
				json = {
					type: "Group",
					props: {},
					children: container.rootInstances.map(instanceToJson),
				};
			}

			// Use core library to build scene
			return buildSceneFromJson(json);
		},
	};
}

// Export act helper for testing
export async function act(callback: () => void | Promise<void>): Promise<void> {
	// Use React's act from react reconciler
	const reactAct = (await import("react")).act;
	await reactAct(async () => {
		await callback();
	});
}
