<p align="center"><strong>GAZAN</strong></p>
<p align="center">Interactive backend project generator for Node.js</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen">
</p>

GAZAN is a CLI that asks a short series of questions about the backend you want — module
system, language, architecture, database, auth, infrastructure — and generates a complete,
runnable Express project from the answers. Nothing you don't select gets generated: no unused
dependencies, no dead directories, no disabled-feature code paths.

```bash
npx gazan-init init
```

## Why GAZAN?

Most "backend starter" templates are frozen snapshots: one language, one database, one
architecture, and you delete what you don't need. GAZAN generates the project *from* your
choices instead, so the result only ever contains what you asked for — and the generator itself
is tested against dozens of real configuration combinations, not just the default one.

It is not a repository-layer framework, an ORM, or a runtime library your generated project
depends on. Once generated, the project is a plain Express app with no reference back to GAZAN.

## Features

- **CommonJS or ES Modules**, **JavaScript or TypeScript** — correct syntax, extensions, and
  `tsconfig.json`/`package.json` wiring for whichever combination you pick.
- **MVC or HMVC** architecture, with or without a `src/` directory.
- **PostgreSQL + Prisma**, **MongoDB + Mongoose**, **MongoDB (native driver)**, or no database.
- **`entity.json`** — an optional schema file that, when provided, generates real Prisma models
  or Mongoose schemas plus matching Zod validators, services, controllers, and routes.
