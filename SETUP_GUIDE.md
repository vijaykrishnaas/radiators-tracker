# Radiator Management System — Setup Guide

A multi-tenant billing & bonus management web app for radiator service businesses.
It has two parts in this folder:

| Folder | What it is | Tech | Default port |
|---|---|---|---|
| `Radiator-backend-main` | REST API + database access | Node.js (Express 5, ES modules) + MongoDB | **5000** |
| `Radiator-frontend-main` | Web UI | React 19 + TypeScript + Vite | **3000** |

**Multi-tenant model:** one **super-admin** provisions any number of **client businesses**. Each client gets an isolated dataset and its own admin login. The super-admin manages clients from an `/admin` portal; clients log in with a **business code + username + password**.

---

## 1. Prerequisites

Install these first:

1. **Node.js 20.19+ or 22.x LTS** — <https://nodejs.org/> (Vite 7 requires this; older Node will fail to build).
   Verify: `node -v` and `npm -v`.
2. **MongoDB** — choose **one** of:
   - **Docker** (easiest): <https://www.docker.com/products/docker-desktop/>
   - **MongoDB Community Server** installed locally — <https://www.mongodb.com/try/download/community>
   - **MongoDB Atlas** (cloud, free tier) — <https://www.mongodb.com/atlas>
3. (Optional) **Git** — only if you want version control.

> The app was developed and tested on Windows 11. The commands below work on Windows (PowerShell), macOS, and Linux unless noted.

---

## 2. Start MongoDB

### Option A — Docker (recommended)
```bash
docker run -d --name radiator-mongo -p 27017:27017 -v radiator-mongo-data:/data/db mongo:7
```
This runs MongoDB on `localhost:27017` with a persistent volume. To start/stop later:
```bash
docker start radiator-mongo
docker stop radiator-mongo
```

### Option B — Local MongoDB install
Install MongoDB Community Server and make sure the `mongod` service is running on the default port **27017**.

### Option C — MongoDB Atlas (cloud)
Create a free cluster, add your IP to the network access list, create a database user, and copy the **connection string** (looks like `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net`). You'll paste it into the backend `.env` in the next step.

---

## 3. Backend setup (`Radiator-backend-main`)

```bash
cd Radiator-backend-main
npm install
```

### Configure the `.env` file
A `.env` file is included with working defaults. Open it and review:

```ini
MONGO_URI=mongodb://localhost:27017     # Docker/local. For Atlas, paste your connection string.
PORT=5000
JWT_SECRET=change-this-to-a-long-random-string
JWT_EXPIRES_IN=24h

# Platform super-admin (manages all clients) — seeded on first boot
SUPERADMIN_USER_ID=superadmin
SUPERADMIN_PASSWORD=super@velavan2026
SUPERADMIN_NAME=Platform Admin

# Legacy single-tenant admin (used only by the data-migration script)
ADMIN_USER_ID=admin
ADMIN_PASSWORD=velavan@123
```

**Before going live, change `JWT_SECRET` and `SUPERADMIN_PASSWORD`.**

> **Using Atlas or a Docker "replica set" image?** If you ever see `getaddrinfo ENOTFOUND <name>`, append `/?directConnection=true` to `MONGO_URI` (only needed for single-node replica-set containers; not needed for the standard `mongo:7` image above or Atlas).

### Run the backend
```bash
npm run dev
```
You should see:
```
🚀 Server running on port 5000
MongoDB Connected ✅
Super-admin seeded ✅ (userId: superadmin)
```
The backend creates the database, indexes, and the super-admin account automatically on first boot. Leave this terminal running.

> **Importing data from an older single-tenant version?** Only then run `npm run migrate` once (it registers the existing data as the first client). For a **fresh install you do NOT need this** — just create clients from the portal (Step 5).

---

## 4. Frontend setup (`Radiator-frontend-main`)

Open a **second terminal**:
```bash
cd Radiator-frontend-main
npm install
npm run dev
```
It starts on **<http://localhost:3000>**. The included `.env.development` already points the UI at the backend:
```ini
VITE_BACKEND_BASE_URL=http://localhost:5000
```
(If you run the backend on a different host/port, update this and restart `npm run dev`.)

