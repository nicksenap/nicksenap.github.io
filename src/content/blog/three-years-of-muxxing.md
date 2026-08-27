---
title: "Three years of muxxing"
description: "Three years of swapping terminals and coding agents, hop by hop: Warp, Cursor, Zellij, cmux, Herdr, and why each one stopped being the right machine."
pubDate: 2026-08-27
tags: ["terminal", "ai", "tools"]
---

A mux is a terminal multiplexer. One window, many terminals: tabs, split panes, sessions you can detach from and come back to. tmux is the classic. Zellij, cmux, and Herdr are later takes, some of them built around coding agents instead of just shells.

I've been swapping that layer, and the rest of the stack around it, for about three years. Not because I enjoy ricing. Each hop was a response to a specific problem, and the problem kept changing.

I currently run Ghostty + [Herdr](https://herdr.dev) + [Pi](https://pi.dev) + [Helix](https://helix-editor.com). Getting here:

```
Warp + Cursor
→ Warp + Claude Code + VS Code
→ Alacritty + Zellij + Claude Code + Helix
→ cmux + Claude Code + Helix
→ cmux + Pi + Helix
→ Ghostty + Herdr + Pi + Helix
```

Here's what each stack was actually for, and what broke it.

## Warp + Cursor

I picked up [Warp](https://www.warp.dev) at Klarna, after it went public beta in April 2022. For a long time that's all it was: the terminal that made the default macOS one feel antique. GPU rendering, blocks of output you could select as a unit, a genuinely good Ctrl-R. I used it as a terminal.

Then they started bolting an agent onto it. By [Warp 2.0](https://www.warp.dev/blog/reimagining-coding-agentic-development-environment) in 2025 they were calling the whole thing an Agentic Development Environment. The in-house agent, the block UI, the later "software factory" talk. The product kept growing on top of the thing I had opened it for.

I don't think that's a stupid bet for them. I just didn't want my *terminal* to be the agent. I wanted a terminal.

[Cursor](https://cursor.com) came later, at Footway. It [launched](https://cursor.com/changelog/0-2-6) in 2023 as a VS Code fork with GPT-4. [Claude 3 Sonnet](https://www.anthropic.com/news/claude-3-family) landed in March 2024 and became the other model you actually used. Composer, the agent sidebar, tab-complete that was actually useful. It lived in the editor, which made sense when the editor was still the center of the work.

Then [Claude Code](https://www.claude.com/product/claude-code) showed up as a CLI. It can run tests, git, the shell: the whole machine, not just the buffer. Once I'd used that, Cursor's agent felt boxed. It was still an IDE feature. Claude Code was a process.

That's the first split: Warp was stuffing its own AI into the glass, and Cursor couldn't leave the editor.

## Warp + Claude Code + VS Code

So I ran Claude Code in Warp and kept an editor around to look at the result.

I didn't want another IDE. I wanted something dumb that could open a file, show a diff, and get out of the way. VS Code is that, if you ignore the rest of it. No Composer, no Copilot-as-the-point. Just a viewer with a file tree.

This stack *worked*. It's also an awkward machine. Warp still wanted to be the agent, while Claude Code already was, so you had two AI surfaces fighting over the same TTY. And VS Code is still a GUI: mouse, tabs, a window that isn't the terminal. Every time I jumped over to check a file I dropped out of the loop I'd just been in.

The thing I actually wanted, I only named later: stay in the TTY, stay on the keyboard, do the whole job without leaving.

## Alacritty + Zellij + Claude Code + Helix

That's the hop that looks like taste and was really about flow.

[Helix](https://helix-editor.com) is a modal editor that runs in the terminal. Selection-first, LSP in the box, no plugin ecosystem to babysit. The conversion cost is real. It's not VS Code with vim keys. But once muscle memory caught up it was also a touch faster. No Electron, no extension host waiting on a file open. The viewer finally lived in the same place as the agent.

[Alacritty](https://alacritty.org) was the glass. GPU terminal, almost no features, which was the point after Warp. I didn't want blocks or an ADE. I wanted pixels and a PTY.

[Zellij](https://zellij.dev) was the first mux that mattered. Tabs, sessions, layouts, unlocked-by-default movement. `Ctrl-p h` moves a pane and you're immediately back in the program. Compared to tmux's prefix lock, that feels like the multiplexer getting out of the way.

I put [Grove](https://github.com/nicksenap/grove) on top of it. Grove is a CLI I wrote for managing git worktrees across multiple repos: `gw create`, pick some repos, get a workspace. In Zellij I treated each tab as one Grove workspace, one logical segment per branch. Fast switching. It was a workspace model I was maintaining by convention. Tab names meant something only I had agreed they meant.

That's also when I found [Atuin](https://atuin.sh). Warp's Ctrl-R is genuinely good; leave Warp and you notice the hole. Atuin is shell history you can actually search, synced if you want it. Caps Lock has been Ctrl for a long time, so Ctrl-R is a home-row reflex rather than a stretch.

[Yazi](https://yazi-rs.github.io) for files. [Lazygit](https://github.com/jesseduffield/lazygit) sitting in the same toolkit, still being learned. Those three didn't cause a hop. They just never left.

Zellij + Grove was a good first version of "many agents, many branches, switch quickly." It was also homemade. The next tool made that obvious.

## cmux + Claude Code + Helix

[cmux](https://cmux.com) is a Ghostty-based macOS terminal whose unit of work is the **workspace**: agents, panes, notifications, a sidebar that knows which session needs you. Not a tab you remember means "this branch." A workspace.

That's what Grove-in-Zellij had been approximating. cmux shipped it as a product. The hop wasn't "a better mux." It was "someone else already knew the unit."

I ran Claude Code in those workspaces for a while. It was a clear upgrade on the tab convention.

Two things I didn't use, and one of them is worth naming because cmux advertises it hard: the in-app browser.

cmux lets you split a [browser pane](https://cmux.com/) next to the terminal. On paper that's the dream: agent on the left, the app it's building on the right. In practice it's a [WKWebView](https://github.com/manaflow-ai/cmux/issues/10084), not Chrome. Sites go mobile because the CSS viewport is the pane width. The omnibar can lag [seconds per keystroke](https://github.com/manaflow-ai/cmux/issues/4642). Panes [go blank](https://github.com/manaflow-ai/cmux/issues/949) when you drag them, [stay blank](https://github.com/manaflow-ai/cmux/issues/5103) after a relaunch, [reload](https://github.com/manaflow-ai/cmux/issues/1132) when you switch workspaces. Auth that works in Chrome [doesn't](https://github.com/manaflow-ai/cmux/issues/5117). There's no CDP endpoint, so if an agent needs Playwright it [spawns a real Chrome outside cmux](https://github.com/manaflow-ai/cmux/issues/3442) and the integration is the first thing to go.

I never used it. A browser that isn't a browser is worse than Cmd-Tab.

## cmux + Pi + Helix

This one was Funnel. Claude Code didn't lose on capability. It lost on being a worse product to pay for, and a heavier harness.

Two things in particular.

First, they shipped a classifier into the prompt. From v2.1.91, if `ANTHROPIC_BASE_URL` isn't `api.anthropic.com`, Claude Code checks the hostname against a hidden China-linked domain list, checks whether your timezone is `Asia/Shanghai` or `Asia/Urumqi`, and encodes the verdict into the system prompt by changing punctuation in `Today's date is …`. [Vincent Schmalbach reverse-engineered it](https://www.vincentschmalbach.com/claude-code-china-router-fingerprint/). That's a hidden classifier, injected into *your* context.

Second, the subscription started feeling like a squeeze. Five-hour rolling windows. Peak-hour drain, which Anthropic later [admitted existed by removing it](https://www.anthropic.com/news/higher-limits-spacex). And Fable 5 landed on the API, not the sub. People with Max plans watched `/usage` show unused Fable quota while `/model` said [credits only](https://github.com/anthropics/claude-code/issues/78613).

On top of that the harness is heavy. Same model, more tokens. That matched what I was seeing. A [writeup of a Databricks internal pairing](https://ryrenz.com/ai/pi-vs-claude-code-codex/) put Pi at about half Claude Code's cost per task on the same Opus run. Not a public paper, but the direction is the same.

I tried [OpenCode](https://opencode.ai). Didn't stick. [Pi](https://pi.dev) did: small system prompt, you pay the model, it lives in the same TTY as everything else.

## Ghostty + Herdr + Pi + Helix

cmux taught me workspaces. Then two things made it the wrong home.

It wouldn't let me resize a pane from the keyboard. Mouse-drag the divider, or don't. [The issue](https://github.com/manaflow-ai/cmux/issues/1756) opened in March. The PR that would add keybindings is [still open](https://github.com/manaflow-ai/cmux/pull/4025). After Helix, that's not a missing shortcut. That's a daily break in a keyboard-only loop.

And it got slower than Ghostty while wrapping libghostty. Embedding the emulator is not the same as being the emulator. People were filing [typing latency](https://github.com/manaflow-ai/cmux/issues/4681) against the same Ghostty + tmux setup that felt fine outside cmux. I felt it locally too.

Alacritty and [WezTerm](https://wezfurlong.org/wezterm/) were the obvious glasses to go back to. WezTerm's last stable is February 2024; the README still calls it a spare-time project. Alacritty is minimal and slower-moving. [Ghostty](https://ghostty.org) is the one that's actually shipping: native macOS app, libghostty as a library, active enough that I don't worry the glass will freeze under me.

I wouldn't have re-homed in Zellij. I'd be back to Grove-tabs-as-workspaces.

[Herdr](https://herdr.dev) is the landing. It has cmux's agentic pieces (workspaces, agent sidebar, blocked/done, notifications) in a terminal mux. It's a server that owns PTYs. Close Ghostty, agents keep running. `prefix+g` jumps anywhere.

Herdr also has a stock worktree dialog on `prefix+shift+g`. It's a nice modal: type a branch name, Enter. It's also single-repo. Grove is the opposite: one branch, many repos, one workspace. If I used Herdr's `worktree create` I'd be fighting Grove. So I rebound that key to Grove and let Grove own the checkouts.

A regular Herdr popup can't set its own title. A tiny plugin pane can:

```toml
# ~/.grove/herdr-plugin.toml
id = "grove.workspace"
name = "Grove Workspace"

[[panes]]
id = "create"
title = "Grove"
placement = "popup"
width = 72
height = 18
command = ["./hooks/herdr-create.sh"]
```

```toml
# ~/.config/herdr/config.toml
[keys]
new_worktree = ""

[[keys.command]]
key = "prefix+shift+g"
type = "shell"
command = "herdr plugin pane open --plugin grove.workspace --entrypoint create"
```

The script asks for a workspace name (Escape dismisses), then runs `gw create "$name"`. Grove still does the repo picker. After create, a `post_create` hook opens a Herdr workspace on that path; `pre_delete` closes it on `gw delete`.

```text
prefix+shift+g
        ↓
Grove popup: type a name
        ↓
gw create my-feature
        ↓
Grove post_create
        ↓
herdr workspace create --cwd <grove-path>
```

That's the Zellij-tab convention, except nobody has to remember what the tab meant. Once the rest of the mental model formed (workspace / tab / pane / agent, prefix talks to Herdr, no prefix talks to Pi) it stopped feeling like three products glued together. Hide the sidebar if you want. The goto picker is the navigator.

That's what I'm running today. Ghostty as the glass, Herdr as the runtime, Pi as the agent, Helix as the viewer. Yazi and Atuin came along for the whole ride. Lazygit is still sitting there. I should actually learn it.