- **Redis, BullMQ, Socket.IO** — each generated only when selected, sharing one Redis connection.
- **Authentication** — email/password (bcrypt), JWT, refresh tokens; OAuth is a documented stub
  (see [Authentication](#authentication)).
- **Module aliases** (`@/services/x` instead of `../../services/x`) — optional, generated for
  whichever directories your configuration actually produces, and wired to actually resolve at
  runtime for every module system / language combination (see [Module Aliases](#module-aliases)).
- **Security baseline** — Helmet, CORS, request validation (Zod), rate limiting (in-memory or
  Redis-backed), centralized error handling, environment validation at startup, graceful shutdown,
  and automatic stripping of password/secret-like fields from API responses.
- **No repository layer.** Services talk to the database directly:
  `Route → Controller → Service → Database`.

## Supported stack

| Concern | Options |
|---|---|
| Module system | CommonJS, ES Modules |
| Language | JavaScript, TypeScript |
| Architecture | MVC, HMVC |
| Database | PostgreSQL + Prisma, MongoDB + Mongoose, MongoDB (native driver), none |
| Infrastructure | Redis, BullMQ, Socket.IO |
| Authentication | Email/password, JWT, refresh tokens, OAuth (stub) |
| Module aliases | Optional, on by default |

## Installation

```bash
npx gazan-init init
```

Or install the CLI globally:

```bash
npm install -g gazan-init
gazan init
```

From a local clone:

```bash
git clone git@github.com:korveniq/Gazan.git
cd Gazan
npm install
node bin/gazan.js init
```

Requires **Node.js 18 or later** — `gazan` checks this itself at startup and exits with a clear
message if your Node version is too old.

## Quick start

```bash
node bin/gazan.js init
```

GAZAN asks its questions in order, then generates the project:

```text
┌  GAZAN — backend project initializer
│
◇  Project name
│  my-api
│
◇  Which module system do you want?
│  ES Modules (MJS)
│
◇  Which language do you want?
│  TypeScript
│
◇  Do you want to enable module/path aliases? (e.g. @/services/x instead of ../../services/x)
│  Yes
│
◇  Which database do you want?
│  PostgreSQL + Prisma
│
◇  Which architecture do you want?
│  MVC
│
◇  Use src/ directory?
│  Yes
│
◇  Do you need Socket.IO?
│  No
│
◇  Do you need BullMQ workers?
│  No
│
◇  Use Redis for rate limiting? (No = in-memory rate limiting)
│  No
│
◇  Do you need authentication?
│  Yes
│
◇  Which authentication methods?
│  JWT
│
◇  Do you have an entity.json file?
│  No
│
└  Configuration collected.

✔ Project structure created
✔ Environment & error handling configured
✔ Security middleware configured
✔ Database configured
✔ Redis configured
✔ BullMQ configured
✔ Socket.IO configured
✔ Authentication configured
✔ Entity models generated
✔ Module aliases configured
✔ README generated

Project initialized successfully.

Next steps:

  cd my-api
  npm install
  npm run dev
```

If the target directory already has content in it (beyond a stray `.git`), GAZAN asks before
touching anything — see [Existing directories](#existing-directories).

## Generated project structure

**MVC**, with `src/`, PostgreSQL + Prisma, Redis, and aliases enabled:

```text
my-api/
├── src/
│   ├── controllers/
│   ├── routes/
│   │   └── index.js
│   ├── services/
│   ├── validators/
│   ├── middlewares/
│   │   ├── error-handler.js
│   │   ├── not-found.js
│   │   ├── rate-limit.js
│   │   └── validate.js
│   ├── helpers/
│   │   ├── env.js
│   │   └── errors.js
│   ├── utils/
│   │   ├── shutdown.js
│   │   └── validate-env.js
│   ├── configs/
│   │   ├── db/
│   │   └── redis/
│   ├── app.js
│   └── server.js
├── prisma/
│   └── schema.prisma
├── jsconfig.json
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

`workers/` only exists when BullMQ is enabled, `socket/` only when Socket.IO is enabled,
`prisma/` only for PostgreSQL + Prisma, `models/` only for MongoDB + Mongoose, `tsconfig.json`
only for TypeScript, and `jsconfig.json` / `alias-loader.mjs` only when aliases are enabled (see
[Module Aliases](#module-aliases) for which files appear for which module system).

**HMVC** groups `controllers/routes/services/validators` per entity instead of by layer:

```text
src/
├── modules/
│   ├── user/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   └── validators/
│   └── post/
│       ├── controllers/
│       ├── routes/
│       ├── services/
│       └── validators/
├── routes/
│   └── index.js        # aggregates every module's router
├── middlewares/
├── helpers/
├── utils/
└── configs/
```

## Architecture

Both architectures follow the same request flow — **there is no repository layer**:

```text
MVC:   Route  →  Controller  →  Service  →  Database
HMVC:  Module Route  →  Module Controller  →  Module Service  →  Database
```

Controllers and services are classes. A controller is constructed with a service instance
(dependency injection) and contains no business logic; a service is the only thing that talks to
the database. Routes stay thin — they wire a validator and a controller method together and
nothing else.

## `entity.json`

An optional JSON file you can point GAZAN at during `init`. When provided, it becomes the source
of truth for generated database models, Zod validators, services, controllers, and routes — one
CRUD endpoint set per model (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`), mounted
under `/api/<pluralized-model-name>`.

```text
entity.json → Entity Parser (schema + semantic validation) → Normalized Entity Model → Database Generator
```

Invalid files fail with precise, field-level errors — not a bare "invalid JSON":

```text
models[1].relations.author.model:
  unknown model 'Userr'. Did you mean 'User'?
```

### Basic example

```json
{
  "models": [
    {
      "name": "User",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true },
        "email": { "type": "string", "required": true, "unique": true },
        "age": { "type": "integer" }
      }
    }
  ]
}
```

### Realistic example

A blog-shaped schema exercising UUID primary keys, an enum, unique + indexed fields, a nullable
optional relation, a one-to-many, and a many-to-many:

```json
{
  "models": [
    {
      "name": "Role",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true, "unique": true }
      }
    },
    {
      "name": "User",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true, "length": 120 },
        "email": { "type": "string", "required": true, "unique": true, "index": true },
        "passwordHash": { "type": "string", "required": true },
        "roleId": { "type": "uuid", "required": true }
      },
      "relations": {
        "role": { "type": "belongsTo", "model": "Role", "foreignKey": "roleId" }
      }
    },
    {
      "name": "Category",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true, "unique": true }
      }
    },
    {
      "name": "Tag",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "name": { "type": "string", "required": true, "unique": true }
      },
      "relations": {
        "posts": { "type": "belongsToMany", "model": "Post", "through": "PostTag" }
      }
    },
    {
      "name": "Post",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "title": { "type": "string", "required": true, "length": 200, "index": true },
        "slug": { "type": "string", "required": true, "unique": true },
        "body": { "type": "text", "required": false, "nullable": true },
        "status": { "type": "enum", "values": ["DRAFT", "PUBLISHED", "ARCHIVED"], "default": "DRAFT", "required": true },
        "published": { "type": "boolean", "default": false, "required": true },
        "authorId": { "type": "uuid", "required": true },
        "categoryId": { "type": "uuid", "required": false, "nullable": true }
      },
      "relations": {
        "author": { "type": "belongsTo", "model": "User", "foreignKey": "authorId" },
        "category": { "type": "belongsTo", "model": "Category", "foreignKey": "categoryId" },
        "comments": { "type": "hasMany", "model": "Comment", "foreignKey": "postId" },
        "tags": { "type": "belongsToMany", "model": "Tag", "through": "PostTag" }
      }
    },
    {
      "name": "Comment",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "body": { "type": "text", "required": true },
        "postId": { "type": "uuid", "required": true },
        "authorId": { "type": "uuid", "required": true }
      },
      "relations": {
        "post": { "type": "belongsTo", "model": "Post", "foreignKey": "postId" },
        "author": { "type": "belongsTo", "model": "User", "foreignKey": "authorId" }
      }
    }
  ]
}
```

Both examples above are copy-pasteable and are exercised directly by GAZAN's own test suite
against both Prisma and Mongoose.

### Field types

| Type | Description | PostgreSQL (Prisma) | MongoDB (Mongoose) |
|---|---|---|---|
| `string` | Short text | `String` | `String` |
| `text` | Long text | `String` | `String` |
| `number` | Generic number | `Float` | `Number` |
| `integer` | Whole number | `Int` | `Number` |
| `float` | Floating point | `Float` | `Number` |
| `boolean` | True/false | `Boolean` | `Boolean` |
| `date` | Calendar date | `DateTime` | `Date` |
| `datetime` | Date + time | `DateTime` | `Date` |
| `uuid` | UUID string | `String` (`@default(uuid())` when `default: "uuid"`) | `String` |
| `json` | Arbitrary JSON | `Json` | `Mixed` |
| `enum` | Fixed set of values (needs `values`) | Generated Prisma `enum` | `String` with a schema-level enum validator |
| `decimal` | Fixed-precision number | `Decimal` | `Decimal128` |
| `bigint` | Large integer | `BigInt` | `Mixed` (Mongoose has no dedicated bigint type) |

**MongoDB primary keys must be `uuid` or omitted.** Every model's primary key is routed through
Mongo's native `_id` rather than a redundant parallel field; GAZAN generates a UUID string default
for it. A primary key of any other type (or `autoIncrement`, which Mongo has no native equivalent
for) is rejected at validation time rather than silently approximated.

### Field attributes

| Attribute | Meaning |
|---|---|
| `required` | Field must be present; cannot be combined with `nullable: true`. |
| `nullable` | Column/field may be `null`. Not allowed on a `primaryKey` field. |
| `unique` | Unique constraint (`@unique` in Prisma, `unique: true` in Mongoose). |
| `index` | Single-column index (`@@index` in Prisma, `index: true` in Mongoose). |
| `default` | Default value. `"uuid"` is a sentinel meaning "generate one"; `"now"` on a `date`/`datetime` field means `now()`. |
| `primaryKey` | Marks the primary key. At most one per model. |
| `autoIncrement` | Postgres/Prisma only (`integer`/`bigint`); rejected for MongoDB. |
| `length` | Max string length (`@db.VarChar(n)` in Prisma, `maxlength` in Mongoose). |
| `min` / `max` | Numeric bounds, enforced in the generated Zod validator (and Mongoose `min`/`max`). |
| `values` | Required for `type: "enum"` — the list of allowed values. |

### Relations

Four relation types, declared under a model's `relations` object:

```json
{
  "models": [
    {
      "name": "Post",
      "fields": {
        "authorId": { "type": "uuid", "required": true }
      },
      "relations": {
        "author": { "type": "belongsTo", "model": "User", "foreignKey": "authorId" }
      }
    }
  ]
}
```

- **`belongsTo`** — this model holds the foreign key (`foreignKey` required).
- **`hasMany`** / **`hasOne`** — the *other* model holds the foreign key (`foreignKey` required).
  You only need to declare this when you want to name or customize the reverse side yourself —
  GAZAN auto-derives a reverse array field for any `belongsTo` that doesn't have one, including
  disambiguating multiple relations to the same model and self-relations.
- **`belongsToMany`** — many-to-many (`through` required, naming the join). **Both models must
  declare it, with a matching `through` value** — a one-sided declaration is rejected at
  validation time rather than silently generating a broken schema.

**Many-to-many is schema-only.** `belongsToMany` is correctly represented in the generated Prisma
schema (implicit join table) and Mongoose model (array of refs on both sides), but the generated
CRUD `create`/`update` endpoints do not read or write it — Prisma's nested-write shape
(`connect: [...]`) and Mongoose's plain array differ enough that GAZAN doesn't attempt a one-size
implementation. Manage join-table writes through your own service code.

## Database support

| Mode | Notes |
|---|---|
| PostgreSQL + Prisma | `prisma/schema.prisma` generated from `entity.json` (or a starter model if none is given, so `prisma generate` works immediately). |
| MongoDB + Mongoose | Models under `src/models/`, `_id`-based primary keys (see above). |
| MongoDB (native driver) | No Mongoose — a thin `MongoClient` wrapper with a duplicate-connect guard. |
| None | No database code, no DB dependency, no `DATABASE_URL`/`MONGODB_URI` requirement. |

## Authentication

Selected independently — only what you pick is generated:

| Method | What's generated |
|---|---|
| Email/password | `helpers/bcrypt.js` (`hashPassword`/`comparePassword`) |
| JWT | `helpers/jwt.js` (`signAccessToken`/`verifyAccessToken`) + `middlewares/auth.js` |
| Refresh tokens | Adds `signRefreshToken`/`verifyRefreshToken` to `helpers/jwt.js` |
| OAuth | **Stub only** — see below |

> **OAuth is currently a documented integration stub.** GAZAN scaffolds
> `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`/`OAUTH_CALLBACK_URL` env vars and a
> `helpers/oauth.stub.*` file that documents what to build and throws if called — it does not
> provide a complete, provider-specific OAuth flow. No OAuth client library is installed. GAZAN
> prints an explicit warning about this after generation.

Password/secret/hash-like fields declared in `entity.json` (matching `/password|secret|hash/i`)
are automatically stripped from every generated CRUD response, regardless of database backend.

## Module aliases

Optional (on by default) — generated from whichever directories your specific configuration
actually produces, never for a feature you didn't enable.

**MVC**, PostgreSQL + Redis + Socket.IO + BullMQ:

```text
@             → src
@controllers  → src/controllers
@services     → src/services
@routes       → src/routes
@validators   → src/validators
@middlewares  → src/middlewares
@utils        → src/utils
@helpers      → src/helpers
@configs      → src/configs
@db           → src/configs/db
@redis        → src/configs/redis
@socket       → src/socket
@workers      → src/workers
```

```ts
import { prisma } from '@db/index';
import { UserService } from '@services/user.service';
```

**HMVC** additionally gets one alias per entity model (pluralized, pointing at that model's real
module directory — e.g. a `User` model's module lives at `src/modules/user/`, aliased as
`@users`):

```text
@         → src
@users    → src/modules/user
@posts    → src/modules/post
@comments → src/modules/comment
```

```ts
import { UserService } from '@users/services/user.service';
```

If a model's pluralized name would collide with a reserved alias (e.g. a model literally named
`Service`), generation fails with a clear error rather than silently misresolving imports.

**How aliases actually resolve at runtime** — this differs by module system, and GAZAN picks the
mechanism for you:

| Config | Dev | Build / start |
|---|---|---|
| TypeScript (CJS or MJS) | `tsx` resolves `tsconfig.json` `paths` natively | `tsc && tsc-alias` rewrites aliases to relative paths in the compiled output |
| JavaScript + CJS | `module-alias` (registered as the first line of `server.js`, reading `_moduleAliases` from `package.json`) | same |
| JavaScript + ESM (MJS) | A generated `alias-loader.mjs`, registered via `node --experimental-loader=./alias-loader.mjs` (already wired into `npm run dev` / `npm start`) | same |

A `jsconfig.json` is also generated for JS projects so editors get alias-aware intellisense — it
has no effect on how the project actually runs. If you decline aliases, none of this is
generated and every import is a plain relative path, exactly as before this feature existed.

## Environment variables

Only variables the selected features actually need are generated, into `.env` (with working local
defaults) and `.env.example` (a template):

```env
# Application (always)
NODE_ENV=development
PORT=3000
CORS_ORIGIN=*

# Database (only one of these, depending on selection)
DATABASE_URL=
MONGODB_URI=

# Redis (only if Redis is needed)
REDIS_URL=

# Auth — JWT / refresh tokens (only if selected)
JWT_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d

# Auth — OAuth (only if selected; stub — see Authentication)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_CALLBACK_URL=
```

Validated at startup with Zod (`utils/validate-env.js`) — the app refuses to boot with a missing
or malformed required variable instead of failing confusingly later.

## Generated project commands

```bash
npm install
npm run dev      # tsx watch (TS) or node --watch (JS)
npm run build     # TypeScript only: tsc [&& tsc-alias if aliases are enabled]
npm start          # node dist/server.js (TS) or node src/server.js (JS)
```

If PostgreSQL + Prisma was selected:

```bash
npm run db:generate   # regenerate the Prisma client
npm run db:migrate    # run dev migrations
npm run db:push       # push schema without a migration
npm run db:studio     # open Prisma Studio
```

Every generated project exposes `GET /health` → `{ "success": true, "data": { "status": "ok" } }`,
a centralized 404 handler, and a centralized error handler.

## Configuration examples

**A — Modern TypeScript API**: ESM, TypeScript, MVC, `src/`, PostgreSQL + Prisma, Redis, BullMQ,
Socket.IO, JWT, aliases, `entity.json`. Produces the full MVC tree shown above plus `workers/`,
`socket/`, `middlewares/auth.js`, and `prisma/schema.prisma` generated from your entities.

**B — Lightweight JavaScript API**: CommonJS, JavaScript, MVC, no `src/`, MongoDB + Mongoose, no
Redis/BullMQ/Socket.IO/auth. Produces a minimal flat tree (`controllers/`, `routes/`, `services/`,
`validators/`, `middlewares/`, `helpers/`, `utils/`, `configs/db/` at the project root) with only
`express`, `mongoose`, and the always-on security/validation dependencies.

**C — Modular backend**: ESM, TypeScript, HMVC, PostgreSQL + Prisma, aliases, `entity.json`.
Produces the HMVC tree shown above, one `@<model>` alias per entity, and per-module CRUD wired
through `src/routes/index.js`.

## Security

- Helmet, CORS (`CORS_ORIGIN`; a startup warning fires if it's still `*` in production)
- Zod validation on every write route, before the controller runs
- Rate limiting — in-memory by default, Redis-backed (`rate-limit-redis`) when selected or when
  BullMQ is enabled; fails closed (rejects requests) rather than silently going unlimited if
  Redis-backed and Redis is unreachable
- bcrypt password hashing, centralized (never duplicated into controllers)
- Centralized HTTP error handling — stack traces are only ever included in a `development`
  response, never in `production`
- Environment validation at startup (Zod) — required variables must be present and well-formed
- Graceful shutdown — HTTP server → Socket.IO → BullMQ → Redis → database, in order, each awaited
- Automatic stripping of password/secret/hash-like fields from generated API responses
- Generation-time safety: a non-empty target directory is never silently overwritten, HMVC module
  names are validated against reserved-alias collisions, and generation happens into a temporary
  directory first, only copied into place once it fully succeeds

> GAZAN generates a backend *foundation*. Application-specific security requirements — threat
> modeling, auth flow correctness, secrets management, dependency audits, and so on — still need
> to be reviewed and implemented by the project owner.

## CLI reference

```bash
gazan --help       # command list and usage
gazan --version     # installed GAZAN version
gazan init            # interactively generate a new backend project
```

There is currently no `gazan generate <resource>` (incremental regeneration into an existing
project) — see [Limitations](#project-status--limitations).

## Generated project lifecycle

```text
Install GAZAN
      ↓
gazan init
      ↓
Answer the prompts (optionally pointing at an entity.json)
      ↓
GAZAN normalizes your answers into one configuration object
      ↓
GAZAN generates the project (into a temp dir, then copies it into place on success)
      ↓
cd <project> && npm install
      ↓
Configure .env
      ↓
Run migrations / database setup as appropriate (e.g. npm run db:migrate)
      ↓
npm run dev
```

GAZAN does not run migrations, seed data, or otherwise touch a live database during generation —
it only writes files.

## Development

Working on GAZAN itself:

```bash
git clone git@github.com:korveniq/Gazan.git
cd Gazan
npm install
npm test
node bin/gazan.js init     # run the generator locally against a scratch directory
```

## Testing

`npm test` runs `tests/run.js`, an end-to-end suite that generates real projects (into
`.test-scratch/`, gitignored) and validates them with the actual toolchain — `npm install`,
`tsc --noEmit`, `prisma validate`/`prisma generate`, and for a representative subset, actually
booting the server and checking `/health` plus the absence of module-resolution errors — not just
static inspection of the generated text.

The matrix covers, in combination: CJS/MJS, JS/TS, MVC/HMVC, `src`/no-`src`, PostgreSQL+Prisma,
MongoDB+Mongoose, MongoDB (native), no database, Redis (with and without BullMQ), BullMQ,
Socket.IO, each authentication method in isolation, module aliases (across every module
system/language combination, MVC and HMVC), and `entity.json` schemas including self-relations,
dual foreign keys to the same model, many-to-many, and a six-model realistic schema.

## Troubleshooting

**Node.js version** — GAZAN requires Node 18+ (see `engines` in `package.json`) and checks this
itself at startup, exiting with a clear message on older versions.

**Permission errors installing globally** — prefer `npx gazan-init init` over
`npm install -g gazan-init` if you hit `EACCES` or similar; it avoids global install
permissions entirely.

**`entity.json` errors** — invalid entity definitions are rejected with field-level validation
errors (see [entity.json](#entityjson)) before any files are generated, not partway through.

**Database connection during generation** — generation itself never requires a live database;
it only produces schema/config files. `npm run db:migrate` (Prisma) or connecting your generated
app does.

**Existing directories** — if the target directory has content in it, GAZAN asks you to cancel,
continue (existing files may be overwritten), or choose another directory. A directory containing
only a stray `.git` is still treated as empty.

## Project status / limitations

- **OAuth is a stub** (env vars + a documented `throw`, not a working provider integration).
- **Many-to-many CRUD writes aren't automatic** — the relation is schema-correct but generated
  services don't read/write it (see [Relations](#relations)).
- **No incremental `gazan generate model`** — only full `gazan init`.
- **No live-database round-trip tests** in this repository's own test suite (no Postgres/Mongo/
  Redis instance in CI/sandbox) — tests verify schema validity, compilation, and that the app
  boots and fails at the *expected* connection boundary, not full data round-trips.
- **Composite (multi-field) unique constraints/indexes** aren't representable in `entity.json`'s
  current per-field-only shape.
- entity.json has no per-model way to require authentication on generated routes — wire
  `middlewares/auth.js` into a generated route file yourself if you need that.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
npm test
```

Keep changes scoped — GAZAN's generators are composable and conditional by design; a new feature
should follow the same pattern (only generate what's selected, single source of truth for shared
config, no duplicated logic across CJS/MJS/JS/TS variants).

## License

[MIT](./LICENSE)
