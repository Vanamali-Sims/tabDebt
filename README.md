# Tab Debt

A browser extension with an agent inside. Once a day it reads your open tabs, works out why you opened each one, and proposes a plan: close what's done, save what you want to read, file project tabs, turn tasks into to-dos. You approve, it acts, and nothing is ever lost.

## Develop

```bash
npm install
npm run dev        # opens Chrome with the extension loaded and hot reload
npm run build      # production build in .output/chrome-mv3
npm test           # unit tests
npm run compile    # type check
```

To load a build by hand: open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `.output/chrome-mv3`.

## Git workflow

- `main` always builds and passes tests.
- Work happens on short branches: `feat/*`, `fix/*`, `chore/*`, `docs/*`.
- Branches merge into `main` with `--no-ff` so each feature stays visible in history.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