---

## 5. First login & creating a client

1. Open **<http://localhost:3000/admin/login>** (the super-admin portal).
2. Log in with the super-admin credentials from the backend `.env`:
   - **User ID:** `superadmin`
   - **Password:** `super@velavan2026`
   - You'll be **required to set a new password** on first login.
3. On the **Clients** page, click **Add Client** and fill in:
   - Business name (e.g. `Sri Velavan Radiators`)
   - Business code (auto-suggested, e.g. `sri-velavan` — this is locked after creation)
   - The client's admin username & a temporary password
4. After creating, a **handover card** shows the client's login URL, business code, username, and temporary password — share these with the client.
5. The client logs in at **`http://localhost:3000/t/<business-code>/login`** (e.g. `/t/sri-velavan/login`) — or the generic `/issueCounter/login` and types their business code. They'll be asked to change their password on first login, then they can configure their company settings, create bills, record payments, track expenses, and run bonus reports.

---

## 6. Quick reference

| Item | Value |
|---|---|
| Backend API | http://localhost:5000 |
| Frontend UI | http://localhost:3000 |
| MongoDB | mongodb://localhost:27017 (database `radiatorDB`) |
| Super-admin portal | http://localhost:3000/admin/login |
| Client login | http://localhost:3000/t/&lt;code&gt;/login |
| Super-admin (default) | `superadmin` / `super@velavan2026` (change on first login) |

---

## 7. Building for production

**Frontend** — produces static files in `Radiator-frontend-main/dist/`:
```bash
cd Radiator-frontend-main
npm run build
```
Serve `dist/` with any static host (Nginx, Apache, Vercel, Netlify, etc.). Set `VITE_BACKEND_BASE_URL` to the production API URL before building (create a `.env.production` or edit `.env.development`).

**Backend** — run with a process manager (e.g. PM2):
```bash
cd Radiator-backend-main
npm install --omit=dev
node src/index.js   # or: pm2 start src/index.js --name radiator-api
```
For production, point `MONGO_URI` at a managed MongoDB (Atlas) and set strong `JWT_SECRET` and `SUPERADMIN_PASSWORD`.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Backend log: `connect ECONNREFUSED ...27017` | MongoDB isn't running. Start it (`docker start radiator-mongo`) or check your `MONGO_URI`. |
| `getaddrinfo ENOTFOUND <name>` | Replica-set image — add `/?directConnection=true` to `MONGO_URI`. |
| `npm install` errors / build fails | Use Node **20.19+ or 22.x**. Check with `node -v`. Delete `node_modules` + `package-lock.json` and reinstall if needed. |
| Port 5000 or 3000 already in use | Stop the other process, or change `PORT` in the backend `.env` (and `VITE_BACKEND_BASE_URL` in the frontend) / Vite's port. |
| UI shows "Cannot reach the server" | The backend isn't running, or `VITE_BACKEND_BASE_URL` points to the wrong address. |
| Forgot the super-admin password | It's seeded from `SUPERADMIN_PASSWORD` only when **no** super-admin exists. To reset: drop the `users` doc with `role:"superadmin"` in MongoDB and restart the backend, or set a fresh `SUPERADMIN_*` and reseed on an empty DB. |

---

## 9. Optional: run the isolation/regression test

With both MongoDB and the backend running, you can verify tenant data isolation:
```bash
cd Radiator-backend-main
npm run test:isolation
```
It provisions two throwaway clients, asserts neither can see the other's data, then cleans up. (If you've changed the super-admin password from the env default, pass the current one, e.g. on Windows: `$env:SUPERADMIN_PASSWORD="yourpass"; npm run test:isolation`.)

---

### Folder contents of this package
```
Radiator-backend-main/    Node.js + Express API (node_modules removed — run npm install)
Radiator-frontend-main/   React + Vite UI (node_modules/dist removed — run npm install)
SETUP_GUIDE.md            This file
README.md / PLAN.md       Project notes
```
`node_modules` were removed to keep the download small — `npm install` in each folder recreates them.
