# Repository Notes

- `yarn build` must use `tsconfig.build.json`. Keep Jest types in `tsconfig.test.json`, not `tsconfig.json`.
- `Dockerfile` is for dev/test. `Dockerfile.prod` is for production and is used by `docker-compose.prod.yml`.
- Docker builds run Swagger generation, which imports app config. Keep build-time defaults wired for `DATABASE_URL`, `NODE_ORIGIN`, `JWT_SECRET`, `JWT_BASE64_PUBLIC_KEY`, `JWT_BASE64_PRIVATE_KEY`, and `SEED_HASH_SECRET`.
- Before moving packages between `dependencies` and `devDependencies`, check whether `yarn build` inside `Dockerfile.prod` needs them.
- Behind nginx, set `NODE_TRUSTED_PROXY_IP` to the proxy IP or CIDR so `req.ip` and rate limiting work correctly.
- Use `yarn audit --groups dependencies` for production-relevant security checks.
