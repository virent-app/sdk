# @virent.app/sdk

Virent SDK for browser-side human analytics and server-side AI crawler
analytics.

## Install

```bash
npm install @virent.app/sdk
```

Use the documented subpath imports to keep client bundles small:

- `@virent.app/sdk/browser` for browser analytics.
- `@virent.app/sdk/server` for framework-independent bot tracking.
- `@virent.app/sdk/next` for Next.js bot tracking.
- `@virent.app/sdk/elysia` for Elysia bot tracking.

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
	siteId: "site_...",
	writeKey: "vha_sk_...",
	trackMode: "ai-crawlers",
});
```

`trackMode` defaults to `"bots"`, which skips browser-like human requests and
sends known or generic bot requests. Use `"ai-crawlers"` when you only want
AI/LLM crawler telemetry in Virent.

## Elysia Bot Tracking

```ts
import { Elysia } from "elysia";
import { createVirentElysiaBotPlugin } from "@virent.app/sdk/elysia";

export const app = new Elysia().use(
	createVirentElysiaBotPlugin({
		siteId: "site_...",
		writeKey: "vha_sk_...",
		trackMode: "ai-crawlers",
	})
);
```

## Exports

- `@virent.app/sdk/browser`: browser pageview, event, identify, and goal
  tracking.
- `@virent.app/sdk/server`: framework-independent bot request tracking.
- `@virent.app/sdk/next`: Next.js proxy helper for bot tracking.
- `@virent.app/sdk/elysia`: Elysia plugin for bot tracking.

## Support

For SDK support, email virent.app@gmail.com.

## License

Apache-2.0
