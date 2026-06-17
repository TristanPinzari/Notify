# Known Issues

Things that are noted but intentionally not fixed yet. Not bugs in the sense
of "broken," but gaps worth closing eventually.

## No rate limiting anywhere

None of the server actions (`classes.ts`, `topics.ts`, `contributions.ts`)
track call frequency per user. `createClass`, `joinClass`, `createTopic`,
`createContribution`, etc. only check auth + rank before executing — there's
no cooldown or per-user/per-IP cap.

- `createClass`/`createTopic`/`createContribution` can be spammed to fill
  tables with junk and waste DB/connection resources.
- `joinClass(code)` is a guessing oracle. Codes are 8 chars from a 32-char
  alphabet (~40 bits), so brute force isn't practical today, but nothing
  besides keyspace size prevents rapid guessing.

Fix idea: a sliding-window counter (Redis, or a Postgres table) keyed by
`userId` + action name, checked before the DB write.

## Deployment platform — not yet decided

Need: Next.js hosting, a persistent Temporal worker process (not
serverless), Temporal orchestration, Postgres, S3.

Options considered:

1. **Vercel (Next.js) + Temporal Cloud + small always-on worker host
   (Railway/Fly.io) + Neon/Supabase Postgres.** Best Next.js-specific DX
   (ISR, edge middleware, image optimization tuned for Vercel specifically).
   Temporal Cloud avoids self-hosting Temporal's server. Worker needs an
   always-on host since Vercel functions are serverless. Four providers,
   each the managed/easy version of itself.
2. **Railway or Fly.io for everything** (Next.js app + worker + Postgres on
   one provider, still + Temporal Cloud). Simpler mental model, one
   dashboard, but Next.js loses Vercel-specific optimizations running in a
   generic Node container, and it doesn't actually reduce provider count
   since Temporal Cloud is still needed either way — the app and worker
   don't share resources/deploy together, so there's limited coupling
   benefit to co-hosting them.
3. **All-in on AWS (ECS/Fargate + RDS + S3).** One cloud/IAM model, most
   control, scales well later. Meaningfully more setup (task defs,
   networking, RDS provisioning) than 1 or 2 — overkill for current stage.
4. **Single VPS (Hetzner/DigitalOcean) via Docker Compose.** Cheapest, full
   control, but all ops (patching, backups, scaling, uptime) are
   self-owned across Next.js, Postgres, Temporal server, and worker at
   once. Risky for something being demoed to people.

**Recommendation: option 1.** Gets the best version of each piece (Next.js
on its native platform, Temporal without self-hosting its server, managed
Postgres) without taking on infra ops the project doesn't need to own yet.
Doesn't block moving to option 3 later if it's outgrown.

## No ownership transfer / recovery path

A class's `"owner"` rank can only be granted at `createClass` time.
`changeUserRank` can never promote to `"owner"`, and the owner can't
`leaveClass`. If the owner's account is lost, the class has no recovery path.

## Stuck `processing` contributions need a cleanup job

If the DB is down when Temporal tries to write the final status, the workflow
fails but the contribution stays `"processing"` forever. Fix: a periodic
cleanup job that queries for contributions stuck in `"processing"` beyond a
threshold (e.g. 30 minutes), then restarts their Temporal workflow via the
client API using a new `workflowId` (e.g. `extract-${id}-retry-${Date.now()}`).
Alternatively, raise `maximumAttempts` and `maximumInterval` in the retry
policy so transient DB outages heal themselves before Temporal gives up.
