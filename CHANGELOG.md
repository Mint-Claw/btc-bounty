# Changelog

## [0.3.0] - 2026-03-31

### Added
- **Dynamic OG image cards** for individual bounty pages (title, sats, status badge)
- **Dynamic OG metadata** via `generateMetadata()` on `/bounty/[id]` routes
- **Dynamic sitemap** includes all cached bounty pages for SEO
- **Dynamic robots.txt** with correct domain-specific sitemap URL
- **Agent API E2E tests** (11 Playwright tests for auth, public endpoints, NIP-89)
- **CITADEL deployment scripts** (`deploy-citadel.sh`, `deploy-remote.sh`)
- **Post-bounty CLI helper** (`scripts/post-bounty.sh` for API-based bounty creation)
- **Agent API docs** in README with curl examples
- **CORS X-API-Key support** for cross-origin agent calls

### Fixed
- CORS `Access-Control-Allow-Headers` missing `X-API-Key` (would block agent API from browsers)
- `robots.txt` sitemap URL was hardcoded to vercel domain

### Stats
- 445 unit tests, 51 E2E tests (496 total)
- Build: zero warnings

## [0.2.0] - 2026-03-21

### Added
- **Zod-based input validation** for all API endpoints (CreateBounty, UpdateStatus, SubmitWork)
- **Rate limiting middleware** (60 req/min per IP, in-memory sliding window)
- **CORS + security headers** (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- **Standardized error handling** (ApiError class, withErrorHandler wrapper)
- **Bounty lifecycle integration tests** (create → transitions → validation)
- **BTCPay webhook handler tests** (7 cases)
- **Middleware tests** (4 cases: rate limiting, CORS, preflight, security headers)
- **Validation tests** (20 cases: schema validation, edge cases)
- **Seed data script** for local development
- **Smoke test script** for deployment verification
- **Version endpoint** (`GET /api/version`)
- Docker deployment config (Dockerfile, docker-compose.yml)

### Changed
- BountyStatus uses uppercase values ("OPEN", "COMPLETED", "CANCELLED")
- Build now succeeds with zero lint warnings

### Fixed
- 7 type/casing errors blocking `next build`
- setState-in-effect warnings
- Unused import warnings

## [0.1.0] - 2026-03-01

### Added
- Initial release
- Nostr-based bounty creation and management
- BTCPay Server integration for escrow
- SQLite database for local state
- 17 API routes
- Relay health monitoring
