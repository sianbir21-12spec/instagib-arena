# Test_branch audit

## Scope

Audit target: `Test_branch`. `main` is not modified by this audit.

## Verified findings and fixes

### 1. Development proxy port mismatch — fixed

`server/index.ts` defaults the Node server to port `8080`, while `vite.config.ts`
previously defaulted its API/WebSocket proxy to `8787`. Running the documented
`npm run dev` path therefore started the server on one port and proxied to another.

Fixed by making the Vite proxy default to `8080` and aligning `.env.example`.

### 2. CI did not run on Test_branch — fixed

The CI workflow previously triggered push validation only for `main`, so commits
to `Test_branch` had no push validation. The workflow now includes `Test_branch`.

### 3. CI lint was non-blocking — fixed

`npm run lint` previously used `continue-on-error: true`, so lint failures could
still produce a successful CI job. Lint is now a required validation step.

## Important audit findings still requiring validation/remediation

### Server-side session lifetime

`instagib_sessions` stores `created_at`, but `userIdFromSession()` currently looks
up a token without checking its age. The one-year `httpOnly` cookie lifetime in
`auth.ts` is therefore not enforced server-side for an already-present token.
A server-side expiry check should be added before this can be considered fully
closed.

### CI execution environment

The repository currently reports zero GitHub Actions workflow runs for
`Test_branch`, and the commit status endpoint reports no checks. A draft validation
PR was opened solely to attempt to trigger `pull_request` CI; no run was produced.
Therefore typecheck/build/lint cannot honestly be marked PASS from GitHub evidence
yet.

## Existing netcode evidence

`docs/NETCODE-TCP-LOAD.md` records prior controlled load-harness results for the
64 Hz networking path, including 8-player constrained-link tests. Those are useful
historical evidence but do not replace a fresh CI/deployment validation of the
current branch.
