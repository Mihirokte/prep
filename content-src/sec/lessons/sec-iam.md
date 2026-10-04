---
id: sec-iam
chapter: sec-identity
title: Identity and access management (IAM)
minutes: 4
---
Access control answers two separate questions, and conflating them is a common mistake. **Authentication** ("authn") is *who are you* — proving identity with a password, key, or token. **Authorization** ("authz") is *what may you do* — deciding whether that identity is allowed the action. You authenticate once; you authorize on every request.

The models you should be able to name:

- **RBAC (role-based)** — permissions attach to roles, users get roles. Simple and the common default: an "editor" role can publish, a "viewer" cannot.
- **ABAC (attribute-based)** — decisions use attributes of the user, resource, and context ("only the document *owner*, and only during business hours"). More expressive, harder to reason about.

Two principles the interviewer wants to hear regardless of model:

- **Least privilege** — grant the minimum permission needed, nothing "just in case." An over-scoped credential is the blast radius of every future compromise.
- **Deny by default** — the absence of an explicit allow is a denial. Never build a system where a missing rule means "permitted."

Cloud IAM (AWS/GCP/Azure) applies exactly this: a *policy* attaches permissions to a *principal* (user, role, service), and the effective decision is the intersection of what every applicable policy allows.

```flow
dir: LR
req: Request + identity | actor
authn: Authenticate | gate
authz: Authorize | gate
policy: Policy set | store
allow: Allow action | step
deny: Deny by default | gate
req -> authn : who are you
authn -> authz : identity proven
authz -> policy : check permissions
policy -> allow : explicit allow
policy -> deny : no matching allow
```

```recall
Q: Why is authentication separate from authorization, and when does each run?
A: Authentication proves who you are and happens once; authorization decides what that identity may do and runs on every request. Conflating them lets a proven identity do things it should not.
Q: What breaks if a system treats a missing rule as permitted?
A: Any action nobody explicitly denied becomes allowed, so a forgotten rule silently grants access. Deny by default makes the absence of an allow a denial.
Q: When would you choose ABAC over RBAC?
A: When decisions depend on attributes of the user, resource, or context (owner-only, business hours) that roles alone cannot express. RBAC stays simpler when fixed roles suffice.
Q: Why does least privilege limit blast radius?
A: A credential can only do what it was granted, so a compromised one with minimal scope exposes little. Over-scoped credentials turn one compromise into broad access.
```
