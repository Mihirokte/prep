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

```check
Q: An engineering team stores millions of sensitive customer profile records in a cloud database. They must support regular key rotation without decrypting and re-encrypting every customer record on disk each time. Which design properly implements envelope encryption for this scenario?
- Generate a single AES data key to encrypt all user records, and store that key directly inside the KMS without local wrapping.
* Encrypt user records with a local data key, encrypt that data key using a KMS master key, and store only the wrapped data key alongside the ciphertext.
- Use a fast hash like SHA-256 to encrypt the data keys and KMS master keys so they can be rotated instantly without decrypting data.
- Encrypt incoming traffic at the load balancer with TLS, but transfer plaintext to internal microservices to avoid key rotation overhead.
Why: Envelope encryption encrypts bulk data with a data key and protects that data key with a KMS master key, allowing rotation of the master key simply by re-wrapping the data keys. Storing a single unwrapped key in KMS or using fast hashing conflates encryption with hashing and fails to solve bulk re-encryption needs.
```

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
