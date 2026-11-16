# Fabricut — Next.js + TypeScript migration

## Run on this Mac

```sh
export PATH="$HOME/.local/bin:$PATH"
npm run dev
```

Open http://127.0.0.1:3000. Production: `npm run build && npm start`.
Both commands bind loopback only. No separate Express server is required.

- Next.js App Router, React, strict TypeScript, native Web API route handlers.
- `app/` routes; typed React UI in `components/`; typed server/client modules in `lib/`.
- Original Vue implementation preserved under `legacy/vue-src`; original Express source remains in `server/` for rollback/reference, NOT the active application.
- Real private configuration remains `server/.env` (mode 600, git-ignored). No server password or private configuration is embedded in browser assets. `/api/auth/config` intentionally returns only the public Firebase Web SDK configuration.
- Original uploads remain `server/uploads`; private files are never moved to public/.

## Access model

Any verified Google account may sign in. New users see pending-owner-approval and cannot access business records, uploads or approval administration. Owners are bootstrapped only from `FIREBASE_OWNER_EMAILS`; these are not the complete sign-in list. Owners approve/revoke staff by Firebase UID using persisted `accessRequests` / `staffApprovals` documents. No client-side role selection changes authorization. Only an owner can write approval status, and owner status cannot be granted through this flow. Every API request cryptographically verifies the Firebase token and uses request-specific FirebaseServerApp context. Access checks read the server copy of approval documents rather than offline caches.

Rules are a prototype pending emulator validation and explicit deployment. `npm run rules:staff` synchronizes bootstrap owner emails from private server configuration into the rules (not a public sign-in restriction). It performs NO cloud deployment.

## Feature map

| URL | Workflow |
| --- | --- |
| / | Original logo, tailoring landing page |
| /login | Google sign-in; pending accounts stay signed in |
| /about | Public business information / hours |
| /dashboard | Real-data counts, recent clients/orders, appointments, shared measurements save/cancel |
| /dashboard/clients | Search, add/edit/delete, all ten client measurement fields, details and client order/appointment history |
| /dashboard/records | Full order fields, edit/delete/details, status/date/fabric/search filters, statistics, progress, filtered CSV export |
| /dashboard/schedule | Appointment create/edit/delete/details, date/status/search filters, business/break hours |
| /dashboard/status | Order-based progress, milestones, alerts, latest completion |
| /dashboard/app-controller | Private pattern upload/view, motor-speed/progress simulation, start/stop/save/confirm/maintenance previews |
| /dashboard/access | Owner-only staff request/approval/revocation management |

The controller was already a browser simulation, not a hardware driver. It is now explicitly labeled. Demo/fabricated metrics are not presented as measured live values. Visual structure was rebuilt responsively in React using the original global theme, not a pixel-identical Vue template conversion.

## Verification

`npm test` runs native Request/Response API tests, synthetic in-memory CRUD and approval tests, concurrent user context tests, real locally signed RSA JWT verification tests, and private temporary pattern upload/read tests. These do not write Firebase data and do not prove cloud configuration works.
`npm run typecheck` and `npm run build` validate strict TS and production compilation.
The maintained root stack uses a reviewed `@grpc/grpc-js` 1.14.7 override to remove an outdated Firebase transitive version. Root audit has zero findings. Retained legacy server dependencies are not used by Next and have separate older audit findings; do not deploy the legacy server.

## Still pending outside local migration

- Firebase Google provider support email/brand and authorized localhost/domain configuration.
- Firestore creation in selected Singapore region, edition/cost confirmation; no billing authorized.
- Rules emulator validation (Mac currently has no Java); no dry-run/deploy was attempted because it can enable APIs.
- Reviewed rules deployment followed by real owner/staff/pending sign-in and CRUD verification.
- Browser visual verification.

Until provisioned, access and database failures are explicit and fail closed. No cloud resources, IAM grants, providers, databases, or billing were changed during migration.

## Full rollback backup

`/Users/acelang/.local/state/fabricut-migration-backups/FABRICUT-before-next-20261107-154109.tar.gz`

This restrictive full archive includes the pre-migration working tree, Git metadata, private environment, uploads and dependencies. Restore to a NEW empty sibling directory first and inspect it; do not blindly extract over ongoing edits. The prior project can be launched from that restored copy. Preserve the migrated tree until the user decides otherwise.
