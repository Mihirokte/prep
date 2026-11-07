---
id: sec-threat-modeling
chapter: sec-webvuln
title: Threat modeling before controls
minutes: 3
---
Threat modeling turns a design into a prioritized security argument. It asks what must be protected, who can attack it, where trust changes, and which failures matter most. Starting with a catalog of controls produces expensive defenses without proving they address the real risk.

## Map the system

List assets such as credentials, private data, money, availability, and administrative authority. Identify actors, entry points, data stores, external dependencies, and trust boundaries. A boundary is where identity, privilege, or control changes: browser to API, API to worker, tenant to shared database, or service to third party.

```flow
dir: LR
user: User device | actor
edge: Public API | gate
service: Application | step
queue: Job queue | store
worker: File worker | step
objects: Object store | store
user -> edge : untrusted input
edge -> service : authenticated call
service -> queue : job
queue -> worker : work item
worker -> objects : read and write
```

Annotate each boundary with the identity used, data accepted, and authority granted. This makes missing authorization and over-privileged workers visible.

## Generate concrete threats

Use categories as prompts, not as the answer. Ask how identity can be spoofed, data tampered with, actions denied, secrets disclosed, service exhausted, or privileges raised. Then write an attack story: an authenticated tenant changes an object id and reads another tenant's file. Specific stories lead to testable controls.

```steps
Choose an asset | Name what loss would hurt the business or user
Cross a boundary | Find where untrusted data or identity changes domain
Write an attack | Describe actor precondition action and impact
Rank it | Estimate likelihood impact and detectability
Select controls | Prevent detect and recover at the narrowest point
Create a test | Turn the story into an abuse or authorization test
```

## Prioritize and close

Rank by impact and realistic reachability. A public authorization bypass outranks an exotic attack requiring administrator access. For each high risk, assign an owner and one of four decisions: mitigate, avoid, transfer, or explicitly accept.

Controls should layer prevention, detection, and recovery. Tenant-scoped queries prevent cross-tenant reads; audit signals detect repeated attempts; key rotation and incident procedures limit damage if prevention fails. Revisit the model when architecture, data, or trust boundaries change.

```recall
Q: What is the first output of threat modeling?
A: A map of assets, actors, entry points, data flows, and trust boundaries, not a list of security products.
Q: Why write an attack story instead of only naming a category?
A: A concrete actor, precondition, action, and impact lead to a specific control and test.
Q: How should threats be prioritized?
A: By realistic likelihood and impact, adjusted for reachability and existing detection, not by how sophisticated the attack sounds.
Q: When must a threat model be revisited?
A: When architecture, data sensitivity, actors, privileges, or trust boundaries change.
```
