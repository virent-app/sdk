import { createVirentBotTracker, type VirentBotTrackerOptions } from "./server";

export type VirentNextBotProxyOptions = VirentBotTrackerOptions;

export interface VirentNextFetchEvent {
	waitUntil(promise: Promise<unknown>): void;
}

export type VirentNextRequest = Request;

export const createVirentBotProxy = (options: VirentNextBotProxyOptions) => {
	const tracker = createVirentBotTracker(options);

	return (request: VirentNextRequest, event: VirentNextFetchEvent) => {
		event.waitUntil(
			tracker
				.trackRequest(request, {
					statusCode: null,
				})
				.catch(() => ({
					accepted: false,
					reason: "tracking-failed",
				}))
		);
	};
};
