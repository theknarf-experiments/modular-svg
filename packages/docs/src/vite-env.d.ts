/// <reference types="vite/client" />

// An interface, not a type: it has to merge with Vite's own ImportMetaEnv.
interface ImportMetaEnv {
	/** Link back to the source; unset when it cannot be found. */
	readonly VITE_REPO_URL?: string;
}
