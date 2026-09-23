---
title: "One model name"
description: "I put a router in front of our coding agents so nobody has to pick a model. It classifies each turn and sends it to the cheapest model that can handle it. Most of the work was making it survive the word 'continue'."
pubDate: 2026-09-24
tags: ["ai", "tools", "llm", "cost"]
---

Coding agents resend the whole conversation every turn, and most turns are not hard. I wanted one model name in the agent config, `billy-goat`, and a proxy behind it that picks the cheapest model that can do the job. Developers stop thinking about models; the bill goes down. That was the pitch. Here's what it took to make it actually route well.

## Where the money goes

Before building anything I harvested 60 days of my own [pi](https://github.com/earendil-works/pi) session logs and grouped every human ask by the shape of the reply it produced:

| reply shape | share of asks | share of cost |
|---|---:|---:|
| ack / short ask (`yes`, `A`, `ok go`) | 23% | **39%** |
| no tools | 25% | 2% |
| 1–5 tool calls | 19% | 5% |
| 6–20 tool calls | 17% | 12% |
| 20+ tool calls | 17% | **42%** |

44% of asks (no tools, or one to five tool calls) account for 7% of cost. Routing those to a cheap model is low-risk, and it barely moves the bill. The row that matters is the top one: 23% of asks are a word or two long and they cost 39% of the total, because that word is "go" at the end of a long planning session, and what follows is forty tool calls on a frontier model.

That row is the whole problem. A router that reads the latest message will look at `continue` and route it to the cheapest tier.

## The setup

[LiteLLM](https://docs.litellm.ai/) has a beta [auto-router](https://docs.litellm.ai/docs/proxy/auto_routing) with a complexity classifier built in, so I didn't write one. Four tiers on Bedrock global endpoints, [prices](https://aws.amazon.com/bedrock/pricing/) per million input/output tokens:

```
pi / Claude Code ──► LiteLLM :14000 ──► billy-goat
                                        ├─ SIMPLE    → Luna   ($0.20 / $1.20)
                                        ├─ MEDIUM    → Terra  ($2 / $12)
                                        ├─ COMPLEX   → Sol    ($4 / $20)
                                        └─ REASONING → Fable  ($10 / $50)
```

A small classifier call decides the tier with structured output, a ceiling on how long it may take (2.5 seconds at first, 5 seconds now; more on that below), and a fallback to Sol if it fails. Responses always say `"model": "billy-goat"`; the real model is in a response header. LiteLLM's own cost headers price each response at the tier that actually served it, so a Fable turn bills as Fable, not as the alias.

The first version worked immediately and was wrong in exactly the way the table predicts. We were rewriting a service in Rust. The opening ask classified REASONING → Fable, correctly. Two turns later the agent stalled, I typed `continue`, the classifier said "easy" → Luna, and Luna tried to continue a Rust rewrite from a cold start.

## Three things that fixed it

**Bounded context for the classifier.** LiteLLM can hand the classifier the last few turns instead of the last message. I give it four turns, 500 characters each, assistant turns included. That's enough to see that `continue` refers to a Rust rewrite, and cheap enough that the classifier stays under a second at p50. The rubric says it explicitly: classify the active task, not its latest wording; never lower for short wording.

**Reuse the decision inside a turn.** An agent turn is one human message followed by a chain of tool calls, and each tool result is a new request to the proxy. With a stable session ID from the client, LiteLLM reuses the human turn's tier for the tool-result continuations instead of reclassifying each one. Without the ID it reclassifies, which is safe but wasteful.

**Fail upward.** Classifier failures go to Sol. A short deterministic keyword list (`production incident`, `possible data loss`, `security vulnerability`, `credential leak`, `irreversible migration`) escalates to REASONING before the classifier runs. If a request won't fit the chosen model's context window it escalates. Nothing in the policy ever moves a request down on a technicality.

What I did not add: session affinity. Pinning a session to its first tier is the obvious fix for context-blindness and it fails the other way: a session that opens with "what does this repo do" gets pinned to Luna and stays there when the next ask is "now rewrite the API layer". The bounded context handles both directions; the pin only handles one.

## Picking the classifier

The classifier is on the critical path of every turn, so its latency tail matters more than its accuracy. I ran the same rubric through all four models, 32 balanced cases each, at low reasoning effort:

| classifier | exact | p50 | p95 | max | calls > 2.5s |
|---|---:|---:|---:|---:|---:|
| Luna | 30/32 | 0.96s | 1.24s | 1.55s | 0 |
| Terra | 31/32 | 1.22s | 2.35s | 4.70s | 1 |
| Sol | 32/32 | 6.24s | 14.75s | 16.52s | 30 |
| Fable | 32/32 | 3.44s | 4.24s | 4.60s | 32 |

Terra was one label more accurate than Luna, which is noise at n=32. The tail decided it. In an earlier run, one Terra call hit the 2.5-second ceiling and LiteLLM's circuit breaker opened for the next five requests, so six requests in a row fell back to Sol, including two REASONING tasks. Four "misroutes" in that matrix were one slow call. Raising the ceiling to 5 seconds stopped the amplification but not the tail: Terra still had three calls over 5 seconds in a 100-call sample, with a maximum of 9.59s. Luna went 100 classifier-only calls with a max of 2.48s and zero over 2.5s, and 136 integrated routes with zero failures, zero fallbacks and one under-route that mattered (a MEDIUM task sent to Luna).

Every error Luna and Terra made in the direct comparison was in the expensive direction: COMPLEX classified as REASONING. That is the failure mode I want.

## What I got wrong about caching

My assumption going in was that switching models on any turn throws away the prompt cache, because caches are per model and the whole history gets resent. So a router would pay a full cache write every time it changed tiers, and could cost more than no router at all.

I measured it, sending an 11k-token stable prefix through the router while deliberately bouncing between tiers:

| route | cache read | cache write | cost |
|---|---:|---:|---:|
| Luna, first turn | 0 | 11,431 | $0.0029 |
| Terra, first switch | 0 | 11,468 | $0.0289 |
| Luna, return | 11,431 | 71 | $0.0003 |
| Sol, first switch | 0 | 11,540 | $0.0580 |
| Luna, second return | 11,502 | 71 | $0.0003 |
| Fable, plain text | 0 | 0 | $0.1743 |
| Luna, final return | 11,573 | 72 | $0.0003 |

The assumption was half right. A model that hasn't seen the prefix pays a full write. But a model that has seen it gets a hit when you come back, even after intervening turns went elsewhere; the 71-token writes on the Luna returns are just the newly appended suffix. Switching isn't an unconditional rewrite. It's a write the first time each model sees a prefix, and a read after that, bounded by cache retention.

The one real cache failure was Fable: zero read, zero write, full price every time (a direct repeat cost exactly the same $0.1715 as the first call). Anthropic models need explicit `cache_control` breakpoints, and the OpenAI-shaped request from pi doesn't carry them. LiteLLM has a setting that injects them after model selection; with it on, a repeat Fable request cost 97.9% less than the cold one, and an intervening Luna request didn't evict the entry.

## The other way to do this

Spotify published a Claude Code plugin called [shunt](https://engineering.atspotify.com/2026/09/portal-by-spotify-cut-my-claude-code-token-usage-by-90) that takes a different cut at the same bill. It never moves the conversation. Claude stays the agent, and a hook blocks whole-file reads over 350 lines (targeted reads with an offset pass through) and redirects them to a one-shot Gemini Flash call that returns a summary. The big files never enter the expensive context. They report about 90% fewer tokens in Claude's context on bulk reads, and they're explicit that reasoning, debugging and editing stay with Claude.

Because the main model never changes, it needs no classifier, no session state, and has no cache question. The cost is that it only works with an agent that supports hooks, a filesystem, and work that decomposes into tool calls, and the 90% is a context-token figure for one operation, not a bill. The router works for any OpenAI-compatible client with a one-line config change, and it's the only lever when there's no agent loop at all. I want both eventually. For now I wanted the one that needed no changes on the client side.

## Where it stands

It's an experiment, and the docs say so. Integrated routing on hand-authored cases is 96 to 100% exact; the direct classifier runs are lower (28 to 30 of 32 on the current prompt) and nearly every miss is an over-route; the classifier adds about a second per human turn. Every decision is logged to a sanitised JSONL ledger (serving model, tokens, cache reads and writes, cost, latency; never prompts) so the next step is possible: a manually labelled set of real asks with their real context, and a measured answer to whether the whole thing clears the 20% net saving I set as the bar for keeping it. The other go/no-go constraints are written down too: zero under-routes on production, security or migration work, under 2% under-routes that would have changed the answer, classifier p95 under 2.5 seconds.

The part I'd tell anyone building one: the router doesn't have to be perfect. It has to be measurable, it has to fail upward, and it has to know what `continue` means.
