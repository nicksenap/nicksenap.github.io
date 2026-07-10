---
title: "A wall of AI slop, and the shim underneath it"
description: "I ported a Python agent to TypeScript in a week. Then Amazon's eval product refused to score it, support sent two thousand words of nothing, and the real answer turned out to be sitting in an open-source file the whole time."
pubDate: 2026-07-10
tags: ["aws", "observability", "otel", "typescript", "ai"]
---

In [To the moon](/thoughts/to-the-moon) I mentioned, almost in passing, porting a service to a new language and new infrastructure in a single week. That service was a Python agent, rewritten in TypeScript, moved onto [Amazon Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/). This is the bill for that week.

The agent works fine. The problem is telemetry. I wanted AgentCore's managed **Evaluations** — Faithfulness, Correctness, tool-selection accuracy — to grade production traffic automatically. It produced exactly zero scores. The console said **"No events available."**

## The slop

So I opened a support case with five specific questions. Amazon Premium Support replied with about two thousand courteous, well-formatted words that answered "strictly from current AWS documentation" and, where the docs were silent, declined to speculate:

> I could not find any AWS documentation that establishes the TypeScript Strands SDK as a supported source for the content based evaluators, so I cannot confirm it is available today.

> I did not find any AWS documentation that announces TypeScript content based evaluation availability or a timeline for it, and I will not speculate on unannounced availability. Product roadmaps are internal.

Every sentence was defensible. The whole thing was useless. It read like output from a model told never to be wrong — which, in 2026, it probably was. Optimize hard enough for *never say a false thing* and you converge on beautifully-formatted nothing.

The catch: the thing I needed *was* one of the things the docs are silent about. So the documentation was never going to answer it. But the source code would.

## Why Python works and TypeScript doesn't

The content evaluators don't read the model's input/output from the span. They read it from a *separate* OpenTelemetry **log record** whose body carries `input.messages` / `output.messages`, correlated to a span by trace and span ID. A session only gets graded when every span has its matching event.

