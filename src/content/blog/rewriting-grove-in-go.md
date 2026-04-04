---
title: "Rewriting Grove in Go"
description: "I rewrote my CLI from Python to Go for performance, distribution, and the excuse to learn a new language. 10x faster on fast commands, 3x on git-heavy ones, and a plugin system that fell out naturally."
pubDate: 2026-04-04
tags: ["go", "python", "performance", "cli"]
---

A few weeks ago I wrote about [optimizing Grove's Python implementation](/thoughts/cli-got-slow) — deduping subprocess calls, threading, caching. That got the hot path from 10 seconds to 200 milliseconds. Problem solved, right?

Kind of. The optimized Python version was fast *enough*, but there was a floor I couldn't get past. Every invocation paid ~100ms just for Python to start up: importing Typer, Rich, Click, and the rest of the dependency tree. The actual work hadn't even begun yet. For a CLI you run dozens of times a day, that tax adds up.

So I rewrote it in Go.

## Why rewrite

Three reasons, in order of honesty:

**Distribution pain.** Python's dependency tree is unpredictable. When I added MCP server support, `cryptography` got pulled in transitively — it has no pure-Python wheel, so now my Homebrew formula needed Rust and OpenSSL as build dependencies just to install a Python CLI. A [one-line version bump](https://github.com/nicksenap/grove/commit/5f0c6a29d10b470ac843bda42f009b0470379491) turned into adding `depends_on "rust" => :build` and `depends_on "openssl@3"` to the formula. Every new dependency was a coin flip on whether the formula would break. Go produces a single static binary. No runtime, no transitive surprises, no formula surgery.

**Performance.** That 100ms import overhead bothered me. Not because it was slow in absolute terms, but because it was *wasted* time. The program knew what it needed to do; it was just waiting for the interpreter to load libraries it might not even use for that particular command.

**Learning a compiled language.** I'd been writing Python for years and wanted to pick up something lower-level. Rust was the obvious choice, but the learning curve felt too steep for a side project I actually wanted to ship. Go hit the sweet spot: compiled, statically typed, good concurrency primitives, but not fighting the borrow checker at 11pm. Rewriting a tool I already understood meant I was learning a language without also learning a problem domain.

## Benchmarking it

I wanted actual numbers, not vibes. So I wrote a [benchmark script](https://github.com/nicksenap/grove/commit/8bf54aaf31b00a276d53b5014b9a4a1861c070eb) that sets up an isolated environment — five test repos, a workspace, a preset — and times both implementations over multiple iterations.

The script uses `uv run gw` for Python (so it picks up the actual Python entry point) and the compiled Go binary. Each command gets a warmup run, then 20 timed iterations. Timing uses nanosecond-resolution monotonic clocks.

Here's what came out on an M1 Pro:

| Command | Python | Go | Speedup |
|---|---|---|---|
| `--version` | 119 ms | 12 ms | **10x** |
| `list` | 116 ms | 12 ms | **10x** |
| `ws show --json` | 123 ms | 12 ms | **10x** |
| `doctor --json` | 162 ms | 11 ms | **15x** |
| `preset list` | 113 ms | 11 ms | **10x** |
| `status` | 207 ms | 71 ms | **3x** |
| `create + delete` | 427 ms | 153 ms | **3x** |

Two clusters jump out.

**Fast commands (10-15x).** These are the commands that read a JSON file or print a value and exit. `list`, `--version`, `preset list` — they do almost no real work. In Python, the import overhead dominates: ~100ms loading libraries, ~15ms doing the actual thing. Go just does the thing. The 10x here is really measuring Python's startup cost, not a difference in algorithmic efficiency.

**Git-heavy commands (~3x).** `status` runs `git status` across multiple repos. `create + delete` runs `git worktree add`, `git checkout`, then tears it all down. These commands spend most of their wall time in git subprocesses, which are the same speed regardless of which language spawned them. Go is still faster — it starts the subprocesses sooner and has less overhead between them — but git is the bottleneck, not Grove.

The 3x number is honest. If your CLI mostly shells out to other programs, a rewrite won't magically make those programs faster. The win is on everything *around* the subprocess calls: startup, argument parsing, state management, output formatting. For the commands where Grove does the heavy lifting itself, the improvement is dramatic.

## Plugins

The Go rewrite also gave me a natural place to add something I'd been wanting: a plugin system.

It follows the git model. When you run `gw foo`, Grove checks its built-in commands first. If there's no match, it looks for a `gw-foo` executable in `~/.grove/plugins/` or on your `$PATH`, then `exec`s it with environment variables pointing at Grove's config and state files.

```bash
gw plugin install nicksenap/gw-dash    # fetch from GitHub Releases
gw plugin list                         # see what's installed
gw plugin upgrade                      # update all
```

Since plugins are standalone binaries, they can be written in any language. The install command downloads the right binary for your OS and architecture from GitHub Releases — goreleaser makes this trivial for Go plugins.

There are three first-party plugins so far:

- **gw-claude** — Claude Code integration. Syncs memory files between source repos and worktrees, copies `CLAUDE.md` files, manages session tracking hooks.
- **gw-dash** — A TUI dashboard for monitoring Claude Code agents across workspaces. Kanban-style, lives in the terminal.
- **gw-zellij** — Zellij integration for closing panes when you're done with a workspace.

The plugin contract is intentionally minimal: you get env vars (`GROVE_DIR`, `GROVE_CONFIG`, `GROVE_STATE`, `GROVE_WORKSPACE`) and full terminal control. No shared libraries, no IPC, no plugin SDK to version. A shell script works. A Go binary works. Anything executable works.

This was harder to do cleanly in the Python version. Distribution was already a headache for Grove itself — asking plugin authors to deal with it too felt unreasonable. With Go, `gw plugin install` just downloads a tarball and extracts a binary. Done.

## What I learned

I'll be honest: Claude Code wrote most of the Go. I didn't build muscle memory for the syntax — I couldn't hand-write a goroutine from scratch without looking it up. But when the agent writes code fast enough, you stop learning *how to type* the language and start learning *how to think* in it. You can run ten iterations of an architecture in an afternoon, and each one forces a judgment call: is this the right abstraction? Should this be a plugin or core? Is this dependency worth the cost? That's a different kind of learning — less mechanical, more architectural — but it's real. It's your taste and judgment getting trained, not your fingers.

The decisions that mattered most:

**Minimize dependencies.** The Python version pulled in Typer, Rich, Click, and a stack of transitive deps — which is what caused the Homebrew formula headaches in the first place. For the Go rewrite I was deliberate about keeping the dep tree small. The core binary depends on cobra, toml, term, and sqlite. That's it. No [Charm](https://charm.sh/) libraries, no TUI framework. We even hand-rolled the interactive repo picker instead of pulling in a library for it. Fewer deps means fewer things that break, fewer things to audit, and a faster build.

**Push complexity to the edges.** The Python version had Claude Code and Zellij support baked into core — hardcoded `CLAUDE.md` copying, memory sync logic, Zellij close-pane fallbacks. It worked, but it meant Grove was opinionated about *which tools* you used, and every integration added surface area to test. In [v1.1.0](https://github.com/nicksenap/grove/releases/tag/v1.1.0) I extracted all of that into plugins and made the core tool-agnostic. Grove is now a pure git worktree orchestrator. Tool-specific behavior is composable via lifecycle hooks:

```toml
[hooks]
post_create = "gw claude sync rehydrate {path} && gw claude copy-md {path}"
pre_delete  = "gw claude sync harvest {path}"
on_close    = "gw zellij close-pane"
```

Anything that needed heavy dependencies or was hard to test — like the [TUI dashboard](https://github.com/nicksenap/gw-dash) — became a plugin with its own `go.mod`. The dashboard uses Bubble Tea and Lipgloss (Charm's TUI stack), and that's fine because it's a separate binary. The core stays lean and bulletproof; the plugins can pull in whatever they need.

## Was it worth it

For users: yes. A 10x faster startup and zero-dependency install is a meaningful quality-of-life improvement for a tool you use all day.

For me: also yes, but for different reasons. I learned a language, I got a cleaner distribution story, and the plugin system fell out naturally from the "everything is a static binary" model. The performance was the justification, but the side effects were the real win.

The code is on [GitHub](https://github.com/nicksenap/grove).
