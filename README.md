# GAZAN

GAZAN is an interactive backend project generator. It asks a short series of architecture and
infrastructure questions, then generates a complete, immediately-runnable Express backend —
conditionally: nothing is generated for a feature you didn't ask for.

It is not a folder scaffolder. It is a backend project generator + architecture generator +
database schema generator + infrastructure generator + security-baseline generator, composed from
a normalized configuration object.

## Requirements

- **Node.js >= 18** (`bin/gazan.js` checks this at startup and fails fast with a clear message on
  older versions).

## Installation & usage

```bash
# from this repository
npm install
node bin/gazan.js init

# once published
npx gazan init
```

`gazan init` is fully interactive — it asks every question below in order, then generates the
project into `./<project-name>` (or a directory you choose, if that one already has content in it).

## The prompts

| Prompt | Choices | Stored as |
|---|---|---|
| Module system | CommonJS (CJS) / ES Modules (MJS) | `moduleSystem` |
| Language | JavaScript / TypeScript | `language` |
| Database | PostgreSQL + Prisma / MongoDB + Mongoose / MongoDB + native driver / None | `database.{type,orm}` |
| Architecture | MVC / HMVC | `architecture` |
| Use `src/`? | Yes / No | `useSrc` |
| Socket.IO? | Yes / No | `socketIO` |
| BullMQ workers? | Yes / No | `bullMQ` |
| Redis for rate limiting? | Yes / No (only asked if BullMQ is No — BullMQ already requires Redis) | `rateLimitStrategy` |
| Authentication? | Yes / No, then Email/password, JWT, OAuth, Refresh tokens (multi-select) | `authentication.{enabled,methods}` |
| entity.json? | Yes (enter a path) / No | `entityFile` |

Answers are normalized into one configuration object (`src/config/normalize.js`) that every
generator reads — generators never see raw prompt answers.

## Generated project structure

MVC, with `src/`, Postgres + Prisma, everything enabled:

```
my-app/
├── src/
│   ├── controllers/          # thin, class-based, DI'd with a service
│   ├── routes/                # thin — validate() + controller method, nothing else
│   ├── services/               # business logic + the only place that talks to the DB
│   ├── validators/             # Zod schemas, generated from entity.json
│   ├── middlewares/            # error-handler, not-found, validate, rate-limit, auth (if enabled)
│   ├── helpers/                 # env, errors, process-events, bcrypt/jwt (if enabled)
│   ├── utils/                    # validate-env, shutdown
│   ├── configs/
│   │   ├── db/                    # centralized Prisma/Mongoose/native-driver connection lifecycle
│   │   └── redis/                 # centralized ioredis client (only if Redis is needed)
│   ├── workers/                    # BullMQ queue + worker split (only if BullMQ is enabled)
│   ├── socket/                      # Socket.IO server init (only if enabled)
│   ├── app.js                        # Express app: middleware, routes, error handling
│   └── server.js                     # HTTP server + infra startup + graceful shutdown wiring
├── prisma/
│   └── schema.prisma                  # only if PostgreSQL + Prisma
├── .env / .env.example
├── .gitignore
├── package.json
└── README.md                           # documents only the features actually enabled
```

For **HMVC**, `controllers/routes/services/validators` move under `src/modules/<entity>/...` per
entity; `middlewares/helpers/utils/configs` stay shared at the top level, and a thin
`src/routes/index.js` aggregates every module's router.

Architecture rules that hold everywhere:

- **No repository layer.** `Route → Controller → Service → Database`, always.
- Controllers and services are classes; controllers are constructed with a service via
  dependency injection and contain no business logic.
- Routes never touch the database or contain conditionals beyond picking a validator.

## entity.json

Optional. When provided, it's the source of truth for generated models, Zod validators,
controllers, services, and routes.

```
entity.json → Entity Parser (Zod schema + semantic checks) → Normalized Entity Model → Database Generator
```

### Schema

```json
{
  "models": [
    {
      "name": "User",
      "tableName": "users",
      "timestamps": true,
      "crud": true,
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true },
        "email": { "type": "string", "required": true, "unique": true, "index": true },
        "age": { "type": "number", "required": false, "nullable": true }
      },
      "relations": {}
    }
  ]
}
```

**Field types:** `string`, `text`, `number`, `integer`, `float`, `boolean`, `date`, `datetime`,
`uuid`, `json`, `enum`, `decimal`, `bigint`.

**Field attributes:** `required`, `nullable`, `unique`, `index`, `default`, `primaryKey`,
`autoIncrement`, `length`, `min`, `max`, `values` (enum only).

**Relations:** `belongsTo` (needs `foreignKey`), `hasMany` / `hasOne` (needs `foreignKey`),
`belongsToMany` (needs `through`, and — see limitations — must be declared symmetrically on both
models with a matching `through`).

### Validation

Invalid entity.json fails with precise, field-level errors — never a bare "invalid JSON" unless
the file genuinely isn't parseable JSON:

