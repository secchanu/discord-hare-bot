import timers from "node:timers";

timers.setTimeout = ((...args: Parameters<typeof setTimeout>) =>
	globalThis.setTimeout(...args)) as typeof timers.setTimeout;
timers.clearTimeout = ((...args: Parameters<typeof clearTimeout>) =>
	globalThis.clearTimeout(...args)) as typeof timers.clearTimeout;
