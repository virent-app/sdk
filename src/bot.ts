export const botFamilyValues = [
	"openai",
	"anthropic",
	"perplexity",
	"google",
	"deepseek",
	"common-crawler",
	"apple",
	"bytedance",
	"meta",
	"amazon",
	"duckduckgo",
	"you",
	"unknown",
] as const;

export type BotFamily = (typeof botFamilyValues)[number];

export const botConfidenceValues = ["low", "medium", "high"] as const;

export type BotConfidence = (typeof botConfidenceValues)[number];

export const botProviderValues = botFamilyValues;

export type BotProvider = (typeof botProviderValues)[number];

export const botCrawlerTypeValues = [
	"answer_engine",
	"ai_training",
	"ai_search",
	"generic_bot",
	"link_preview",
	"search_indexer",
	"unknown",
] as const;

export type BotCrawlerType = (typeof botCrawlerTypeValues)[number];

export const botClassificationStateValues = [
	"known",
	"generic",
	"unknown",
] as const;

export type BotClassificationState =
	(typeof botClassificationStateValues)[number];

export interface BotTaxonomyCrawler {
	confidence: BotConfidence;
	crawlerType: BotCrawlerType;
	examples: readonly string[];
	isAiCrawler: boolean;
	name: string;
	patterns: readonly RegExp[];
}

export interface BotTaxonomyEntry {
	crawlers: readonly BotTaxonomyCrawler[];
	family: BotFamily;
	provider: BotProvider;
}

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

export interface BotRule {
	action?: BotRuleAction;
	confidence?: BotConfidence;
	crawlerType?: BotCrawlerType;
	family: BotFamily;
	isAiCrawler?: boolean;
	name: string;
	pattern: RegExp;
	provider?: BotProvider;
}

export type BotRuleInput = Omit<BotRule, "pattern"> & {
	pattern: RegExp | string;
};

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

const genericBotPattern =
	/(bot|crawler|spider|slurp|fetcher|preview|scrape|indexer|archiver)/i;

const ipHashLength = 32;

export const botCrawlerTaxonomy = [
	{
		family: "openai",
		provider: "openai",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: [
					"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
				],
				isAiCrawler: true,
				name: "GPTBot",
				patterns: [/GPTBot/i],
			},
			{
				confidence: "high",
				crawlerType: "ai_search",
				examples: [
					"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
				],
				isAiCrawler: true,
				name: "OAI-SearchBot",
				patterns: [/OAI-SearchBot/i],
			},
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: ["ChatGPT-User/1.0 (+https://openai.com/bot)"],
				isAiCrawler: true,
				name: "ChatGPT-User",
				patterns: [/ChatGPT-User/i],
			},
		],
	},
	{
		family: "anthropic",
		provider: "anthropic",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: ["ClaudeBot/1.0 (+claudebot@anthropic.com)"],
				isAiCrawler: true,
				name: "ClaudeBot",
				patterns: [/ClaudeBot/i],
			},
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: ["Claude-User/1.0"],
				isAiCrawler: true,
				name: "Claude-User",
				patterns: [/Claude-User/i],
			},
			{
				confidence: "high",
				crawlerType: "ai_search",
				examples: ["Claude-SearchBot/1.0"],
				isAiCrawler: true,
				name: "Claude-SearchBot",
				patterns: [/Claude-SearchBot/i],
			},
		],
	},
	{
		family: "perplexity",
		provider: "perplexity",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: [
					"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
				],
				isAiCrawler: true,
				name: "PerplexityBot",
				patterns: [/PerplexityBot/i],
			},
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: ["Perplexity-User/1.0"],
				isAiCrawler: true,
				name: "Perplexity-User",
				patterns: [/Perplexity-User/i],
			},
		],
	},
	{
		family: "google",
		provider: "google",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "search_indexer",
				examples: [
					"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
				],
				isAiCrawler: false,
				name: "Googlebot",
				patterns: [/Googlebot/i],
			},
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: [
					"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Google-Extended; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers",
				],
				isAiCrawler: true,
				name: "Google-Extended",
				patterns: [/Google-Extended/i],
			},
		],
	},
	{
		family: "deepseek",
		provider: "deepseek",
		crawlers: [
			{
				confidence: "medium",
				crawlerType: "answer_engine",
				examples: ["DeepSeekBot/1.0 (+https://www.deepseek.com/)"],
				isAiCrawler: true,
				name: "DeepSeekBot",
				patterns: [/DeepSeekBot/i, /DeepSeekSpider/i],
			},
		],
	},
	{
		family: "common-crawler",
		provider: "common-crawler",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: ["CCBot/2.0 (https://commoncrawl.org/faq/)"],
				isAiCrawler: true,
				name: "CCBot",
				patterns: [/CCBot/i],
			},
		],
	},
	{
		family: "apple",
		provider: "apple",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: ["Applebot/0.1; +http://www.apple.com/go/applebot"],
				isAiCrawler: true,
				name: "Applebot",
				patterns: [/Applebot/i],
			},
		],
	},
	{
		family: "bytedance",
		provider: "bytedance",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: ["Bytespider; spider-feedback@bytedance.com"],
				isAiCrawler: true,
				name: "Bytespider",
				patterns: [/Bytespider/i],
			},
		],
	},
	{
		family: "meta",
		provider: "meta",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: [
					"meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
				],
				isAiCrawler: true,
				name: "meta-externalagent",
				patterns: [/meta-externalagent/i],
			},
			{
				confidence: "high",
				crawlerType: "link_preview",
				examples: [
					"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
				],
				isAiCrawler: false,
				name: "facebookexternalhit",
				patterns: [/facebookexternalhit/i],
			},
		],
	},
	{
		family: "amazon",
		provider: "amazon",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "ai_training",
				examples: [
					"Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot",
				],
				isAiCrawler: true,
				name: "Amazonbot",
				patterns: [/Amazonbot/i],
			},
		],
	},
	{
		family: "duckduckgo",
		provider: "duckduckgo",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: [
					"DuckAssistBot/1.0; (+https://duckduckgo.com/duckassistbot)",
				],
				isAiCrawler: true,
				name: "DuckAssistBot",
				patterns: [/DuckAssistBot/i],
			},
		],
	},
	{
		family: "you",
		provider: "you",
		crawlers: [
			{
				confidence: "high",
				crawlerType: "answer_engine",
				examples: ["YouBot/1.0; +https://about.you.com/youbot/"],
				isAiCrawler: true,
				name: "YouBot",
				patterns: [/YouBot/i],
			},
		],
	},
] as const satisfies readonly BotTaxonomyEntry[];

