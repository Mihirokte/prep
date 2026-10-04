---
id: ai-frameworks
chapter: ai-stack
title: Frameworks the honest take
minutes: 7
---
The framework question, should we use LangChain or build on raw SDKs, is a judgment test disguised as a tooling question. A strong answer holds two true things at once instead of picking a tribe: frameworks save real work on genuinely complex control flow, and they add abstraction that obscures the prompts and responses you most need to see when debugging. Interviewers want the decision rule, not a favourite.

## The primary-sourced caution

Anthropic's engineering guidance is the anchor because it comes from a model provider, not a competing framework. In Building Effective Agents (2024) they write that many patterns can be implemented in a few lines of code, that frameworks often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug, and that teams are tempted to add complexity when a simpler solution would suffice. Their top recommendation is to start with direct API calls, and if you do use a framework, to make sure you understand the underlying code.

> **Key idea.** Start with direct API calls. Reach for a framework when you hit a concrete problem it solves, not in anticipation of one.

## The landscape, by what each is for

```steps
Direct SDK | The provider client plus your own code. Maximum control and visibility, you write the loop.
Orchestration | LangChain and LlamaIndex wrap chaining, retrieval, and tool glue into reusable components.
Graph control | LangGraph models an agent as an explicit state graph for complex branching and loops.
Focused libraries | DSPy (prompt optimisation), Pydantic AI and Instructor (typed structured output).
Multi-agent | CrewAI, AutoGen, OpenAI Agents SDK, Claude Agent SDK, for coordinating several agents.
```

All of these move fast, so read their own docs rather than comparison blogs, and expect APIs to churn.

## The abstraction-leak problem

A framework earns its keep by hiding detail, but an LLM app's hardest bugs live in exactly the detail it hides: the literal prompt sent, the raw response, the token counts, the retry behaviour. When a chain misbehaves you often have to read the framework's source to see the prompt it assembled, which can cost more time than writing the twenty lines yourself. This is the recurring 2025 to 2026 practitioner complaint about LangChain specifically (convergent across independent authors, secondary): it is just a wrapper, dependency bloat, and frequent breaking changes. The sentiment went from obvious yes to it depends, and most of the time, no.

## The decision rule

```flow
dir: TB
start: New LLM project | actor
simple: Simple chain or retrieval? | gate
sdk: Direct SDK plus your code | step
complex: Complex graph control flow? | gate
graph: LangGraph or similar | step
eco: Already in an ecosystem? | gate
fw: Shared framework | step
start -> simple
simple -> sdk : yes
simple -> complex : no
complex -> graph : yes
complex -> eco : no
eco -> fw : yes
eco -> sdk : no
```

Apply it to two teams. A three-person startup prototyping with no existing investment, probably not, start with direct API calls and stay close to the metal while the product is still moving. A forty-engineer platform team standardising a dozen product teams, the case for a shared framework (consistency, tracing integration, onboarding) is real, the cost of everyone reinventing the loop differently is higher than the abstraction tax. Hold both, do not treat it as binary.

```recall
Q: What is Anthropics primary-sourced advice on frameworks, and why does the source matter?
A: Start with direct API calls, add a framework only when it clearly helps, and understand its underlying code. It matters because Anthropic is a model provider, not a competing framework, so the advice is not a sales pitch.
Q: Why do LLM frameworks cause disproportionate debugging pain?
A: The hardest bugs are in the exact prompt sent and raw response returned, which is precisely the detail a framework abstracts away, so you often must read its source to see what you need.
Q: When is a shared framework the right call despite the abstraction cost?
A: On a large multi-team org where consistency, shared tracing, and onboarding matter, the cost of everyone reinventing the loop differently exceeds the abstraction tax. A tiny prototyping team usually does not clear that bar.
Q: Why read a framework docs rather than a comparison blog?
A: These tools change fast, so comparison blogs go stale and often carry SEO or vendor bias. The primary docs reflect the current API and capabilities you will actually depend on.
Q: What does should this team use LangChain really test in an interview?
A: Judgment, whether you can weigh control and visibility against reuse and consistency and give a context-dependent rule, rather than naming a favourite tool.
```

===DEEPER===

### What a framework actually gives you

Stripped of marketing, an orchestration framework provides four things: pre-built components (retrievers, chains, memory, tool wrappers), a standard interface so swapping a model or vector store is a config change, integrations (tracing, eval, vector DB connectors), and patterns encoded as reusable primitives. The value of each depends on scale. One developer on one app gets little from a standard interface they will never swap and integrations they could wire directly, but a platform serving many teams gets real value from a shared vocabulary and consistent tracing. This is why the honest answer is scale-dependent rather than absolute, the same abstraction that is overhead for one team is leverage for twenty.

### Graph control flow, where LangGraph earns it

The one case where a framework clearly beats hand-rolled code is genuinely complex control flow, an agent that branches, loops, retries, interrupts for human approval, and resumes from durable state. Modelling that as an explicit state graph (nodes as steps, edges as transitions, a persisted state object) is real engineering that LangGraph's primitives handle, and reimplementing it correctly, especially durable interrupt-and-resume, is substantial work. If your control flow is a straight chain or a simple retrieve-then-generate, you do not need this and the graph machinery is pure overhead, but when branching and resumable state are inherent to the problem, the primitives save weeks.

### The migration tax

A framework decision is sticky, because its abstractions spread through your code, call sites, prompt templates, memory handling, tool definitions all take the framework's shape, so leaving it later is a rewrite, not a config change. That stickiness is the real argument for starting with direct SDK calls on a young project: you keep optionality, and adopting a framework later when you understand your actual needs is far cheaper than ripping one out after it has grown into everything. The reverse migration, from a framework to raw SDKs because the abstraction got in the way, is the painful one teams report, which is itself evidence for the start-simple default.

### Focused libraries are a third option

The debate is often framed as full framework versus nothing, but focused single-purpose libraries occupy a useful middle. Instructor or Pydantic AI add typed structured outputs without taking over your control flow, DSPy optimises prompts without owning your retrieval, and you can adopt one for the one problem it solves while writing everything else directly. This composes better than a monolith, you pay abstraction cost only where it buys something, and each library is small enough to understand fully, which satisfies Anthropic's understand the underlying code caution in a way a large framework rarely does.
