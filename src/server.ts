import {
	classifyBotUserAgent as classifyBotUserAgentInternal,
	hashIpAddress,
} from "./bot";

export type BotFamily =
	| "amazon"
	| "anthropic"
	| "apple"
	| "bytedance"
	| "common-crawler"
	| "deepseek"
	| "duckduckgo"
	| "google"
	| "meta"
	| "openai"
	| "perplexity"
	| "unknown"
	| "you";

export type BotConfidence = "high" | "low" | "medium";

export type BotProvider = BotFamily;

export type BotCrawlerType =
	| "ai_search"
	| "ai_training"
	| "answer_engine"
	| "generic_bot"
	| "link_preview"
	| "search_indexer"
	| "unknown";

export type BotClassificationState = "generic" | "known" | "unknown";

export interface BotClassification {
	classificationState: BotClassificationState;
	confidence: BotConfidence;
	crawlerType: BotCrawlerType;
	family: BotFamily;
	isAiCrawler: boolean;
	isBot: boolean;
	matchReason: string[];
	name: string | null;
	provider: BotProvider;
}

export type BotRuleAction = "allow" | "classify" | "deny";

export interface BotRuleInput {
	action?: BotRuleAction;
	confidence?: BotConfidence;
	crawlerType?: BotCrawlerType;
	family: BotFamily;
	isAiCrawler?: boolean;
	name: string;
	pattern: RegExp | string;
	provider?: BotProvider;
}

export interface ClassifyBotOptions {
	allowlistRules?: readonly BotRuleInput[];
	customRules?: readonly BotRuleInput[];
	denylistRules?: readonly BotRuleInput[];
}

export interface BotVisitIngestPayload {
	accept?: string | null;
	acceptLanguage?: string | null;
	city?: string | null;
	classification?: BotClassification;
	country?: string | null;
	crawlRule?: string | null;
	headers?: Record<string, string>;
	host?: string | null;
	ipHash?: string | null;
	method: string;
	path: string;
	query?: Record<string, string | string[]>;
	referer?: string | null;
	region?: string | null;
	requestId?: string;
	robotsAllowed?: boolean | null;
	rulesMatched?: string[];
	siteId: string;
	statusCode?: number | null;
	timestamp?: string;
	url: string;
	userAgent?: string | null;
}

export interface VirentBotTrackerOptions {
	allowlistRules?: readonly BotRuleInput[];
	customRules?: readonly BotRuleInput[];
	denylistRules?: readonly BotRuleInput[];
	endpoint?: string;
	ipHashSalt?: string;
	siteId?: string;
	writeKey?: string;
}

export interface TrackBotRequestOptions {
	classification?: BotClassification;
	requestId?: string;
	statusCode?: number | null;
	timestamp?: Date;
}

export interface TrackBotRequestResult {
	accepted: boolean;
	duplicate?: boolean;
	reason?: string;
	status?: number;
}

export interface VirentBotTracker {
	trackRequest(
		request: Request,
		options?: TrackBotRequestOptions
	): Promise<TrackBotRequestResult>;
}

const defaultEndpoint = "https://api.virent.com/v1/ingest/bot";
const requestIdHeader = "x-request-id";
const forwardedForHeader = "x-forwarded-for";
const realIpHeader = "x-real-ip";

const getHeader = (headers: Headers, name: string) =>
	headers.get(name)?.trim() || null;

const getClientIpAddress = (headers: Headers) => {
	const forwardedFor = getHeader(headers, forwardedForHeader);

	if (forwardedFor) {
		const [firstIp] = forwardedFor.split(",");
		return firstIp?.trim() || null;
	}

	return getHeader(headers, realIpHeader);
};

const getQueryObject = (url: URL): Record<string, string | string[]> => {
	const output: Record<string, string | string[]> = {};

	for (const [key, value] of url.searchParams.entries()) {
		const existing = output[key];

		if (Array.isArray(existing)) {
			existing.push(value);
			continue;
		}

		if (existing !== undefined) {
			output[key] = [existing, value];
			continue;
		}

		output[key] = value;
	}

	return output;
};

