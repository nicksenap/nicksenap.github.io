---
title: "Code mode"
description: "We let our agent write JavaScript that calls its own tools. A question across 700 accounts went from impossible to two minutes. Here is what we built, what surprised us, and why I think more teams should try it."
pubDate: 2026-11-20
tags: ["ai", "llm", "agents", "tools"]
---

One of the first things we tried on a new version of our agent was a simple question: what was last week's spend in every account, ranked? The customer had about 700 accounts. Our agent is allowed a few dozen tool calls per turn, so the honest answer was "I can't".

Today it answers in about two minutes. What changed is that we let the agent write code.

The idea is called "code mode". Cloudflare [gave it the name](https://blog.cloudflare.com/code-mode/) and Anthropic described [the same thing for MCP](https://www.anthropic.com/engineering/code-execution-with-mcp): let the model write a small program that calls the tools, and hand back only what the program returns. I spent the last two weeks adding it to the AI agent my team builds, and I think more teams should try it.

## Let the model write the loop

The agent got one new tool that takes a piece of JavaScript:

```js
const { items } = await tools.list_items();
const details = await Promise.allSettled(
  items.map((item) => tools.get_item({ id: item.id }))
);
return items.map((item, i) => ({ name: item.name, status: details[i].value?.status }));
```

It runs in [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly, on its own worker thread, with no network, file system or timers. It can only reach `tools`, and the model only sees the return value, so twelve tool results become one small array.

Getting the model to use it was the easy part. We gave it a description and no examples. Models have written `Promise.allSettled` over a list a million times, and in my first trial every script ran correctly on the first try.

## What it unlocked

The 700-account question came from my colleague [Gabriel](https://glundgren93.github.io/), who built a version of the agent that works across all of a customer's accounts at once. One script queries all 700, deals with the fifty or so that fail, and returns the top ten. Without scripts that feature would have no way to answer its most obvious question.

Then there are files. A script can save what it collected as a file and pass only the file's id to our Python sandbox. In one test a script built a 1.8 MB file of 12,000 records and Python summed it up, while the conversation stayed under 6% of the context window. The data went from tools to script to Python and the model never read a byte of it.

Everyday questions got cheaper too. A chain of four dependent calls for eight items went from 58k input tokens to 16k.

## What we learned

My favourite bug: an error thrown inside QuickJS became `{}` on the way out, so a failed call looked like an empty result and the model cheerfully reported "no data". Errors now cross the sandbox with their code and message.

Scripts are very good at hiding failure. A model that catches every error and fills in a placeholder gets output that looks like data. So every result now lists the calls that failed, and the model reports them.

One turn ran two scripts of about 180 queries each and ran out of budget half way through both. The model had no idea that scripts share one budget per turn. Now the description says so, and suggests one query broken down by date over one query per day.

For one or two lookups a script is slower, because writing it is an extra step. We put that in the tool's description, and the model listens: in a benchmark it never used a script where a single call would do.

And scripts can only read. A call from a script skips the agent loop, so the approval we ask for before a write would never appear. Where we wanted a script to help with writes, it prepares the changes and a normal tool asks for one approval for the whole batch.

## Tell the model what tools return

The latest improvement came from watching the logs. Before writing a script, the model would often call each tool once on its own, just to see what the result looks like. Our tools only described their input.

[pi](https://github.com/earendil-works/pi), the coding agent I use, has its own code mode, and it renders every tool a script can call as a TypeScript declaration generated from the schema. I borrowed the idea as it is:

```ts
tools.get_item({ id: string; detail?: "compact" | "full" })
  -> { id: string; name: string; status: string; updated_at: string | null }
```

For the tools that now have a result type, the extra calls disappeared. On questions that use a script, a turn went from 359k tokens to 278k and from 5.5 model steps to 4.3, with the same answers.

## Try it

If your agent already has tools with schemas, you are most of the way there. A sandbox, a list of read-only tools and one tool description gave us the first version. Result types made it good.

We still have tools without a result type, and that is what I'm fixing next. After that I want to see how much more of the agent's work can move into scripts. I suspect it is a lot.
