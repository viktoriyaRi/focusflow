# FocusFlow

Tiny productivity app that combines a **Pomodoro timer**, **mini-kanban tasks**, and **habits** - with browser notifications and a daily goal. Works fully in the browser and stores data locally.

> Live demo (GitHub Pages): `https://<your-username>.github.io/focusflow/`  
> _(Make sure Vite `base` is set to `/focusflow/` - see Deploy section.)_

---

## Features

- **Tasks (Mini-Kanban)**

  - Title, Priority (High/Med/Low), Date, Time, **Remind (before)**, **Estimate (minutes)**
  - Search & Filters: All / High / Med / Low / Today / Overdue / Missed
  - Smart badges: `Today`, `Overdue`, `Missed`, `⏱ Xm`, `High/Med/Low`
  - Auto-priority boost to **High** when a task becomes **Missed** (one-time)
  - Keyboard fix: inputs now accept **Space** (no hotkey collisions)

- **Pomodoro**

  - 5–60 minutes, Start / Pause / Reset
  - Finish celebration: melody, vibration (if supported), confetti, toasts
  - **Hotkeys**: `Space` (start/pause), `R` (reset) - ignored while typing
  - Melodies (Victory/Chill/Arcade/Bells/Sunrise) + volume with **Test** button

- **Habits & Streaks**

  - Create habit with minutes, **Start** launches Pomodoro for that duration
  - **Done today** button, streak counter
  - **Auto mark Done today** when a Pomodoro started from a habit finishes
  - Today’s done habits are **highlighted** (green ✓)

- **Daily Goal & Weekly Chart**

  - Adjustable daily goal with progress bar
  - Sessions timeline: Today / Yesterday / Last 7
  - Weekly line chart of minutes (Recharts)

- **Notifications & Reminders**

  - Browser **Notifications** (HTTPS or localhost) + vibration + sound
  - Task **Remind** sends notification _before_ the deadline (select shows full “before”)

- **Data**

  - Everything is stored locally (`localStorage`)
  - **Export/Import** JSON backup, **Reset** for full wipe

- **UI/UX tweaks**
  - Wider **Remind** selects (full word “before” visible)
  - **? Help** tooltip next to **Estimate** with a short explanation
  - Date input wide enough to show the **year**
  - Spacing adjustments in the Done section for cleaner alignment

---

## Quick Start (local)

```bash
# install
npm i

# run locally
npm run dev

# build
npm run build

# preview build
npm run preview
```

**Enable Notifications**: click the button in the header and allow in the browser (works only on **HTTPS** or **localhost**).

---

## Export / Import / Reset

- **Export**: saves a `.json` backup (tasks, habits, pomodoro history, settings)
- **Import**: load a previous backup and refresh the page
- **Reset**: clears all local data (use carefully)

---

## Keyboard Shortcuts

- `Space` - Start/Pause Pomodoro
- `R` - Reset Pomodoro  
  _(Hotkeys are disabled while you’re typing in inputs.)_

---

## Development Notes (React + Vite)

This project uses **React + Vite**. Vite provides super fast dev server (HMR) and lean builds.

Two official React plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) - uses **Babel** for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) - uses **SWC** for Fast Refresh

### ESLint & TypeScript (recommended)

If you’re building a production app, consider TypeScript with type-aware lint rules. See the Vite TS template and [`typescript-eslint`](https://typescript-eslint.io).

---

## Build & Deploy (GitHub Pages)

### 1) Set `base` in `vite.config.js`

**Project page** (`https://username.github.io/focusflow/`):

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/focusflow/", // 👈 repo name
});
```

**User/Org page** (`https://username.github.io/`):

```js
export default defineConfig({
  plugins: [react()],
  base: "/", // 👈 root
});
```

### 2) Public icons (safe paths)

Use relative paths so assets work both locally and on Pages:

```html
<!-- index.html -->
<link rel="icon" type="image/png" href="./favicon.png" />
```

And in code (for Notifications):

```js
// safe icon URL that respects Vite base
const ICON_URL = `${location.origin}${import.meta.env.BASE_URL}favicon.png`;
// use in notify(...)
```

### 3) GitHub Actions workflow

Create `.github/workflows/deploy.yml`:

```yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Push to `main`, then enable **Settings → Pages → Source: GitHub Actions**.  
If you get a white page, verify the `base` path is correct and clear the browser cache.

---

## Tech Stack

- **React**, **Vite**
- **Tailwind CSS**
- **Framer Motion** (animations)
- **Recharts** (weekly chart)
- **react-hot-toast** (toasts)
- **canvas-confetti** (celebrations)
- Native **Notification API** & **WebAudio**

---

## Data & Privacy

All data lives in your browser’s **localStorage** under `ff.*` keys.  
No servers, no accounts, no analytics.

---

## Recent Changes (highlights)

- Fix: allow **Space** in inputs; guard global hotkeys
- UI: widen **Remind** selects (show full “before”)
- UI: add **? Help** tooltips for **Estimate** (tasks & editor)
- UI: make date input wide enough to show full **year**
- Habits: highlight **Done today**, and **auto-mark** after Pomodoro finishes
- Layout: improved spacing/alignment in Done section

---

## License

Educational/personal project. Contributions and ideas are welcome - open an Issue or PR.

---

**Have a focused day! 💙**

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
