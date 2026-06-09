# M&M SuperMart cPanel Hosting

Use this layout:

- Frontend: `https://mmsupermart.in`
- API: `https://api.mmsupermart.in/api`

## Backend API

Create a cPanel Node.js app:

```text
Node.js version: 20.x
Application mode: production
Application root: repositories/mm-supermart/mm-api
Application URL: api.mmsupermart.in
Startup file: dist/server.js
```

Environment variables:

```env
NODE_ENV=production
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME
JWT_SECRET=change-this-to-a-long-random-secret
WEB_ORIGIN=https://mmsupermart.in
```

Then run in cPanel Terminal after activating the API Node environment:

```bash
cd /home/YOUR_CPANEL_USER/repositories/mm-supermart/mm-api
npm install --ignore-scripts --no-audit --no-fund
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run build
```

Test:

```text
https://api.mmsupermart.in/api/health
```

## Frontend

Build locally:

```bash
npm run build:cpanel:frontend
```

Upload and extract this file into the domain document root:

```text
dist-hosting/mm-supermart-frontend.tar.gz
```

The extracted files must be directly inside the document root and include:

```text
index.html
login.html
_next/
app-config.js
```

If the API URL ever changes, edit `app-config.js` in cPanel:

```js
window.__MM_SUPERMART_CONFIG__ = {
  apiBaseUrl: "https://api.mmsupermart.in/api"
};
```
