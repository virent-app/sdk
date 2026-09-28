import { expect, test } from "vitest";
import {
	createVirentBrowserClient,
	identify,
	initVirent,
	pageview,
	resetVirent,
	trackEvent,
	trackGoal,
	type VirentBrowserOptions,
} from "./browser";
import { createVirentAnalyticsProxy, createVirentBotProxy } from "./next";
import { createVirentBotTracker } from "./server";

const virentIdPattern = /^vnt_/;

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

const createDeterministicCrypto = () => {
	let index = 0;

	return {
		getRandomValues<T extends ArrayBufferView>(array: T) {
			const bytes = new Uint8Array(
				array.buffer,
				array.byteOffset,
				array.byteLength
			);

			for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
				bytes[byteIndex] = (index + byteIndex) % 256;
			}

			index += bytes.length;

			return array;
		},
	};
};

const createBrowserHarness = () => {
	const requests: Array<{
		init?: RequestInit;
		url: string;
	}> = [];
	const fetch: NonNullable<VirentBrowserOptions["fetch"]> = (url, init) => {
		requests.push({
			init,
			url: String(url),
		});

		return Promise.resolve(
			new Response(JSON.stringify({ accepted: 1 }), {
				status: 202,
			})
		);
	};

	return {
		crypto: createDeterministicCrypto(),
		fetch,
		localStorage: new MemoryStorage(),
		requests,
		sessionStorage: new MemoryStorage(),
	};
};

test("root entrypoint only exposes browser analytics", async () => {
	const rootSdk = await import("./index");

	expect(Object.keys(rootSdk).sort()).toEqual([
		"createVirentBrowserClient",
		"identify",
		"initVirent",
		"pageview",
		"resetVirent",
		"trackEvent",
		"trackGoal",
	]);
});

test("tracker skips when site credentials are missing", async () => {
	const tracker = createVirentBotTracker({});
	const result = await tracker.trackRequest(
		new Request("https://example.com/docs", {
			headers: {
				"user-agent": "GPTBot/1.0",
			},
		})
	);

	expect(result.accepted).toBe(false);
	expect(result.reason).toBe("missing-site-or-write-key");
});

