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

export interface VirentAnalyticsProxyOptions {
	/** Virent origin that serves the script and the ingest API. */
	origin?: string;
	/** Upstream request timeout in milliseconds. */
	timeoutMs?: number;
	/**
	 * Where the visitor IP and country come from. "vercel" reads the headers
	 * Vercel sets on every request; "development" trusts X-Forwarded-For.
	 */
	trustedProxy?: "development" | "none" | "vercel";
	/**
	 * The website's secret key (the same key as the crawler proxy). It lets
	 * Virent trust the visitor IP and country this proxy forwards; without it,
	 * geography reflects your server instead of your visitors.
	 */
	writeKey?: string;
}

const defaultVirentOrigin = "https://virent.app";
const scriptCacheMs = 60 * 60 * 1000;
const trailingSlashPattern = /\/+$/;
const scriptPathPattern = /\/script\.js$/;
const eventPathPattern = /\/event$/;
const forwardedRequestHeaders = ["accept-language", "origin", "user-agent"];

const readFirstForwardedAddress = (value: string | null) =>
	value?.split(",", 1)[0]?.trim() || null;

const getVisitorIpAddress = (
	headers: Headers,
	trustedProxy: NonNullable<VirentAnalyticsProxyOptions["trustedProxy"]>
) => {
	if (trustedProxy === "vercel") {
		return readFirstForwardedAddress(headers.get("x-vercel-forwarded-for"));
	}

	if (trustedProxy === "development") {
		return (
			readFirstForwardedAddress(headers.get("x-forwarded-for")) ??
			headers.get("x-real-ip")?.trim() ??
			null
		);
	}

	return null;
};

const createUpstreamEventHeaders = (
	request: Request,
	writeKey: string | undefined,
	trustedProxy: NonNullable<VirentAnalyticsProxyOptions["trustedProxy"]>
) => {
	const headers = new Headers({
		"Content-Type":
			request.headers.get("content-type") ?? "text/plain;charset=UTF-8",
	});

	for (const name of forwardedRequestHeaders) {
		const value = request.headers.get(name);

		if (value) {
			headers.set(name, value);
		}
	}

	// Same-origin requests may omit Origin; the event came from this site.
	if (!headers.has("origin")) {
		headers.set("origin", new URL(request.url).origin);
	}

	if (!writeKey) {
		return headers;
	}

	const ipAddress = getVisitorIpAddress(request.headers, trustedProxy);
	const country =
		trustedProxy === "vercel"
			? request.headers.get("x-vercel-ip-country")?.trim()
			: null;

	headers.set("x-virent-proxy-key", writeKey);

	if (ipAddress) {
		headers.set("x-virent-forwarded-for", ipAddress);
	}

	if (country) {
		headers.set("x-virent-forwarded-country", country);
	}

	return headers;
};

/**
 * First-party analytics: serves the Virent browser script and relays its
 * events from your own domain, so privacy tools that block third-party
 * analytics hosts don't drop visits. Mount it on a catch-all route, e.g.
 * `app/vt/[...path]/route.ts`:
 *
 *   export const { GET, POST } = createVirentAnalyticsProxy({
 *     trustedProxy: "vercel",
 *     writeKey: process.env.VIRENT_INGEST_SECRET,
 *   });
 *
 * and load `<script src="/vt/script.js" data-api-url="/vt/event" ...>`.
 */
export const createVirentAnalyticsProxy = (
	options: VirentAnalyticsProxyOptions = {}
) => {
	const origin = (options.origin ?? defaultVirentOrigin).replace(
		trailingSlashPattern,
		""
	);
	const timeoutMs = options.timeoutMs ?? 5000;
	const trustedProxy = options.trustedProxy ?? "none";
	let cachedScript: { body: string; expiresAt: number } | null = null;

	const GET = async (request: Request) => {
		if (!scriptPathPattern.test(new URL(request.url).pathname)) {
			return new Response("Not found", { status: 404 });
		}

		if (!cachedScript || cachedScript.expiresAt <= Date.now()) {
			const upstream = await fetch(`${origin}/js/script.js`, {
				signal: AbortSignal.timeout(timeoutMs),
			});

			if (!upstream.ok) {
				return new Response("Script unavailable", { status: 502 });
			}

			cachedScript = {
				body: await upstream.text(),
				expiresAt: Date.now() + scriptCacheMs,
			};
		}

		return new Response(cachedScript.body, {
			headers: {
				"Cache-Control": "public, max-age=3600, s-maxage=86400",
				"Content-Type": "application/javascript; charset=utf-8",
			},
		});
	};

	const POST = async (request: Request) => {
		const requestUrl = new URL(request.url);

		if (!eventPathPattern.test(requestUrl.pathname)) {
			return new Response("Not found", { status: 404 });
		}

		const upstreamUrl = new URL(`${origin}/v1/ingest/batch`);
		upstreamUrl.search = requestUrl.search;
		const headers = createUpstreamEventHeaders(
			request,
			options.writeKey,
			trustedProxy
		);

		try {
			const upstream = await fetch(upstreamUrl, {
				body: await request.text(),
				headers,
				method: "POST",
				signal: AbortSignal.timeout(timeoutMs),
			});

			return new Response(upstream.body, {
				headers: {
					"Cache-Control": "no-store",
					"Content-Type":
						upstream.headers.get("content-type") ?? "application/json",
				},
				status: upstream.status,
			});
		} catch {
			return Response.json(
				{ error: "Virent is unreachable." },
				{ headers: { "Cache-Control": "no-store" }, status: 502 }
			);
		}
	};

	return { GET, POST };
};
