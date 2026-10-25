# Privacy

Tab Debt runs entirely in your browser. There is no Tab Debt server, no account, and no analytics.

## What it stores, and where

Everything is stored on your computer, inside the extension:

- **Tab history**: title, address, time spent, visits, which tab opened which, and when you closed it. Closed tabs and review history are deleted after 30 days.
- **Saved items**: tasks, reading list and project tabs from your reviews. Kept until you remove them.
- **Settings and key**: your chosen AI mode, model, and API key if you add one.
- **Sites you kept**: addresses you unticked in a review, so they stay open next time. You can remove them in Settings.

## What leaves your computer

**Built-in mode (default): nothing.** Tabs are sorted by rules that run in your browser.

**Your own key or a local model:** when you run a review, the extension sends the **titles, addresses and usage details** (time viewed, visits, last seen, which tab opened which) of the tabs the rules couldn't decide to the AI provider **you chose**, using **your key**. If you turn on page reading, it may also send the first part of a page's text for up to ten pages per review. Requests go straight from your browser to that provider and nowhere else. The provider's own privacy terms apply to what you send them.

**Local model (Ollama, LM Studio):** requests go to the address you enter, usually your own computer.

## What it never reads

Tabs whose address contains anything on your **Never look at** list are never read, sent or closed. The list starts with email, banking, payment and health keywords, and you can edit it. Pinned tabs, tabs playing audio, and the tab you're on are always left alone.

## Permissions, and why

| Permission | Why |
|---|---|
| tabs | See tab titles, addresses and activity, and close tabs you approve |
| storage | Keep your history, settings and saved items |
| alarms | A daily end-of-day reminder and cleanup |
| idle | Pause the clock when you step away |
| sidePanel | Show the panel |
| scripting + site access (optional) | Read page text, only if you turn on **Page text**, and only for the AI step |
| Access to your AI provider's address (optional) | Asked for when you test your connection, for that one address |

## Your control

Nothing is closed without your approval, every review can be undone, and you can delete all stored data by removing the extension.
