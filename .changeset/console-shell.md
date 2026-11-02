---
"@ghub/ui": minor
---

`ConsoleShell` in `@ghub/ui/modern`: the console's frame, a 48px top bar (the app's context, the workspace as a blue tab, the workspace's pages as text tabs with the current one underlined, the product's name and round buttons) over a 52px icon rail of workspaces and the page. Server rendered; the pages are links with `aria-current` that wrap under the bar on a narrow screen, the rail turns into a row, and each icon carries its name. `CONSOLE_ROUND` is the round button's classes for a caller's own button or link.
