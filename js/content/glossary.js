DDIA.registerGlossary([
  {
    term: "ACID",
    definition: "The four guarantees a transaction can offer: **atomicity** (writes are all-or-nothing), **consistency** (application invariants hold before and after), **isolation** (concurrent transactions do not see each other's half-done work), and **durability** (committed data survives crashes). Databases interpret the letters differently, especially isolation, so the label alone tells you little about actual behavior.",
    chapters: [7]
  },
  {
    term: "asynchronous",
    definition: "Describes a step that does not block: the caller sends a request and carries on, and the system makes no promise about when, or whether, a response arrives. Asynchronous replication lets a leader acknowledge a write before followers have applied it; an asynchronous network gives no upper bound on message delay.",
    chapters: [5, 8]
  },
  {
    term: "atomic",
    definition: "Two related meanings. For a single concurrent operation: it appears indivisible, so no observer ever catches it midway. For a transaction: its writes form an all-or-nothing unit, so a crash or error after some writes causes the database to discard them all rather than leave a partial result.",
    chapters: [7, 9]
  },
  {
    term: "Avro",
    definition: "A compact binary encoding whose byte stream contains no field tags or names at all; the reader reconciles the **writer's schema** (stored with the data) against its own **reader's schema** by matching field names. This makes it a good fit for dynamically generated schemas and for large files in Hadoop.",
    chapters: [4]
  },
  {
    term: "B-tree",
    definition: "The most widely used on-disk index: a balanced tree of fixed-size pages (commonly 4 KB) in which each page holds sorted keys and pointers to child pages, and leaves hold the values. Pages are updated in place, so a write-ahead log is needed for crash safety. Trees stay shallow; four levels of 4 KB pages with 500-way branching cover about 256 TB.",
    chapters: [3]
  },
  {
    term: "backpressure",
    definition: "A mechanism by which a slow consumer makes a fast producer wait instead of letting messages accumulate without limit. TCP applies it per connection; a message broker can apply it by blocking a publisher once its buffers fill. Also called flow control.",
    chapters: [11]
  },
  {
    term: "batch process",
    definition: "A job that reads an entire, finite input dataset, runs until done, and emits a fresh output dataset; inputs are treated as immutable, so a buggy job can simply be fixed and rerun. MapReduce and Spark jobs are typical examples, and throughput rather than latency is the metric that matters.",
    chapters: [10]
  },
  {
    term: "bounded",
    definition: "Finite, with a limit you can state in advance. A bounded dataset can be read from beginning to end, which is the batch-processing case; a bounded network delay would have a guaranteed maximum, something real datacenter networks do not offer.",
    chapters: [8, 11]
  },
  {
    term: "Byzantine fault",
    definition: "A fault model in which a node may do anything at all: report false data, tell one peer one story and another peer a different one, or actively try to subvert the protocol. This is far harder to tolerate than a crash, and most datacenter systems simply assume it does not happen.",
    chapters: [8]
  },
  {
    term: "cache",
    definition: "A fast store holding copies of hot data so that repeated reads avoid the slower system of record. On a miss the data is fetched from the source and inserted; because a cache can always be rebuilt, it is a form of derived data.",
    chapters: [1, 12]
  },
  {
    term: "CAP theorem",
    definition: "A result stating that during a network partition a system must sacrifice either linearizability (its narrow meaning of consistency) or the availability of every node. Its definitions are so restrictive that it gives little practical design guidance; real systems must also weigh latency, partial failures, and faults other than partitions.",
    chapters: [9]
  },
  {
    term: "causal consistency",
    definition: "A model in which every node sees causally related operations in the same order, while concurrent operations may be observed in different orders on different nodes. It is strictly weaker than linearizability and, unlike it, can be provided without coordination that blocks during partitions.",
    chapters: [9]
  },
  {
    term: "causality",
    definition: "The relationship between two events when the first could have influenced the second, for example a reply following a question or an update that depends on an earlier read. Causally related events have a definite order; unrelated ones are **concurrent**, which makes causal order a partial order.",
    chapters: [5, 9]
  },
  {
    term: "change data capture (CDC)",
    definition: "Tapping a database's write log to turn every insert, update, and delete into a stream of change events. Downstream consumers such as search indexes, caches, and warehouses replay that stream to stay in step with the database as the system of record.",
    chapters: [11]
  },
  {
    term: "column-oriented storage",
    definition: "A layout that stores all values of one column contiguously instead of storing each row contiguously. Analytic queries that touch a few columns across billions of rows read far less data, and columns compress very well, for instance with bitmap encodings and run-length encoding.",
    chapters: [3]
  },
  {
    term: "consensus",
    definition: "The task of having several nodes decide on one and the same value, such as who the leader is, despite crashes and message delays. It underlies leader election, atomic commit, and distributed locks, and is solved by algorithms such as Paxos, Raft, and Zab, which need a majority of nodes to make progress.",
    chapters: [9]
  },
  {
    term: "consistent hashing",
    definition: "A partitioning scheme that places each node at pseudorandom points on a hash ring and routes a key to the node owning the next point after the key's hash. It was designed for internet-scale caches; in databases the term is often used loosely for any hash-based partitioning, and few systems implement it literally.",
    chapters: [6]
  },
  {
    term: "consistent prefix reads",
    definition: "A guarantee that if writes happened in a certain order, every reader sees them in that order. It rules out the anomaly in which someone reads an answer before the question it responds to, which can happen when the two writes live in differently lagged partitions.",
    chapters: [5]
  },
  {
    term: "CRDT",
    definition: "Conflict-free replicated data type: a counter, set, map, or similar structure whose replicas can be modified independently and then merged automatically, with a merge function guaranteed to converge to the same state everywhere. Used to resolve conflicts in multi-leader and leaderless systems without application-specific code.",
    chapters: [5]
  },
  {
    term: "data warehouse",
    definition: "A separate database holding a read-only copy of data gathered from many operational systems, laid out so that analysts can run large scans and aggregations without slowing down the OLTP systems. It is usually filled through ETL and organized as a star schema.",
    chapters: [3]
  },
  {
    term: "dataflow engine",
    definition: "A batch framework such as Spark, Tez, or Flink that treats a whole workflow as one graph of operators and passes data between them through memory or local disk, instead of writing every intermediate result to a distributed filesystem as MapReduce does. This saves I/O and lets later stages start before earlier ones finish.",
    chapters: [10]
  },
  {
    term: "declarative",
    definition: "A style of specifying what result you want rather than the steps to compute it. SQL is the canonical example: the query optimizer chooses indexes and join orders, which frees the database to change its execution strategy, or parallelize, without any change to the query.",
    chapters: [2]
  },
  {
    term: "denormalize",
    definition: "To deliberately keep the same fact in more than one place, such as copying a user's name into each of their posts, so reads need fewer joins. The price is that every update must touch every copy, which is where multi-object transactions or derived-data pipelines come in.",
    chapters: [2, 7, 11]
  },
  {
    term: "derived data",
    definition: "Any dataset computed from another dataset that can be regenerated by rerunning the computation: indexes, caches, materialized views, search indexes, and the outputs of batch and stream jobs. Losing it is inconvenient but not fatal, unlike losing a system of record.",
    chapters: [10, 11, 12]
  },
  {
    term: "deterministic",
    definition: "A function or program whose output depends only on its input, so repeated runs give identical results; nothing may depend on the clock, random numbers, or network state. Determinism is what lets you safely re-execute a failed batch task, replay a log to rebuild state, or run the same transaction on every replica.",
    chapters: [7, 9, 10]
  },
  {
    term: "distributed",
    definition: "Spread across several machines that coordinate only by sending messages. The defining difficulty is partial failure: parts of the system break while others keep working, and a node cannot reliably tell a crashed peer from a slow link.",
    chapters: [8]
  },
  {
    term: "durable",
    definition: "A promise that an acknowledged write survives whatever happens next: a process crash, a power cut, or a dead disk. Delivered through write-ahead logs, flushing to nonvolatile storage, and replication to other nodes; none of these is perfect on its own.",
    chapters: [7]
  },
  {
    term: "ETL",
    definition: "Extract-Transform-Load: the pipeline that pulls data out of operational databases, cleans and reshapes it into an analysis-friendly schema, and writes it into a data warehouse. Some modern setups load first and transform inside the warehouse, but the idea is the same.",
    chapters: [3]
  },
  {
    term: "event sourcing",
    definition: "An application design in which the system of record is an append-only log of domain events such as `ItemAddedToCart`, and current state is a view derived by replaying them. Events capture intent, which gives a natural audit trail and makes it cheap to build new views later.",
    chapters: [11]
  },
  {
    term: "eventual consistency",
    definition: "A weak guarantee that if writes stop, all replicas will converge to the same data at some unspecified later time. It is the default in asynchronously replicated systems, and applications must be prepared to read stale values in the meantime.",
    chapters: [5, 9]
  },
  {
    term: "exactly-once semantics",
    definition: "The guarantee that the effect of processing each message is applied once, even though delivery and processing may be repeated after failures. It is achieved by making processing idempotent or by committing output and consumer offsets atomically; **effectively-once** is the more honest name.",
    chapters: [11, 12]
  },
  {
    term: "failover",
    definition: "The procedure that installs a new leader when the current one fails: detect the failure (usually by timeout), pick a replacement, and point clients and followers at it. Pitfalls include losing unreplicated writes, split brain, and choosing a timeout that is too short or too long.",
    chapters: [5]
  },
  {
    term: "fault-tolerant",
    definition: "Able to keep working correctly when some of its parts fail, for example a disk, a process, or a network switch. The faults still occur; the system is engineered to survive them, often verified by deliberately injecting failures.",
    chapters: [1, 8]
  },
  {
    term: "fencing token",
    definition: "A monotonically increasing number handed out with every lock or lease grant. The protected resource rejects any request carrying an older token, so a client that was paused and still believes it holds an expired lock cannot corrupt data.",
    chapters: [8, 9]
  },
  {
    term: "flow control",
    definition: "Another name for backpressure: throttling a sender so that a receiver with limited capacity is not overwhelmed.",
    chapters: [11]
  },
  {
    term: "follower",
    definition: "A replica that takes its data changes only from the leader, applying them in the same order, and serves read-only queries to clients. Also called a secondary, read replica, or hot standby.",
    chapters: [5]
  },
  {
    term: "forward / backward compatibility",
    definition: "Backward compatibility means new code can read data written by old code; forward compatibility means old code can read data written by new code. Both are needed during rolling upgrades, when old and new versions run side by side and read each other's output.",
    chapters: [4]
  },
  {
    term: "full-text search",
    definition: "Finding documents that contain given words, often with fuzzy matching for misspellings, stemming, and synonyms. It relies on an inverted index, a secondary index that maps each term to the documents containing it, as in Lucene and Elasticsearch.",
    chapters: [3]
  },
  {
    term: "graph",
    definition: "A data model made of vertices (entities) joined by edges (relationships), suited to data where the connections matter as much as the records, such as social networks, road maps, or knowledge bases. Property graphs (Neo4j, Cypher) and triple-stores (RDF, SPARQL) are the two main flavors.",
    chapters: [2, 10]
  },
  {
    term: "hash",
    definition: "A function that condenses any input into a fixed-size, pseudorandom-looking number; equal inputs always yield equal outputs, and distinct inputs almost always differ (a **collision** is when they do not). Hash indexes use it to locate keys in memory; hash partitioning uses it to spread keys evenly across nodes at the cost of range-query locality.",
    chapters: [3, 6]
  },
  {
    term: "HDFS",
    definition: "Hadoop Distributed File System: a shared-nothing filesystem that splits files into large blocks, replicates each block across several commodity machines, and lets MapReduce tasks run on the machine that holds their input. A central NameNode tracks where each block lives.",
    chapters: [10]
  },
  {
    term: "head-of-line blocking",
    definition: "A delay in which a few slow requests hold up many fast ones queued behind them, for example in a server's thread pool or in a page that must wait for its slowest backend call. It is a main reason why high-percentile latencies dominate what users experience.",
    chapters: [1]
  },
  {
    term: "hinted handoff",
    definition: "In a sloppy quorum, when a key's proper home nodes are unreachable, another node temporarily stores the write together with a hint about where it belongs. Once the home nodes are back, the stand-in forwards the data to them.",
    chapters: [5]
  },
  {
    term: "hot spot",
    definition: "A partition or key that attracts a disproportionate share of traffic, such as a celebrity's account, so one node saturates while others idle. Remedies include appending a random suffix to the key so writes fan out, or splitting the partition.",
    chapters: [6]
  },
  {
    term: "idempotent",
    definition: "An operation you can apply any number of times and end up in the same state as after applying it once, like setting `x = 5` (unlike incrementing `x`). Idempotence makes retries safe and is the simplest route to exactly-once results on top of at-least-once delivery.",
    chapters: [11, 12]
  },
  {
    term: "index",
    definition: "An auxiliary structure, built from B-trees, LSM-trees, or hash tables, that lets the database find records matching a value without scanning everything. Each index speeds up some reads but slows every write, because the index must be updated too.",
    chapters: [3]
  },
  {
    term: "isolation",
    definition: "How much one in-flight transaction can observe or disturb another. At the serializable level each transaction behaves as if it ran alone; read committed and snapshot isolation are cheaper but permit specific anomalies such as read skew and write skew.",
    chapters: [7]
  },
  {
    term: "join",
    definition: "Combining records from different tables or streams that share a key, usually by following a foreign key or reference. In batch jobs it becomes a sort-merge or hash join across partitions; in stream processing it means matching events with other events, or with a table, as they arrive.",
    chapters: [2, 10, 11]
  },
  {
    term: "lambda architecture",
    definition: "A design that runs a batch system over the full history and a stream system over recent events in parallel, then merges their outputs to get both accuracy and low latency. Maintaining two implementations of the same logic is its major cost, which newer unified engines try to remove.",
    chapters: [12]
  },
  {
    term: "Lamport timestamp",
    definition: "A pair of (counter, node ID) that each node increments on every operation and bumps to the highest counter it has seen in incoming messages. It yields a total order consistent with causality, but it cannot tell you whether two operations were concurrent, nor let a node reject an operation immediately, because an earlier-ordered one may still be in flight.",
    chapters: [9]
  },
  {
    term: "last write wins (LWW)",
    definition: "A conflict-resolution rule that keeps the write with the highest timestamp and silently discards the rest. It guarantees convergence but loses data whenever concurrent writes hit the same key, so it is only safe when such loss is acceptable, for example when keys are never overwritten.",
    chapters: [5]
  },
  {
    term: "leader",
    definition: "The replica that accepts all writes for its data and fixes their order; followers copy its log. Also called primary or master. A leader is chosen by configuration or elected by consensus, and if it fails, failover appoints another.",
    chapters: [5]
  },
  {
    term: "leader election",
    definition: "Agreeing on exactly one node to act as leader, which is an instance of consensus. Systems often delegate it to a coordination service such as ZooKeeper or etcd and guard against stale leaders with fencing tokens.",
    chapters: [5, 9]
  },
  {
    term: "linearizable",
    definition: "A consistency guarantee under which a replicated value is indistinguishable from one living on a single machine: every operation appears to take effect atomically at one instant between its invocation and its response, and once any read has returned a new value, no later read may return an older one. It is the strongest single-object model and is expensive under partitions and high latency.",
    chapters: [9]
  },
  {
    term: "locality",
    definition: "Storing items that are typically accessed together next to each other, so one disk read or network round-trip retrieves them all. Document databases get it by storing each document as a contiguous blob; column stores invert it, placing each column's values together for analytic scans.",
    chapters: [2, 3]
  },
  {
    term: "lock",
    definition: "A primitive that serializes access to a resource: a holder gets exclusive (or, for readers, shared) use, and other would-be users block until it is given up. Databases build two-phase locking on it; distributed systems prefer leases with fencing tokens, since a lock held by a paused node cannot be trusted.",
    chapters: [7, 8]
  },
  {
    term: "log",
    definition: "An append-only sequence of records, read in order. The idea recurs throughout the book: storage engines keep a write-ahead log for crash recovery or use a log-structured format outright, leaders stream a replication log to followers, and Kafka-style partitioned logs carry event streams between systems.",
    chapters: [3, 5, 11]
  },
  {
    term: "log compaction",
    definition: "Dropping older records from a log while keeping the latest value for each key, so the log's size is bounded by the number of distinct keys rather than by the total number of writes. Log-structured storage uses it to reclaim space; Kafka uses it to retain a complete snapshot of a changelog indefinitely.",
    chapters: [3, 11]
  },
  {
    term: "LSM-tree",
    definition: "Log-Structured Merge-Tree: a storage engine that buffers writes in an in-memory sorted structure (the memtable), flushes it to disk as immutable sorted files (SSTables), and merges those files in the background through compaction. Writes are sequential and fast; a read may have to check several files, so Bloom filters are used to skip ones that cannot contain the key. LevelDB, RocksDB, Cassandra, and HBase use this design.",
    chapters: [3]
  },
  {
    term: "MapReduce",
    definition: "A batch programming model in which a mapper extracts key-value pairs from each input record, the framework sorts and groups them by key, and a reducer processes each key's group. Hadoop runs it over HDFS; it is simple and robust, but every job writes its full output to disk, which makes multi-stage workflows slow.",
    chapters: [2, 10]
  },
  {
    term: "materialize",
    definition: "To run a computation now and persist what it produces, so that consumers read the stored result instead of recomputing it. Materialized views precompute aggregates; MapReduce materializes each job's full output to HDFS, while Unix pipes and dataflow engines pass data along without storing it.",
    chapters: [3, 10]
  },
  {
    term: "materialized view",
    definition: "A query result that is physically stored and kept up to date as the underlying data changes, trading extra write work and storage for fast reads. Data cubes in warehouses are one form; derived views maintained by a stream processor are another.",
    chapters: [3, 12]
  },
  {
    term: "message broker",
    definition: "A server that receives messages from producers and delivers them to consumers, decoupling the two and buffering when consumers lag. Traditional brokers (RabbitMQ, ActiveMQ) delete a message once it is acknowledged; log-based brokers (Kafka, Kinesis) retain an ordered log that consumers read by offset and can replay.",
    chapters: [4, 11]
  },
  {
    term: "monotonic clock",
    definition: "A clock that only moves forward and is meant for measuring elapsed time, such as timeouts, but whose absolute value means nothing outside one machine. Contrast with the time-of-day clock, which NTP adjusts, which can jump backward, and which is the one to use for timestamps.",
    chapters: [8]
  },
  {
    term: "monotonic reads",
    definition: "A guarantee that a user who has observed a recent value will never later observe an older one, an anomaly that otherwise occurs when successive reads land on replicas with different lag. One implementation pins each user's reads to the same replica.",
    chapters: [5]
  },
  {
    term: "MVCC",
    definition: "Multi-version concurrency control: the database retains several committed versions of each row, tagged with transaction IDs, so that each transaction reads from a consistent snapshot while writers create new versions rather than overwriting. It is how snapshot isolation is implemented without readers blocking writers or writers blocking readers.",
    chapters: [7]
  },
  {
    term: "node",
    definition: "A single process on a single machine that plays a part in a larger system by exchanging messages with its peers. Each node has its own clock, its own memory, and its own view of events, and it can crash, pause, or be cut off independently of the others.",
    chapters: [8]
  },
  {
    term: "normalized",
    definition: "A schema in which every fact is stored exactly once and other tables refer to it by identifier; renaming a city then means a single update. Normalized data needs joins to read, which relational databases handle well and document stores handle awkwardly.",
    chapters: [2]
  },
  {
    term: "OLAP",
    definition: "Online analytical processing: workloads that scan huge numbers of rows to compute aggregates such as sums and averages for reports and dashboards, typically touching only a few columns. Served by data warehouses and column stores rather than by transactional databases.",
    chapters: [3]
  },
  {
    term: "OLTP",
    definition: "Online transaction processing: workloads of many small, low-latency reads and writes, each touching a handful of records found by key and driven by end-user actions. Row-oriented storage with B-tree or LSM indexes is built for this pattern.",
    chapters: [3]
  },
  {
    term: "partial failure",
    definition: "The condition in which some parts of a distributed system fail or become unreachable while the rest keep running, with no reliable way for survivors to learn what happened. A single machine fails totally and predictably; a network makes failures partial and nondeterministic.",
    chapters: [8]
  },
  {
    term: "partitioning",
    definition: "Dividing a dataset into pieces (partitions, shards) so that each node holds a subset, which lets the system grow beyond one machine. Keys are assigned by range or by hash, and each partition is normally also replicated. Also known as sharding.",
    chapters: [6]
  },
  {
    term: "Paxos / Raft",
    definition: "Families of fault-tolerant consensus algorithms (with Zab in ZooKeeper and Viewstamped Replication as siblings) that elect a leader with a numbered epoch and require a majority to accept each decision. They provide total order broadcast and stay correct through crashes and partitions as long as a majority of nodes can communicate.",
    chapters: [9]
  },
  {
    term: "percentile",
    definition: "A point in a distribution: the 99th percentile (p99) response time is the value that 99 percent of requests beat. Percentiles describe latency far better than averages, because the slowest requests often belong to the most valuable users and define SLAs.",
    chapters: [1]
  },
  {
    term: "phantom",
    definition: "A write in one transaction that changes which rows match another transaction's query, for example inserting a booking that would have made the other transaction's conflict check fail. Phantoms drive many write-skew cases and cannot be stopped by locking existing rows; predicate or index-range locks are needed.",
    chapters: [7]
  },
  {
    term: "Pregel / BSP",
    definition: "The bulk synchronous parallel model for graph processing, popularized by Google's Pregel: in each superstep a vertex handles the messages sent to it, updates its state, and sends messages along its edges, with a barrier between supersteps. Apache Giraph, Spark GraphX, and Flink Gelly implement it.",
    chapters: [10]
  },
  {
    term: "primary key",
    definition: "An identifier that no two records share, such as an auto-increment integer or a UUID that the database assigns on insert. The primary index maps it to the record; secondary indexes map other attributes to primary keys.",
    chapters: [2, 3]
  },
  {
    term: "process pause",
    definition: "A stretch of time during which a running thread makes no progress without realizing it, caused by garbage collection, virtual machine suspension, swapping, or a stop signal. On resuming, the process may act on stale assumptions, such as believing it still holds a lease that has already expired.",
    chapters: [8]
  },
  {
    term: "Protocol Buffers",
    definition: "Google's binary encoding format in which a schema definition assigns every field a numeric tag; the encoded data carries tags rather than names, so fields can be renamed freely and added or removed with some care. Facebook's Thrift uses the same approach.",
    chapters: [4]
  },
  {
    term: "quorum",
    definition: "The number of replicas whose acknowledgment makes an operation count as done. With `n` copies, requiring `w` writers and `r` readers such that `w + r > n` guarantees that any read overlaps at least one up-to-date write; in consensus, a quorum is any majority of nodes.",
    chapters: [5, 9]
  },
  {
    term: "read-your-writes",
    definition: "A guarantee that after a user submits a write, that same user's later reads reflect it, even though other users may still see stale data. Implementations read from the leader for recently modified data or route reads based on the timestamp of the user's last write.",
    chapters: [5]
  },
  {
    term: "rebalance",
    definition: "Moving partitions between nodes when machines are added or removed, or when load becomes uneven, so that data and requests stay evenly spread. Good strategies (a fixed number of partitions, or dynamic splitting) move only what is necessary; naive `hash mod N` moves almost everything.",
    chapters: [6]
  },
  {
    term: "replication",
    definition: "Maintaining the same dataset on several machines (replicas) so that a crashed or unreachable node does not take the data with it, reads can be served close to users, and read load can be spread out. The hard part is propagating changes; single-leader, multi-leader, and leaderless designs make different trade-offs.",
    chapters: [5]
  },
  {
    term: "replication lag",
    definition: "The delay between a write being applied on the leader and its arrival on an asynchronous follower. Normally it is a fraction of a second, but under load or during faults it can stretch to minutes and expose anomalies such as reads that appear to go back in time.",
    chapters: [5]
  },
  {
    term: "REST",
    definition: "A design philosophy for HTTP services that exposes resources at URLs, uses standard HTTP verbs and status codes, and keeps the network protocol visible rather than hiding it behind local-looking function calls. It is the usual choice for public APIs, in contrast to RPC frameworks used between internal services.",
    chapters: [4]
  },
  {
    term: "RPC",
    definition: "Remote procedure call: invoking a function on another machine as if it were local. The illusion leaks because a remote call can time out, run twice after a retry, or fail with the caller never learning the outcome; modern frameworks such as gRPC, Thrift, and Finagle expose this with futures and explicit timeouts.",
    chapters: [4]
  },
  {
    term: "safety / liveness",
    definition: "Two kinds of correctness property. A safety property says nothing bad ever happens (never two leaders, never a lost write) and, once violated, cannot be repaired; a liveness property says something good eventually happens (a request eventually gets a reply). Consensus algorithms uphold safety unconditionally and liveness only while a majority is reachable.",
    chapters: [8]
  },
  {
    term: "scatter/gather",
    definition: "Executing a query by sending it to every partition in parallel and merging the partial answers. It is unavoidable with document-partitioned secondary indexes and suffers from tail latency amplification, since the slowest partition determines the response time.",
    chapters: [6]
  },
  {
    term: "schema",
    definition: "A formal statement of what shape data takes: which fields exist and what type each holds. Relational databases enforce it on write; document databases usually leave checking to the application on read; encodings such as Avro and Protocol Buffers rely on it to keep data compact and to evolve it safely.",
    chapters: [2, 4]
  },
  {
    term: "schema-on-read",
    definition: "Storing data without validating its structure and interpreting that structure in application code when the data is read. It suits heterogeneous data or data whose format is dictated by external systems; the opposite, **schema-on-write**, is what relational databases do.",
    chapters: [2, 4]
  },
  {
    term: "secondary index",
    definition: "An index on an attribute other than the primary key, enabling lookups such as all red cars, where one value can match many records. In a partitioned database it can be local to each partition (cheap writes, scatter/gather reads) or global by term (fast reads, but writes update several partitions, usually asynchronously).",
    chapters: [3, 6]
  },
  {
    term: "serializable",
    definition: "The strongest isolation level: however the database actually interleaves concurrent transactions, the outcome matches what some one-at-a-time ordering would have produced. Databases achieve it by actual serial execution, two-phase locking, or serializable snapshot isolation.",
    chapters: [7]
  },
  {
    term: "serializable snapshot isolation (SSI)",
    definition: "An optimistic technique that lets transactions run on snapshots without taking locks and then, at commit, checks whether a transaction read data that another concurrent transaction has since changed, aborting it if so. It prevents write skew with far less blocking than two-phase locking; PostgreSQL implements it.",
    chapters: [7]
  },
  {
    term: "shared-nothing",
    definition: "A cluster design built from ordinary machines that own their processors, RAM, and disks outright and coordinate purely by network messages. It avoids the cost and limits of big shared-memory or shared-disk hardware and is the setting this book assumes.",
    chapters: [5, 6]
  },
  {
    term: "skew",
    definition: "Either an imbalance (some partitions hold far more data or traffic than others, also known as hot spots, in storage or in batch joins) or a timing anomaly: **read skew** when a transaction sees data from different points in time, **write skew** when two transactions each decide based on data the other is changing, and **clock skew** between machines whose clocks disagree.",
    chapters: [6, 7, 8, 10]
  },
  {
    term: "sloppy quorum",
    definition: "A relaxed quorum in which a write is accepted by any `w` reachable nodes, not only the designated home nodes for the key, so that the system stays writable during outages. The data is later handed off to the proper nodes; until then, a read quorum may miss it.",
    chapters: [5]
  },
  {
    term: "snapshot isolation",
    definition: "An isolation level in which every transaction reads from a consistent snapshot of the database as of its start, so long-running reads and backups are unaffected by concurrent writes. It is implemented with MVCC, prevents read skew, and still allows write skew; some databases call it repeatable read.",
    chapters: [7]
  },
  {
    term: "split brain",
    definition: "The dangerous situation where an old leader keeps operating after a new one has been promoted, so two nodes accept writes for the same data and produce conflicts or lost updates. It arises when failover fires while the old leader is still alive; consensus-based election and fencing are the defenses.",
    chapters: [5, 8]
  },
  {
    term: "SSTable",
    definition: "Sorted String Table: an immutable on-disk file of key-value pairs ordered by key, produced when an LSM-tree flushes its memtable. Sorting lets files be merged like a mergesort, allows a sparse in-memory index, and makes range scans sequential.",
    chapters: [3]
  },
  {
    term: "star schema",
    definition: "The standard warehouse layout: a central fact table in which each row is an event (a sale, a click) surrounded by dimension tables (product, customer, date) that it references by foreign key. A snowflake schema further normalizes the dimensions into sub-dimensions.",
    chapters: [3]
  },
  {
    term: "stored procedure",
    definition: "Application code shipped to and run inside the database, so a whole transaction completes without network round-trips to the client. Single-threaded serial-execution systems such as VoltDB require it, because every transaction must be short and self-contained.",
    chapters: [7]
  },
  {
    term: "stream process",
    definition: "A job that never finishes: it reads events one by one as they are produced and keeps emitting results, such as alerts, running aggregates, or updates to a derived store. Flink, Kafka Streams, Storm, and Spark Streaming are typical frameworks.",
    chapters: [11]
  },
  {
    term: "synchronous",
    definition: "Waiting for a step to complete before moving on. A synchronous follower must confirm a write before the leader acknowledges it; a synchronous network would guarantee a maximum delay, which packet-switched networks do not.",
    chapters: [5, 8]
  },
  {
    term: "system of record",
    definition: "The one place that holds the definitive version of some data (the **source of truth**). New information is written there first; indexes, caches, and warehouses are computed from it and defer to it in any disagreement.",
    chapters: [11, 12]
  },
  {
    term: "tail latency",
    definition: "Response time at the high percentiles (p99, p999), suffered by a small fraction of requests but often by the most valuable users. When a request fans out to many backends, one slow backend turns a rare slow case into a common one, which is called tail latency amplification.",
    chapters: [1, 6]
  },
  {
    term: "timeout",
    definition: "Declaring a remote node failed when it has not answered within a chosen period. Because network delays are unbounded, a timeout cannot distinguish a dead node from a slow one; a short timeout risks false alarms and a long one delays recovery.",
    chapters: [8]
  },
  {
    term: "total order",
    definition: "An ordering with no ties in comparability: pick any two elements and one definitely comes first. Sequence numbers and timestamps give a total order; causality gives only a **partial order**, because concurrent events cannot be ranked against each other.",
    chapters: [9]
  },
  {
    term: "total order broadcast",
    definition: "A protocol that delivers messages to every node reliably and in exactly the same order. It is equivalent in power to consensus and is the basis of state machine replication, replicated logs, and linearizable storage.",
    chapters: [9]
  },
  {
    term: "transaction",
    definition: "A group of reads and writes treated as one unit that either fully succeeds or fully fails, so the application can simply retry without reasoning about partial results. Transactions also define how concurrent operations are isolated from one another.",
    chapters: [7]
  },
  {
    term: "two-phase commit (2PC)",
    definition: "An atomic commit protocol for transactions spanning several nodes: a coordinator first asks every participant to prepare (promise it can commit), and only if all say yes does it record and broadcast the commit decision. If the coordinator crashes after participants have prepared, they are stuck in doubt, holding locks until it recovers.",
    chapters: [9]
  },
  {
    term: "two-phase locking (2PL)",
    definition: "A pessimistic route to serializability: before touching an object a transaction takes a shared lock to read it or an exclusive lock to write it, and releases nothing until it commits or aborts. Readers and writers block each other, which hurts throughput and causes deadlocks, but it was the standard approach for decades.",
    chapters: [7]
  },
  {
    term: "unbounded",
    definition: "Without a finite limit that you can state in advance. An unbounded stream never ends and must be processed incrementally; an unbounded network delay means no timeout is guaranteed to be long enough.",
    chapters: [8, 11]
  },
  {
    term: "version vector",
    definition: "A set of per-replica version counters stored alongside a value so that, when two versions of a key meet, the system can tell whether one descends from the other or whether they were written concurrently and must be merged. Riak and other Dynamo-style databases use it.",
    chapters: [5]
  },
  {
    term: "watermark",
    definition: "A marker flowing through a stream that says no more events with timestamps earlier than a given time are expected, which lets a window close and emit its result. Events that arrive after the watermark are late and must be dropped or handled as corrections.",
    chapters: [11]
  },
  {
    term: "windowing",
    definition: "Grouping an unbounded stream into finite time intervals for aggregation: tumbling windows are fixed and non-overlapping, hopping windows overlap by a fixed step, sliding windows cover any interval of a given length, and session windows group a user's burst of activity.",
    chapters: [11]
  },
  {
    term: "write skew",
    definition: "An anomaly in which two concurrent transactions each read the same data, make a decision, and write to different rows, so neither sees the other's write and a shared invariant breaks, such as both on-call doctors taking leave at once. Snapshot isolation permits it; serializable isolation prevents it.",
    chapters: [7]
  },
  {
    term: "write-ahead log (WAL)",
    definition: "A sequential log to which a storage engine appends every intended change before modifying its data pages, so that after a crash it can redo or undo partial writes. The same log can be shipped to followers for replication or tapped for change data capture.",
    chapters: [3, 5]
  }
]);
