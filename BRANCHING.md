# Branching & Deployment Strategy

A lightweight, trunk-based workflow for the Radiator Management System. One
production environment, short-lived branches, and a pull request for every
change. Sized for a small team / solo maintainer with continuous deployment.

> The trunk branch is **`master`** (the repository's current default). If you
> prefer the modern `main` convention, rename it on GitHub and update the
> tracked branch in Render and Netlify; the workflow below is identical either
> way — substitute `main` for `master`.

## Environments

| Environment | Branch | Frontend (Netlify) | Backend (Render) | Database (Atlas) |
|---|---|---|---|---|
| **Production** | `master` | Production site (auto-deploy on push) | Production service (auto-deploy on push) | Production `radiatorDB` |
| **PR preview** | any open PR | Netlify **Deploy Preview** (auto, per PR) | — (uses the production API)¹ | Production DB¹ |

¹ On the free tier there is no separate backend/DB per PR. The Netlify deploy
preview exercises **frontend** changes against the production API. **Backend and
database changes have no preview** — see "Backend changes" below.

## Branches

- **`master`** — always deployable; this is production. **Protected**: no direct
  pushes, changes land only through a reviewed PR.
- Short-lived working branches, deleted after merge:
  - `feature/<slug>` — new functionality
  - `fix/<slug>` — bug fixes
  - `chore/<slug>` — config, deps, tooling, docs
  - `security/<slug>` — security hardening
  - `hotfix/<slug>` — urgent production fix

Keep one branch per logical change; merge `master` in if it falls behind.

## Day-to-day flow

```
master ──●─────────────●──────────────●──►   (production, auto-deploys)
          \           /                /
           ●──●──●──●  (feature/x)     /
              PR + Netlify preview    /
                                     ●  (fix/y)
```

1. `git checkout master && git pull`
2. `git checkout -b feature/<slug>` and do the work.
3. Push and open a **PR into `master`**. Netlify automatically builds a **Deploy
   Preview** — review the frontend there.
4. Self-review the diff; make sure checks pass (build + tests, see below).
5. **Merge** the PR → Render and Netlify auto-deploy `master` to production.
6. **Delete the branch** (locally and on the remote).
7. Optionally **tag the release**: `git tag v1.2.0 && git push origin v1.2.0`.

A "hotfix" is just a fast version of the same loop — branch off `master`, PR,
merge. (There is no `staging`/`develop` to back-merge into.)

## Backend changes (important on the lean model)

Merging to `master` deploys the **backend to production immediately**, and there
is **no preview environment or staging database** to catch problems first. So
before merging anything that touches `Radiator-backend-main/`:

- Run it locally against your local Mongo and exercise the affected endpoints.
- `cd Radiator-backend-main && npm run test:isolation` (tenant-isolation suite).
- Be especially careful with anything destructive or schema-shaped — there is no
  safety net between merge and live data.

If backend changes become risky/frequent, graduate to a **staging environment**:
a second Render service + Netlify branch-deploy + a separate Atlas database
tracking a long-lived `staging` branch, promoted to `master` once verified.

## Frontend checks before merge

- `cd Radiator-frontend-main && npm run build` (must pass — TypeScript + Vite).
- Click through the Netlify Deploy Preview for the screens you changed.

## Environment variables

Secrets and per-environment config live in the **Render and Netlify dashboards**,
never in git. `.env` files are git-ignored; `.env.example` /
`.env.development.example` document the required keys.

- **Render (backend):** `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
  `SUPERADMIN_USER_ID/PASSWORD/NAME`, `NODE_VERSION`, optional
  `ALLOWED_ORIGINS=https://<netlify-site>`. Do **not** set `PORT`.
- **Netlify (frontend):** `VITE_BACKEND_BASE_URL=https://<render-service>.onrender.com`,
  `NODE_VERSION=20.19.0`.

## Rollback

- **Frontend:** Netlify → Deploys → pick the last good deploy → "Publish deploy".
- **Backend:** Render → the service → Events/Deploys → "Rollback" to a previous deploy.
- **Code:** `git revert <bad-commit>` on a branch → PR → merge (re-deploys the
  reverted state). Prefer `revert` over force-pushing `master`.

## Conventions

- Conventional-ish commit subjects (imperative, e.g. "Add …", "Fix …").
- One PR = one reviewable change; squash if the history is noisy.
- Tag production releases `vMAJOR.MINOR.PATCH`.
- Delete merged branches to keep the remote clean.
