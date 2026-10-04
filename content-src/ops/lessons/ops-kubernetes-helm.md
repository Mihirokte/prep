---
id: ops-kubernetes-helm
chapter: ops-delivery
title: Kubernetes and Helm: running containers at scale
minutes: 6
---
One container is easy. Hundreds of containers across many machines — restarted when they crash, rescheduled when a node dies, load-balanced, rolled out gradually — is what **Kubernetes (k8s)** manages.

The core idea is **declarative desired state**. You don't tell Kubernetes "start this container here." You declare "I want 5 replicas of this image," and a control loop continuously works to make reality match. A crashed pod is replaced; a dead node's pods are rescheduled elsewhere. You describe the *what*; the system owns the *how*.

```flow
dir: LR
you: You | actor
desired: Desired state, 5 replicas | store
loop: Control loop | gate
pods: Running pods | store
svc: Service, stable IP | store
you -> desired : declare
desired -> loop : reconcile
loop -> pods : create or reschedule
pods -> loop : report actual state
loop -> pods : replace crashed pod
svc -> pods : route to healthy pods
```

Objects you'll name in an interview:

- **Pod** — the smallest unit; one (or a few tightly-coupled) containers sharing a network address.
- **Deployment** — declares how many replicas of a pod to keep running and manages rollouts/rollbacks.
- **Service** — a stable virtual IP / DNS name in front of a changing set of pods, so callers don't chase individual pod addresses.
- **ConfigMap / Secret** — configuration and credentials injected at runtime, kept out of the image.

**Helm** is the package manager on top. A **chart** is a templated, versioned bundle of these manifests with values you fill in per environment — so "deploy the payments service to staging with 3 replicas" is one command against one chart, not a folder of hand-edited YAML. It gives you versioned, repeatable, parameterized deploys and a clean rollback to a previous release.

```recall
Q: What does "declarative desired state" mean in Kubernetes?
A: You declare the end state you want, such as 5 replicas of an image, and a control loop continuously works to make reality match, replacing crashed pods and rescheduling those on dead nodes.
Q: Why does a Service exist in front of pods?
A: Pods come and go and their addresses change. A Service is a stable virtual IP and DNS name in front of the changing set, so callers do not have to chase individual pod addresses.
Q: What does a Deployment manage that a bare Pod does not?
A: A Deployment declares how many replicas to keep running and manages rollouts and rollbacks, whereas a Pod is just the smallest run unit with no self-healing replica count of its own.
Q: What does Helm add on top of raw manifests?
A: A chart is a templated, versioned bundle of manifests with per-environment values, giving one-command parameterized deploys and clean rollback instead of hand-edited YAML.
```
