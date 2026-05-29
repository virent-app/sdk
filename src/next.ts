import {
	type NextFetchEvent,
	type NextRequest,
	NextResponse,
} from "next/server";
import { createVirentBotTracker, type VirentBotTrackerOptions } from "./server";

export type VirentNextBotProxyOptions = VirentBotTrackerOptions;

export const createVirentBotProxy = (options: VirentNextBotProxyOptions) => {
	const tracker = createVirentBotTracker(options);

	return (request: NextRequest, event: NextFetchEvent) => {
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

		return NextResponse.next();
	};
};
