---
id: sd-load-balancing
chapter: sd-request-path
title: Load balancers & reverse proxies
minutes: 5
---
A **reverse proxy** sits in front of your servers and forwards client requests to them. The client only ever talks to the proxy. That one indirection buys a lot: TLS termination, caching, compression, request routing, and hiding your internal topology. Nginx and Envoy are the common ones.

A **load balancer** is a reverse proxy whose main job is spreading traffic across many identical servers so no one is overwhelmed. Two layers:

- **L4** (transport) — routes by IP/port without looking at the request. Fast, protocol-agnostic.
- **L7** (application) — reads the HTTP request and can route by path, header, or cookie (e.g. `/api` to one pool, `/img` to another). More capable, slightly more work per request.

Balancing algorithms worth naming: **round-robin** (simple), **least-connections** (favours idle servers — good for uneven request costs), and **consistent hashing** (sticks a given key to the same server — important for caches, covered later).

The interview point: a load balancer also does **health checks** and stops sending traffic to a server that fails them — that's how it gives you availability, not just distribution.

```flow
dir: LR
client: Client | actor
lb: Load balancer | gate
s1: Server 1 | step
s2: Server 2 | step
s3: Server 3 (dead) | step
client -> lb : request
lb -> s1 : least-conn
lb -> s2 : least-conn
lb --> s3 : ejected on fail
lb -> s3 : healthz probe
```

```recall
Q: Why does a load balancer give you availability, not just load distribution?
A: It health-checks backends and stops routing to one that fails, so a dead server is drained in seconds instead of users hitting it. Distribution alone would keep sending traffic to a broken node.
Q: When would you pick least-connections over round-robin?
A: When request cost is uneven. Round-robin can send slow work to an already-busy server; least-connections routes to the server with the fewest in-flight requests, so slow jobs avoid piling onto a loaded box.
Q: Sticky sessions keep load even and survive server death. True or false, and why?
A: False. Pinning a client to one server breaks even distribution and loses in-memory session state if that server dies. Prefer stateless servers with session state in Redis; use stickiness only when forced.
Q: When would you choose L4 over L7?
A: L4 for raw throughput, non-HTTP protocols, or TCP passthrough. L7 when you need path/host routing, TLS termination, retries, or per-route policy, at a small per-request cost.
```

===DEEPER===
**Mechanism.** An **L4** balancer works at the TCP/UDP layer: it picks a backend once at connection setup and then just forwards packets (often via NAT or direct server return), never parsing the payload — so it's cheap and protocol-agnostic. An **L7** balancer terminates the TCP connection itself, reads the full HTTP request, and can route on path/host/header/cookie, retry failed requests, and reuse pooled upstream connections. That parsing is why L7 does more but costs a little more per request. Health checks are active (the LB probes `/healthz` every few seconds) or passive (it observes real failures); a backend failing K consecutive probes is ejected and re-added once it passes again.

**Numbers an interviewer expects.**
- LB-added latency: **sub-millisecond to ~1 ms** for L4, a bit more for L7 TLS termination.
- Health-check cadence: probe every **~1–5 s**, eject after **2–3** consecutive failures → a dead server is drained in **seconds**, not on the next user's failed request.
- A single L7 proxy (Nginx/Envoy) handles **tens of thousands of req/s** per core; you scale out with multiple LBs behind DNS or an L4 tier.

**Worked example.** Requests have uneven cost — most are fast `GET /profile`, a few are slow report generations. Round-robin sends the next slow report to whichever server is "next," possibly one already busy, spiking its p99. **Least-connections** instead routes to the server with the fewest in-flight requests, so slow work naturally avoids piling onto a loaded box. Add health checks: when one server's report job OOMs it and it stops answering probes, the LB ejects it in ~3–9 s and no user hits the dead node.

**Common follow-ups**
- *Q: How do you avoid the LB being a single point of failure?* A: Run redundant LBs; put a floating/virtual IP or DNS round-robin (or an L4 tier) in front so a dead LB is bypassed. Cloud LBs are managed and multi-AZ by default.
- *Q: Sticky sessions — good idea?* A: They pin a client to one server (by cookie/IP) for in-memory session state, but they break even load distribution and lose the session if that server dies. Prefer stateless servers with session state in Redis; use stickiness only when forced.
- *Q: L4 vs L7 — when each?* A: L4 for raw throughput, non-HTTP protocols, or TCP passthrough; L7 when you need path/host routing, TLS termination, retries, or per-route policy.
- *Q: How does traffic reach servers in multiple regions?* A: DNS/anycast or a global LB routes to the nearest healthy region; the regional LB then distributes within it and health-checks locally.
