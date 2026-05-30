# SDK Publishing

`packages/sdk` in the private Virent monorepo is the source of truth for SDK
development.

`https://github.com/virent-app/sdk` is the public publishing mirror used for npm
Trusted Publishing and provenance. Do not hand-edit SDK source in the public
repository. Generate it from this package instead:

```bash
bun --filter @virent.app/sdk mirror:public
```

The sync task writes a standalone public repository that can install, typecheck,
test, build, and publish without private workspace packages. It rewrites the
public `package.json` and `tsconfig.json` from monorepo metadata so npm
provenance points to a complete public source tree.

## One-Time Setup

GitHub:

- Public repository: `virent-app/sdk`
- Workflow: `.github/workflows/publish-sdk.yml`
- Protected environment: `npm-publish`
- Required reviewer for `npm-publish`: at least one Virent maintainer

npm Trusted Publisher:

- Publisher: `GitHub Actions`
- Organization or user: `virent-app`
- Repository: `sdk`
- Workflow filename: `publish-sdk.yml`
- Environment name: `npm-publish`
- Allowed actions: `Allow npm stage publish` only

npm account policy:

- Package access: public
- Package publishing access: require 2FA
- Do not use long-lived npm publish tokens for releases

## Release Flow

### 1. Validate from the monorepo

```bash
bun --filter @virent.app/sdk check-types
bun --filter @virent.app/sdk test
bun --filter @virent.app/sdk build
bun --filter @virent.app/sdk pack:dry-run
bun --filter @virent.app/sdk mirror:public
bun --filter @virent.app/sdk mirror:public:check
```

### 2. Commit and push both repositories

Private monorepo:

- Commit SDK source changes in `virent`
- Push the branch

Public mirror:

- Commit generated changes in `/Users/brunolelis/Developer/virent-sdk`
- Push `main`

### 3. Create the release tag in the public mirror

The tag must match `package.json` exactly.

```bash
cd /Users/brunolelis/Developer/virent-sdk
git tag vX.Y.Z
git push origin vX.Y.Z
```

This starts the GitHub Actions publish workflow, which:

- installs dependencies with Bun;
- verifies the tag matches `@virent.app/sdk@X.Y.Z`;
- runs `check-types`, `test`, `build`, and `pack:dry-run`;
- runs `npm stage publish --access public --tag latest --provenance`.

### 4. Manual GitHub approval

The workflow will pause at the protected `npm-publish` environment until a
reviewer approves it.

Approve in GitHub UI, or with `gh` if needed:

```bash
gh api repos/virent-app/sdk/actions/runs/<run-id>/pending_deployments
gh api repos/virent-app/sdk/actions/runs/<run-id>/pending_deployments \
  --method POST \
  -f state=approved \
  -f comment='Approve @virent.app/sdk release' \
  -F 'environment_ids[]=<environment-id>'
```

### 5. Manual npm approval

After the workflow succeeds, the package is staged on npm but not yet live on
the registry. List the staged release:

```bash
cd /Users/brunolelis/Developer/virent-sdk
/opt/homebrew/bin/npx -y npm@11.16.0 stage list @virent.app/sdk --json
```

Inspect it if needed:

```bash
/opt/homebrew/bin/npx -y npm@11.16.0 stage view <stage-id> --json
```

Approve it:

```bash
/opt/homebrew/bin/npx -y npm@11.16.0 stage approve <stage-id>
```

npm will require proof-of-presence. That approval may happen in either of these
forms:

- browser verification after npm opens an auth URL; or
- `--otp <code>` with a current 2FA authenticator code.

### 6. Verify the release

```bash
/opt/homebrew/bin/npm view @virent.app/sdk version dist-tags --json
```

Expected result after approval:

- `version` is the released version
- `dist-tags.latest` points to that same version

## Troubleshooting

`npm trust github ...` returns `E409 Conflict`:

- A Trusted Publisher entry already exists.
- Check the existing entry or update it in npm package settings instead of
  creating a duplicate.

`npm stage publish` fails with `OIDC permission denied for this action`:

- The existing Trusted Publisher entry does not allow staged publishing.
- Reconfigure the npm Trusted Publisher entry so `Allow npm stage publish` is
  enabled.

Workflow succeeds but npm `latest` still shows the old version:

- The package is staged but not yet approved.
- Run `npm stage list` and `npm stage approve`.

`npm stage approve` prompts for browser auth or OTP:

- This is expected.
- Complete the browser auth flow or rerun with `--otp <code>`.

`mirror:public:check` reports the public repo is out of sync after a local build:

- Regenerate the mirror with `bun --filter @virent.app/sdk mirror:public`.
- The checker ignores generated `dist/` and tarball artifacts, so only tracked
  source drift should remain.
