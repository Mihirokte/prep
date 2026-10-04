---
id: sec-encryption
chapter: sec-data
title: Encryption in transit and at rest
minutes: 5
---
"Encrypt everything" splits into two distinct problems with different tools.

**Encryption in transit** protects data moving between systems — the browser to your server, your server to the database, service to service. The tool is **TLS** on every hop. The mistake is encrypting the public edge (HTTPS at the load balancer) and then sending plaintext internally; treat internal links as untrusted too.

**Encryption at rest** protects data sitting on disk — databases, object storage, backups, logs — so a stolen disk or leaked backup is useless without the key. Building blocks:

- **Symmetric encryption (AES)** does the bulk work: one key encrypts and decrypts. Fast, used for the actual data.
- **Key hierarchy / envelope encryption** — data is encrypted with a **data key**, and that data key is itself encrypted by a **master key** held in a KMS (Key Management Service). You rotate the master key without re-encrypting all the data.

```flow
dir: LR
data: Plaintext data | store
dk: Data key | step
enc: Ciphertext | store
master: Master key in KMS | store
wrapped: Wrapped data key | store
data -> dk : encrypt with
dk -> enc : produces
master -> dk : encrypts data key
dk -> wrapped : stored encrypted
```

Two things people conflate with encryption but shouldn't:

- **Hashing is not encryption.** Passwords are *hashed*, not encrypted — a one-way function you can't reverse. Use a slow, salted algorithm built for it (**bcrypt, scrypt, or Argon2**), never a fast general hash like SHA-256 alone, and never MD5.
- **Encoding (base64) is not encryption.** It provides zero confidentiality; anyone can decode it.

The full posture is data encrypted in transit *and* at rest, keys managed in a KMS with rotation, and passwords hashed with a purpose-built slow function.

```recall
Q: Why does envelope encryption let you rotate the master key cheaply?
A: Only the small data keys are encrypted by the master key, so rotating it re-wraps those keys without re-encrypting the bulk data.
Q: Why hash passwords with bcrypt, scrypt, or Argon2 instead of SHA-256?
A: Password hashing must be deliberately slow and salted to resist brute force. A fast general hash like SHA-256 lets an attacker try billions of guesses cheaply.
Q: What breaks if you encrypt only the public edge and send plaintext internally?
A: Anyone who can observe internal links sees the data in the clear. Internal hops must be treated as untrusted and encrypted too.
Q: Why is base64 encoding not a form of encryption?
A: It provides zero confidentiality; anyone can decode it without a key. It only changes representation, not secrecy.
```
