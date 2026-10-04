---
id: sd-realtime
chapter: sd-building-blocks
title: Real-time delivery
minutes: 4
---
When the server must push to the client (chat, presence, live scores, collaborative editing), polling wastes requests. Options, weakest to strongest:

- **Short polling** — client asks every N seconds. Simple, laggy, wasteful.
- **Long polling** — client asks, server holds the request open until there's data. Better, still HTTP-request-shaped.
- **WebSockets** — a persistent bidirectional connection. The standard answer for chat and live updates.
- **Server-Sent Events (SSE)** — one-way server→client stream over HTTP. Lighter than WebSockets when you don't need client→server on the same channel (good for live feeds/notifications).

The scaling wrinkle interviewers probe: **connections are stateful**. A user's WebSocket lives on one specific server, so to deliver a message you must route it to the right server. That needs a **connection registry** (which user is on which server, e.g. in Redis) and often a pub/sub layer so any server can publish to the server holding the target connection.

```flow
dir: LR
sender: Sender | actor
s1: Server A | step
reg: Connection registry | store
ps: Pub/sub | store
s2: Server B | step
recv: Recipient socket | actor
sender -> s1 : message
s1 -> reg : which server?
s1 -> ps : publish to B
ps -> s2 : deliver
s2 -> recv : push
```

```recall
Q: Why is short polling wasteful compared to WebSockets for a chat app?
A: Short polling fires a request every N seconds whether or not there is data, wasting requests and adding lag. A WebSocket holds one persistent connection and the server pushes only when there is something to send.
Q: When would you pick SSE over WebSockets?
A: When you only need one-way server-to-client streaming, like a live feed or notifications. SSE is lighter than a full bidirectional WebSocket because you do not need a client-to-server channel on the same connection.
Q: Why does real-time delivery need a connection registry at scale?
A: A user's connection lives on one specific server, so another server receiving a message for that user must find where the socket is. The registry maps user to server so delivery can be routed there.
Q: What role does a pub/sub layer play in pushing a message?
A: It lets any server publish to the server actually holding the target connection, so the sending server does not need a direct link to every other server to reach a recipient's socket.
```