test("explicit bots mode skips browser-like human requests", async () => {
	const originalFetch = globalThis.fetch;
	let requestCount = 0;

	globalThis.fetch = (() => {
		requestCount += 1;
		return Promise.resolve(new Response(null, { status: 202 }));
	}) as unknown as typeof fetch;

	try {
		const tracker = createVirentBotTracker({
			endpoint: "http://localhost:3000/v1/ingest/bot",
			siteId: "site_123",
			trackMode: "bots",
			writeKey: "vha_sk_test",
		});
		const result = await tracker.trackRequest(
			new Request("https://example.com/docs", {
				headers: {
					"user-agent":
						"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
				},
			})
		);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe("not-a-bot");
		expect(requestCount).toBe(0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("bot tracker sends crawler ingest payloads", async () => {
	const originalFetch = globalThis.fetch;
	const requests: Array<{
		init?: RequestInit;
		url: string;
	}> = [];

	globalThis.fetch = ((
		url: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1]
	) => {
		requests.push({
			init,
			url: String(url),
		});

		return Promise.resolve(
			new Response(JSON.stringify({ accepted: true }), {
				status: 202,
			})
		);
	}) as unknown as typeof fetch;

	try {
		const tracker = createVirentBotTracker({
			endpoint: "http://localhost:3000/v1/ingest/bot",
			ipHashSalt: "test-salt",
			siteId: "site_123",
			trustedProxy: "development",
			writeKey: "vha_sk_test",
		});
		const result = await tracker.trackRequest(
			new Request("https://example.com/docs?q=ai", {
				headers: {
					accept: "text/html",
					referer: "https://chatgpt.com/?token=private",
					"user-agent": "GPTBot/1.0",
					"x-forwarded-for": "203.0.113.10",
				},
				method: "GET",
			}),
			{
				requestId: "req_123",
				statusCode: 200,
				timestamp: new Date("2026-05-09T10:00:00.000Z"),
			}
		);

		expect(result.accepted).toBe(true);
		expect(result.status).toBe(202);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("http://localhost:3000/v1/ingest/bot");
		expect(requests[0]?.init?.headers).toEqual({
			Authorization: "Bearer vha_sk_test",
			"Content-Type": "application/json",
		});

		const payload = JSON.parse(String(requests[0]?.init?.body));

		expect(payload).toMatchObject({
			accept: "text/html",
			host: "example.com",
			method: "GET",
			path: "/docs",
			query: {},
			referer: null,
			requestId: "req_123",
			siteId: "site_123",
			statusCode: 200,
			timestamp: "2026-05-09T10:00:00.000Z",
			url: "https://example.com/docs",
			userAgent: "GPTBot/1.0",
		});
		expect(typeof payload.ipHash).toBe("string");
		expect(payload.ipHash).toHaveLength(32);
		expect(payload.classification).toMatchObject({
			classificationState: "known",
			crawlerType: "ai_training",
			family: "openai",
			isAiCrawler: true,
			isBot: true,
			name: "GPTBot",
			provider: "openai",
		});
		expect(payload.classification.sourceIds).toContain("arcjet:openai-crawler");
		expect(payload.rulesMatched[0]).toBe("classify:openai:GPTBot");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("bot tracker propagates accepted false responses", async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (() =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					accepted: false,
					duplicate: true,
					reason: "duplicate-request",
				}),
				{
					status: 200,
				}
			)
		)) as unknown as typeof fetch;

	try {
		const tracker = createVirentBotTracker({
			endpoint: "http://localhost:3000/v1/ingest/bot",
			siteId: "site_123",
			writeKey: "vha_sk_test",
		});
		const result = await tracker.trackRequest(
			new Request("https://example.com/docs", {
				headers: {
					"user-agent": "GPTBot/1.0",
				},
			})
		);

		expect(result.accepted).toBe(false);
		expect(result.duplicate).toBe(true);
		expect(result.reason).toBe("duplicate-request");
		expect(result.status).toBe(200);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Next.js proxy helper tracks in waitUntil without Next runtime imports", () => {
	const pendingWork: Promise<unknown>[] = [];
	const proxy = createVirentBotProxy({});
	const result = proxy(
		new Request("https://example.com/docs", {
			headers: {
				"user-agent": "GPTBot/1.0",
			},
		}),
		{
			waitUntil(promise) {
				pendingWork.push(promise);
			},
		}
	);

	expect(result).toBeUndefined();
	expect(pendingWork).toHaveLength(1);
});

test("browser client sends validated pageview payloads", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		document: {
			referrer: "https://search.example/?q=virent",
			title: "Pricing",
		},
		endpoint: "http://localhost:3000/v1/ingest/batch",
		location: {
			hostname: "example.com",
			href: "https://example.com/pricing?utm_source=google&utm_campaign=mvp",
		},
		writeKey: "vha_pk_test",
	});

	const result = await client.pageview({
		timestamp: "2026-05-09T10:00:00.000Z",
	});

	expect(result.accepted).toBe(true);
	expect(result.status).toBe(202);
	expect(harness.requests).toHaveLength(1);
	expect(harness.requests[0]?.url).toBe(
		"http://localhost:3000/v1/ingest/batch"
	);
	expect(harness.requests[0]?.init?.headers).toEqual({
		"Content-Type": "application/json",
		"x-api-key": "vha_pk_test",
	});

	const payload = JSON.parse(String(harness.requests[0]?.init?.body));
	const [event] = payload.events;

	expect(event).toMatchObject({
		hostname: "example.com",
		path: "/pricing",
		properties: {
			title: "Pricing",
			utm_campaign: "mvp",
			utm_source: "google",
		},
		referrer: "https://search.example/?q=virent",
		timestamp: "2026-05-09T10:00:00.000Z",
		type: "pageview",
		url: "https://example.com/pricing?utm_source=google&utm_campaign=mvp",
	});
	expect(event.visitorId).toMatch(virentIdPattern);
	expect(event.sessionId).toMatch(virentIdPattern);
	expect(event.event_id).toMatch(virentIdPattern);
});

