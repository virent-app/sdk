import { expect, test } from "bun:test";
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
import { createVirentBotProxy } from "./next";
import { createVirentBotTracker } from "./server";

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

test("bot tracker skips browser-like human requests by default", async () => {
	const originalFetch = globalThis.fetch;
	let requestCount = 0;

	globalThis.fetch = (() => {
		requestCount += 1;
		return Promise.resolve(new Response(null, { status: 202 }));
	}) as unknown as typeof fetch;

	try {
		const tracker = createVirentBotTracker({
			endpoint: "http://localhost:3001/v1/ingest/bot",
			siteId: "site_123",
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
			endpoint: "http://localhost:3001/v1/ingest/bot",
			ipHashSalt: "test-salt",
			siteId: "site_123",
			writeKey: "vha_sk_test",
		});
		const result = await tracker.trackRequest(
			new Request("https://example.com/docs?q=ai", {
				headers: {
					accept: "text/html",
					referer: "https://chatgpt.com/",
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
		expect(requests[0]?.url).toBe("http://localhost:3001/v1/ingest/bot");
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
			query: {
				q: "ai",
			},
			referer: "https://chatgpt.com/",
			requestId: "req_123",
			siteId: "site_123",
			statusCode: 200,
			timestamp: "2026-05-09T10:00:00.000Z",
			url: "https://example.com/docs?q=ai",
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
			endpoint: "http://localhost:3001/v1/ingest/bot",
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
		endpoint: "http://localhost:3001/v1/ingest/batch",
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
		"http://localhost:3001/v1/ingest/batch"
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
	expect(event.visitorId).toStartWith("vnt_");
	expect(event.sessionId).toStartWith("vnt_");
	expect(event.event_id).toStartWith("vnt_");
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
		endpoint: "http://localhost:3001/v1/ingest/batch",
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
	expect(event.visitorId).toStartWith("vnt_");
	expect(event.sessionId).toStartWith("vnt_");
	expect(event.event_id).toBe("signup-123");
});

test("browser client identifies visitors with customer user ids", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		endpoint: "http://localhost:3001/v1/ingest/batch",
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
	expect(harness.requests[0]?.url).toBe("http://localhost:3001/v1/identify");
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
	expect(payload.visitorId).toStartWith("vnt_");
});

test("browser client tracks idempotent goal conversions", async () => {
	const harness = createBrowserHarness();
	const client = createVirentBrowserClient({
		...harness,
		endpoint: "http://localhost:3001/v1/ingest/batch",
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
	expect(harness.requests[0]?.url).toBe("http://localhost:3001/v1/track/goal");

	const payload = JSON.parse(String(harness.requests[0]?.init?.body));

	expect(payload).toMatchObject({
		eventId: "signup-completed-123",
		idempotencyKey: "signup-completed-123",
		name: "signup_completed",
		timestamp: "2026-05-09T12:00:00.000Z",
	});
	expect(payload.visitorId).toStartWith("vnt_");
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
