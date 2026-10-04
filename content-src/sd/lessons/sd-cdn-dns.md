---
id: sd-cdn-dns
chapter: sd-request-path
title: CDNs, edge caching & DNS
minutes: 4
---
A **CDN** (Content Delivery Network) is a globally distributed set of caches. You push static assets — images, video, JS/CSS, sometimes cached API responses — to it, and users are served from a **point of presence** physically near them instead of your origin. That cuts latency (fewer, shorter network hops) and offloads huge read traffic from your servers. **Edge caching** is the general idea: cache as close to the user as possible.

The cost is the same as any cache: **invalidation**. When you change an asset, edges may still serve the old copy until its TTL expires — the standard fix is content-hashed filenames (`app.9f3a.js`) so a new version is a new URL.

```flow
dir: LR
user: User | actor
dns: DNS (geo-routed) | store
pop: Nearest PoP | store
origin: Origin server | store
user -> dns : resolve name
dns -> user : nearest IP
user -> pop : request asset
pop -> user : hit, cached
pop --> origin : miss, fetch
```

**DNS** is the internet's lookup layer: it turns a name (`api.example.com`) into an IP. It matters in system design for two reasons: it's the *first* hop of every request (a slow or failed DNS resolution stalls everything), and it's a coarse routing tool — **geo-DNS** can return different IPs by region to send users to the nearest data centre, and DNS-level failover can redirect traffic away from a dead region. TTLs on DNS records trade propagation speed against lookup load.

```recall
Q: What two things does serving assets from a CDN buy you?
A: Lower latency because users are served from a point of presence physically near them with fewer, shorter hops, and offloading large read traffic from your origin servers. The edge absorbs reads your origin would otherwise handle.
Q: Why do content-hashed filenames solve CDN invalidation?
A: Edges may serve a stale copy until its TTL expires. A hashed filename like app.9f3a.js makes a new version a new URL, so clients fetch the new asset immediately instead of waiting for old entries to expire.
Q: Why does DNS matter for latency even though it is just name resolution?
A: It is the first hop of every request, so a slow or failed resolution stalls everything before any real work starts. That is why DNS TTLs and resolver health are part of the design.
Q: How does geo-DNS help route users, and what does its TTL trade off?
A: It returns different IPs by region to send users to the nearest data centre and can fail traffic away from a dead region. A short TTL propagates changes fast but increases lookup load; a long TTL is the reverse.
```
