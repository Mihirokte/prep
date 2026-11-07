---
id: sec-secrets
chapter: sec-identity
title: Secrets management
minutes: 4
---
Secrets — database passwords, API keys, signing keys, TLS private keys — are the credentials that unlock everything else, so where they live matters more than any single line of application code.

The failures are predictable:

- **Hardcoded in source** — the classic. Once a key is in a git commit it is in history forever; rotate it, don't just delete the line.
- **Baked into container images or config files** shipped alongside the app.
- **Logged** accidentally when a request or config object is dumped.

The standard practice:

- **Never commit secrets.** Keep them out of the repo entirely; scan commits (pre-commit hooks, secret scanners) to catch mistakes.
- **Inject at runtime**, not build time — from environment variables in dev, and from a dedicated **secrets manager** (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager) in production. The app fetches the secret at startup or on demand; it is never stored in the artifact.
- **Rotate regularly and on compromise.** A managed secret store can rotate a database credential automatically and hand the app the new one, so rotation isn't a manual outage.
- **Encrypt at rest and restrict access** with IAM — least privilege again: a service reads only the secrets it needs.

The mindset: assume any secret *will* eventually leak, and design so that a leak is a rotation, not a catastrophe.

```steps
Store centrally | Keep secrets in a dedicated manager, never in the repo or image
Restrict access | Grant each service IAM access to only the secrets it needs
Fetch at runtime | The app pulls the secret at startup or on demand, not at build time
Rotate on schedule | The manager issues a new credential and hands it to the app automatically
Rotate on compromise | On any suspected leak, rotate immediately rather than deleting a line
```

```check
Q: An engineer discovers that a third-party production API key was committed to a public Git repository three days ago. Which action should the team take to resolve this?
- Delete the file containing the API key in a new git commit and push the change to the repository.
* Immediately rotate the compromised API key and configure the service to fetch credentials at runtime from a secrets manager.
- Add the file to .gitignore so subsequent git status checks ignore future edits to the hardcoded key.
- Revert the commit in git and keep the existing key since the commit is no longer at the HEAD of the branch.
Why: Once committed, a secret persists permanently in the repository history, meaning deleting the line or reverting the commit is insufficient and the key must be rotated immediately. A tempting mistake is simply removing the secret in a new commit or adding the file to .gitignore, which leaves the exposed key active and recoverable from git history.
```

```recall
Q: Why does deleting a hardcoded key from source not make it safe again?
A: Once committed, the key stays in git history forever and can be recovered. The only safe response is to rotate the key.
Q: Why inject secrets at runtime instead of baking them into the build artifact?
A: An artifact with embedded secrets leaks them wherever it is copied or shared. Runtime injection keeps the secret out of the image and lets it be rotated independently.
Q: What is the payoff of automated rotation through a secrets manager?
A: Rotation becomes routine rather than a manual outage, so leaked credentials expire quickly and compromise response is just a rotation.
Q: Why apply least privilege to secret access?
A: So a compromised service can read only the few secrets it needs, limiting how far one breach spreads.
```
