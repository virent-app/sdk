import { isIP } from "node:net";
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
	| "huawei"
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
	sourceIds: string[];
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
	sourceIds?: readonly string[];
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
	/** Defaults to all eligible page requests; Virent classifies centrally. */
	trackMode?: "ai-crawlers" | "all" | "bots";
	trustedProxy?: "development" | "none" | "vercel";
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

const defaultEndpoint = "https://virent.app/v1/ingest/bot";
const internalPathPattern = /^\/(?:api|_next|v1\/ingest)(?:\/|$)/i;
const assetPathPattern =
	/\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|map|mjs|mp3|mp4|ogg|otf|png|svg|ttf|webm|webp|woff2?)$/i;
const requestIdHeader = "x-request-id";
const getHeader = (headers: Headers, name: string) =>
	headers.get(name)?.trim() || null;

const normalizeIpAddress = (value: string | null) => {
	if (!(value && value.length <= 64 && isIP(value))) {
		return null;
	}

	return value.toLowerCase();
};

const getFirstHeaderValue = (value: string | null) =>
	value?.split(",", 1)[0]?.trim() || null;

const getClientIpAddress = (
	headers: Headers,
	trustedProxy: NonNullable<VirentBotTrackerOptions["trustedProxy"]>
) => {
	if (trustedProxy === "vercel") {
		return normalizeIpAddress(
			getFirstHeaderValue(headers.get("x-vercel-forwarded-for"))
		);
	}

	if (trustedProxy === "development") {
		return normalizeIpAddress(
			getFirstHeaderValue(headers.get("x-forwarded-for")) ??
				headers.get("x-real-ip")
		);
	}

	return null;
};

const getSafeHeaders = (headers: Headers): Record<string, string> => {
	const output: Record<string, string> = {};
	const allowedHeaders = [
		"accept",
		"accept-language",
		"user-agent",
		"x-vercel-ip-country",
	];

	for (const header of allowedHeaders) {
		const value = getHeader(headers, header);

		if (value) {
			output[header] = value;
		}
	}

	return output;
};

const shouldTrackClassification = (
	classification: BotClassification,
	mode: VirentBotTrackerOptions["trackMode"] = "all"
) => {
	if (mode === "all") {
		return true;
	}

	if (mode === "ai-crawlers") {
		return classification.isAiCrawler;
	}

	return classification.isBot;
};

const createPayload = async (
	request: Request,
	options: VirentBotTrackerOptions,
	trackOptions: TrackBotRequestOptions
): Promise<BotVisitIngestPayload> => {
	const requestUrl = new URL(request.url);
	requestUrl.search = "";
	requestUrl.hash = "";
	requestUrl.username = "";
	requestUrl.password = "";
	const { headers } = request;
	const userAgent = getHeader(headers, "user-agent");
	const classification =
		trackOptions.classification ??
		classifyBotUserAgentInternal(userAgent, {
			allowlistRules: options.allowlistRules,
			customRules: options.customRules,
			denylistRules: options.denylistRules,
		});
	const ipHash = await hashIpAddress(
		getClientIpAddress(headers, options.trustedProxy ?? "none"),
		options.ipHashSalt ?? options.siteId ?? ""
	);

	const safeHeaders = getSafeHeaders(headers);
	return {
		accept: getHeader(headers, "accept"),
		acceptLanguage: getHeader(headers, "accept-language"),
		city: null,
		classification,
		country: getHeader(headers, "x-vercel-ip-country"),
		headers: safeHeaders,
		host: requestUrl.host,
		ipHash,
		method: request.method,
		path: requestUrl.pathname,
		query: {},
		referer: null,
		region: null,
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

		const requestUrl = new URL(request.url);
		if (
			!["GET", "HEAD"].includes(request.method) ||
			internalPathPattern.test(requestUrl.pathname) ||
			assetPathPattern.test(requestUrl.pathname)
		) {
			return { accepted: false, reason: "ineligible-request" };
		}
		const userAgent = getHeader(request.headers, "user-agent");
		const classification =
			trackOptions.classification ??
			(classifyBotUserAgentInternal(userAgent, {
				allowlistRules: options.allowlistRules,
				customRules: options.customRules,
				denylistRules: options.denylistRules,
			}) as BotClassification);

		if (!shouldTrackClassification(classification, options.trackMode)) {
			return {
				accepted: false,
				reason: "not-a-bot",
			};
		}

		const payload = await createPayload(request, options, {
			...trackOptions,
			classification,
		});
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
