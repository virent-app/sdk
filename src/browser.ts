type CryptoLike = Pick<Crypto, "getRandomValues"> &
	Partial<Pick<Crypto, "randomUUID">>;

export interface VirentBrowserEnvironment {
	crypto?: CryptoLike;
	document?: Pick<Document, "referrer" | "title">;
	fetch?: FetchLike;
	localStorage?: StorageLike;
	location?: Pick<Location, "href" | "hostname">;
	sessionStorage?: StorageLike;
}

export interface VirentBrowserOptions extends VirentBrowserEnvironment {
	autoPageviews?: boolean;
	endpoint?: string;
	goalEndpoint?: string;
	identifyEndpoint?: string;
	sessionTimeoutMs?: number;
	writeKey?: string;
}

export type VirentJsonValue =
	| boolean
	| null
	| number
	| string
	| VirentJsonValue[]
	| { [key: string]: VirentJsonValue };

export type VirentEventProperties = Record<string, VirentJsonValue>;

export interface VirentPageviewInput {
	eventId?: string;
	path?: string;
	properties?: VirentEventProperties;
	referrer?: string | null;
	timestamp?: Date | string;
	title?: string | null;
	url?: string;
}

export interface VirentPageviewEvent {
	event_id: string;
	hostname: string;
	path: string;
	properties?: VirentEventProperties;
	referrer?: string;
	sessionId: string;
	timestamp: string;
	type: "pageview";
	url: string;
	visitorId: string;
}

export interface VirentCustomEventInput {
	contentId?: string;
	eventId?: string;
	idempotencyKey?: string;
	name: string;
	properties?: VirentEventProperties;
	referrer?: string | null;
	timestamp?: Date | string;
}

export interface VirentCustomEvent {
	contentId?: string;
	event_id: string;
	idempotencyKey?: string;
	name: string;
	properties?: VirentEventProperties;
	referrer?: string;
	sessionId: string;
	timestamp: string;
	type: "event";
	visitorId: string;
}

export interface VirentIdentifyInput {
	traits?: VirentEventProperties;
	userId: string;
	visitorId?: string;
	websiteId?: string;
}

export interface VirentIdentifyPayload {
	traits?: VirentEventProperties;
	userId: string;
	visitorId: string;
	websiteId?: string;
}

export interface VirentGoalInput {
	eventId?: string;
	idempotencyKey?: string;
	name: string;
	timestamp?: Date | string;
	visitorId?: string;
}

export interface VirentGoalPayload {
	eventId: string;
	idempotencyKey?: string;
	name: string;
	timestamp: string;
	visitorId: string;
}

export interface TrackPageviewResult {
	accepted: boolean;
	payload?: VirentPageviewEvent;
	reason?: string;
	status?: number;
}

export interface TrackCustomEventResult {
	accepted: boolean;
	payload?: VirentCustomEvent;
	reason?: string;
	status?: number;
}

export interface IdentifyResult {
	accepted: boolean;
	payload?: VirentIdentifyPayload;
	reason?: string;
	status?: number;
}

export interface TrackGoalResult {
	accepted: boolean;
	duplicate?: boolean;
	payload?: VirentGoalPayload;
	reason?: string;
	status?: number;
}

export interface VirentBrowserClient {
	identify(input: VirentIdentifyInput): Promise<IdentifyResult>;
	pageview(input?: VirentPageviewInput): Promise<TrackPageviewResult>;
	trackEvent(input: VirentCustomEventInput): Promise<TrackCustomEventResult>;
	trackGoal(input: VirentGoalInput): Promise<TrackGoalResult>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface StorageLike {
	getItem(key: string): string | null;
	removeItem(key: string): void;
	setItem(key: string, value: string): void;
}

const defaultEndpoint = "https://virent.app/v1/ingest/batch";
const localEndpoint = "http://localhost:3000/v1/ingest/batch";
const defaultSessionTimeoutMs = 30 * 60 * 1000;
const visitorStorageKey = "virent:visitor-id";
const sessionStorageKey = "virent:session-id";
const sessionLastSeenStorageKey = "virent:session-last-seen";
const randomIdByteLength = 16;
const idMaximumLength = 255;
const eventNameMaximumLength = 255;
const eventPropertiesMaximumBytes = 16 * 1024;
const eventPropertiesMaximumDepth = 8;
const eventPropertiesMaximumEntries = 100;
const pathMaximumLength = 1024;
const urlMaximumLength = 2048;
const contentIdMaximumLength = 255;
const idempotencyKeyMaximumLength = 255;
const attributionParameterNames = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"gclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
] as const;

