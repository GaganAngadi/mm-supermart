# M&M Super Mart POS + ERP

Production-oriented Grocery Store POS + ERP web application for **M&M Super Mart**.

## Stack

- Frontend: Next.js 15, React, TypeScript, Tailwind CSS, shadcn-style components, Framer Motion-ready, Zustand, Recharts, Lucide
- Backend: Node.js, Express.js, JWT RBAC, Zod validation, rate limiting, Helmet security headers
- Database: MySQL 8 with Prisma ORM
- Integrations: Google Sheets service layer, barcode scanner input, receipt printing, export-ready reports

## Folder Structure

```text
client/                 Next.js web application
server/                 Express REST API
prisma/                 MySQL Prisma schema, seed, import artifacts
scripts/                Windows local install/start helpers
```

## Quick Start

```bash
cp .env.example .env
npm install
docker compose up -d mysql
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend: `http://localhost:3000`

API: `http://localhost:4000/api`

## Multi-Shop SaaS Mode

This codebase now includes the foundation for one cloud platform serving many shops.

- `POST /api/auth/signup` creates a shop, owner user, main branch, starter categories, and shop branding.
- Login JWTs include `shopId` so APIs can isolate each shop's products, customers, and orders.
- Product SKU/barcode and customer mobile uniqueness are scoped per shop.
- Signup page: `http://localhost:3000/signup`
- Login page: `http://localhost:3000/login`

For production SaaS, deploy one shared backend/database and enforce `shopId` on every business table before enabling public onboarding at scale.

## Local Windows Install

```powershell
.\scripts\install-local.ps1
```

This creates a desktop shortcut named **M&M SuperMart ERP**. The shortcut launches:

`http://localhost:3000/dashboard`

## Main Modules

- Authentication: admin/employee login, JWT, password hashing, forgot password hook, RBAC roles
- Dashboard: zero-start KPIs, sales/revenue charts, quick billing guide, inventory and employee summaries
- POS Billing: product search, barcode scan field, cart, quantity controls, GST, discount, invoice generation, print receipt, stock deduction
- Inventory: user-created products, categories, brands, suppliers, stock, purchase/selling price, expiry/batch fields, barcode generation, product image preview/upload-ready API
- Employees: employee profiles, attendance, payroll, shifts, permissions, performance placeholders
- Customers: profiles, mobile billing, loyalty, wallet/credit fields, purchase history-ready schema
- Purchases: suppliers, purchase inward, invoice upload URL, payment tracking, stock-in API pattern
- Reports: sales, GST, profit/loss, inventory, employee reports, export-ready endpoints
- Settings: store details, GST, invoice, printer, barcode, backup, branding
- Google Sheets: service layer and sync job API for product/inventory/sales import/export

## API Highlights

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/dashboard`
- `GET /api/products`
- `POST /api/products`
- `POST /api/uploads/products`
- `POST /api/orders`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/purchases`
- `POST /api/purchases`
- `GET /api/attendance`
- `POST /api/attendance/check-in`
- `POST /api/google-sheets/sync/import`
- `GET /api/reports/sales`

## Google Sheets Setup

Add these to `.env` when ready:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL="service-account@project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Share the target Google Sheet with the service account email, then call:

`POST /api/google-sheets/sync/import`

## Production Notes

- Replace `JWT_SECRET` before deployment.
- Use MySQL managed hosting or Docker MySQL volume backups.
- Configure HTTPS and secure cookies at the reverse proxy.
- Product upload API stores local files in `uploads/products`; use S3/Cloudinary for production.
- Browser receipt printing supports 58mm/80mm thermal layouts and A4/PDF-friendly printing. Silent ESC/POS printing requires a local print bridge or kiosk configuration because browsers cannot silently access USB printers by default.
- Add provider credentials for SMS/WhatsApp/email.
- Run CI checks: `npm run typecheck`, `npm run build`, Prisma migrations, API tests.

## POS Hardware Notes

- USB barcode scanners work as keyboard input. Configure the scanner to send `Enter` after each scan.
- The POS page keeps the scanner input focused and also captures fast page-level scanner keystrokes.
- Thermal printers work through the browser print dialog. Select the 58mm or 80mm receipt size in POS before printing.
- For silent ESC/POS printing, run the app in a controlled kiosk setup with a local print service such as QZ Tray, RawBT, or a custom Node bridge.

## Deployment

Docker:

```bash
docker compose up --build
```

Manual:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run build
npm --workspace server run start
npm --workspace client run start
```
