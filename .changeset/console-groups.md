---
"@ghub/ui": minor
---

`ConsoleShell` takes a group of pages as one tab (`ConsolePageGroup`): a click opens the list of its pages under the tab, a sheet from the bottom on a phone, and the tab names the page you are on ("Rules › Guest rules"). A group of one page draws as a plain tab. Page links take `flag` (a warn dot with words) and `count` (shown in a group's list). Below 768px the rail no longer takes a row above the page: the workspace's tab becomes a button that opens the workspaces as a sheet. `ConsolePageLink` and `ConsolePageGroup` are exported.
