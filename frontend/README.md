# EazyCount login (React + Vite SPA)

The PHP backend stays in the repo root (`login_process.php`, `api/**`). This folder is **only** the login UI.

## Develop

1. From the **repository root**, start PHP (example):

   ```bash
   php -S 127.0.0.1:8000
   ```

2. Copy env and adjust if needed:

   ```bash
   cd frontend
   copy .env.example .env
   ```

3. Install and run Vite:

   ```bash
   npm install
   npm run dev
   ```

   Open the URL Vite prints (usually `http://localhost:5173/`). API calls are proxied to `VITE_PHP_PROXY_TARGET`.

## Production

From `frontend/`:

```bash
npm install
npm run build
```

Output goes to `frontend/dist/`. The site root `index.php` redirects visitors to `frontend/dist/index.html` after session checks.

If `frontend/dist/` is missing, run `npm run build` first.

## Paths

- Production build uses `base: /frontend/dist/` so assets resolve correctly when the app is opened at `/frontend/dist/index.html`.
- Styles reuse existing site CSS: `/css/style.css` and `/css/index.css`.
