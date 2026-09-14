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
◇  Project name/path
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
touching anything — see **Existing directories** under [Troubleshooting](#troubleshooting).

## Project name and output path

The first prompt (`Project name/path`) answers two questions at once: **where** the project is
written, and **what it's called**. Both are derived safely with Node's `path` APIs — never by
concatenating strings — so every form below behaves predictably:

| You type | Where GAZAN generates | `package.json` `name` |
|---|---|---|
| `my-api` | `<cwd>/my-api/` (created) | `my-api` |
| `.` | **directly inside the current directory** — nothing nested | basename of the current directory |
| `./backend` | `<cwd>/backend/` | `backend` |
| `../backend` | one directory up from `<cwd>`, named `backend` | `backend` |
| `/abs/path/to/api` | that exact absolute path | `api` |

**The project name always comes from the resolved output directory's basename, not the literal
text you typed.** This is what makes `.` work correctly:

```bash
mkdir my-api
cd my-api
gazan init
```

```text
Project name/path: .
```

generates directly into `my-api/`:

```text
my-api/
├── src/
├── package.json   # { "name": "my-api", ... }
├── README.md
├── .env.example
└── ...
```

GAZAN never creates `my-api/./`, `my-api/my-api/`, or any other nested duplicate — `.` resolves
to `process.cwd()` itself (via `path.resolve`), and the *directory* GAZAN is about to write into
is what names the project, not the string that happened to be typed. This also means a directory
name that isn't a valid npm package name (uppercase letters, spaces, dots — e.g. a folder called
`My Api`) is automatically sanitized into a valid `package.json` name (`my-api`) without changing
the actual folder name on disk or the human-readable title used in the generated `README.md`.

There is currently no separate "application name" prompt distinct from the output path — if you
need `package.json`'s `name` to differ from the directory GAZAN writes into, rename the directory
(or edit `name` in the generated `package.json`) after generation.

### Current-directory safety