test("browser client validates payload before sending", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		location: {
			hostname: "example.com",
			href: "https://example.com/",
		},
		writeKey: "vha_pk_test",
	});

	const result = await client.pageview({
		timestamp: "not-a-date",
	});

	expect(result.accepted).toBe(false);
	expect(result.reason).toBe("invalid-timestamp");
	expect(harness.requests).toHaveLength(0);
});

test("browser client sends validated custom event payloads", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		document: {
			referrer: "https://referrer.example/",
			title: "Ignored for custom events",
		},
		endpoint: "http://localhost:3000/v1/ingest/batch",
		location: {
			hostname: "example.com",
			href: "https://example.com/pricing",
		},
		writeKey: "vha_pk_test",
	});

	const result = await client.trackEvent({
		contentId: "pricing-cta",
		idempotencyKey: "signup-123",
		name: "signup_started",
		properties: {
			plan: "pro",
			step: 1,
			tags: ["pricing", "cta"],
		},
		timestamp: "2026-05-09T11:00:00.000Z",
	});

	expect(result.accepted).toBe(true);
	expect(result.status).toBe(202);
	expect(harness.requests).toHaveLength(1);

	const payload = JSON.parse(String(harness.requests[0]?.init?.body));
	const [event] = payload.events;

	expect(event).toMatchObject({
		contentId: "pricing-cta",
		idempotencyKey: "signup-123",
		name: "signup_started",
		properties: {
			plan: "pro",
			step: 1,
			tags: ["pricing", "cta"],
		},
		referrer: "https://referrer.example/",
		timestamp: "2026-05-09T11:00:00.000Z",
		type: "event",
	});
	expect(event.visitorId).toMatch(virentIdPattern);
	expect(event.sessionId).toMatch(virentIdPattern);
	expect(event.event_id).toBe("signup-123");
});

test("browser client identifies visitors with customer user ids", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		endpoint: "http://localhost:3000/v1/ingest/batch",
		location: {
			hostname: "example.com",
			href: "https://example.com/account",
		},
		writeKey: "vha_pk_test",
	});

	const result = await client.identify({
		traits: {
			plan: "pro",
		},
		userId: "customer_123",
	});

	expect(result.accepted).toBe(true);
	expect(result.status).toBe(202);
	expect(harness.requests).toHaveLength(1);
	expect(harness.requests[0]?.url).toBe("http://localhost:3000/v1/identify");
	expect(harness.requests[0]?.init?.headers).toEqual({
		"Content-Type": "application/json",
		"x-api-key": "vha_pk_test",
	});

	const payload = JSON.parse(String(harness.requests[0]?.init?.body));

	expect(payload).toMatchObject({
		traits: {
			plan: "pro",
		},
		userId: "customer_123",
	});
	expect(payload.visitorId).toMatch(virentIdPattern);
});

test("browser client tracks idempotent goal conversions", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		endpoint: "http://localhost:3000/v1/ingest/batch",
		location: {
			hostname: "example.com",
			href: "https://example.com/pricing",
		},
		writeKey: "vha_pk_test",
	});

	const result = await client.trackGoal({
		idempotencyKey: "signup-completed-123",
		name: "signup_completed",
		timestamp: "2026-05-09T12:00:00.000Z",
	});

	expect(result.accepted).toBe(true);
	expect(result.status).toBe(202);
	expect(harness.requests).toHaveLength(1);
	expect(harness.requests[0]?.url).toBe("http://localhost:3000/v1/track/goal");

	const payload = JSON.parse(String(harness.requests[0]?.init?.body));

	expect(payload).toMatchObject({
		eventId: "signup-completed-123",
		idempotencyKey: "signup-completed-123",
		name: "signup_completed",
		timestamp: "2026-05-09T12:00:00.000Z",
	});
	expect(payload.visitorId).toMatch(virentIdPattern);
});

