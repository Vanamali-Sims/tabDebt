# Tab Debt

A browser extension with an agent inside. Once a day it reads your open tabs, works out why you opened each one, and proposes a plan: close what's done, save what you want to read, file project tabs, turn tasks into to-dos. You approve it, it acts, and nothing is ever lost.

Free out of the box: it uses the AI model built into Chrome, on your own computer, with no key. Bring your own key (OpenRouter, Anthropic, OpenAI, Gemini, any OpenAI-compatible endpoint) or run a local model when you want it sharper. Without any AI, built-in rules handle the obvious tabs and leave the rest open.

It asks for your attention once a day at most. Near your usual finish time, when it looks like you're wrapping up, it asks "Finishing up?". The next morning it opens on "Here's where you left off", with the one thing to pick up first.

## How it works

```
tab events -> Tracker -> IndexedDB
                            |
   Rules (free, instant) ---+--> decided: protected, duplicates, finished pages
                            |
                            +--> unclear tabs -> Agent loop (your model)
                                                  tools: read_page, find_related, submit_plan
                                                        |
                         Plan (side panel) <-- our own checks on every proposal
                              |
                      you approve or untick
                              |
                  Executor: close, save, file  ->  undo, memory, decision log
```

- **Tracker** (`src/lib/tracker.ts`): records time viewed, visits, last seen and which tab opened which, from browser events. Works from timestamps because the background worker sleeps.
- **Rules** (`src/lib/rules.ts`): free first pass. Protects tabs that must never be closed, then catches duplicates, followed-up searches, confirmation pages and error pages. Passes on anything unclear.
- **Agent** (`src/lib/agent/`): a short, bounded tool loop for the unclear tabs. It can read a page or ask which tabs relate, then proposes. It cannot close or change anything.
- **Executor** (`src/lib/executor.ts`): the only code that closes tabs or saves items. Re-checks every tab itself.
- **Review** (`src/lib/review.ts`): rules, then agent, then a cautious fallback. Produces a plan; changes nothing.
- **On-device model** (`src/lib/agent/device.ts`): Chrome's built-in model in small batches with a JSON schema. Same checks as the cloud agent.
- **Brief** (`src/lib/brief.ts`): written when you wrap up or leave in the evening. Holds the pick-up and counts, so the morning view needs no AI call.
- **Nudges** (`src/lib/nudge.ts`): learns your usual finish time, scores wrap-up signals from tab events, and keeps the once-a-day budget, the "Not yet" retry and the back-off.

### Attention budget

| Level | Where | When |
|---|---|---|
| Badge | Toolbar icon | Always. Grey count, amber past your tab limit, a green dot when the morning view is waiting, nothing when caught up |
| One prompt | Panel banner, or one notification if the panel is closed | In your finish window (45 min before to 90 min after), on weekdays, when you're closing tabs in a burst, switching from work to personal sites, or opening your calendar. Never while something plays or a window is fullscreen |
| Never | | Modals, tabs opening by themselves, sounds, closing without your approval |

The prompt is off until you say yes after your first review. "Not yet" asks once more after 30 minutes. Three skipped evenings in a row and it asks whether to remind you less. Right-click the icon to review now, skip tonight or pause for a week.

### Safety, by design

- The agent only proposes. You approve every change, and every review can be undone.
- Unsure never means closed: a low-confidence "done" becomes "save to read".
- Page text reaches the model only inside a marked untrusted block, is cleaned, and is checked for text that tries to give orders. A page that does is left alone, whatever the model says.
- Pinned, audible, active, excluded and remembered tabs are never closed, enforced in the rules, the finalizer and the executor.
- Hard limits: step budget, page-read cap, tabs per run. If the AI call fails, you still get the built-in plan.

## Develop

```bash
npm install
npm run dev        # Chrome with the extension loaded, hot reload
npm run build      # production build in .output/chrome-mv3
npm test           # unit tests (rules, tracker, agent with a mock model, executor, ...)
npm run compile    # type check
npm run e2e        # real Chromium: tracker, review, apply, undo, agent via a fake provider
npm run eval       # score a real model on 38 labelled tabs (needs EVAL_* env, see evals/llm.eval.ts)
```

Load a build by hand: open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `.output/chrome-mv3`.

For `npm run e2e`, serve three small pages first: `a.html`, `b.html` and `c.html` on `http://localhost:8765` (any static server works).

## Evals

`evals/cases.json` holds 38 labelled tabs, including two prompt-injection pages. `npm test` runs the free rules against them. `npm run eval` runs the full pipeline with a real model and fails on any injection leak, too many unsafe closes, or low accuracy. Run it whenever you change the prompt, the rules or the model.

## Git workflow

- `main` always builds and passes tests.
- Work happens on short branches: `feat/*`, `fix/*`, `chore/*`, `test/*`, `docs/*`.
- Branches merge into `main` with `--no-ff` so each feature stays visible in history.
- Commits follow Conventional Commits.

## Known limits

- Chrome and Chromium browsers only (uses the side panel API). Firefox needs a sidebar port.
- It cannot detect an unsent draft in an arbitrary page. Common cases are covered by the never-look list and a "compose" check.
- The review runs in the side panel, so closing the panel mid-review cancels it.
- Chrome may not let a notification open the side panel directly. If it doesn't, the panel opens on the review the next time you click the icon.
- The on-device model needs a recent desktop Chrome with enough memory and a one-time download. Other browsers fall back to rules or your own key.
- The finish time is learned from weekdays only, and work and personal sites are told apart by a built-in list of addresses.
- Search is keyword-based. Meaning-based search is a natural next step.
- Only the OpenAI-compatible path is tested end to end. The Anthropic, OpenAI and Gemini providers are wired through the AI SDK but need a real-key check.

See [docs/PRIVACY.md](docs/PRIVACY.md).
