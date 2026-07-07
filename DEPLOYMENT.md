# Deployment Guide

Target architecture (all free-tier):

```
Browser ──HTTPS──> Netlify (React frontend, free)
   │
   └──HTTPS──> Caddy :443 ──> API :5000        (Docker on one EC2 instance)
                                 │
                                 └──TLS──> MongoDB Atlas M0 (free, same AWS region)
```

**Why Atlas instead of Mongo on the EC2 box:** Atlas M0 is a managed 3-node
replica set with TLS and auth enforced — your billing data survives the EC2
instance dying. Self-hosting Mongo on a 1 GB t3.micro means a single
unreplicated node competing with Node for RAM, with patching, hardening, and
backups entirely on you. M0's two limits are manageable: 512 MB storage
(plenty here; note GridFS images — logo/QR/signature/login backgrounds —
count toward it, so keep login backgrounds ~1 MB) and **no automated
backups** — covered by the nightly `deploy/backup-mongo.sh` cron below.

---

## 1. MongoDB Atlas (once, ~10 min)

1. Create a free account at cloud.mongodb.com → **Build a Database → M0 (Free)**.
2. Provider **AWS**, region = **the same region as your EC2 instance**
   (e.g. Mumbai `ap-south-1`) — keeps API↔DB latency ~1 ms.
3. Database Access → add a database user (username + strong password,
   role: *Read and write to any database*).
4. Network Access → **Add IP Address** → add your EC2 instance's
   **Elastic IP** (see §2.1). Avoid `0.0.0.0/0`.
5. Database → Connect → Drivers → copy the connection string
   (`mongodb+srv://...`). This becomes `MONGO_URI`.

> The app creates the `radiatorDB` database, collections, and indexes itself
> on first boot (`ensureIndexes` + super-admin seed). To carry over existing
> data instead of starting fresh:
> `mongodump` from the old DB, then
> `mongorestore --uri="<ATLAS_URI>" --archive=dump.gz --gzip`.

## 2. EC2 instance (once, ~20 min)

### 2.1 Instance
- Ubuntu 24.04 LTS, `t3.micro` (free tier), 20 GB gp3.
- Allocate an **Elastic IP** and associate it (so the IP survives restarts —
  Atlas allowlist and DNS both depend on it).
- Security group inbound: **22** (your IP only), **80**, **443**. Do **not**
  open 5000 — the API is only reachable through Caddy.

### 2.2 Domain (required — not optional)
Netlify serves over HTTPS, and browsers **block** HTTPS pages from calling a
plain-HTTP API (mixed content). Let's Encrypt won't issue certificates for
bare IPs, so the API needs a hostname:
- Own a domain → add an A-record like `api.yourdomain.com` → Elastic IP.
- No domain → free [DuckDNS](https://www.duckdns.org) subdomain
  (e.g. `radiator-api.duckdns.org`) pointed at the Elastic IP.

### 2.3 Install & run
```bash
# Docker + compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/vijaykrishnaas/radiators-tracker.git codebase
cd codebase/deploy
cp .env.example .env
nano .env        # fill in: API_DOMAIN, MONGO_URI, JWT_SECRET (openssl rand -base64 48),
                 # SUPERADMIN_PASSWORD, ALLOWED_ORIGINS (add Netlify URL after §3)

docker compose up -d --build
docker compose logs -f api   # expect: "Server running" + "MongoDB Connected"
```
Check from your machine: `https://<API_DOMAIN>/` should return the welcome
JSON with a valid certificate (Caddy obtains it automatically on first
request — DNS must already point at the instance).

### 2.4 Nightly backups (M0 has none built in)
```bash
chmod +x ~/codebase/deploy/backup-mongo.sh
crontab -e
# add:
30 2 * * * /home/ubuntu/codebase/deploy/backup-mongo.sh >> /home/ubuntu/backup.log 2>&1
```

## 3. Netlify frontend (once, ~10 min)

1. netlify.com → **Add new site → Import an existing project** → pick the
   GitHub repo.
2. **Base directory:** `Radiator-frontend-main` — build command and publish
   dir are then read from `netlify.toml` (`npm run build` → `dist`, plus the
   SPA fallback redirect that deep links like `/t/velavan/login` need).
3. Site configuration → Environment variables:
   `VITE_BACKEND_BASE_URL = https://<API_DOMAIN>` (no trailing slash).
4. Deploy. Then go back to the EC2 `.env`, set
   `ALLOWED_ORIGINS=https://<your-site>.netlify.app`, and
   `docker compose up -d` again to apply.

## 4. First-run checklist

- [ ] `https://<API_DOMAIN>/` returns the welcome JSON (valid padlock)
- [ ] `https://<site>.netlify.app/admin/login` → log in as super-admin →
      **change the seeded password immediately**
- [ ] Create the client (business code, admin user) → log in at
      `/t/<code>/login`
- [ ] Settings: company profile, logo, price matrix, mechanics/labour,
      signature + QR images
- [ ] Create a test bill → print invoice → record payment → check bonus pages
- [ ] Refresh the browser on an inner page (SPA redirect works)
- [ ] Verify a backup archive appears after 02:30 (`ls ~/mongo-backups`)

## 5. Updating later

```bash
# Backend
cd ~/codebase && git pull && cd deploy && docker compose up -d --build

# Frontend: Netlify auto-builds on every push to master.
```

## Costs

| Piece | Tier | Cost |
|---|---|---|
| Netlify | Free (100 GB bandwidth/mo) | ₹0 |
| EC2 t3.micro + 20 GB EBS + Elastic IP (attached) | Free tier 12 mo | ₹0, then ~$10/mo |
| MongoDB Atlas M0 | Free forever | ₹0 |
| DuckDNS | Free | ₹0 |
