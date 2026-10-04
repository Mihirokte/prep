---
id: sd-protocols
chapter: sd-request-path
title: TCP/UDP, HTTP/2 & 3, gRPC, webhooks
minutes: 5
---
**TCP vs UDP** — TCP is reliable, ordered, connection-oriented (handshake, retransmits, congestion control): the default for anything that must arrive intact. UDP is fire-and-forget: no handshake, no ordering, no retransmit — you accept loss for lower latency. Use UDP for real-time media, gaming, DNS queries; TCP for basically everything else.

**HTTP versions** — HTTP/1.1 opens roughly one request per connection and suffers head-of-line blocking. **HTTP/2** multiplexes many streams over one TCP connection (big win for many small assets). **HTTP/3** runs over **QUIC** (built on UDP) and removes TCP's head-of-line blocking entirely, so a single lost packet doesn't stall unrelated streams — noticeably better on flaky mobile networks.

**gRPC** — a high-performance RPC framework over HTTP/2 using Protocol Buffers (compact binary, schema-defined). It's the usual choice for **internal service-to-service** calls: fast, strongly typed, supports streaming. Less suited to public browser-facing APIs (REST/JSON is friendlier there).

**Webhooks** — the inverse of polling. Instead of you repeatedly asking "any updates?", the other system **calls you** at a URL you registered when an event happens (payment succeeded, PR merged). Cheaper and near-real-time. The catches: you must verify the caller (signatures), and delivery is at-least-once, so your handler must be **idempotent** and you should return quickly (do heavy work async).

```flow
dir: LR
provider: Event source | tool
hook: Your webhook URL | gate
work: Async worker | step
provider -> hook : POST event
hook -> hook : verify signature
hook -> provider : 200 fast
hook -> work : enqueue heavy work
```

```recall
Q: When would you choose UDP over TCP?
A: For real-time media, gaming, or DNS queries, where lower latency matters more than guaranteed delivery. You accept loss and no ordering because retransmits and the handshake would add delay you cannot afford.
Q: What does HTTP/3 over QUIC fix that HTTP/2 does not?
A: HTTP/2 multiplexes streams over one TCP connection, but a single lost packet stalls all streams due to TCP head-of-line blocking. HTTP/3 runs over QUIC on UDP, so a lost packet does not stall unrelated streams, which helps on flaky mobile networks.
Q: Why is gRPC the usual choice for internal service calls but not public browser APIs?
A: It is fast and strongly typed over HTTP/2 with Protocol Buffers and supports streaming, ideal service-to-service. For public browser-facing APIs, REST and JSON are friendlier to work with.
Q: Why must a webhook handler be idempotent and return quickly?
A: Delivery is at-least-once, so the same event can arrive more than once; idempotency stops a repeat from double-processing. Returning quickly and doing heavy work async avoids timeouts and keeps the sender from retrying.
```