Selecting `.` does not bypass GAZAN's normal existing-directory safety check (see **Existing
directories** under [Troubleshooting](#troubleshooting)) — it applies identically whether the
target is a brand-new folder or the directory you're already standing in:

```text
? Current directory is not empty.
❯ Cancel
  Continue (files may be overwritten)
  Use another directory
```

Nothing is overwritten until you explicitly choose "Continue," and generation itself always
happens in a temporary directory first, only copied into place once it fully succeeds — so a
mid-generation failure never leaves your current directory partially written.

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

## How GAZAN works

Step by step, in the order the CLI actually executes them:

1. You run `gazan init` (or `npx gazan-init init` / `node bin/gazan.js init` from a clone).
2. GAZAN checks your Node.js version first and exits with a clear message if it's below 18.
3. You answer the prompts, in order: **project name/path** → **module system** (CJS/MJS) →
   **language** (JS/TS) → **module aliases** (on/off) → **database** → **architecture** (MVC/HMVC)
   → **use `src/`?** → **Socket.IO?** → **BullMQ?** → **Redis for rate limiting?** (skipped
   automatically if BullMQ is enabled, since BullMQ already requires Redis) → **authentication**
   (enabled, then which methods — multi-select) → **do you have an `entity.json`?**
4. If you answered yes to `entity.json`, GAZAN asks for its path and validates it immediately,
   right there in the prompt flow — an invalid file gives you a chance to fix the path and retry
   before anything else happens.
5. GAZAN resolves your project name/path answer into an output directory (see
   [Project name and output path](#project-name-and-output-path)) and checks it for existing
   content, asking before touching a non-empty directory.
6. Every answer is normalized into one configuration object — the single shape every generator
   reads from (generators never see raw prompt answers).
7. If an `entity.json` path was given, it's read and validated again here, against the actual
   selected database (some rules, like MongoDB's primary-key restriction, depend on which database
   you picked).
8. GAZAN generates the whole project into a temporary directory — not your real target directory
   yet.
9. The base folder skeleton, `package.json`, `.gitignore`, and (TypeScript only) `tsconfig.json`
   are written.
10. Environment validation, error classes, and graceful-shutdown scaffolding are generated.
11. Security middleware is generated — rate limiting, centralized error/not-found handlers, and
    the Zod request-validation middleware (Helmet/CORS are wired directly into `app.js`).
12. Database artifacts are generated for the selected backend — a Prisma schema, a Mongoose
    connection module, or a native MongoDB client — or nothing at all for "No database" (see
    [Database support](#database-support)).
13. Redis, BullMQ, and Socket.IO scaffolding are generated, each strictly only if you selected it.
14. Authentication helpers and middleware are generated for each method you selected.
15. If you provided an `entity.json`, its models are turned into real code: Mongoose model files
    (Prisma's models already live in the one `schema.prisma` written in step 12), Zod validators,
    services, controllers, and routes — then the aggregate routes file and the `app`/`server`
    entry files are (re)generated to wire everything together.
16. Module aliases are generated — `tsconfig.json` paths, `jsconfig.json`, `module-alias` config,
    or the ESM loader, depending on your language/module-system combination — only if aliases are
    enabled.
17. The generated project's own `README.md` is written last, reflecting exactly what was produced
    (see [Generated project README](#generated-project-structure)).
18. Only once every step above succeeds is the temporary directory copied into your real target
    directory. A failure at any point leaves that directory exactly as it was before you ran
    `gazan init`.
19. GAZAN prints a checklist of what it did, any warnings worth reading (e.g. the OAuth stub, or
    the MJS+JS experimental loader notice), and the exact next commands to run.

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

### Model definition

Every entry in `models` needs a `name` and a non-empty `fields` object:

```json
{ "name": "User", "fields": {} }
```

`name`:

- **Required**, a string.
- **Must be a valid identifier** — letters and digits only, starting with a letter
  (`/^[A-Za-z][A-Za-z0-9]*$/`). This is what actually blocks path traversal and unsafe filesystem
  paths — a name like `../User` or `User/../../etc` fails this regex before it can ever reach a
  filename (see [Invalid examples](#invalid-examples)).
- **Cannot be a JS reserved word** (`class`, `constructor`, `function`, `this`, `export`, …) or —
  for PostgreSQL/Prisma specifically — a Prisma schema keyword (`model`, `datasource`, `generator`,
  `enum`, `type`, `view`).
- **Must be unique** across the file.

**Naming conventions** — GAZAN derives every generated identifier from `name` using the same
casing rules everywhere, so `User`, `BlogPost`, and `UserProfile` normalize consistently:

| `name` | Prisma model / class | camelCase (var/service instance) | kebab-case (file names) | snake_case (table) | Table name (pluralized) | Route path (pluralized) |
|---|---|---|---|---|---|---|
| `User` | `User` | `user` | `user` | `user` | `users` | `/api/users` |
| `BlogPost` | `BlogPost` | `blogPost` | `blog-post` | `blog_post` | `blog_posts` | `/api/blog-posts` |
| `UserProfile` | `UserProfile` | `userProfile` | `user-profile` | `user_profile` | `user_profiles` | `/api/user-profiles` |

Generated file names always follow the kebab-case form: `blog-post.service.ts`,
`blog-post.controller.ts`, etc. Override the table/collection name with `tableName` if you don't
want the auto-pluralized default.

### Providing entity.json

GAZAN asks for this during `init`, after the authentication prompt:

```text
◇  Do you have an entity.json file?
│  Yes
│
◇  Enter entity.json path
│  ./entity.json
```

- **Both relative and absolute paths work.** A relative path (`./entity.json`, `entity.json`,
  `../shared/entity.json`) is resolved against the directory you ran `gazan init` from
  (`path.resolve(process.cwd(), yourInput)`), same as the project name/path prompt.
- **It's parsed and validated immediately, in the prompt itself** — not deferred to generation
  time. GAZAN reads the file, `JSON.parse`s it, runs it through the schema (structural) and then
  semantic (cross-field, cross-model) validators, and reports success or a detailed error right
  there.
- **If the file doesn't exist**, you get `No file exists at: <resolved absolute path>` and are
  asked whether to try a different path.
- **If it exists but isn't valid JSON**, you get `entity.json is not valid JSON` plus the
  underlying `JSON.parse` error message.
- **If it's valid JSON but fails schema or semantic validation**, you get every failing field
  listed with its exact path and reason (see [Invalid examples](#invalid-examples)) — never a
  single generic "invalid entity.json".
- **Retrying** — on any validation failure you're asked "Try a different path?"; declining
  continues `init` with no `entity.json` (generic CRUD scaffolding, no entities) rather than
  aborting the whole run.
- A validated `entity.json` is re-parsed once more right before generation, against the database
  you actually selected — some rules (MongoDB's primary-key restriction, for example) depend on
  which database is in play, not just the file's own contents.

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

`entity.json` supports exactly 13 field types — this list comes straight from the parser's schema
(`FIELD_TYPES` in `src/parser/entity/schema.js`); any other string is rejected before generation
even starts (see [Invalid examples](#invalid-examples)).

| Type | Description | PostgreSQL (Prisma) | MongoDB (Mongoose) | MongoDB (native driver) |
|---|---|---|---|---|
| `string` | Short text | `String` | `String` | — |
| `text` | Long text | `String` | `String` | — |
| `number` | Generic number | `Float` | `Number` | — |
| `integer` | Whole number | `Int` | `Number` | — |
| `float` | Floating point | `Float` | `Number` | — |
| `boolean` | True/false | `Boolean` | `Boolean` | — |
| `date` | Calendar date | `DateTime` | `Date` | — |
| `datetime` | Date + time | `DateTime` | `Date` | — |
| `uuid` | UUID string | `String` (`@default(uuid())` when `default: "uuid"`) | `String` | — |
| `json` | Arbitrary JSON | `Json` | `Mixed` | — |
| `enum` | Fixed set of values (needs `values`) | Generated Prisma `enum` | `String` with a schema-level enum validator | — |
| `decimal` | Fixed-precision number | `Decimal` | `Decimal128` | — |
| `bigint` | Large integer | `BigInt` | `Mixed` (Mongoose has no dedicated bigint type) | — |

**The native MongoDB driver has no schema layer at all.** `entity.json` is still validated
identically regardless of which MongoDB mode you pick, but the native-driver generator doesn't
emit a per-type mapping, model file, or field definitions — the driver returns/accepts plain JS
objects, and the generated services (see [Entity-generated application code](#entity-generated-application-code))
just read/write whatever shape you give them. Field-level constraints (`required`, `unique`,
`min`/`max`, `length`, `enum` values, …) are enforced by the generated **Zod validator** at the
route boundary either way — that part doesn't depend on the database backend.

### Primary keys

Every model has exactly one primary key — either declared explicitly with `primaryKey: true`, or
synthesized automatically if you don't declare one:

```json
"id": { "type": "uuid", "primaryKey": true, "default": "uuid" }
```

- **At most one field per model may set `primaryKey: true`** — a second one is rejected
  (`model 'X' declares more than one primaryKey field`).
- **A primary key field cannot be `nullable: true`** — rejected with
  `primary key field 'id' cannot be nullable`.
- **If no field declares `primaryKey: true`**, GAZAN synthesizes one for you: a field named `id`,
  `type: "uuid"`, `default: "uuid"`, `required: true` — the same shape as the explicit example
  above. You never need to declare a primary key by hand unless you want a different type
  (PostgreSQL only) or a different name.
- **PostgreSQL/Prisma** — any field type is allowed as a primary key; `autoIncrement: true` is
  valid on `integer`/`bigint` primary keys (`@default(autoincrement())`), and `type: "uuid"` with
  `default: "uuid"` generates `@default(uuid())`.
- **MongoDB (Mongoose or native)** — the primary key must be `type: "uuid"` **or omitted
  entirely** (falling back to the synthesized UUID `id` above). Every Mongo primary key is routed
  through Mongo's native `_id` field itself, rather than a redundant parallel `id` column, with a
  generated UUID-string default. Any other declared type — and `autoIncrement`, which Mongo has no
  native equivalent for — is rejected at validation time rather than silently approximated (see
  [Invalid examples](#invalid-examples)).

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

### Required vs nullable

These are two different questions, and `entity.json` keeps them separate:

- **`required`** — must the caller supply this field when creating a record? It's enforced by the
  generated **Zod validator** at the route boundary (`.optional()` is appended to the field's Zod
  expression when `required` is `false`) — this is a request-validation concern.
- **`nullable`** — may the *stored value* be `null` in the database? In Prisma, a nullable,
  non-required field becomes an optional scalar (`String?`); a `required` field is always
  non-optional in the schema regardless of `nullable`. In Mongoose, `required: true` sets
  `required: true` on the schema path; `nullable` has no separate Mongoose keyword (Mongoose paths
  are nullable by default unless `required`), so it exists in `entity.json` mainly for
  documentation and for the Zod validator's `.nullable()`.
- **`required: true` and `nullable: true` are mutually exclusive** — declaring both is rejected at
  validation time: `field cannot be both 'required: true' and 'nullable: true' — required implies
  non-null`.
- **A `primaryKey` field can never be `nullable: true`** (see [Primary keys](#primary-keys)) —
  rejected regardless of its `required` value.
- **`default` does not change `required`/`nullable` semantics** — a field with a `default` can
  still be declared `required: true` (the default only applies when the field is omitted from the
  input the *application* passes to the database layer, not at the `entity.json`/Zod level, which
  still requires the caller to supply it unless you also set `required: false`).

### Relations

Four relation types, declared under a model's `relations` object (`RELATION_TYPES` in
`src/parser/entity/schema.js`): `belongsTo`, `hasMany`, `hasOne`, `belongsToMany`.

#### `belongsTo`

This model holds the foreign key column/field.

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

1. **What it means** — `Post.authorId` points at a `User`.
2. **Required JSON structure** — `type: "belongsTo"`, `model` (target model name), `foreignKey`
   (required — the name of a real field already declared on *this* model).
3. **Foreign key behavior** — the `foreignKey` field's declared type must match the target model's
   primary key type, or generation is rejected (`foreignKey 'authorId' has type 'X' but
   'User.id' (its primary key) has type 'Y'`).
4. **Nullable behavior** — the generated relation field's optionality mirrors the FK scalar's:
   if `authorId` is `required: true` and not `nullable`, Prisma emits `author User @relation(...)`
   (non-optional); if the FK is optional/nullable, it emits `author User? @relation(...)`. Prisma
   rejects a required relation object backed by a nullable FK, so GAZAN always keeps them in sync.
5. **Reverse relation behavior** — see `hasMany`/`hasOne` below; you don't have to declare the
   reverse side yourself.
6. **Database output** — Prisma: a scalar FK column plus a `@relation(...)` object field. Mongoose:
   a `String` field with `ref: "<Target>"` (see [Field types](#field-types) — every Mongo FK is a
   `String` because every Mongo primary key is a `String` `_id`).
7. **Invalid configurations** — missing `foreignKey` (`relations of type 'belongsTo' require a
   'foreignKey'`); `foreignKey` naming a field that doesn't exist on this model; `model` naming a
   model that doesn't exist (with a "did you mean" suggestion); FK/target-PK type mismatch.

#### `hasMany` / `hasOne`

The *other* model holds the foreign key. You only need to declare either explicitly when you want
to **name or customize the reverse side yourself** — GAZAN auto-derives a reverse field for any
`belongsTo` elsewhere in the schema that doesn't already have one, including disambiguating
multiple relations to the same model (see `Post.author`/`Post.editor` in the
[realistic example](#realistic-example)) and self-relations.

```json
{
  "models": [
    {
      "name": "User",
      "fields": { "id": { "type": "uuid", "primaryKey": true, "default": "uuid" } },
      "relations": {
        "profile": { "type": "hasOne", "model": "Profile", "foreignKey": "userId" }
      }
    },
    {
      "name": "Profile",
      "fields": {
        "id": { "type": "uuid", "primaryKey": true, "default": "uuid" },
        "userId": { "type": "uuid", "required": true, "unique": true }
      },
      "relations": {
        "user": { "type": "belongsTo", "model": "User", "foreignKey": "userId" }
      }
    }
  ]
}
```

1. **What it means** — `hasMany` is the one-to-many reverse side (a `User` `hasMany` `Post`);
   `hasOne` is the one-to-one reverse side (a `User` `hasOne` `Profile`), typically paired with a
   `unique` FK on the other side (as above).
2. **Required JSON structure** — `type`, `model` (target model name), `foreignKey` (required — the
   name of a field that must exist on the *target* model, not this one).
3. **Foreign key behavior** — `foreignKey` must exist on the related model
   (`foreignKey 'userId' does not exist on related model 'Profile'` otherwise).
4. **Nullable behavior** — `hasOne` always generates an optional relation field (`profile
   Profile? @relation(...)` in Prisma) since the related row may not exist yet; `hasMany` generates
   a (possibly empty) array field, which has no nullability concept.
5. **Reverse relation behavior** — this *is* the reverse side of a `belongsTo`. If you don't
   declare it, GAZAN still generates one automatically for you (a `[]` field in Prisma named after
   the pluralized owning model, disambiguated with `As<RelationName>` when more than one
   `belongsTo` points at the same target — e.g. `postsAsAuthor` / `postsAsEditor`). Declare it
   explicitly only to pick your own field name.
6. **Database output** — Prisma: `hasMany` → `<name> <Target>[] @relation(...)`; `hasOne` →
   `<name> <Target>? @relation(...)`. Mongoose: a **virtual** (`schema.virtual(name, { ref, localField: "_id", foreignField, justOne })`) — `justOne: true` for `hasOne`, `false` for `hasMany` —
   not a stored field, so it must be `.populate()`d to read.
7. **Invalid configurations** — `foreignKey` missing, or naming a field absent from the target
   model.

#### `belongsToMany`

Many-to-many, naming a join via `through`.

```json
{
  "models": [
    {
      "name": "Post",
      "fields": { "id": { "type": "uuid", "primaryKey": true, "default": "uuid" } },
      "relations": {
        "tags": { "type": "belongsToMany", "model": "Tag", "through": "PostTag" }
      }
    },
    {
      "name": "Tag",
      "fields": { "id": { "type": "uuid", "primaryKey": true, "default": "uuid" } },
      "relations": {
        "posts": { "type": "belongsToMany", "model": "Post", "through": "PostTag" }
      }
    }
  ]
}
```

```text
User
  ↕
Role
```

is the same shape: **both sides must declare `belongsToMany`, with the same `through` value.**

1. **What it means** — an implicit many-to-many join, with no extra fields on the join itself.
2. **Required JSON structure** — `type: "belongsToMany"`, `model`, `through` (required — the join
   table/collection name both sides must agree on).
3. **Foreign key behavior** — none; there's no scalar FK field for a many-to-many, only the array
   relation itself.
4. **Nullable behavior** — not applicable; both sides are array fields.
5. **Reverse relation behavior** — **not automatic**, unlike `belongsTo`/`hasMany`/`hasOne`. A
   one-sided `belongsToMany` (declared on `Post` pointing at `Tag`, but not the reverse on `Tag`)
   is rejected: `many-to-many relation 'tags' has no matching belongsToMany declared on 'Tag' back
   to 'Post'`. A mismatched `through` value between the two sides is also rejected: `through
   'PostTag' does not match 'Tag.relations.posts.through' ('PostTags') — both sides of a
   many-to-many must agree`.
6. **Database output** — Prisma: an implicit many-to-many join table (`<name> <Target>[]
   @relation("<through>")` on both sides — Prisma manages the join table itself). Mongoose: a plain
   array-of-refs field on both sides (`type: [String], ref: "<Target>"`), no separate join
   document.
7. **Invalid configurations** — one-sided declaration (no matching reverse); mismatched `through`
   values between the two sides; `through` omitted (`relations of type 'belongsToMany' require a
   'through' join model/table name`).

**Many-to-many is schema-only.** `belongsToMany` is correctly represented in the generated Prisma
schema and Mongoose model as shown above, but the generated CRUD `create`/`update` endpoints do
not read or write it — Prisma's nested-write shape (`connect: [...]`) and Mongoose's plain array
differ enough that GAZAN doesn't attempt a one-size implementation. Manage join-table writes
through your own service code.

### What entity.json supports

- Multiple models, each with its own fields and relations
- All 13 primitive field types (see [Field types](#field-types))
- UUID and (Postgres-only) auto-incrementing primary keys, or a synthesized default UUID `id`
- Enums (`type: "enum"` + `values`)
- Defaults, including the `"uuid"` and `"now"` generation sentinels
- `required` and `nullable` field flags (independently — see [Required vs nullable](#required-vs-nullable))
- Unique fields (`unique: true`)
- Single-column indexes (`index: true`)
- String length limits (`length`) and numeric/string bounds (`min`/`max`)
- Custom table/collection names per model (`tableName`)
- Opting a model out of timestamps (`timestamps: false`) or out of CRUD generation entirely
  (`crud: false` — the model is still validated and, for Mongoose, still gets a model file, but no
  service/controller/route/validator is generated for it)
- All four relation types: `belongsTo`, `hasMany`, `hasOne`, `belongsToMany`
- Self-relations (a model relating to itself — see the realistic fixtures in `tests/fixtures/`)
- Multiple distinct relations between the same two models (auto-disambiguated reverse fields)
- Automatic sensitive-field detection (`password`/`secret`/`hash`-like field names are stripped
  from generated API responses — see [Authentication](#authentication))

### What entity.json does NOT support

- **Composite (multi-field) unique constraints or indexes** — every `unique`/`index` is
  single-column; `entity.json` has no syntax for `@@unique([a, b])`-style composite constraints.
- **Non-UUID MongoDB primary keys, or MongoDB `autoIncrement`** — rejected at validation time (see
  [Primary keys](#primary-keys)).
- **A one-sided `belongsToMany`** — both sides must declare it (see above).
- **Automatic many-to-many CRUD writes** — the relation is schema-correct, but generated
  create/update endpoints don't read or write the join (see above).
- **Arbitrary ORM-specific syntax** — no raw Prisma attributes, no raw Mongoose schema options
  beyond what's listed in [Field attributes](#field-attributes); anything not modeled by the
  schema is rejected by `.strict()` Zod validation (`entity.json failed schema validation`), not
  silently ignored.
- **Application business logic** — no computed fields, hooks, custom SQL, or arbitrary
  server-side logic. `entity.json` only describes data shape and relations.
- **Controller or service logic beyond generic CRUD** — you get `create`/`findAll`/`findById`/
  `update`/`delete`; anything more custom is written by hand in the generated service/controller.
- **Per-model route protection** — `entity.json` has no field for "require auth on this model's
  routes." Wire `middlewares/auth.js` into the generated route file yourself if needed.
- **Field-level renames between `entity.json` and the database column/field name** — the JSON key
  is the field name everywhere (Prisma column, Mongoose path, Zod key).

### Invalid examples

Every example below is rejected **before any files are generated** — `entity.json` errors are
caught at validation time, not partway through a generation run.

**Unsafe/invalid model name** (also rejects path-traversal-shaped names):

```json
{ "models": [ { "name": "../User", "fields": { "id": { "type": "uuid", "primaryKey": true } } } ] }
```

```text
models[0].name:
  model name must be a valid identifier (letters/digits, starting with a letter): '../User'
```

**Unsupported field type:**

```json
{ "models": [ { "name": "User", "fields": { "id": { "type": "unsupported-type" } } } ] }
```

```text
models[0].fields.id.type:
  type must be one of: string, text, number, integer, float, boolean, date, datetime, uuid, json, enum, decimal, bigint
```

**Unknown relation target** (with a "did you mean" suggestion when one is close enough):

```json
{
  "models": [
    { "name": "User", "fields": { "id": { "type": "uuid", "primaryKey": true } } },
    {
      "name": "Post",
      "fields": { "authorId": { "type": "uuid", "required": true } },
      "relations": { "author": { "type": "belongsTo", "model": "Userr", "foreignKey": "authorId" } }
    }
  ]
}
```

```text
models[1].relations.author.model:
  unknown model 'Userr'. Did you mean 'User'?
```

**One-sided many-to-many:**

```json
{
  "models": [
    { "name": "Post", "fields": { "id": { "type": "uuid", "primaryKey": true } }, "relations": { "tags": { "type": "belongsToMany", "model": "Tag", "through": "PostTag" } } },
    { "name": "Tag", "fields": { "id": { "type": "uuid", "primaryKey": true } } }
  ]
}
```

```text
models[0].relations.tags:
  many-to-many relation 'tags' has no matching belongsToMany declared on 'Tag' back to 'Post'
```

**Database-specific: non-UUID MongoDB primary key** (only rejected when the selected database is
MongoDB — the very same file is valid for PostgreSQL):

```json
{ "models": [ { "name": "User", "fields": { "id": { "type": "integer", "primaryKey": true, "autoIncrement": true } } } ] }
```

```text
models[0].fields.id.autoIncrement:
  autoIncrement is not supported for MongoDB — it has no native auto-increment primary key
```

**`required` and `nullable` together:**

```json
{ "models": [ { "name": "User", "fields": { "bio": { "type": "text", "required": true, "nullable": true } } } ] }
```

```text
models[0].fields.bio:
  field cannot be both 'required: true' and 'nullable: true' — required implies non-null
```

## Database support

GAZAN generates **different, mutually exclusive** database artifacts depending on what you pick —
never a mix of two backends' files in the same project.

### entity.json → generated output

```text
entity.json
     │
     ├── Entity Parser (schema + semantic validation)
     │
     ├── Normalized Entity Model
     │
     ├── Database Generator            (exactly one of the three runs, per your selection)
     │      ├── Prisma       → prisma/schema.prisma
     │      ├── Mongoose     → models/<model>.model.{js,ts} (one file per model)
     │      └── Native Mongo → no per-model files (schemaless — see below)
     │
     └── Application Generator          (skipped for a model with "crud": false)
            ├── Validators   → validators/<model>.validator.{js,ts}   (Zod)
            ├── Services     → services/<model>.service.{js,ts}      (talks to the DB)
            ├── Controllers  → controllers/<model>.controller.{js,ts}
            └── Routes       → routes/<model>.routes.{js,ts}
```

The same `entity.json` is transformed into whichever database representation you selected — the
Entity Parser and Normalized Entity Model are identical either way; only the Database Generator
step (and, for Mongoose, whether a per-model file exists at all) differs.

### Database output matrix

| Selected database | Generated schema/model output |
|---|---|
| PostgreSQL + Prisma | `prisma/schema.prisma` |
| MongoDB + Mongoose | `models/*.model.{js,ts}` (one file per model — `src/models/` when using `src/`) |
| MongoDB (native driver) | No per-model files — a native `MongoClient` config only (`configs/db/index.{js,ts}`) |
| No database | No database artifacts at all |

### PostgreSQL + Prisma

Generates exactly one file, from `entity.json`:

```text
prisma/
└── schema.prisma
```

No Mongoose models and no native-Mongo config are ever generated alongside it. For this
`entity.json`:

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

GAZAN generates:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id String @id @default(uuid())
  name String
  email String @unique
  age Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}
```

If no `entity.json` is provided, GAZAN still writes a valid starter `prisma/schema.prisma` (one
`Example` model) so `prisma generate`/`prisma migrate` work immediately without hand-editing.

### MongoDB + Mongoose

Generates one model file per model declared in `entity.json`, under `models/` (`src/models/` when
using `src/`):

```text
src/
└── models/
    └── user.model.js       # (or .ts — matches your selected language)
```

The **same** `User` model above produces:

```js
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number },
  },
  {
    timestamps: true,
    collection: "users",
  }
);
userSchema.set("toJSON", { virtuals: true });
const User = mongoose.model("User", userSchema);

module.exports = User;
```

No `prisma/schema.prisma` is ever generated for this configuration. If no `entity.json` is
provided, no model files are generated at all — only the shared `configs/db/index.{js,ts}`
Mongoose connection module — since there's nothing to model yet.

### MongoDB (native driver)

The lightest-weight database option: **no schema, no per-model files at all.** GAZAN generates a
single shared client module —

```text
src/
└── configs/
    └── db/
        └── index.js         # MongoClient wrapper: connect(), getDb(), disconnect()
```

— and, if `entity.json` was provided, generic CRUD **services** per model that call
`getDb().collection("<table>")` directly and pass plain JS objects through (see
[Entity-generated application code](#entity-generated-application-code)). There is no Mongoose
schema layer to generate, so field types/constraints from `entity.json` are enforced only by the
generated Zod validator at the route boundary, not by a database-level schema. No Prisma schema
and no Mongoose models are ever generated for this configuration.

### No database

Selecting "None" generates **zero** database-specific artifacts:

- No `prisma/` directory, no `models/` directory, no `configs/db/`.
- No `@prisma/client`, `prisma`, `mongoose`, or `mongodb` dependency in `package.json`.
- No `DATABASE_URL`/`MONGODB_URI` in `.env`/`.env.example`, and no corresponding entry in the
  generated env validator.
- If `entity.json` was still provided, generated services fall back to an in-memory `Map`-backed
  store per model — enough to exercise the full validator → controller → route → service pipeline
  end-to-end without any real database, but data does not persist across restarts.

### Entity-generated application code

Whether or not a database is selected, providing `entity.json` generates the same **four** kinds
of application files per model (skipped for a model with `"crud": false`) — this doesn't change
based on database backend, only *where* the files live changes with architecture:

**MVC** — flat, shared folders, one file per model per folder:

```text
src/
├── controllers/
│   └── user.controller.js
├── services/
│   └── user.service.js
├── routes/
│   └── user.routes.js
│   └── index.js            # aggregates every model's router under /api/<pluralized-name>
└── validators/
    └── user.validator.js
```

**HMVC** — grouped per model instead of by layer:

```text
src/
└── modules/
    └── user/
        ├── controllers/
        │   └── user.controller.js
        ├── routes/
        │   └── user.routes.js
        ├── services/
        │   └── user.service.js
        └── validators/
            └── user.validator.js
```

File naming is always `<model.kebabName>.<kind>.<ext>` (e.g. `blog-post.controller.ts` for a
model named `BlogPost`) — see [Model naming](#model-definition) below.

## Authentication

The authentication prompt is **multi-select** — you can enable any combination of methods in one
run, not just one:

```text
◇  Do you need authentication?
│  Yes
│
◇  Which authentication methods?
│  ◻ Email/password
│  ◼ JWT
│  ◼ Refresh tokens
│  ◻ OAuth
```

Internally, your selection normalizes to:

```json
{
  "authentication": {
    "enabled": true,
    "methods": ["jwt", "refresh-token"]
  }
}
```

(`enabled` is automatically `false` if you decline the prompt, or if every method gets
deselected — an empty selection is equivalent to not enabling authentication at all.)

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
dual foreign keys to the same model, `hasOne`, many-to-many, and a six-model realistic schema.

Before generating a single project, two fast unit-style checks run first (no `npm install`, so
they fail fast): the **entity parser checks** — a valid fixture, an inline invalid-schema object,
and dedicated fixtures for `hasOne`, an invalid field type, an invalid (path-traversal-shaped)
model name, and an invalid relation (unknown target model) each assert the exact error produced —
and the **current-directory checks** — generating with `.`, `./backend`, and `../backend` and
asserting the output lands exactly where expected, with no nested duplicate directory and a
package name derived from the resolved directory. The "no database" case additionally asserts the
*absence* of `prisma/`, `models/`, `configs/db/`, and any database dependency or env var.

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
