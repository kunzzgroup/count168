# CSS workflow

- Edit source styles in `frontend/public/css/*.css`.
- Do not edit files in `frontend/dist/css/*` directly. They are build output and will be overwritten.
- In local dev (`npm run dev`), `/css/*` now serves from `frontend/public/css/*` directly (not PHP root `/css`).
- After CSS changes, run:

```bash
npm run build
```

- Deploy updated `frontend/dist` after build.
