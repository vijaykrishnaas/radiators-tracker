# Billing & Service Management System (White-Label)

A data-driven billing application shipped with **Sri Velavan Radiators** defaults. Every company-specific value — name, address, phones, UPI, price matrix, product models, service types, labour names, field labels, branding colors, invoice options — lives in the database and is editable from the in-app **Settings** page. Redeploying for another company requires zero code changes.

## Stack

- **Frontend:** React 19 + TypeScript, Vite, Bootstrap 5, react-hook-form, jsPDF (`Radiator-frontend-main/`)
- **Backend:** Express 5 (ES modules), MongoDB driver, JWT auth (`Radiator-backend-main/`)
- **Database:** MongoDB (local Docker for dev; point `MONGO_URI` at Atlas for production)

## Quick Start

### 1. Database (dev)

```powershell
docker run -d --name radiator-mongo -p 27017:27017 -v radiator-mongo-data:/data/db mongo:7
```

> The original Atlas cluster from the previous team no longer exists. For production, create a new Atlas cluster and set `MONGO_URI` accordingly.

### 2. Backend

```powershell
cd Radiator-backend-main
npm install
npm run dev        # runs on http://localhost:5000
```

Configuration lives in `Radiator-backend-main/.env`:

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `PORT` | API port (default 5000) |
| `JWT_SECRET` | Token signing secret — **change in production** |
| `JWT_EXPIRES_IN` | Token lifetime (default 24h) |
| `ADMIN_USER_ID` / `ADMIN_PASSWORD` | Initial admin user, auto-seeded when the `users` collection is empty |

### 3. Frontend

```powershell
cd Radiator-frontend-main
npm install
npm run dev        # runs on http://localhost:3000
```

`.env.development` sets `VITE_BACKEND_BASE_URL=http://localhost:5000`.

### 4. Login

Default credentials (from backend `.env`): **admin / velavan@123**

## Features

- **JWT authentication** — login issues a token; all API endpoints and dashboard routes are protected; 401 auto-redirects to login
- **Bill management** — create / view (read-only) / edit / delete, with sequential bill numbers
- **Payment tracking** — record partial payments; status derives automatically: *Not Received → Partial → Received*; dashboard shows Total / Received / Pending per bill
- **"Other" services** — require a comment, and the comment text (not "Other") is shown in the dashboard, exports, and printed bills
- **Printing** — modern A5 invoice per bill (UPI QR appears once a UPI ID is set and `Show payment QR` is enabled in Settings); A4 summary report over the filtered records (revenue, payment position, breakdowns by model / service / mechanic)
- **Exports** — Excel and PDF of the current table
- **Filters** — search by vehicle number, filter by mechanic and date range; column visibility toggle
- **Settings page** (header → user menu → Settings) — company profile, branding colors, product/service catalog with price matrix, labour list, field labels, invoice options, bonus configuration
- **Bonus system** — materialized in a dedicated `bonuses` collection, auto-synced on every bill create/edit/payment/delete:
  - *Mechanic Bonus* (`/bonus/mechanics`) — settled **yearly** (year window configurable, default April–March); % per product × service matrix + default %, with an optional per-line "Bonus %" override on the bill form
  - *Labour Bonus* (`/bonus/labour`) — settled **daily**; own % matrix, the bill's bonus split equally among its workers
  - Bonus is paid in proportion to the amount **collected** on the bill (Accrued vs Payable); "Mark Paid" locks entries against later edits; a Sync button backfills entries for pre-existing bills

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login → `{ token, user }` |
| GET | `/settings` | App settings (seeds defaults on first call) |
| PUT | `/settings` | Update settings |
| GET | `/radiators` | List with pagination + filters |
| POST | `/radiators/add` | Create (auto bill number, status *Not Received*) |
| GET | `/radiators/:id` | Get one (with computed amounts) |
| PUT | `/radiators/:id` | Update (payments preserved) |
| DELETE | `/radiators/:id` | Delete |
| POST | `/radiators/:id/payment` | Record a payment `{ amount }` |
| GET | `/mechanic` | Distinct mechanic names |
| GET | `/bonus/mechanics?year=` | Yearly mechanic bonus per beneficiary |
| GET | `/bonus/labour?date=` | Daily labour bonus per beneficiary |
| POST | `/bonus/payout` | Mark pending entries paid `{ type, period, beneficiary? }` |
| POST | `/bonus/sync` | Backfill/recompute bonus entries from bills |

All endpoints except `/auth/login` require `Authorization: Bearer <token>`.

## Re-deploying for a New Company

1. Deploy backend + frontend, point `MONGO_URI` at a fresh database
2. Set `ADMIN_USER_ID` / `ADMIN_PASSWORD` / `JWT_SECRET` in `.env`
3. Log in → Settings → fill in company profile, prices, catalog, labels
4. Done — invoices, reports, forms, and the dashboard all follow the settings

Defaults shipped in `Radiator-backend-main/src/config/defaultSettings.js`.
