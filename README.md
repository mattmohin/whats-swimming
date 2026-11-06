# What’s Swimming

A seasonal seafood catalogue built with React, TypeScript, and Vite.

## Edit the fish database

The source of truth is [`data/fish.json`](./data/fish.json). Add or edit records there, then put the matching transparent PNG in [`public/sprites/`](./public/sprites/) and add its ID-to-file mapping in `src/WhatsSwimming.tsx`.

Run the data check before committing:

```bash
npm run validate:data
```

The UI loads the JSON at runtime through `src/main.tsx`; the component is in `src/WhatsSwimming.tsx`.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

## Build and deploy

```bash
npm run validate:data
npm run build
```

The production output is `dist/`. On Vercel, import this GitHub repository with build command `npm run build` and output directory `dist`. Vercel detects Vite automatically. Push changes to GitHub; each pull request can use a Vercel preview deployment.

For a subpath deployment, set Vite’s `base` option and keep the JSON request based on `import.meta.env.BASE_URL` as implemented in `src/main.tsx`.
