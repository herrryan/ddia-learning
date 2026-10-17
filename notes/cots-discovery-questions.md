# COTS & Legacy System Optimization: Discovery Questions

Use the categorized discovery questions below to evaluate your Commercial Off-The-Shelf (COTS) system before you propose infrastructure optimizations. Each category maps to a specific architectural layer and links to the corresponding chapter in the DDIA study guide.

---

## 1. Baseline Load Parameters & Tail Latency (Chapter 1: [`ch01.js`](../site/js/content/ch01.js))

Gather baseline metrics to identify whether read volume, write amplification, or queue contention causes the bottleneck.

- **What is the current ratio of database reads to writes at peak load?**
  - *Decision Rule:* If read queries exceed 80% of total traffic, prioritize read replicas and caching layers.
- **What are the `p50`, `p95`, and `p99` response times across key workflows?**
  - *Decision Rule:* If `p99` latency diverges sharply from `p50`, inspect the database for lock contention or slow queries.
- **How many concurrent database connections does the COTS application open at peak traffic?**
  - *Decision Rule:* If connection counts exceed CPU core limits, deploy a connection pooler to prevent context-switch overhead.
- **Do specific heavy requests block fast requests in the application queue?**
  - *Decision Rule:* If slow requests cause head-of-line blocking, isolate heavy workloads onto dedicated worker nodes.

---

## 2. Database Engine, Schema & Vendor Support (Chapter 3: [`ch03.js`](../site/js/content/ch03.js))

Verify vendor contract boundaries and storage hardware limits before you modify the database layer.

- **Does the vendor support agreement permit administrators to add secondary or covering indexes?**
  - *Decision Rule:* If the contract permits index additions, create covering indexes to serve frequent queries from memory.
- **Do vendor upgrade scripts drop custom indexes or materialized views during patch installations?**
  - *Decision Rule:* If upgrades overwrite custom objects, script index recreation as a mandatory post-upgrade step.
- **Can administrators enable the database slow-query log and inspect execution plans (`EXPLAIN`)?**
  - *Decision Rule:* If you can access execution plans, identify full table scans and unindexed filter columns first.
- **What is the total size of the active working set compared to available server RAM?**
  - *Decision Rule:* If the active working set fits in RAM, scale memory vertically to eliminate disk reads.
- **Does the database store data files and transaction logs on local NVMe drives or network storage?**
  - *Decision Rule:* If storage latency limits write throughput, migrate the database volumes to high-IOPS NVMe drives.

---

## 3. Replication Lag, Transactions & Proxy Routing (Chapters 5 & 7: [`ch05.js`](../site/js/content/ch05.js), [`ch07.js`](../site/js/content/ch07.js))

Evaluate transaction boundaries and consistency requirements before you insert a database proxy such as ProxySQL or PgBouncer.

- **Does the COTS application wrap read-only `SELECT` queries inside explicit `BEGIN...COMMIT` transactions?**
  - *Decision Rule:* If the application wraps reads in transactions, verify whether the proxy can route transactional reads to followers.
- **Does the application rely on session-level state such as temporary tables, prepared statements, or advisory locks?**
  - *Decision Rule:* If the application uses session variables, configure the proxy in session-pool mode instead of transaction-pool mode.
- **Does the application immediately read records that the same user just wrote?**
  - *Decision Rule:* If workflows require read-after-write consistency, configure the proxy to pin the user session to the leader briefly.
- **What maximum replication lag can downstream business workflows tolerate without data anomalies?**
  - *Decision Rule:* If replication lag exceeds tolerance thresholds, configure the proxy to route queries to synchronous or low-lag followers.

---

## 4. Reporting Offload & Change Data Capture (Chapters 6 & 11: [`ch06.js`](../site/js/content/ch06.js), [`ch11.js`](../site/js/content/ch11.js))

Identify analytical workloads and external integrations that you can move off the primary transactional database via Change Data Capture (CDC).

- **Do business intelligence tools, batch exports, or audit reports query the primary database directly?**
  - *Decision Rule:* If reporting tools query the leader, redirect those report connections to a dedicated read replica immediately.
- **Can administrators enable row-level binary logs (`binlog`) or logical Write-Ahead Logs (WAL) on the primary database?**
  - *Decision Rule:* If the database supports logical replication logs, deploy Debezium to stream changes without application code modifications.
- **Do external systems poll the COTS database tables on a schedule to detect record updates?**
  - *Decision Rule:* If external integrations poll the database, replace scheduled poll queries with a CDC event stream.
- **Can custom search portals or dashboards read from a derived Elasticsearch or Redis view instead of the COTS database?**
  - *Decision Rule:* If external portals allow custom endpoints, populate a derived data store from the CDC log.

---

## 5. HTTP Edge Caching, Rate Limiting & Rollback Safety (Chapter 1: [`ch01.js`](../site/js/content/ch01.js))

Assess network traffic patterns and staging environments before you place a reverse proxy in front of the application.

- **Which HTTP `GET` endpoints return static assets or public catalog data that changes infrequently?**
  - *Decision Rule:* If endpoints return shared read-only responses, cache those responses at an NGINX or CDN edge layer.
- **Does the COTS application authenticate users via cookies, JWT headers, or server-side sessions?**
  - *Decision Rule:* If responses depend on user identity, configure the reverse proxy to bypass the cache for authenticated headers.
- **Do traffic spikes or automated scrapers overwhelm the application web tier during peak hours?**
  - *Decision Rule:* If traffic bursts saturate the web tier, enforce rate limits and request queues at the API gateway.
- **Does a non-production staging environment exist to replay production traffic and test failback procedures?**
  - *Decision Rule:* If a staging environment exists, benchmark proxy routing and DNS failback before you cut over production traffic.
