# @virent.app/sdk

Virent SDK for browser-side human analytics and server-side AI crawler
analytics.

## Install

```bash
npm install @virent.app/sdk@^0.2.0
```

Use the documented subpath imports to keep client bundles small:

- `@virent.app/sdk/browser` for browser analytics.
- `@virent.app/sdk/server` for framework-independent bot tracking.
- `@virent.app/sdk/next` for Next.js bot tracking.

## Browser Tracking

```ts
import { identify, initVirent, trackEvent, trackGoal } from "@virent.app/sdk/browser";

initVirent({
	writeKey: "vha_pk_...",
});

trackEvent({
	name: "signup_form_started",
	properties: {
		plan: "business",
	},
});

identify({
	userId: "customer_user_123",
});

trackGoal({
	eventId: "checkout_123",
	name: "signup_completed",
});
```

## Next.js Bot Tracking

```ts
import { createVirentBotProxy } from "@virent.app/sdk/next";

export const proxy = createVirentBotProxy({
	siteId: process.env.VIRENT_SITE_ID,
	writeKey: process.env.VIRENT_INGEST_SECRET,
});
```

Since 0.2.0, the default sends eligible GET/HEAD page requests to Virent for
central classification. No `trackMode` or sanitization code is needed.
Assets and internal routes are skipped. Queries, URL credentials, fragments,
referrers, cookies, authorization headers, bodies, city and region are never sent.
Only allowlisted headers are sent. Paths and user agents remain necessary for
analytics; exclude private routes in your framework matcher if they contain
sensitive identifiers. Country is retained; IP hashing requires explicit proxy trust.
Non-AI requests are discarded by Virent before bot-log storage or billing.
The broader default increases ingestion traffic and is a behavioral change from
0.1.x. Explicit `"bots"` and `"ai-crawlers"` modes remain supported but filter
locally and may miss newly recognized agents. Privacy protections apply in every mode.
Use the endpoint supplied by your Virent installation guide when testing staging.

## First-Party Analytics (Next.js)

Privacy tools often block analytics scripts served from a third-party host,
which silently undercounts visits. Serve the browser script and its events from
your own domain with a catch-all route, for example `app/vt/[...path]/route.ts`:

```ts
import { createVirentAnalyticsProxy } from "@virent.app/sdk/next";

export const { GET, POST } = createVirentAnalyticsProxy({
	trustedProxy: "vercel",
	writeKey: process.env.VIRENT_INGEST_SECRET,
});
```

Then load the script from that route:

```tsx
<Script
	data-api-url="/vt/event"
	data-write-key="vha_pk_..."
	src="/vt/script.js"
	strategy="afterInteractive"
/>
```

The secret `writeKey` is the same key as bot tracking. It lets Virent trust the
visitor IP and country the route forwards; without it, geography reflects your
server's location. The key stays on your server and is never sent to browsers.
Pass `origin` to use a Virent environment other than production. If a
middleware or `proxy.ts` rewrites paths (for example locale redirects), exclude
`/vt/` from it so `POST /vt/event` reaches the route unchanged.

## Exports

- `@virent.app/sdk/browser`: browser pageview, event, identify, and goal
  tracking.
- `@virent.app/sdk/server`: framework-independent bot request tracking.
- `@virent.app/sdk/next`: Next.js proxy helper for bot tracking and the
  first-party analytics route.

## Support

For SDK support, email virent.app@gmail.com.

## License

Apache-2.0