test("browser client validates custom event payloads before sending", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		location: {
			hostname: "example.com",
			href: "https://example.com/",
		},
		writeKey: "vha_pk_test",
	});

	const emptyNameResult = await client.trackEvent({
		name: " ",
	});
	const invalidPropertiesResult = await client.trackEvent({
		name: "signup_started",
		properties: {
			invalid: Number.NaN,
		},
	});

	expect(emptyNameResult.accepted).toBe(false);
	expect(emptyNameResult.reason).toBe("invalid-event-name");
	expect(invalidPropertiesResult.accepted).toBe(false);
	expect(invalidPropertiesResult.reason).toBe("invalid-properties");
	expect(harness.requests).toHaveLength(0);
});

test("browser client skips when publishable key is missing", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		location: {
			hostname: "example.com",
			href: "https://example.com/",
		},
	});

	const result = await client.pageview();

	expect(result.accepted).toBe(false);
	expect(result.reason).toBe("missing-write-key");
	expect(harness.requests).toHaveLength(0);
});

test("initVirent sends the initial pageview by default", async () => {
	resetVirent();

	const harness = createBrowserHarness();

	initVirent({
		...harness,
		location: {
			hostname: "localhost",
			href: "http://localhost:3000/",
		},
		writeKey: "vha_pk_test",
	});

	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(harness.requests).toHaveLength(1);

	const manualResult = await pageview({
		path: "/docs",
		url: "http://localhost:3000/docs",
	});
	const customEventResult = await trackEvent({
		name: "docs_cta_clicked",
		properties: {
			location: "hero",
		},
	});
	const identifyResult = await identify({
		userId: "customer_docs_1",
	});
	const goalResult = await trackGoal({
		name: "docs_signup_completed",
	});

	expect(manualResult.accepted).toBe(true);
	expect(customEventResult.accepted).toBe(true);
	expect(identifyResult.accepted).toBe(true);
	expect(goalResult.accepted).toBe(true);
	expect(harness.requests).toHaveLength(5);

	resetVirent();
});

