---
id: ops-dr-backups
chapter: ops-resilience
title: Disaster recovery, backups, and failover
minutes: 5
---
Everything fails eventually — a disk, a datacenter, a bad deploy that corrupts data. Disaster recovery (DR) is planning for the bad day so it's a controlled event, not a company-ending one.

Two numbers frame every DR plan:

- **RPO — Recovery Point Objective**: how much *data* you can afford to lose, measured in time. "RPO of 5 minutes" means backups/replication must be at most 5 minutes behind, so a disaster loses at most 5 minutes of writes.
- **RTO — Recovery Time Objective**: how long you can afford to be *down* while recovering. "RTO of 1 hour" means you must be back within an hour.

Tighter targets cost more, so set them per system by business impact.

**Backups** are the foundation — but an untested backup is a *hope*, not a plan. The single most important discipline is to **regularly test restores**; teams routinely discover their backups are incomplete or unrestorable only during a real disaster. Also keep backups off the primary system (a ransomware event or a fat-fingered delete that hits your live data shouldn't reach your backups).

**Failover** is switching to a standby when the primary fails — a replica database promoted to primary, or traffic rerouted to a healthy region. It can be automatic (fast, but risks flapping and split-brain) or manual (slower, safer). Whichever you choose, **rehearse it** before you need it.

```flow
dir: LR
disaster: Disaster hits | step
detect: Detect primary down | gate
failover: Promote standby | step
restore: Restore from backup | step
rpo: Data loss within RPO | gate
rto: Back up within RTO | gate
disaster -> detect : alarm
detect -> failover : reroute traffic
detect -> restore : if data lost
failover -> rto : service recovered
restore -> rpo : accept data gap
```

```check
Q: A payment processing system has an RPO of 15 minutes and an RTO of 4 hours. Following a severe database failure at 02:00, the engineering team restores data from a backup snapshot taken at 01:30 and successfully brings the service back online at 04:30. How should the outcome be evaluated against DR targets?
- The system met both targets because the service restored within the 4-hour window.
- The system violated its RTO because recovering from backups took longer than 15 minutes.
* The system satisfied its RTO but violated its RPO because 30 minutes of committed data was lost.
- The system violated both RPO and RTO because standby replication failed to prevent downtime.
Why: RPO dictates the maximum tolerable data loss in time, while RTO dictates the maximum allowed downtime. The recovery took 2.5 hours (under the 4-hour RTO), but lost 30 minutes of writes (exceeding the 15-minute RPO). A common confusion is conflating the two metrics or assuming that bringing the system up before the RTO deadline makes the entire recovery compliant.
```

```recall
Q: What is the difference between RPO and RTO?
A: RPO is how much data you can afford to lose, measured in time, so it bounds how far behind backups may be. RTO is how long you can afford to be down while recovering.
Q: Why is an untested backup only a hope, not a plan?
A: Teams routinely discover their backups are incomplete or unrestorable only during a real disaster. Regularly testing restores is what proves the backup actually works.
Q: Why keep backups off the primary system?
A: A ransomware event or a fat-fingered delete that hits live data must not also reach the backups. Keeping them separate ensures a recovery source survives the same incident.
Q: What is the tradeoff between automatic and manual failover?
A: Automatic failover is fast but risks flapping and split-brain; manual is slower but safer. Either way you must rehearse it before a real incident so it works when needed.
```