export const genericBotTaxonomy = {
	classificationState: "generic",
	confidence: "medium",
	crawlerType: "generic_bot",
	family: "unknown",
	isAiCrawler: false,
	matchReason: "generic-bot-token",
	name: null,
	provider: "unknown",
} as const;

export const unknownBotTaxonomy = {
	classificationState: "unknown",
	confidence: "low",
	crawlerType: "unknown",
	family: "unknown",
	isAiCrawler: false,
	name: null,
	provider: "unknown",
} as const;

const aiCrawlerFamilies = new Set<BotFamily>(
	botCrawlerTaxonomy
		.filter((entry) => entry.crawlers.some((crawler) => crawler.isAiCrawler))
		.map((entry) => entry.family)
);

const taxonomyByFamily: ReadonlyMap<BotFamily, BotTaxonomyEntry> = new Map(
	botCrawlerTaxonomy.map((entry) => [entry.family, entry])
);

const getProviderForFamily = (family: BotFamily) =>
	taxonomyByFamily.get(family)?.provider ?? "unknown";

const getFallbackCrawlerType = ({
	isAiCrawler,
	isBot,
}: {
	isAiCrawler: boolean;
	isBot: boolean;
}): BotCrawlerType => {
	if (isAiCrawler) {
		return "ai_search";
	}

	return isBot ? "generic_bot" : "unknown";
};

export const defaultBotRules: readonly BotRule[] = botCrawlerTaxonomy.flatMap(
	(entry) =>
		entry.crawlers.flatMap((crawler) =>
			crawler.patterns.map((pattern) => ({
				confidence: crawler.confidence,
				crawlerType: crawler.crawlerType,
				family: entry.family,
				isAiCrawler: crawler.isAiCrawler,
				name: crawler.name,
				pattern,
				provider: entry.provider,
			}))
		)
);

const emptyClassification = (reason: string): BotClassification => ({
	classificationState: unknownBotTaxonomy.classificationState,
	confidence: unknownBotTaxonomy.confidence,
	crawlerType: unknownBotTaxonomy.crawlerType,
	family: unknownBotTaxonomy.family,
	isAiCrawler: unknownBotTaxonomy.isAiCrawler,
	isBot: false,
	matchReason: [reason],
	name: unknownBotTaxonomy.name,
	provider: unknownBotTaxonomy.provider,
});

const normalizeRule = (rule: BotRuleInput): BotRule | null => {
	if (rule.pattern instanceof RegExp) {
		return {
			...rule,
			pattern: rule.pattern,
		};
	}

	try {
		return {
			...rule,
			pattern: new RegExp(rule.pattern, "i"),
		};
	} catch {
		return null;
	}
};

