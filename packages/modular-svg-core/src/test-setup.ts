import fc from "fast-check";

// A rare property failure used to look like a hang: shrinking a costly
// property can take minutes. Bound each property; past the limit it fails
// with what it has found so far instead of stalling the test run.
fc.configureGlobal({
	interruptAfterTimeLimit: 20_000,
	markInterruptAsFailure: true,
});
