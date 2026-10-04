---
id: ops-serverless-coldstart
chapter: ops-release
title: Serverless: cold starts and limits
minutes: 4
---
Serverless (AWS Lambda and friends) runs your code without you managing servers: you deploy a function, the platform spins up an execution environment on demand, runs it, and scales instances up and down with traffic — to zero when idle. You pay per invocation, not for idle capacity.

The signature trade-off is the **cold start**. When a request arrives and no warm environment is waiting, the platform must create one — download your code, start the runtime, initialize — before your function even begins. That added latency (tens of milliseconds to seconds, worst on heavy runtimes and large dependencies) hits the *first* request to a new instance. Once warm, the environment is reused for a while, so subsequent requests are fast. Mitigations: keep the deployment package small, keep expensive setup outside the handler, and use provisioned/warm concurrency for latency-sensitive paths.

```steps
Request arrives | No warm environment is waiting, so the platform must build one
Download code | Fetch your deployment package into a fresh execution environment
Start runtime | Boot the language runtime, worse on heavy runtimes and large dependencies
Initialize | Run module-level setup before the handler, then invoke your function
Reuse warm | The environment is kept for a while, so later requests skip all of the above
```

The other reality is **limits**. Serverless functions are meant to be small and short: there are caps on execution time, memory, package size, and payload size, and each invocation is stateless (nothing persists between calls — state goes to a database or cache). Serverless shines for spiky, event-driven, bursty workloads; it fits long-running, stateful, or steady-high-throughput work far less well.

```recall
Q: Why does a cold start hit only the first request to a new instance?
A: The platform must build an execution environment (download code, start the runtime, initialize) only when none is warm. Once warm, it is reused for subsequent requests, so they skip that work.
Q: Why keep expensive setup outside the handler?
A: Code outside the handler runs once during initialization and is reused across invocations on a warm environment, so the setup cost is not paid on every request.
Q: When is serverless a poor fit?
A: For long-running, stateful, or steady high-throughput workloads. Execution-time, memory, and payload caps plus statelessness fight those, and steady load loses the pay-per-use benefit.
Q: Why must each invocation be treated as stateless?
A: Nothing persists between calls and environments are created and destroyed on demand, so any state must live in a database or cache, not in process memory.
```
