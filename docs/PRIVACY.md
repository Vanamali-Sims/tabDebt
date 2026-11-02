# Privacy

Tab Debt runs entirely in your browser. There is no Tab Debt server, no account, and no analytics.

## What it stores, and where

Everything is stored on your computer, inside the extension:

- **Tab history**: title, address, time spent, visits, which tab opened which, and when you closed it. Closed tabs and review history are deleted after 30 days.
- **Saved items**: tasks, reading list and project tabs from your reviews. Kept until you remove them.
- **Settings and key**: your chosen AI mode, model, and API key if you add one.
- **Snoozed tabs**: the address and title of tabs you snooze, until they reopen.
- **Daily tab counts**: one number per day for the last two weeks, used for "down from yesterday".
- **Sites you kept**: addresses you unticked in a review, so they stay open next time. You can remove them in Settings.
- **Tomorrow's brief**: the titles and addresses of up to three tabs to pick up, and a few counts. Replaced each evening.
- **Finish times**: the time of your last browser activity each day, for three weeks, to learn when you usually finish.
- **Reminder history**: whether you were asked, answered or skipped, to keep reminders to once a day and back off.
- **Pages you open often**: for each page, the days in the last two weeks you opened it, so pages you use most days stay open. Search results and browser pages aren't counted.

## What leaves your computer

**On this device (default): nothing.** Tabs are sorted by Chrome's built-in model and rules, both running on your computer. The model is downloaded once from Google by Chrome itself; tabDebt never sends your tabs anywhere.

**Rules only: nothing.**

**Wrap-up signals never leave your computer.** They are worked out from tab addresses as you browse, and only decide when to ask.

**Your own key or a local model:** when you run a review, the extension sends the **titles, addresses and usage details** (time viewed, visits, last seen, which tab opened which) of the tabs the rules couldn't decide to the AI provider **you chose**, using **your key**. If you turn on page reading, it may also send the first part of a page's text for up to ten pages per review. Requests go straight from your browser to that provider and nowhere else. The provider's own privacy terms apply to what you send them.

**Local model (Ollama, LM Studio):** requests go to the address you enter, usually your own computer.

## Video progress and unsent text (off until you turn them on)

Each is a switch in Settings that asks the browser for your OK first. **Video progress** asks for YouTube and Vimeo; **Unsent text** asks for every site, because drafts can be anywhere. During a review, and once more before closing a tab, tabDebt checks inside open tabs and learns only:

- the position and length of the main video, and whether it ended
- whether a visible text box has something typed in it (yes or no)

It never reads what you typed or the page's text, and none of it leaves your computer. Never-look sites are skipped. Turning a switch off gives back the access it asked for.

## What it never reads

Tabs whose address contains anything on your **Never look at** list are never read, sent or closed. The list starts with email, banking, payment and health keywords, and you can edit it. Pinned tabs, tabs playing audio, and the tab you're on are always left alone.

## Permissions, and why

| Permission | Why |
|---|---|
| tabs | See tab titles, addresses and activity, and close tabs you approve |
| storage | Keep your history, settings and saved items |
| alarms | The "Not yet" follow-up, snoozed tabs and cleanup |
| idle | Pause the clock when you step away |
| sidePanel | Show the panel |
| tabGroups | Reopen this morning's pick-up as one labelled tab group |
| notifications | The one "Finishing up?" prompt, only after you say yes to it |
| contextMenus | Right-click the icon to review now, skip tonight or pause reminders |
| scripting + site access (optional) | Read page text, only if you turn on **Page text**, and only for the AI step. Check video progress or typed text, only if you turn those on |
| Access to your AI provider's address (optional) | Asked for when you test your connection, for that one address |

## Your control

Nothing is closed without your approval, every review can be undone, and you can delete all stored data by removing the extension.