const normalizeRules = (rules: readonly BotRuleInput[] | undefined) =>
	(rules ?? [])
		.map((rule) => normalizeRule(rule))
		.filter((rule): rule is BotRule => rule !== null);

const getRuleMatchReason = (rule: BotRule) =>
	`${rule.action ?? "classify"}:${rule.family}:${rule.name}`;

const classifyFromRule = (
	rule: BotRule,
	userAgent: string,
	confidence: BotConfidence
): BotClassification | null => {
	if (!rule.pattern.test(userAgent)) {
		return null;
	}

	const matchReason = getRuleMatchReason(rule);

	if (rule.action === "allow") {
		return {
			classificationState: "unknown",
			confidence: rule.confidence ?? "high",
			crawlerType: "unknown",
			family: "unknown",
			isAiCrawler: false,
			isBot: false,
			matchReason: [matchReason],
			name: null,
			provider: "unknown",
		};
	}

	const isAiCrawler = rule.isAiCrawler ?? aiCrawlerFamilies.has(rule.family);
	const isBot = true;

	if (rule.action === "deny") {
		return {
			classificationState: "known",
			confidence: rule.confidence ?? "high",
			crawlerType:
				rule.crawlerType ?? getFallbackCrawlerType({ isAiCrawler, isBot }),
			family: rule.family,
			isAiCrawler,
			isBot,
			matchReason: [matchReason],
			name: rule.name,
			provider: rule.provider ?? getProviderForFamily(rule.family),
		};
	}

	return {
		classificationState: "known",
		confidence: rule.confidence ?? confidence,
		crawlerType:
			rule.crawlerType ?? getFallbackCrawlerType({ isAiCrawler, isBot }),
		family: rule.family,
		isAiCrawler,
		isBot,
		matchReason: [matchReason],
		name: rule.name,
		provider: rule.provider ?? getProviderForFamily(rule.family),
	};
};

const classifyWithRules = (
	userAgent: string,
	rules: readonly BotRule[],
	confidence: BotConfidence
) => {
	for (const rule of rules) {
		const classification = classifyFromRule(rule, userAgent, confidence);

		if (classification) {
			return classification;
		}
	}

	return null;
};

export const classifyBotUserAgent = (
	userAgent: string | null | undefined,
	options: ClassifyBotOptions = {}
): BotClassification => {
	const normalizedUserAgent = userAgent?.trim();

	if (!normalizedUserAgent) {
		return emptyClassification("empty-user-agent");
	}

	const allowlistClassification = classifyWithRules(
		normalizedUserAgent,
		normalizeRules(options.allowlistRules).map((rule) => ({
			...rule,
			action: "allow",
		})),
		"high"
	);

	if (allowlistClassification) {
		return allowlistClassification;
	}

	const denylistClassification = classifyWithRules(
		normalizedUserAgent,
		normalizeRules(options.denylistRules).map((rule) => ({
			...rule,
			action: "deny",
		})),
		"high"
	);

	if (denylistClassification) {
		return denylistClassification;
	}

	const customClassification = classifyWithRules(
		normalizedUserAgent,
		normalizeRules(options.customRules),
		"high"
	);

	if (customClassification) {
		return customClassification;
	}

	const defaultClassification = classifyWithRules(
		normalizedUserAgent,
		defaultBotRules,
		"high"
	);

	if (defaultClassification) {
		return defaultClassification;
	}

	if (genericBotPattern.test(normalizedUserAgent)) {
		return {
			classificationState: genericBotTaxonomy.classificationState,
			confidence: genericBotTaxonomy.confidence,
			crawlerType: genericBotTaxonomy.crawlerType,
			family: genericBotTaxonomy.family,
			isAiCrawler: genericBotTaxonomy.isAiCrawler,
			isBot: true,
			matchReason: [genericBotTaxonomy.matchReason],
			name: genericBotTaxonomy.name,
			provider: genericBotTaxonomy.provider,
		};
	}

	return emptyClassification("no-rule-match");
};

const toHex = (bytes: Uint8Array) => {
	let output = "";

	for (const byte of bytes) {
		output += byte.toString(16).padStart(2, "0");
	}

	return output;
};

export const hashIpAddress = async (
	ipAddress: string | null | undefined,
	salt = ""
) => {
	const normalizedIpAddress = ipAddress?.trim().toLowerCase();

	if (!normalizedIpAddress) {
		return null;
	}

	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${salt}:${normalizedIpAddress}`)
	);

	return toHex(new Uint8Array(digest)).slice(0, ipHashLength);
};
