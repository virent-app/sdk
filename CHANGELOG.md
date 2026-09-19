# Changelog

## 0.2.0 (prepared, not published)

Behavior change: omitting `trackMode` forwards eligible GET/HEAD page requests
for Virent's central classification. The previous default filtered bots locally.
Explicit `bots` and `ai-crawlers` remain available, but can miss new identifiers.

Privacy protections now apply in every mode: strip query strings, URL fragments
and credentials, referrers, city/region and non-allowlisted headers. Never collect
request bodies, cookies or authorization. Assets and internal paths are excluded.
Country and page pathname remain; configure your framework matcher to exclude
private paths whose names contain sensitive information.

Existing applications should upgrade the SDK and remove their custom telemetry
sanitizer and explicit `trackMode`. Preserve locale routing and background
execution. For Quantum retain the stage endpoint configuration.

Release order:

1. Deploy Virent's central classifier and inbound sanitization.
2. Build/test and publish SDK 0.2.0 through the public SDK release process.
3. Upgrade the consumer's package and lockfile to 0.2.0.
4. Remove the workaround only after the installed version is verified.
5. Verify an accepted ingest receipt, not just the website HTTP status.

No registry/token npm publication is performed by building or packing this source.
