# FABRICUT — Next.js + TypeScript

JCM Tailoring client/order management, appointments, measurements, production status and private pattern uploads.

## Local development

```sh
export PATH="$HOME/.local/bin:$PATH"
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. Native Next.js API routes are included; do not start the old Express server.

```sh
npm test
npm run typecheck
npm run build
npm start
```

Configuration remains private in `server/.env`. Any verified Google user may sign in; business data/files require owner approval. Owners manage persisted Firebase UID approvals in `/dashboard/access`. Firebase provider/database/rules setup is still pending and cloud operations fail closed until completed.

See **NEXT_MIGRATION.md** for feature coverage, exact rollback archive, security design and remaining cloud/verification requirements. Original Vue source is preserved in `legacy/vue-src`; original Express code is retained in `server` for reference only. Do not publish private uploads, `.env`, or backup archives.
