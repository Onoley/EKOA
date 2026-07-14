# Ekoa repository rules

- Use pnpm, strict TypeScript, the Next.js App Router, and French user-facing copy.
- Keep features modular under `src/features`; keep shared infrastructure under `src/lib`.
- Validate external input with Zod and enforce authorization server-side plus RLS.
- Never expose demographics, individual votes, service-role credentials, or real secrets.
- Do not use `any`, hard-coded category IDs, silent error handling, or unnecessary global state.
- Before handoff run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant E2E/RLS tests.
- Implement one roadmap phase at a time and document known limitations before starting another.
