# Repository Notes

- Documentation uses plain, factual language about behavior and configuration, not sales copy.
- `yarn build` must use `tsconfig.build.json`. Keep Jest types in `tsconfig.test.json`, not `tsconfig.json`.
- `Dockerfile` is for dev/test. `Dockerfile.prod` is for production and is used by `docker-compose.prod.yml`.
- Docker builds run Swagger generation, which imports app config. Keep build-time defaults wired for `DATABASE_URL`, `NODE_ORIGIN`, `JWT_SECRET`, `JWT_BASE64_PUBLIC_KEY`, `JWT_BASE64_PRIVATE_KEY`, and `SEED_HASH_SECRET`.
- Before moving packages between `dependencies` and `devDependencies`, check whether `yarn build` inside `Dockerfile.prod` needs them.
- Behind nginx, set `NODE_TRUSTED_PROXY_IP` to the proxy IP or CIDR so `req.ip` and rate limiting work correctly.
- Run `yarn audit --groups dependencies` for production-relevant security checks. Critical and high findings on production dependencies block a release; moderate and low findings do not. CI and npm publishing parse the JSON advisories to enforce this rule and fail closed if the audit cannot be verified. Yarn Classic's raw exit code fails on any severity and is not the release gate.
