# npm release process

Lightning Accounts publishes to the public npm registry through GitHub Actions
trusted publishing. The approved tarball committed under `.release/` is the
release trust boundary: the workflow publishes those exact bytes and never
rebuilds the package during the publish job.

The workflow does not create Git tags or GitHub Releases.

## One-time npm configuration

In the `lightning-accounts` package settings on npm, configure this trusted
publisher:

- Provider: GitHub Actions
- Organization or user: `jfrader`
- Repository: `lightning-accounts`
- Workflow filename: `publish-npm.yml`
- Environment: none
- Allowed action: `npm publish`

The filename is case-sensitive and must be entered without the
`.github/workflows/` prefix.

After the first successful OIDC release, set npm publishing access to require
2FA and disallow traditional write tokens, then revoke any obsolete automation
tokens.

## Current migration release

`lightning-accounts@7.0.0` was already published before trusted publishing was
configured. Its exact registry tarball is committed as
`.release/lightning-accounts-7.0.0.tgz`.

The first workflow run verified that the registry had the same integrity and
exited successfully without republishing. Provenance cannot be added to an
existing npm version. Version `7.0.1` is the first release prepared for trusted
publishing; it also restores the original 2022 MIT copyright notice that was
present when the project was forked.

## Preparing a new release

1. Start from the current `master` and choose an unused semantic version.
2. Update `package.json` to that version and install with the exact Node and
   Yarn versions declared by `.nvmrc` and `package.json`.
3. Run the complete validation:

   ```sh
   yarn install --frozen-lockfile
   yarn lint
   yarn prettier
   NODE_ENV=test \
     NODE_ORIGIN=http://localhost:3000 \
     DATABASE_URL='postgresql://ci:ci@localhost:5432/ci?schema=public' \
     JWT_SECRET=ci-jwt-secret \
     JWT_BASE64_PUBLIC_KEY=Y2ktcHVibGljLWtleQ== \
     JWT_BASE64_PRIVATE_KEY=Y2ktcHJpdmF0ZS1rZXk= \
     SEED_HASH_SECRET=ci-seed-secret \
     WALLET_ENABLED=0 \
     yarn test:unit
   yarn build
   yarn security:audit
   ```

4. Generate the client package output before packing. `npm pack` does not run
   `prepublishOnly`:

   ```sh
   yarn swagger:generate
   mkdir -p .release
   npx --yes npm@11.18.0 pack \
     --ignore-scripts \
     --pack-destination .release \
     --json
   ```

5. Inspect the reported file list. The package should contain only the intended
   public client files, license, README, and package metadata. Record the
   integrity reported by `npm pack` and calculate the artifact SHA-256:

   ```sh
   sha256sum .release/lightning-accounts-X.Y.Z.tgz
   tar -tzf .release/lightning-accounts-X.Y.Z.tgz
   ```

6. Update these version-specific values in
   `.github/workflows/publish-npm.yml`:
   - `concurrency.group`
   - `ARTIFACT`
   - `PACKAGE_SPEC`
   - `EXPECTED_SHA256`
   - `EXPECTED_INTEGRITY`

7. Commit the source, generated output, approved artifact, and workflow update
   together. Review the artifact before merging to `master`.
8. A push to `master` runs the workflow. It fails closed on a registry error or
   an existing version with different integrity, publishes only on npm `E404`,
   and verifies the published integrity afterward.
9. Verify npm provenance and consumers before tagging the exact release commit.

Do not run `npm publish` locally. Do not reuse an npm version, replace an
already-approved artifact, or update only the workflow hashes without reviewing
the tarball contents.
