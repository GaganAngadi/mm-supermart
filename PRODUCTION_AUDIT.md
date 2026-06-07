# M&M POS Production Audit

Generated for the current M&M SuperMart POS/ERP project.

## Architecture

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion, Zustand.
- Backend: Node.js, Express, TypeScript, Prisma ORM.
- Current database: MySQL via `DATABASE_URL`.
- Desktop shell: Electron TypeScript scaffold added in `electron/main.ts` and `electron/preload.ts`.
- Build output:
  - Web: `client/.next`
  - API: `server/dist`
  - Electron: `electron/dist`
  - Installer target: `dist-electron`

## Folder Structure

- `client/src/app/(auth)`: login, locked signup, forgot password.
- `client/src/app/(erp)`: dashboard, POS, inventory, accounting, customers, employees, reports, settings, suppliers.
- `client/src/components/modules`: business modules for each ERP page.
- `client/src/lib/stores`: local POS/inventory/billing stores.
- `server/src/routes`: API modules.
- `prisma/schema.prisma`: database schema.
- `scripts`: local install/start/backup scripts.
- `electron`: desktop app main/preload processes.

## Database Models

Core models:
- `Shop`, `Branch`, `User`, `Role`, `LoginActivity`
- `Category`, `Supplier`, `Product`, `ProductBatch`, `Inventory`
- `Customer`, `Order`, `OrderItem`, `Payment`
- `LedgerEntry`, `Expense`, `BankAccount`, `Estimate`
- `Department`, `Designation`, `Shift`, `Employee`, `Attendance`, `Leave`, `Payroll`
- `PurchaseOrder`, `Purchase`, `PurchaseItem`
- `GoogleSheetSync`, `Report`, `Setting`

Important existing indexes:
- Users: role, shop, status
- Products: name, shop, SKU, barcode, category, supplier
- Orders: branch/date, customer, status
- Customers: name, shop, mobile
- Attendance: employee/date, branch/date
- Purchases: supplier, branch/date

## API Endpoints

- `GET /api/health`
- Auth: `POST /api/auth/login`, locked `POST /api/auth/signup`, `POST /api/auth/refresh`, `PATCH /api/auth/me/credentials`
- Accounting: summary, ledger, expenses, accounts, estimates, reminders
- Attendance: list, check-in
- Customers: list/create
- Dashboard: summary
- Employees: dashboard/list/create/attendance
- Google Sheets: import jobs
- Orders: create
- Products: list, search, barcode lookup, create, import
- Purchases: list/create
- Reports: placeholder API routes
- Settings: branding
- Suppliers: list/create
- Uploads: product image upload

## Existing Feature Report

Verified in source:
- Login/auth guard and role-based navigation
- Locked public signup
- Dashboard metrics from local POS invoices and inventory store
- Full-screen centered POS
- USB barcode scan workflow
- New barcode online lookup and inventory capture
- Direct quantity input
- MRP/selling-price savings logic
- Thermal/A4 receipt HTML printing
- PDF/report export utilities
- Inventory Master fields: SKU, barcode, HSN/SAC, packing, size, unit, stock, min stock, rack, purchase/sale accounts
- Image upload preview and OCR/Excel import
- Customers derived from invoice history
- Accounting live API integration for ledger and expenses
- Settings credential change and print preview template
- Low-stock notifications with beep
- Backup script for MySQL/PostgreSQL dumps

## Security Report

Implemented:
- Password hashing via bcrypt
- JWT access tokens
- Refresh token endpoint
- Protected API middleware
- Role-based API checks on sensitive routes
- Protected frontend routes
- Rate limiting middleware
- Helmet/CORS middleware
- Public signup locked by default
- Login activity tracking now writes success/failure records

Remaining hardening:
- Rotate default `JWT_SECRET`
- Store refresh tokens server-side for revocation
- Add full audit-log model for product/invoice/delete operations
- Add CSRF strategy if cookies are introduced
- Add production HTTPS/TLS and secure headers at reverse proxy

## POS Feature Verification

Present:
- Dashboard
- Product and Inventory Management
- Supplier and Customer modules
- GST billing logic
- Barcode billing and online barcode lookup
- Invoice printing and PDF-style exports
- Sales/profit/report exports
- Purchase API foundation
- Expense Management
- User auth/settings
- Backup script

Partial / needs deeper production work:
- Category UI management
- Full purchase receiving UI
- True server-backed invoice persistence for all POS bills
- Full restore UI for backups
- Native ESC/POS silent printing
- Full audit logs for every data mutation

## Offline / SQLite Assessment

Current reality:
- The web POS can continue using local browser stores for key billing/product flows.
- Backend database is currently MySQL, not SQLite.

For true offline desktop:
- Add a SQLite Prisma schema or migrate `schema.prisma` provider to SQLite for desktop builds.
- Set desktop `DATABASE_URL=file:./data/mm-pos.db`.
- Persist POS invoices/products to local SQLite instead of only Zustand localStorage.
- Add sync/export path if cloud mode is needed later.

## Electron Configuration

Added:
- `electron/main.ts`
- `electron/preload.ts`
- `electron/tsconfig.json`
- Root `main`
- Root scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run dist`

Desktop features configured:
- Main app window
- Protected preload bridge
- Local API/web service startup
- External link handling
- App menu hidden
- Print bridge
- NSIS and portable targets
- Desktop and Start Menu shortcuts through Electron Builder

## Build Status

Passing locally:
- `npm --workspace server run build`
- `npm --workspace client run build`
- `npm run electron:build`

Blocked externally:
- `npm run dist` reaches Electron Builder but cannot download Electron Windows runtime because `github.com` DNS is unavailable.
- Required download: Electron `v42.3.0` Windows x64 zip.

## Build Instructions

Development desktop:
```powershell
npm run dev
```

Web/API only:
```powershell
npm run dev:webapi
```

Production build:
```powershell
npm run build
```

Windows installer/portable:
```powershell
npm run dist
```

## Backup Instructions

Manual backup:
```powershell
npm run db:backup:daily
```

Weekly/monthly:
```powershell
npm run db:backup:weekly
npm run db:backup:monthly
```

Ensure `mysqldump` is installed and available in `PATH`.

## Verification Checklist

- Login page loads
- Super Admin login works
- Dashboard loads
- POS scan/search/add/quantity/pay/print works
- Inventory Master save/edit/delete/lookup works
- Reports export works
- Accounting ledger/expense save works
- Settings credentials and print preview work
- API health returns OK
- Server/client/electron TypeScript builds pass
- Installer build requires GitHub access or cached Electron runtime