let activeClient: VirentBrowserClient | null = null;

const getGlobalEnvironment = (): VirentBrowserEnvironment => {
	const globalScope = globalThis as typeof globalThis & {
		document?: Document;
		location?: Location;
		localStorage?: Storage;
		sessionStorage?: Storage;
	};

	return {
		crypto: globalScope.crypto,
		document: globalScope.document,
		fetch: globalScope.fetch?.bind(globalScope),
		localStorage: globalScope.localStorage,
		location: globalScope.location,
		sessionStorage: globalScope.sessionStorage,
	};
};

const isLocalHostname = (hostname: string | undefined) =>
	hostname === "localhost" ||
	hostname === "127.0.0.1" ||
	hostname === "::1" ||
	hostname?.endsWith(".local");

const getDefaultEndpoint = (location: VirentBrowserEnvironment["location"]) =>
	isLocalHostname(location?.hostname) ? localEndpoint : defaultEndpoint;

const getRelatedEndpoint = (ingestEndpoint: string, pathname: string) => {
	try {
		const url = new URL(ingestEndpoint);
		url.pathname = pathname;
		url.search = "";
		url.hash = "";

		return url.toString();
	} catch {
		return pathname;
	}
};

const readStorage = (storage: StorageLike | undefined, key: string) => {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
};

const writeStorage = (
	storage: StorageLike | undefined,
	key: string,
	value: string
) => {
	try {
		storage?.setItem(key, value);
	} catch {
		// Storage can be unavailable in strict privacy modes. The SDK keeps
		// tracking with in-memory identifiers for this page load.
	}
};