const getSafeHeaders = (headers: Headers): Record<string, string> => {
	const output: Record<string, string> = {};
	const allowedHeaders = [
		"accept",
		"accept-language",
		"referer",
		"user-agent",
		"x-vercel-ip-city",
		"x-vercel-ip-country",
		"x-vercel-ip-country-region",
	];

	for (const header of allowedHeaders) {
		const value = getHeader(headers, header);

		if (value) {
			output[header] = value;
		}
	}

	return output;
};

const createPayload = async (
	request: Request,
	options: VirentBotTrackerOptions,
	trackOptions: TrackBotRequestOptions
): Promise<BotVisitIngestPayload> => {
	const requestUrl = new URL(request.url);
	const headers = request.headers;
	const userAgent = getHeader(headers, "user-agent");
	const classification =
		trackOptions.classification ??
		classifyBotUserAgentInternal(userAgent, {
			allowlistRules: options.allowlistRules,
			customRules: options.customRules,
			denylistRules: options.denylistRules,
		});
	const ipHash = await hashIpAddress(
		getClientIpAddress(headers),
		options.ipHashSalt ?? options.siteId ?? ""
	);

	return {
		accept: getHeader(headers, "accept"),
		acceptLanguage: getHeader(headers, "accept-language"),
		city: getHeader(headers, "x-vercel-ip-city"),
		classification,
		country: getHeader(headers, "x-vercel-ip-country"),
		headers: getSafeHeaders(headers),
		host: requestUrl.host,
		ipHash,
		method: request.method,
		path: requestUrl.pathname,
		query: getQueryObject(requestUrl),
		referer: getHeader(headers, "referer"),
		region: getHeader(headers, "x-vercel-ip-country-region"),
		requestId:
			trackOptions.requestId ??
			getHeader(headers, requestIdHeader) ??
			crypto.randomUUID(),
		rulesMatched: classification.matchReason,
		siteId: options.siteId ?? "",
		statusCode: trackOptions.statusCode ?? null,
		timestamp: (trackOptions.timestamp ?? new Date()).toISOString(),
		url: requestUrl.toString(),
		userAgent,
	};
};

const parseTrackingResponse = async (
	response: Response
): Promise<TrackBotRequestResult> => {
	const status = response.status;
	const bodyText = await response.text();

	if (!response.ok) {
		return {
			accepted: false,
			reason: bodyText || response.statusText,
			status,
		};
	}

	if (!bodyText) {
		return {
			accepted: true,
			status,
		};
	}

	try {
		const body = JSON.parse(bodyText) as {
			accepted?: unknown;
			duplicate?: unknown;
			reason?: unknown;
		};
		const accepted = typeof body.accepted === "boolean" ? body.accepted : true;
		const reason = typeof body.reason === "string" ? body.reason : undefined;
		const duplicate =
			body.duplicate === true || reason === "duplicate-request" || undefined;

		return {
			accepted,
			duplicate,
			reason,
			status,
		};
	} catch {
		return {
			accepted: true,
			status,
		};
	}
};

export const createVirentBotTracker = (
	options: VirentBotTrackerOptions
): VirentBotTracker => ({
	async trackRequest(request, trackOptions = {}) {
		if (!(options.siteId && options.writeKey)) {
			return {
				accepted: false,
				reason: "missing-site-or-write-key",
			};
		}

		const payload = await createPayload(request, options, trackOptions);
		const response = await fetch(options.endpoint ?? defaultEndpoint, {
			body: JSON.stringify(payload),
			headers: {
				Authorization: `Bearer ${options.writeKey}`,
				"Content-Type": "application/json",
			},
			method: "POST",
		});

		return parseTrackingResponse(response);
	},
});

export const classifyBotUserAgent = (
	userAgent: null | string | undefined,
	options?: ClassifyBotOptions
): BotClassification =>
	classifyBotUserAgentInternal(
		userAgent,
		options as never
	) as BotClassification;
