---
id: sec-waf-ddos
chapter: sec-data
title: WAF and DDoS protection
minutes: 4
---
These are the two defenses that sit *in front of* your application, at the network edge.

A **WAF (Web Application Firewall)** inspects HTTP requests and blocks malicious ones before they reach your app — think of it as a filter tuned for web attacks. It uses rule sets (often the OWASP Core Rule Set) to catch patterns like SQL injection payloads, XSS attempts, and known bad bots, plus per-IP rate limits. A WAF is **defense in depth, not a substitute** for fixing the vulnerability in code: it reduces exposure and buys time, but a determined attacker can craft around signature rules, so the application must still be safe on its own.

**DDoS (Distributed Denial of Service)** is an availability attack — overwhelm a target with traffic from many sources so real users can't get through. Layers:

- **Volumetric (L3/L4)** — flood the pipe or the connection table (UDP floods, SYN floods). Defended by absorbing the traffic in a large distributed network and scrubbing it upstream.
- **Application (L7)** — fewer but expensive requests that look legitimate (hammering a search endpoint). Defended with rate limiting, challenges (CAPTCHA/JS), and caching so requests never reach origin.

The practical answer in a design: put a **CDN + DDoS scrubbing service** (Cloudflare, AWS Shield/CloudFront) in front, enable a WAF on it, cache aggressively so most traffic never touches your origin, and keep origin IPs hidden so attackers can't bypass the edge.

```flow
dir: LR
client: Users + attackers | actor
scrub: CDN + scrubbing | gate
waf: WAF rules | gate
cache: Edge cache | store
origin: Origin server | store
client -> scrub : all traffic
scrub -> waf : absorbed and filtered
waf -> cache : clean requests
cache -> origin : only cache misses
```

```check
Q: A high-volume public web service is experiencing bot attacks attempting SQL injection and volumetric DDoS floods that saturate its bandwidth. Which architecture best mitigates these threats while protecting the origin servers?
- Replace application-level input sanitization entirely with WAF rule sets like OWASP CRS, and route traffic directly to the origin.
- Deploy origin instances on public IPs and rely strictly on origin CPU auto-scaling to absorb volumetric UDP floods.
* Place a CDN and DDoS scrubbing service with a WAF in front, aggressively cache responses, and hide origin IPs from public access.
- Use base64 encoding at the edge to convert incoming payloads before they hit origin database query endpoints.
Why: Placing a CDN with DDoS scrubbing and a WAF at the edge absorbs volumetric attacks, filters common web exploit signatures, and keeps origin servers shielded from direct traffic. Relying solely on origin scaling or treating a WAF as a complete substitute for secure application code leaves systems vulnerable to bypass and resource exhaustion.
```

```recall
Q: Why is a WAF defense in depth rather than a substitute for fixing code?
A: Signature rules can be crafted around by a determined attacker, so the app must still be safe on its own. The WAF reduces exposure and buys time.
Q: How do volumetric and application-layer DDoS attacks differ in defense?
A: Volumetric L3/L4 floods are absorbed and scrubbed upstream in a large network, while L7 attacks of expensive legitimate-looking requests need rate limiting, challenges, and caching.
Q: Why does aggressive edge caching help against DDoS?
A: Cached responses are served at the edge, so most requests never reach the origin and the origin is not overwhelmed.
Q: Why keep origin IPs hidden behind the edge?
A: So attackers cannot bypass the CDN and WAF by hitting the origin directly, which would defeat the whole edge defense.
```