const createRandomId = (cryptoImpl: VirentBrowserEnvironment["crypto"]) => {
	if (typeof cryptoImpl?.randomUUID === "function") {
		return `vnt_${cryptoImpl.randomUUID()}`;
	}

	if (typeof cryptoImpl?.getRandomValues === "function") {
		const bytes = new Uint8Array(randomIdByteLength);
		cryptoImpl.getRandomValues(bytes);

		return `vnt_${Array.from(bytes, (byte) =>
			byte.toString(16).padStart(2, "0")
		).join("")}`;
	}

	return `vnt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const getVisitorId = ({
	crypto,
	localStorage,
}: Pick<VirentBrowserEnvironment, "crypto" | "localStorage">) => {
	const existingVisitorId = readStorage(localStorage, visitorStorageKey);

	if (existingVisitorId) {
		return existingVisitorId;
	}

	const visitorId = createRandomId(crypto);
	writeStorage(localStorage, visitorStorageKey, visitorId);

	return visitorId;
};

const getSessionId = ({
	crypto,
	now,
	sessionStorage,
	sessionTimeoutMs,
}: {
	crypto: VirentBrowserEnvironment["crypto"];
	now: Date;
	sessionStorage: StorageLike | undefined;
	sessionTimeoutMs: number;
}) => {
	const previousSessionId = readStorage(sessionStorage, sessionStorageKey);
	const previousLastSeen = Number(
		readStorage(sessionStorage, sessionLastSeenStorageKey) ?? 0
	);
	const shouldReuseSession =
		previousSessionId &&
		Number.isFinite(previousLastSeen) &&
		now.getTime() - previousLastSeen <= sessionTimeoutMs;
	const sessionId = shouldReuseSession
		? previousSessionId
		: createRandomId(crypto);

	writeStorage(sessionStorage, sessionStorageKey, sessionId);
	writeStorage(
		sessionStorage,
		sessionLastSeenStorageKey,
		String(now.getTime())
	);

	return sessionId;
};

const normalizeTimestamp = (
	timestamp: Date | string | undefined,
	now: Date
) => {
	if (timestamp instanceof Date) {
		return timestamp.toISOString();
	}

	if (typeof timestamp === "string") {
		return timestamp;
	}

	return now.toISOString();
};

const getUrl = (
	inputUrl: string | undefined,
	location: VirentBrowserEnvironment["location"]
) => inputUrl ?? location?.href ?? null;

const getReferrer = (
	inputReferrer: string | null | undefined,
	documentReferrer: string | undefined
) => {
	if (inputReferrer === null) {
		return;
	}

	const referrer = inputReferrer ?? documentReferrer;

	return referrer?.trim() || undefined;
};

const getAttributionProperties = (url: URL) => {
	const attributionProperties: Record<string, string> = {};

	for (const parameterName of attributionParameterNames) {
		const value = url.searchParams.get(parameterName);

		if (value) {
			attributionProperties[parameterName] = value;
		}
	}

	return attributionProperties;
};

const getProperties = ({
	inputProperties,
	title,
	url,
}: {
	inputProperties: VirentEventProperties | undefined;
	title: string | null | undefined;
	url: URL;
}): VirentEventProperties | undefined => {
	const attributionProperties = getAttributionProperties(url);
	const properties: VirentEventProperties = {
		...attributionProperties,
		...(inputProperties ?? {}),
	};
	const trimmedTitle = title?.trim();

	if (trimmedTitle) {
		properties.title = trimmedTitle;
	}

	return Object.keys(properties).length > 0 ? properties : undefined;
};

const isPlainObject = (value: object) => {
	const prototype = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
};

const isJsonValue = (value: unknown, depth = 0): value is VirentJsonValue => {
	if (depth > eventPropertiesMaximumDepth) {
		return false;
	}

	if (value === null) {
		return true;
	}

	if (typeof value === "string" || typeof value === "boolean") {
		return true;
	}

	if (typeof value === "number") {
		return Number.isFinite(value);
	}

	if (Array.isArray(value)) {
		return (
			value.length <= eventPropertiesMaximumEntries &&
			value.every((entry) => isJsonValue(entry, depth + 1))
		);
	}

	if (typeof value === "object" && value !== null && isPlainObject(value)) {
		const entries = Object.entries(value);

		return (
			entries.length <= eventPropertiesMaximumEntries &&
			entries.every(
				([key, entry]) =>
					key.trim().length > 0 &&
					key.length <= idMaximumLength &&
					isJsonValue(entry, depth + 1)
			)
		);
	}

	return false;
};

const validateProperties = (properties: VirentEventProperties | undefined) => {
	if (properties === undefined) {
		return null;
	}

	if (!isPlainObject(properties)) {
		return "invalid-properties";
	}

	if (!isJsonValue(properties)) {
		return "invalid-properties";
	}

	if (JSON.stringify(properties).length > eventPropertiesMaximumBytes) {
		return "properties-too-large";
	}

	return null;
};

const validatePageviewEvent = (event: VirentPageviewEvent) => {
	const occurredAt = new Date(event.timestamp);

	if (Number.isNaN(occurredAt.getTime())) {
		return "invalid-timestamp";
	}

	if (!event.path.trim() || event.path.length > pathMaximumLength) {
		return "invalid-path";
	}

	if (event.url.length > urlMaximumLength) {
		return "invalid-url";
	}

	if (
		!event.event_id.trim() ||
		event.event_id.length > idMaximumLength ||
		!event.visitorId.trim() ||
		event.visitorId.length > idMaximumLength ||
		!event.sessionId.trim() ||
		event.sessionId.length > idMaximumLength
	) {
		return "invalid-identifiers";
	}

	return validateProperties(event.properties);
};

const validateOptionalField = (
	value: string | undefined,
	maximumLength: number
) => {
	if (value === undefined) {
		return null;
	}

	return value.trim().length > 0 && value.length <= maximumLength
		? null
		: "invalid-event-metadata";
};

const validateCustomEvent = (event: VirentCustomEvent) => {
	const occurredAt = new Date(event.timestamp);

	if (Number.isNaN(occurredAt.getTime())) {
		return "invalid-timestamp";
	}

	if (!event.name.trim() || event.name.length > eventNameMaximumLength) {
		return "invalid-event-name";
	}

	if (
		!event.event_id.trim() ||
		event.event_id.length > idMaximumLength ||
		!event.visitorId.trim() ||
		event.visitorId.length > idMaximumLength ||
		!event.sessionId.trim() ||
		event.sessionId.length > idMaximumLength
	) {
		return "invalid-identifiers";
	}

	const invalidMetadata =
		validateOptionalField(event.contentId, contentIdMaximumLength) ??
		validateOptionalField(event.idempotencyKey, idempotencyKeyMaximumLength);

	if (invalidMetadata) {
		return invalidMetadata;
	}

	return validateProperties(event.properties);
};

const createPageviewEvent = (
	input: VirentPageviewInput,
	options: Required<Pick<VirentBrowserOptions, "sessionTimeoutMs">> &
		VirentBrowserEnvironment
):
	| { event: VirentPageviewEvent; error: null }
	| { event: null; error: string } => {
	const now = input.timestamp instanceof Date ? input.timestamp : new Date();
	const rawUrl = getUrl(input.url, options.location);

	if (!rawUrl) {
		return {
			error: "missing-url",
			event: null,
		};
	}

	let parsedUrl: URL;

	try {
		parsedUrl = new URL(rawUrl);
	} catch {
		return {
			error: "invalid-url",
			event: null,
		};
	}

	const event: VirentPageviewEvent = {
		event_id: input.eventId?.trim() || createRandomId(options.crypto),
		hostname: parsedUrl.hostname,
		path: input.path?.trim() || parsedUrl.pathname || "/",
		properties: getProperties({
			inputProperties: input.properties,
			title: input.title ?? options.document?.title,
			url: parsedUrl,
		}),
		referrer: getReferrer(input.referrer, options.document?.referrer),
		sessionId: getSessionId({
			crypto: options.crypto,
			now,
			sessionStorage: options.sessionStorage,
			sessionTimeoutMs: options.sessionTimeoutMs,
		}),
		timestamp: normalizeTimestamp(input.timestamp, now),
		type: "pageview",
		url: parsedUrl.toString(),
		visitorId: getVisitorId({
			crypto: options.crypto,
			localStorage: options.localStorage,
		}),
	};
	const validationError = validatePageviewEvent(event);

	if (validationError) {
		return {
			error: validationError,
			event: null,
		};
	}

	return {
		error: null,
		event,
	};
};

const createCustomEvent = (
	input: VirentCustomEventInput,
	options: Required<Pick<VirentBrowserOptions, "sessionTimeoutMs">> &
		VirentBrowserEnvironment
):
	| { event: VirentCustomEvent; error: null }
	| { event: null; error: string } => {
	const now = input.timestamp instanceof Date ? input.timestamp : new Date();
	const event: VirentCustomEvent = {
		contentId: input.contentId?.trim() || undefined,
		event_id:
			input.eventId?.trim() ||
			input.idempotencyKey?.trim() ||
			createRandomId(options.crypto),
		idempotencyKey: input.idempotencyKey?.trim() || undefined,
		name: input.name.trim(),
		properties: input.properties,
		referrer: getReferrer(input.referrer, options.document?.referrer),
		sessionId: getSessionId({
			crypto: options.crypto,
			now,
			sessionStorage: options.sessionStorage,
			sessionTimeoutMs: options.sessionTimeoutMs,
		}),
		timestamp: normalizeTimestamp(input.timestamp, now),
		type: "event",
		visitorId: getVisitorId({
			crypto: options.crypto,
			localStorage: options.localStorage,
		}),
	};
	const validationError = validateCustomEvent(event);

	if (validationError) {
		return {
			error: validationError,
			event: null,
		};
	}

	return {
		error: null,
		event,
	};
};

const createIdentifyPayload = (
	input: VirentIdentifyInput,
	options: Pick<VirentBrowserEnvironment, "crypto" | "localStorage">
):
	| { error: null; payload: VirentIdentifyPayload }
	| { error: string; payload: null } => {
	const visitorId =
		input.visitorId?.trim() ||
		getVisitorId({
			crypto: options.crypto,
			localStorage: options.localStorage,
		});
	const payload: VirentIdentifyPayload = {
		traits: input.traits,
		userId: input.userId.trim(),
		visitorId,
		websiteId: input.websiteId?.trim() || undefined,
	};

	if (
		!payload.userId ||
		payload.userId.length > idMaximumLength ||
		!payload.visitorId ||
		payload.visitorId.length > idMaximumLength
	) {
		return {
			error: "invalid-identifiers",
			payload: null,
		};
	}

	const traitsError = validateProperties(payload.traits);

	if (traitsError) {
		return {
			error: traitsError,
			payload: null,
		};
	}

	return {
		error: null,
		payload,
	};
};

const createGoalPayload = (
	input: VirentGoalInput,
	options: Pick<VirentBrowserEnvironment, "crypto" | "localStorage">
):
	| { error: null; payload: VirentGoalPayload }
	| { error: string; payload: null } => {
	const now = input.timestamp instanceof Date ? input.timestamp : new Date();
	const eventId =
		input.eventId?.trim() ||
		input.idempotencyKey?.trim() ||
		createRandomId(options.crypto);
	const visitorId =
		input.visitorId?.trim() ||
		getVisitorId({
			crypto: options.crypto,
			localStorage: options.localStorage,
		});
	const payload: VirentGoalPayload = {
		eventId,
		idempotencyKey: input.idempotencyKey?.trim() || undefined,
		name: input.name.trim(),
		timestamp: normalizeTimestamp(input.timestamp, now),
		visitorId,
	};
	const occurredAt = new Date(payload.timestamp);

	if (Number.isNaN(occurredAt.getTime())) {
		return {
			error: "invalid-timestamp",
			payload: null,
		};
	}

	if (!payload.name || payload.name.length > eventNameMaximumLength) {
		return {
			error: "invalid-goal-name",
			payload: null,
		};
	}

	if (
		!payload.eventId ||
		payload.eventId.length > idempotencyKeyMaximumLength ||
		!payload.visitorId ||
		payload.visitorId.length > idMaximumLength
	) {
		return {
			error: "invalid-identifiers",
			payload: null,
		};
	}

	const invalidMetadata = validateOptionalField(
		payload.idempotencyKey,
		idempotencyKeyMaximumLength
	);

	if (invalidMetadata) {
		return {
			error: invalidMetadata,
			payload: null,
		};
	}

	return {
		error: null,
		payload,
	};
};

const sendJsonPayload = async <TPayload>({
	endpoint,
	fetchImpl,
	payload,
	readAcceptedFlag,
	requestFailureReason,
	writeKey,
}: {
	endpoint: string;
	fetchImpl: FetchLike | undefined;
	payload: TPayload;
	readAcceptedFlag?: boolean;
	requestFailureReason: string;
	writeKey: string | undefined;
}): Promise<{
	accepted: boolean;
	duplicate?: boolean;
	payload?: TPayload;
	reason?: string;
	status?: number;
}> => {
	if (!writeKey?.trim()) {
		return {
			accepted: false,
			reason: "missing-write-key",
		};
	}

	if (!fetchImpl) {
		return {
			accepted: false,
			reason: "missing-fetch",
		};
	}

	try {
		const response = await fetchImpl(endpoint, {
			body: JSON.stringify(payload),
			headers: {
				"Content-Type": "application/json",
				"x-api-key": writeKey.trim(),
			},
			method: "POST",
		});

		if (!response.ok) {
			return {
				accepted: false,
				payload,
				reason: await response.text(),
				status: response.status,
			};
		}

		if (readAcceptedFlag) {
			const responsePayload: unknown = await response
				.clone()
				.json()
				.catch(() => null);

			if (
				typeof responsePayload === "object" &&
				responsePayload !== null &&
				"accepted" in responsePayload &&
				typeof responsePayload.accepted === "boolean"
			) {
				return {
					accepted: responsePayload.accepted,
					duplicate:
						"duplicate" in responsePayload &&
						typeof responsePayload.duplicate === "boolean"
							? responsePayload.duplicate
							: undefined,
					payload,
					status: response.status,
				};
			}
		}

		return {
			accepted: true,
			payload,
			status: response.status,
		};
	} catch (error) {
		return {
			accepted: false,
			payload,
			reason: error instanceof Error ? error.message : requestFailureReason,
		};
	}
};

const sendIngestEvent = async <
	TEvent extends VirentCustomEvent | VirentPageviewEvent,
>({
	endpoint,
	event,
	fetchImpl,
	writeKey,
}: {
	endpoint: string;
	event: TEvent;
	fetchImpl: FetchLike | undefined;
	writeKey: string | undefined;
}): Promise<{
	accepted: boolean;
	payload?: TEvent;
	reason?: string;
	status?: number;
}> => {
	const result = await sendJsonPayload({
		endpoint,
		fetchImpl,
		payload: {
			events: [event],
		},
		requestFailureReason: "ingest-request-failed",
		writeKey,
	});

	return {
		accepted: result.accepted,
		payload: event,
		reason: result.reason,
		status: result.status,
	};
};

export const createVirentBrowserClient = (
	options: VirentBrowserOptions
): VirentBrowserClient => {
	const environment = {
		...getGlobalEnvironment(),
		...options,
	};
	const endpoint = options.endpoint ?? getDefaultEndpoint(environment.location);
	const identifyEndpoint =
		options.identifyEndpoint ?? getRelatedEndpoint(endpoint, "/v1/identify");
	const goalEndpoint =
		options.goalEndpoint ?? getRelatedEndpoint(endpoint, "/v1/track/goal");
	const fetchImpl = environment.fetch;
	const sessionTimeoutMs = options.sessionTimeoutMs ?? defaultSessionTimeoutMs;

	return {
		async identify(input) {
			const identifyPayload = createIdentifyPayload(input, environment);

			if (!identifyPayload.payload) {
				return {
					accepted: false,
					reason: identifyPayload.error,
				};
			}

			return await sendJsonPayload({
				endpoint: identifyEndpoint,
				fetchImpl,
				payload: identifyPayload.payload,
				requestFailureReason: "identify-request-failed",
				writeKey: options.writeKey,
			});
		},
		async pageview(input = {}) {
			const pageviewEvent = createPageviewEvent(input, {
				...environment,
				sessionTimeoutMs,
			});

			if (!pageviewEvent.event) {
				return {
					accepted: false,
					reason: pageviewEvent.error,
				};
			}

			return await sendIngestEvent({
				endpoint,
				event: pageviewEvent.event,
				fetchImpl,
				writeKey: options.writeKey,
			});
		},
		async trackEvent(input) {
			const customEvent = createCustomEvent(input, {
				...environment,
				sessionTimeoutMs,
			});

			if (!customEvent.event) {
				return {
					accepted: false,
					reason: customEvent.error,
				};
			}

			return await sendIngestEvent({
				endpoint,
				event: customEvent.event,
				fetchImpl,
				writeKey: options.writeKey,
			});
		},
		async trackGoal(input) {
			const goalPayload = createGoalPayload(input, environment);

			if (!goalPayload.payload) {
				return {
					accepted: false,
					reason: goalPayload.error,
				};
			}

			return await sendJsonPayload({
				endpoint: goalEndpoint,
				fetchImpl,
				payload: goalPayload.payload,
				readAcceptedFlag: true,
				requestFailureReason: "goal-request-failed",
				writeKey: options.writeKey,
			});
		},
	};
};

export const initVirent = (
	options: VirentBrowserOptions
): VirentBrowserClient => {
	activeClient = createVirentBrowserClient(options);

	if (options.autoPageviews ?? true) {
		activeClient.pageview().catch(() => undefined);
	}

	return activeClient;
};

export const pageview = (input?: VirentPageviewInput) => {
	if (!activeClient) {
		return Promise.resolve({
			accepted: false,
			reason: "not-initialized",
		} satisfies TrackPageviewResult);
	}

	return activeClient.pageview(input);
};

export const identify = (input: VirentIdentifyInput) => {
	if (!activeClient) {
		return Promise.resolve({
			accepted: false,
			reason: "not-initialized",
		} satisfies IdentifyResult);
	}

	return activeClient.identify(input);
};

export const trackEvent = (input: VirentCustomEventInput) => {
	if (!activeClient) {
		return Promise.resolve({
			accepted: false,
			reason: "not-initialized",
		} satisfies TrackCustomEventResult);
	}

	return activeClient.trackEvent(input);
};

export const trackGoal = (input: VirentGoalInput) => {
	if (!activeClient) {
		return Promise.resolve({
			accepted: false,
			reason: "not-initialized",
		} satisfies TrackGoalResult);
	}

	return activeClient.trackGoal(input);
};

export const resetVirent = () => {
	activeClient = null;
};
