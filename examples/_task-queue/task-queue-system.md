# Distributed Task Queue System

## Problem Statement  
You need to design a **distributed task queue / job processing system** (a background worker architecture) for an application. Jobs are independent units of work (e.g. image processing, sending emails, data transformations). The system must reliably schedule, deliver, and monitor jobs across many worker nodes.

## Requirements & Constraints

- The system should support **at least 100,000 jobs per minute** under peak load.
- Jobs should not be lost: on failure, retry logic or durability is needed.
- Workers may crash or restart; jobs should be re-assignable / resumed / retried but not duplicated incorrectly.
- You may assume eventual consistency in state propagation.
- Latency from job enqueue to start should be low for most jobs (e.g. < 500 ms), but some jobs are allowed to run with more delay.
- The system should support **priorities** (e.g. high / standard / low).
- Monitoring / visibility: ability to query job status, error logs, backlogs.
- Cost should be reasonable: avoid overprovisioning, excessive message overhead, or extremely high operational complexity.

## Questions (for agents to debate / explore)

- What storage / persistence mechanism should be used for job metadata (database, log, queue, etc.)?  
- How to assign jobs to workers (pull vs push)?  
- How to detect and recover from worker failures / “orphaned” jobs?  
- How to support job retries, backoff, dead jobs / poison queue handling?  
- How to scale across regions (multi-region availability)?  
- What tradeoffs exist between throughput, latency, consistency, and fault tolerance in your design?