test("default mode sends unknown page requests with sanitized metadata", async () => {
	const originalFetch = globalThis.fetch;
	let payload: Record<string, unknown> | undefined;
	globalThis.fetch = ((_url, init) => {
		payload = JSON.parse(String(init?.body));
		return Promise.resolve(
			Response.json({ accepted: false, reason: "not-ai-traffic" })
		);
	}) as typeof fetch;
	try {
		const tracker = createVirentBotTracker({
			siteId: "site_123",
			writeKey: "test",
		});
		const result = await tracker.trackRequest(
			new Request("https://example.com/docs?token=private#secret", {
				headers: {
					authorization: "Bearer secret",
					cookie: "session=secret",
					referer: "https://example.com/?token=secret",
					"user-agent": "FutureAgent/1",
				},
			})
		);
		expect(payload?.url).toBe("https://example.com/docs");
		expect(payload?.query).toEqual({});
		expect(JSON.stringify(payload)).not.toContain("secret");
		expect(JSON.stringify(payload)).not.toContain("private");
		expect(result.reason).toBe("not-ai-traffic");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("all mode excludes assets and internal requests", async () => {
	const originalFetch = globalThis.fetch;
	let count = 0;
	globalThis.fetch = (() => {
		count += 1;
		return Promise.resolve(new Response());
	}) as typeof fetch;
	try {
		const tracker = createVirentBotTracker({
			siteId: "site_123",
			trackMode: "all",
			writeKey: "test",
		});
		const results = await Promise.all(
			["/_next/data/test", "/api/auth", "/v1/ingest/bot", "/logo.svg"].map(
				(path) =>
					tracker.trackRequest(new Request(`https://example.com${path}`))
			)
		);
		expect(
			results.every((result) => result.reason === "ineligible-request")
		).toBe(true);
		expect(count).toBe(0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("first-party proxy serves the script from the site's own domain", async () => {
	const originalFetch = globalThis.fetch;
	const requests: string[] = [];
	globalThis.fetch = ((input: RequestInfo | URL) => {
		requests.push(String(input));
		return Promise.resolve(new Response("/* virent */", { status: 200 }));
	}) as typeof fetch;

	try {
		const proxy = createVirentAnalyticsProxy({
			origin: "https://stage.virent.app/",
		});
		const first = await proxy.GET(
			new Request("https://quantum.ltda/vt/script.js")
		);
		const second = await proxy.GET(
			new Request("https://quantum.ltda/vt/script.js")
		);
		const other = await proxy.GET(new Request("https://quantum.ltda/vt/other"));

		expect(await first.text()).toBe("/* virent */");
		expect(first.headers.get("content-type")).toContain("javascript");
		expect(second.status).toBe(200);
		expect(other.status).toBe(404);
		// The script is cached, so Virent is fetched once.
		expect(requests).toEqual(["https://stage.virent.app/js/script.js"]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("first-party proxy forwards events with the visitor's network context", async () => {
	const originalFetch = globalThis.fetch;
	const captured: { upstream?: { headers: Headers; url: string } } = {};
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		captured.upstream = {
			headers: new Headers(init?.headers),
			url: String(input),
		};
		return Promise.resolve(Response.json({ accepted: 1 }, { status: 200 }));
	}) as typeof fetch;

	try {
		const proxy = createVirentAnalyticsProxy({
			origin: "https://stage.virent.app",
			trustedProxy: "vercel",
			writeKey: "vha_sk_secret",
		});
		const response = await proxy.POST(
			new Request("https://quantum.ltda/vt/event?key=vha_pk_public", {
				body: JSON.stringify({ events: [] }),
				headers: {
					"content-type": "text/plain;charset=UTF-8",
					"user-agent":
						"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)",
					"x-vercel-forwarded-for": "203.0.113.7",
					"x-vercel-ip-country": "BR",
				},
				method: "POST",
			})
		);

		expect(response.status).toBe(200);
		expect(captured.upstream?.url).toBe(
			"https://stage.virent.app/v1/ingest/batch?key=vha_pk_public"
		);
		expect(captured.upstream?.headers.get("x-virent-proxy-key")).toBe(
			"vha_sk_secret"
		);
		expect(captured.upstream?.headers.get("x-virent-forwarded-for")).toBe(
			"203.0.113.7"
		);
		expect(captured.upstream?.headers.get("x-virent-forwarded-country")).toBe(
			"BR"
		);
		expect(captured.upstream?.headers.get("origin")).toBe(
			"https://quantum.ltda"
		);
		expect(captured.upstream?.headers.get("user-agent")).toContain("iPhone");
		// The browser's publishable key stays in the query, never in x-api-key.
		expect(captured.upstream?.headers.get("x-api-key")).toBeNull();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("first-party proxy forwards no visitor context without a secret key", async () => {
	const originalFetch = globalThis.fetch;
	const captured: { headers?: Headers } = {};
	globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
		captured.headers = new Headers(init?.headers);
		return Promise.resolve(Response.json({}, { status: 200 }));
	}) as typeof fetch;

	try {
		await createVirentAnalyticsProxy({ trustedProxy: "vercel" }).POST(
			new Request("https://quantum.ltda/vt/event?key=vha_pk_public", {
				body: "{}",
				headers: { "x-vercel-forwarded-for": "203.0.113.7" },
				method: "POST",
			})
		);

		expect(captured.headers?.get("x-virent-proxy-key")).toBeNull();
		expect(captured.headers?.get("x-virent-forwarded-for")).toBeNull();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