```
models[1].relations.author.model:
  unknown model 'Userr'. Did you mean 'User'?
```

Checks include: duplicate/invalid/reserved model or field names (JS-reserved always; Prisma
schema keywords when the target is PostgreSQL; Mongoose Document built-ins when the target is
MongoDB), unknown relation targets (with "did you mean" suggestions), missing/mismatched foreign
keys, `primaryKey`+`nullable` and `required`+`nullable` contradictions, `autoIncrement` on a
non-integer type, enum defaults that aren't in `values`, relation names colliding with field
names, and one-sided `belongsToMany` declarations.

**MongoDB-specific:** a MongoDB primary key must be type `uuid` or omitted entirely — anything
else (including `autoIncrement`, which Mongo has no native equivalent for) is rejected outright
rather than silently mapped to something else.

## Database generation

### PostgreSQL + Prisma

Generates `prisma/schema.prisma` directly from the normalized entity model — all supported field
types, `@id`/`@default`/`@unique`, `@@index` for `index: true` fields, enums, and relations
(`belongsTo`, `hasMany`, `hasOne`, `belongsToMany`). Every relation gets a deterministic
`@relation("...")` name derived from (the model holding the foreign key, that foreign key's name)
— this is what makes self-relations, multiple relations between the same two models, and
auto-derived reverse sides (you only declare `belongsTo`; the `hasMany[]` on the other side is
added for you, unless you already declared it yourself) all work correctly instead of hitting
Prisma's "ambiguous relation" error. No entity.json still gets you a real, valid
`prisma/schema.prisma` (a starter `Example` model), so `prisma generate`/`migrate` work
immediately.

### MongoDB + Mongoose

**Primary key strategy:** every model's primary key is routed through Mongo's native `_id` —
never a redundant parallel `id` field next to it. If entity.json declares an explicit `uuid`
primary key (or omits one, which defaults to `uuid`), `_id` is overridden to a generated `String`
UUID (`default: () => randomUUID()`); TypeScript models are typed `Document<string>` to match.
`belongsTo` foreign keys are typed `String` with `ref` (not `ObjectId` — they point at another
model's `_id`, which is also a `String` here). `hasMany`/`hasOne` become populate-ready virtuals.
`belongsToMany` becomes an array-of-refs field (`{ type: [String], ref: "..." }`) on both
declaring models.

### MongoDB + native driver

No Mongoose anywhere. `configs/db/index.js` centralizes a single `MongoClient`, with a duplicate-
connect guard and a `getDb()` accessor that throws a clear error if called before `connect()`.
Generated services use the same `_id`-as-UUID-string strategy as Mongoose, with the collection
typed against a minimal `{ _id: string, [key: string]: unknown }` shape in TypeScript so the
driver's default `ObjectId`-typed `_id` doesn't fight you.

## Infrastructure

- **Redis** (`configs/redis/index.js`) is generated once, shared by whichever of BullMQ / Redis
  rate limiting needs it — nothing opens its own client.
- **BullMQ**: `workers/queue.js` (a `createQueue()` factory), `workers/example.worker.js` (a
  starter worker), `workers/index.js` (aggregates queues/workers for graceful shutdown). Enabling
  BullMQ implies Redis.
- **Socket.IO**: `socket/index.js` initializes against the raw `http.Server`, kept fully separate
  from the Express app; its shutdown is wrapped into the same graceful-shutdown flow.
- **Rate limiting**: Redis-backed (`rate-limit-redis` + the shared ioredis client) whenever BullMQ
  is enabled, or if you separately opt into it; in-memory (`express-rate-limit` alone) otherwise.
  If Redis-backed and Redis is unavailable, requests fail rather than silently falling back to
  unlimited — that's a deliberate fail-closed choice, not a bug.

## Authentication

Only the methods you select generate anything:

- **Email/password** → `helpers/bcrypt.js` (`hashPassword`/`comparePassword`; centralized, never
  duplicated into controllers).
- **JWT** and/or **Refresh tokens** → `helpers/jwt.js` (`sign/verifyAccessToken`, plus
  `sign/verifyRefreshToken` if refresh tokens are selected) and `middlewares/auth.js` (verifies
  the `Authorization: Bearer` header, attaches `req.user`).
- **OAuth is a stub.** GAZAN scaffolds `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`/
  `OAUTH_CALLBACK_URL` env vars and `helpers/oauth.stub.js` (a documented `throw`, not a working
  integration) — and prints an explicit warning after generation. "OAuth" isn't one client
  library; which provider(s) you need, their SDKs, and the redirect/callback routes are left to
  you. No OAuth dependency is installed.
- No auth selected → none of the above exist, and no auth env vars are required.

**Sensitive fields:** any entity.json field named like `password`, `secret`, or `hash` is
automatically stripped from every generated CRUD endpoint's response (create/findAll/findById/
update), via a shared `helpers/strip-sensitive-fields.js`, regardless of database backend. This is
a name-based heuristic, not a substitute for review.

## Security baseline

`helmet`, `cors` (origin from `CORS_ORIGIN`, default `*` for local dev — a startup warning fires
if `NODE_ENV=production` and it's still `*`), a rate limiter, explicit JSON/urlencoded body size
limits (1mb), centralized error handling (stack traces only ever included in a `development`
response, never in `production`), and Zod validation before every controller runs.

## Environment variables

Dynamically generated — a variable is only required if the feature that needs it is enabled
(`NODE_ENV`/`PORT`/`CORS_ORIGIN` always; `DATABASE_URL` only for Postgres; `MONGODB_URI` only for
Mongo; `REDIS_URL` only if Redis is needed; `JWT_SECRET`/`JWT_EXPIRES_IN` for JWT or refresh
tokens; `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN` for refresh tokens; `OAUTH_*` for OAuth).
Validated at startup via `utils/validate-env.js` (Zod) — the app refuses to boot with a missing or
malformed required variable rather than failing confusingly later.

## Graceful shutdown

`utils/shutdown.js` is idempotent (repeat `SIGINT`/`SIGTERM` is a no-op after the first) and only
ever touches resources that actually exist: HTTP server → Socket.IO → BullMQ workers/queues →
Redis → database, in that order, each awaited before the next starts. `helpers/process-events.js`
wires `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection` to it.

## Safety

- **Existing directories are never silently overwritten.** A non-empty target directory (ignoring
  only `.git` and `.DS_Store` — a fresh `git init` doesn't trigger this, but a stray `.env` with
  real secrets does) prompts you to cancel, continue anyway, or pick another directory.
- **Generation is atomic.** GAZAN generates into a temporary directory first and only copies into
  your target directory once generation succeeds completely — a bug or filesystem error partway
  through never leaves your project half-written.

## Commands (this repository)

```bash
npm install       # install GAZAN's own dependencies
npm test          # run the end-to-end generator test suite (see tests/run.js)
node bin/gazan.js init
```

`tests/run.js` generates real projects for a broad configuration matrix (module system × language
× database × architecture × src-or-not × auth methods × Redis/BullMQ/Socket.IO combinations × a
realistic multi-entity schema with self-relations, dual foreign keys to the same model, and a
many-to-many) into `.test-scratch/`, then actually runs `npm install`, `tsc --noEmit` (TypeScript),
and `prisma validate`/`prisma generate` (Prisma) against each one — not just static inspection.

## Known limitations

- **`belongsToMany` isn't wired into generated CRUD writes.** The relation is represented
  correctly in the generated schema/model (Prisma relation, Mongoose array-of-refs), but the
  generated Zod validators and service `create`/`update` methods don't accept or persist it —
  Prisma's nested-write shape (`connect: [...]`) differs enough from Mongoose/native's plain array
  that supporting both correctly needs per-ORM write logic this version doesn't generate. Manage
  join-table writes via your own service code.
- **OAuth is a stub** (see Authentication above) — intentionally, not an oversight.
- **Composite (multi-field) unique constraints and indexes** aren't representable in entity.json's
  current per-field-only shape.
- **A non-`uuid` MongoDB primary key** (e.g. wanting a plain incrementing integer id) is rejected
  at validation time rather than approximated — Mongo has no native auto-increment.
- **`gazan generate model X`** (incremental regeneration into an existing project) doesn't exist
  yet. The parser and generators are already decoupled from the `init` command specifically so
  this can be added later without restructuring — it just isn't built.
- entity.json has no first-class way to protect specific generated routes with authentication
  per-model; wire `middlewares/auth.js` into a generated route file yourself if you need that.

## GAZAN's own architecture

```
src/
  cli/                CLI entrypoint (commander) + the `init` command's orchestration
  prompts/            @clack/prompts interactive Q&A
  config/normalize.js raw prompt answers -> the one normalized config every generator reads
  parser/entity/       entity.json: Zod schema -> semantic validation -> normalized entity model
  generators/
    engine.js           fs primitives every generator goes through (createFile, writeJson, ...)
    syntax.js            CJS/MJS/JS/TS import & export & extension rules — the single source of
                          truth other generators lean on to avoid re-deriving these rules
    paths.js              MVC/HMVC + src/no-src directory resolution
    project.js             app.js / server.js / routes-index generation
    database/               prisma.js, mongoose.js, mongoNative.js
    features/                auth.js, redis.js, socket.js, bullmq.js
    entity/                   toPrisma.js, toMongoose.js, toZod.js, toApp.js (controller/service/
                              route/validator), sensitiveFields.js
    middlewares.js, errors.js, env.js, shutdown.js, packageJson.js, tsconfig.js, gitignore.js,
    readme.js, stripSensitiveFieldsHelper.js
    index.js                 orchestrator — composes every phase above into one `generate()`
tests/run.js            end-to-end test harness (see Commands above)
```
