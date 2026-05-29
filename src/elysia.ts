import { Elysia } from "elysia";
import { createVirentBotTracker, type VirentBotTrackerOptions } from "./server";

const normalizeStatusCode = (status: number | string | undefined) => {
	if (typeof status === "number") {
		return status;
	}

	if (typeof status === "string") {
		const parsedStatus = Number(status);
		return Number.isFinite(parsedStatus) ? parsedStatus : null;
	}

	return 200;
};

export const createVirentElysiaBotPlugin = (
	options: VirentBotTrackerOptions
) => {
	const tracker = createVirentBotTracker(options);

	return new Elysia({
		name: "virent-bot-analytics",
	})
		.onAfterHandle(({ request, set }) => {
			tracker
				.trackRequest(request, {
					statusCode: normalizeStatusCode(set.status),
				})
				.catch(() => undefined);
		})
		.onError(({ request, set }) => {
			tracker
				.trackRequest(request, {
					statusCode: normalizeStatusCode(set.status) ?? 500,
				})
				.catch(() => undefined);
		});
};
