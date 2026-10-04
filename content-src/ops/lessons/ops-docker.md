---
id: ops-docker
chapter: ops-delivery
title: Docker: packaging the runtime
minutes: 4
---
A container packages your application **together with everything it needs to run** — libraries, runtime, system tools — into one image. That image runs identically on a laptop, in CI, and in production, which is what kills "works on my machine."

The mental model: an **image** is a read-only, layered blueprint built from a `Dockerfile`; a **container** is a running instance of that image. Layers are cached and shared, so two images built on the same base share those bytes.

```steps
Dockerfile | Write the layered recipe: base image, dependencies, your app
Build | Build the read-only image; each instruction becomes a cached, shareable layer
Push | Store the versioned image in a registry
Run | Start a container, a running instance of that image, on any host
Dispose | Treat the container as throwaway; the next deploy replaces it
```

Containers are **not** virtual machines. A VM ships a whole guest OS and boots in seconds-to-minutes; a container shares the host kernel and starts in milliseconds, using isolation primitives (namespaces, cgroups) rather than hardware virtualization. That lightness is why you can pack many containers on one host and start them on demand.

Two habits that matter in practice:

- **Small images**: start from a slim base, copy only what you need, and use multi-stage builds so compilers and build tools don't ship to production.
- **Immutable and stateless**: treat a container as disposable. State (files, sessions) belongs in a database or object store, not inside the container's writable layer — because the next deploy throws that container away.

```recall
Q: How does a container differ from a virtual machine?
A: A VM ships a whole guest OS and boots in seconds to minutes. A container shares the host kernel and uses namespaces and cgroups for isolation, starting in milliseconds, so many pack onto one host.
Q: Why does containerizing an app kill "works on my machine"?
A: The image bundles the app with its libraries, runtime, and system tools, so the same image runs identically on a laptop, in CI, and in production rather than depending on each host's setup.
Q: Why use a slim base and multi-stage builds?
A: To keep images small. A slim base and multi-stage builds leave compilers and build tools out of the final image, so they do not ship to production, shrinking size and attack surface.
Q: Why must container state live in a database or object store?
A: Containers are disposable and the next deploy throws the current one away along with its writable layer. State kept inside would be lost, so it belongs in external durable storage.
```
