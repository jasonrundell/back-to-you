# The multiple-choice picker is a permission prompt, so PreToolUse is unwired

Users heard the `decision-needed` clip **twice**, a few seconds apart, whenever Claude opened the multiple-choice picker (the `AskUserQuestion` tool). Verified with a process watcher against Claude Code 2.1.260:

1. `PreToolUse`, matched to `AskUserQuestion`, played `decision-needed` immediately.
2. Claude Code renders the picker as a permission dialog internally (`AskUserQuestionPermissionDialog`). Its permission-dialog code schedules a `Notification` of type `permission_prompt` — *"Claude needs your permission to use AskUserQuestion"* — after a fixed six seconds if the dialog is still open, cancelled if it is answered sooner. This project's `Notification` hook, matched to `permission_prompt|agent_needs_input|elicitation_dialog`, played `decision-needed` again.

So the picker is not silent without `PreToolUse`, and never was. It is a permission prompt like any other, and gets the same delayed `permission_prompt` notification every other permission prompt gets. The `PreToolUse` entry was a duplicate of the `Notification` entry the whole time.

This reverses the decision `PROJECT_INDEX.md` documented for the 1.x line: that `PreToolUse` on `AskUserQuestion` existed *because* the picker had no notification type of its own. That premise was never checked against the actual Claude Code implementation; it turned out to be false.

## Considered options

**(a) Keep `PreToolUse`, and have the category hook skip `permission_prompt` notifications whose message names `AskUserQuestion`.** Rejected: it depends on matching notification message text, which is not a stable API and could change wording without notice. It also keeps the only hook in this project that can block a tool call (see Consequences below) for no benefit over simply not wiring it.

**(b) A time-window dedupe in `play-lib`: skip a category if it was played within the last N seconds.** Rejected: it hides the cause rather than removing it, and it needs shared state written into `~/.claude` that both the Node and PowerShell implementations would have to agree on — the same kind of trap `.subagent-done-at` was before `SubagentStop` was unwired.

**(c) Drop `PreToolUse` entirely — chosen.** The smallest change, consistent with how every other permission prompt in the product already sounds, and the settings rewrite in `src/settings.js` unwires the entry on upgrade with nothing asked of the user.

## Consequences

- The question clip now arrives roughly six seconds after the picker opens, rather than immediately — and not at all if the question is answered within six seconds. Both are simply the existing behaviour of every other permission prompt; the picker is no longer a special case.
- Upgrading removes the `PreToolUse` entry automatically; nothing is asked of the user.
- Dropping `PreToolUse` retires the one hook in this project that could ever block a tool call outright (exit code 2 on `PreToolUse` means "do not do this"). The exit-0 discipline in `play-category.js` / `play-category.ps1` stays regardless — cheap insurance against it being wired there again.

## Provenance

Diagnosed 2026-09-08 in a Claude Code desktop session with a process watcher; see the PR that introduced this file.
