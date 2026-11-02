# Chrome Web Store submission: Tab Debt

Everything to paste into the developer dashboard, tab by tab. Images are in this folder.

---

## Store listing tab

**Description** (the summary under the name comes from the manifest automatically)

```
Tabs pile up because closing them feels like losing something. Tab Debt closes the ones you're done with, keeps what matters, and shows you where you left off the next morning.

HOW IT WORKS
• See your tab debt: every open tab, sorted by how long since you last used it. Forgotten tabs stand out.
• Review in one click: Tab Debt looks at each tab and proposes what to do. Close what's finished, save articles to read later, turn bills and replies into tasks, file project tabs together. Each suggestion says why.
• You approve everything: nothing closes until you press Close. Untick anything it got wrong and it remembers next time.
• Nothing is lost: everything Tab Debt closes is listed with the reason, and any tab or whole review can be undone for 30 days.
• Pick up where you left off: the next morning, the side panel opens on the one thing to get back to, reopened as a tab group, plus today's tasks.

SAFE BY DESIGN
• Pinned tabs, tabs playing audio, the tab you're on and sites on your never-look list (email, banking, health by default) are never closed.
• When it isn't sure, a tab stays open.
• Optional checks keep tabs with a half-watched video or something typed in a text box. Each one asks your permission first, and it never reads what you typed.
• Pages you open most days, like a dashboard, stay open.

FREE AND PRIVATE
• Uses the AI built into Chrome, on your own computer. No account, no key, and your tabs don't leave your browser.
• Prefer a different model? Add your own key for Claude, ChatGPT, Gemini or OpenRouter, or use a local model with Ollama or LM Studio. Requests go straight from your browser to the provider you choose.
• No Tab Debt server, no tracking, no analytics.

QUIET BY DEFAULT
At most one reminder a day, only near your usual finish time and only when you look like you're wrapping up. It's off until you ask for it, and right-clicking the icon pauses it.
```

**Category:** Productivity (choose Workflow & Planning if it asks for a subcategory)

**Language:** English

**Store icon:** `public/icon/128.png` in the repo

**Screenshots** (1280×800, in this order):
1. `1-tabs.png`
2. `2-review.png`
3. `3-morning.png`
4. `4-cleared.png`
5. `5-settings.png`

**Small promo tile** (440×280): `promo-tile-440x280.png`

**Marquee promo tile:** leave empty.

**Homepage URL:** `https://github.com/Vanamali-Sims/tabDebt`

**Support URL:** `https://github.com/Vanamali-Sims/tabDebt/issues`

**Mature content:** No

---

## Privacy tab

**Single purpose description**

```
Tab Debt helps people clear the browser tabs they are finished with. It reviews the open tabs, proposes which to close, save for later or keep (the user approves every change), and shows where they left off the next day.
```

**Permission justifications**

`tabs`
```
Reads the title, address and activity of open tabs to show how long each has gone unused and to build the review. Closes only the tabs the user approves, and reopens them on undo.
```

`tabGroups`
```
Reopens the "pick up here" tabs from the morning view as one labelled tab group.
```

`storage`
```
Stores tab history, saved items, settings and review history on the user's computer. Closed tabs and reviews are deleted after 30 days.
```

`alarms`
```
Schedules the one follow-up after the user picks "Not yet" on the end-of-day reminder, reopens snoozed tabs at their time, and runs daily cleanup of old history.
```

`idle`
```
Pauses the time-spent clock when the user steps away, and notices when the screen locks in the evening so the next morning's "where you left off" view can be prepared. Nothing is closed when this happens.
```

`sidePanel`
```
The whole interface lives in the side panel: the tab list, the review, saved items and settings.
```

`scripting`
```
Runs a small function inside a tab only when the user has turned on one of these optional settings and granted site access for it: reading the main video's position (so unfinished videos are never closed), checking whether a text box has something typed in it (a yes/no answer only, the text is never read), or reading the first part of a page's text for the user's own AI provider. Nothing is injected when these settings are off.
```

`notifications`
```
Shows at most one "Finishing up?" reminder a day, only after the user has said yes to reminders. It is used only when the side panel is closed.
```

`contextMenus`
```
Adds items to the toolbar icon's right-click menu: review tabs now, skip tonight's reminder, pause reminders for a week, and reminder settings.
```

**Host permission justification** (optional access to all sites)

```
Host access is optional and not granted at install. It is requested only when the user turns on a setting that needs it: "Page text" (the first part of an unclear tab's text is sent to the AI provider the user chose), "Video progress" (asks for YouTube and Vimeo only, to read how far into a video the user got) or "Unsent text" (asks for all sites, because drafts can be on any site; only a yes/no is read, never the text). When the user adds their own AI provider, access to that one provider address is requested so requests can go straight to it. Each permission is removed when the setting is turned off.
```

**Are you using remote code?** No, I am not using remote code.

(All code ships in the package. Responses from the user's chosen AI provider are data, never executed. Fonts are bundled.)

**Data usage: what the extension collects.** Tick these:

- [x] **Authentication information**: only the user's own AI provider key, if they add one. Stored on their computer, sent only to that provider.
- [x] **Web history**: titles and addresses of open tabs, time spent on them, and when they were closed.
- [x] **User activity**: which tab is active and when the user is idle, used to measure time spent.
- [x] **Website content**: optional. A video's position, whether a text box has text (yes/no), or the start of a page's text, only when the user turns those settings on.

Leave unticked: personally identifiable information, health information, financial and payment information, personal communications, location.

**Certify all three:**
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/Vanamali-Sims/tabDebt/blob/main/docs/PRIVACY.md
```

Push first (`git push origin main`) so the page has the latest version. Then open the link in a private window: if it loads without signing in, it's public. If the repo is private, either make it public or paste `docs/PRIVACY.md` into a public GitHub Gist and use that link.

---

## Test instructions tab (for the reviewer)

```
No account or key is needed.
1. Open 8–10 tabs, including two copies of the same page and an article.
2. Click the Tab Debt icon to open the side panel. Open tabs are listed by how long since they were used.
3. Click "Review tabs". Each suggestion shows a reason. Untick any, then click "Close … · Save …".
4. Open Saved > Cleared to see what was closed and why; "Undo" reopens them.
5. In Settings, the AI is "On this device" (Chrome's built-in model). On a computer without it, the review falls back to built-in rules and says so.
The optional site access is only requested by the switches under Settings > What it can see.
```

---

## Distribution tab

- **Payment:** Free
- **Visibility:** Public
- **Regions:** All regions

## Account tab (if asked)

- **Trader or non-trader (EU):** non-trader, if this is a personal side project and you're not selling it or acting for a business. Choose trader if you plan to charge for it or publish as a company.

---

## Microsoft Edge Add-ons

Same zip, same text and images. Register free at partner.microsoft.com with a personal Microsoft or GitHub account. Its form asks for the same description, privacy URL, screenshots and up to 7 search terms:

```
tab manager, close tabs, tab groups, productivity, reading list, focus, AI
```
