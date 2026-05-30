# SDK Publishing

This public repository is generated from `packages/sdk` in the private Virent monorepo. Do not hand-edit SDK source here; make changes in the monorepo and run `bun --filter @virent.app/sdk mirror:public`.

Releases are staged from GitHub Actions through npm Trusted Publishing. Configure npm with publisher `GitHub Actions`, organization/user `virent-app`, repository `sdk`, workflow filename `publish-sdk.yml`, environment `npm-publish`, and only the `Allow npm stage publish` action.

Release flow:

1. Commit the generated mirror.
2. Tag the mirror with the matching package version, for example `vX.Y.Z`.
3. Push the tag to run the publish workflow.
4. Review the staged tarball on npm.
5. Approve the staged package with a 2FA-enabled maintainer account.

Keep package publishing access set to require 2FA and disallow traditional tokens. Trusted Publishing automatically creates provenance for public packages built from this public repository.