Nothing in a Node stack writes those events. The ADOT **Python** distro ships an [LLO handler](https://github.com/aws-observability/aws-otel-python-instrumentation) that harvests `gen_ai.*` content off spans and re-emits it as those log records, automatically. The ADOT **Node** distro has no equivalent, and [Strands](https://strandsagents.com/) itself only attaches content as span events, which the evaluator ignores.

There's a second gap: the evaluator only processes spans whose scope is `strands.telemetry.tracer`. Python names its tracer exactly that — for free, from the module name. The TypeScript SDK names it after the service, so our spans were skipped before anyone read them.

Both gaps are a direct consequence of the port. Support's "Python is the only documented path" was correct *and* unactionable. But the Python handler is open source, the evaluator was built against its output, and that output is the real spec. Nobody wrote it down. It was a `git clone` away the whole time.

## The shim

A self-contained CommonJS preload — fenced in a `telemetry/` folder, behind an env flag, fully reversible — that reproduces the Python handler in Node. The whole thing, end to end:

<pre class="mermaid">
flowchart TD
    A["Strands TS SDK: one turn produces a span + gen_ai.* span events"]
    A --> B["getTracer patch: remap scope to strands.telemetry.tracer"]
    B --> C["NodeSDK patch: inject a SpanProcessor (OTel JS 2.x has no addSpanProcessor)"]
    C --> D["onEnd(span): read gen_ai.* events, build input/output messages"]
    D --> E["emit an OTEL log record, correlated to the span by traceId + spanId"]
    A --> F[("aws/spans")]
    E --> G[("eval-events log group")]
    F --> H{{"evaluator: match span + event by traceId/spanId"}}
    G --> H
    H --> I["scores"]
</pre>

Two monkeypatches and a bridge, all installed *before* ADOT starts — which is exactly why the file is `.cjs` and `--require`d first. `require` runs synchronously, so the patches are guaranteed in place before ADOT constructs the SDK (an ESM `--import` would be async and hoisted — wrong for this).

```js
const { trace, context } = require("@opentelemetry/api");
const { logs } = require("@opentelemetry/api-logs");

// A. Give the Strands tracer the one scope the evaluator accepts.
const getTracer = trace.getTracer.bind(trace);
trace.getTracer = (name, ...rest) =>
  getTracer(name === "strands-agents" ? "strands.telemetry.tracer" : name, ...rest);

// B. OTel JS 2.x dropped addSpanProcessor(), so wrap the NodeSDK constructor
//    to inject our processor into the list ADOT builds.
const sdk = require("@opentelemetry/sdk-node");
const NodeSDK = sdk.NodeSDK;
sdk.NodeSDK = function (cfg = {}) {
  cfg.spanProcessors = [...(cfg.spanProcessors ?? []), evalProcessor];
  return new NodeSDK(cfg);
};

// The bridge: every ended in-scope span -> one correlated log record.
const evalProcessor = {
  onStart() {}, forceFlush: async () => {}, shutdown: async () => {},
  onEnd(span) {
    if (span.instrumentationScope.name !== "strands.telemetry.tracer") return;
    const { input, output } = messagesFrom(span); // the shape that took days — see below
    logs.getLogger("strands.telemetry.tracer").emit({
      body: { input: { messages: input }, output: { messages: output } },
      attributes: { "event.name": "strands.telemetry.tracer", "session.id": span.attributes["session.id"] },
      context: trace.setSpanContext(context.active(), span.spanContext()), // the correlation
    });
  },
};
```

One more: a force-flush at the end of every turn. AgentCore freezes the microVM between invocations, so the batch processor's background timer never fires and nothing exports.

## Six bugs in a trench coat

It didn't work the first time, or the sixth. It was a stack of six bugs, each one hiding the next. Every fix unlocked the following failure:

| # | The bug | Why it was invisible |
|---|---------|----------------------|
| 1 | Tracer scope was `strands-agents`, not `strands.telemetry.tracer` | Spans looked fine; the evaluator just skipped them |
| 2 | Content lived in span events, not log records | Node has no LLO handler, so nothing wrote them |
| 3 | Two copies of `@opentelemetry/api-logs` in the tree | My logger read a *different* provider instance → a silent no-op → every `emit()` discarded |
| 4 | The flush was a no-op | `getLoggerProvider()` returns a proxy with no `forceFlush`; only its hidden delegate has it |
| 5 | The log *stream* didn't exist | The CloudWatch OTLP endpoint won't create it; exports failed `400`, and the batch processor swallowed the error |
| 6 | `session.id: None` on a sub-agent | It ran outside the baggage context |

Bug #3 is the one I'm fond of, the way you're fond of a scar: two versions of the same package, so my shim handed every log line to a no-op logger that cheerfully binned it. No error, no warning, nothing forever.

What cracked it: I replayed the OTLP export by hand, signing it with SigV4 myself, and finally saw the `400 — log stream does not exist` that the batch exporter had been eating. That exporter fails quietly by design. When you're debugging it, that's a feature pointed the wrong way.

## The red herring

Then a real evaluation choked with `SpanEventParsingException` on my message `content` — a `parts: [...]` array copied from the TS SDK. I flattened it to a string, the error cleared, and I shipped it. Wrong. Now the agent spans threw `AgentSpanMappingException`, and this is where I nearly wrote back to support, because AWS's *own* documented example threw it too.

Back to the source. The Python SDK defaults to the *stable* gen_ai conventions, not the latest-experimental ones I'd opted into for convenience — and the handler sets each message's `content` to the event's **attribute dict**. Not a string. Not a `parts` array. A dict.

The error progression was the map — each new exception meant one rung climbed:

> `SpanEventParsingException` → `AgentSpanMappingException(user_query)` → `(agent_response)` → score

The fix was to stop inventing shapes: pin the runtime to stable conventions, and emit exactly what the Python handler emits — route each per-message event by name, and set `content` to the event's attribute dict, verbatim.

```js
const ROUTE = {
  "gen_ai.system.message": ["system",    "input"],
  "gen_ai.user.message":   ["user",      "input"],
  "gen_ai.tool.message":   ["tool",      "input"],
  "gen_ai.choice":         ["assistant", "output"],
};
function messagesFrom(span) {
  const input = [], output = [];
  for (const ev of span.events) {
    const [role, dir] = ROUTE[ev.name] ?? [];
    if (!role) continue;
    (dir === "output" ? output : input).push({ role, content: { ...ev.attributes } });
  }
  return { input, output };
}
```

## The result

Verified against the live Evaluate API, using the actual shim output over real production sessions — agent and tool spans:

> Helpfulness **0.83** · Correctness **1.0** · ToolSelectionAccuracy **1.0** · ToolParameterAccuracy **1.0**

Real scores, from a pure TypeScript container, no fork of the SDK or the distro. The thing support couldn't confirm was possible had been possible all along. It was just written in Python and never translated.

The shim is a hack and I wrote it down as one — it monkeypatches OTel internals and could break on any upstream release, so it degrades to a no-op rather than ever taking down the runtime. I filed the two upstream asks that would let me delete half of it: name the TS tracer correctly, and ship an LLO handler for ADOT JS.

The port was the leap of faith. This was the landing — quieter, slower, and mostly spent reading the source instead of the slop.
