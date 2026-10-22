# Air Rental API

NestJS and TypeORM API for the Air Rental property and tenancy platform. Owner, tenant, manager, and internal admin clients use the same business rules. Admin routes live under `/api/v1/admin` and use a separate account table.

The existing project already used NestJS, TypeORM, and MySQL, so this backend stays on that stack. Prisma and PostgreSQL were not added as a second data layer.

## Setup

1. Install dependencies: `npm install`
2. Create a MySQL database named `air_rental`.
3. Copy `.env.example` to `.env` and set the database password. Do not commit `.env`.
4. Start the API: `npm run start:dev`

In development, `DB_SYNCHRONIZE=true` creates tables from the entities, and `SEED_ON_BOOT=true` inserts countries, languages, currencies, subscription tiers, and utility-provider records on an empty database.

Health: `http://localhost:3000/api/v1/health`

Swagger (basic auth from `SWAGGER_USER` / `SWAGGER_PASSWORD`): `http://localhost:3000/api-docs`

Send `Authorization: Bearer <accessToken>` on protected routes. Send `X-Portal-Role: OWNER`, `TENANT`, or `MANAGER` when an account has more than one public role.

## Commands

```bash
npm run start:dev
npm run start:worker
npm test
npm run build
npm run admin:bootstrap
```

`admin:bootstrap` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment. It refuses to run in production unless `ADMIN_BOOTSTRAP_CONFIRM=yes`. There is no default admin account.

The API process runs scheduled jobs only outside production. Production should run `npm run start:worker` as a separate process.

## Assumptions

- Visible property codes such as `APT-1` are globally unique per property type. A locked sequence allocates them. The permanent id remains a UUID. Ownership changes do not change either identifier.
- One property can have only one `ACTIVE` tenancy.
- Email addresses are trimmed and lowercased. A verified Google or Apple email links to the existing user instead of creating a second account.
- Overpayment is rejected on manual rent entry so the remaining balance cannot go negative. Confirmed payments are the only amounts counted as income.
- Subscription tier is chosen from the total number of properties with an active tenancy, for the owner and organizations that owner created. That tier's rate applies to every billable unit. The one-time trial waives exactly one unit for 30 days.
- Tenant insurance, when required, must be verified before a tenancy is activated.
- Utility providers are stored as manual-upload integrations. No provider is treated as having a live official API.
- Payment success is accepted only from a verified webhook or the non-production sandbox adapter.
- AI answers are limited to properties the current user and portal can read. Live completion stays unavailable until `AI_API_KEY` and `AI_BASE_URL` are set.
- Biometric login stores a device public key. The server never stores Face ID or fingerprint data.

## Not configured until credentials exist

Google sign-in, Apple sign-in, email delivery, SMS, push notifications, S3, live card payments, and the AI provider. Those endpoints return a configuration error instead of a fabricated success.
