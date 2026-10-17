DDIA.registerChapter({
  number: 6,
  part: 2,
  title: "Partitioning",
  tagline: "How do you split a large dataset across many nodes so load stays balanced and requests still find their data?",
  studyMinutes: 80,
  overview: [
    "Chapter 5 made extra copies of the same data. This chapter cuts the data into pieces. Partitioning (also called sharding) splits a dataset into partitions and places them on different nodes of a shared-nothing cluster, so that datasets and query volumes too large for one machine can grow with the number of nodes. Every record belongs to exactly one partition, and each partition behaves like a small independent database. The idea dates back to Teradata and Tandem NonStop SQL in the 1980s and was rediscovered by NoSQL stores and Hadoop-style warehouses.",
    "The chapter works through four questions. How do you decide which partition a record belongs to, and what do you give up when you choose key ranges versus hashes? How do secondary indexes, which look up records by non-key values, fit into a partitioned world (local versus global indexes)? How do you rebalance partitions when nodes join, leave, or fail, without moving more data than necessary? And how does a client find the node that currently owns a given key (request routing and service discovery)?",
    "Within Part II, partitioning and replication are almost always combined: each partition has a leader and followers, and each node leads some partitions while following others. The chapter deliberately leaves out the hardest consequence of splitting data, namely what happens when one operation must write to several partitions and only some of those writes succeed. Transactions (Chapter 7) and consensus (Chapter 9) pick that up."
  ],
  bigIdeas: [
    "Partitioning exists to spread data and load evenly; a skewed scheme with a hot spot leaves most of the cluster idle.",
    "Key-range partitioning keeps keys sorted for range scans but invites hot spots; hash partitioning evens out load but scatters adjacent keys.",
    "Secondary indexes force a choice: local indexes make writes cheap and reads scatter/gather; global indexes make reads targeted and writes multi-partition and usually asynchronous.",
    "Never map keys to nodes with hash mod N; separate key-to-partition from partition-to-node so rebalancing moves only whole partitions.",
    "Routing requires an agreed view of partition ownership, kept in a coordination service like ZooKeeper or spread among nodes by gossip.",
    "Fully automatic rebalancing combined with automatic failure detection can turn one slow node into a cascading failure; keep a human in the loop."
  ],
  sections: [
    {
      id: "partitioning-and-replication",
      title: "Why Partition, and How Partitioning Combines with Replication",
      body: [
        "Replication keeps a full copy of the dataset on every replica, so it cannot help once the data volume or the write rate exceeds what one machine can handle. Partitioning breaks the dataset into pieces and spreads those pieces across the nodes of a shared-nothing cluster. Each record, row, or document lives in exactly one partition, which lets every partition act as a small self-contained database. A query that touches a single partition runs entirely on one node, so adding nodes adds both storage and query throughput. Queries that span many partitions are possible but much harder to execute efficiently.",
        "Different products use different names for the same thing: MongoDB, Elasticsearch, and SolrCloud say shard; HBase says region; Bigtable says tablet; Cassandra and Riak say vnode; Couchbase says vBucket. The chapter uses partition throughout. This has nothing to do with a network partition, which is a communication fault between nodes and is covered in Chapter 8. Partitioned databases first appeared in the 1980s with Teradata and Tandem NonStop SQL; NoSQL stores and Hadoop-based warehouses revived the techniques decades later. Transactional and analytical systems are tuned differently, but the partitioning fundamentals are the same.",
        "In real deployments partitioning and replication go together. Every partition has several replicas on different nodes, and with leader-based replication one node hosts the leader for a given partition while other nodes host its followers. A single node normally leads some partitions and follows others, so leadership is distributed across the cluster. How you split the data and how you replicate it are largely separate decisions, which is why the chapter sets replication aside and concentrates on how partitions are formed, indexed, rebalanced, and located."
      ],
      keyPoints: [
        "Partitioning is about scalability: spread data over many disks and spread query load over many processors.",
        "A record is owned by exactly one partition, yet with replication that partition has copies on several nodes.",
        "Under leader-based replication a node typically leads some partitions while following others at the same time.",
        "Same concept, many names: shard, region, tablet, vnode, vBucket.",
        "A data partition is a design choice; a network partition (netsplit) is a fault. Do not confuse them.",
        "Partitioning scheme and replication scheme can be chosen independently."
      ],
      table: {
        caption: "What different systems call a partition",
        columns: ["Term", "Systems that use it"],
        rows: [
          ["shard", "MongoDB, Elasticsearch, SolrCloud"],
          ["region", "HBase"],
          ["tablet", "Bigtable"],
          ["vnode", "Cassandra, Riak"],
          ["vBucket", "Couchbase"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Treat each partition as a small database that happens to share a cluster with others. Everything that is easy inside one partition (indexes, ordering, atomic updates) becomes hard the moment an operation spans two."
      },
      systems: ["Teradata", "Tandem NonStop SQL", "MongoDB", "Elasticsearch", "SolrCloud", "HBase", "Bigtable", "Cassandra", "Riak", "Couchbase"]
    },
    {
      id: "key-value-partitioning-goals",
      title: "Partitioning Key-Value Data: Balance, Skew, and Hot Spots",
      body: [
        "The target is easy to state: every node should hold about the same amount of data and serve about the same share of reads and writes. If that holds, ten nodes deliver roughly ten times the storage and throughput of one (setting replication aside). The failure mode is skew, where some partitions carry far more data or traffic than others. When one partition draws a disproportionate amount of load it is a hot spot. In the extreme, a single node does all the work while the other nine sit idle, and the cluster is no faster than one machine.",
        "Placing records on nodes at random would balance data volume very well, but it destroys the ability to find anything: to read one record you would have to ask every node, because nothing tells you where it landed. So the chapter assumes a key-value model in which records are always addressed by primary key, and asks how to derive the partition deterministically from that key. A paper encyclopedia is the running analogy: entries are sorted by title and volumes are labeled by title range, so you can pull the right book off the shelf without searching all of them."
      ],
      keyPoints: [
        "The goal is even distribution of both data volume and request load; balancing one but not the other is not enough.",
        "Skew means unequal partitions; a hot spot is the extreme case of one overloaded partition.",
        "Random placement balances data perfectly but forces every read to query all nodes.",
        "A deterministic key-to-partition function lets a client send a request to exactly one node.",
        "The two main deterministic strategies are partitioning by key range and partitioning by hash of key."
      ],
      callout: {
        kind: "pitfall",
        text: "Balanced data does not imply balanced load. A partition can be small yet hot if a handful of its keys are read or written constantly."
      }
    },
    {
      id: "partitioning-by-key-range",
      title: "Partitioning by Key Range",
      body: [
        "Key-range partitioning gives each partition a contiguous slice of the sorted key space, from some lower bound to some upper bound. Anyone who knows the boundaries can compute which partition holds a key, and anyone who also knows which node hosts that partition can send the request straight there. Boundaries are rarely evenly spaced because keys are rarely evenly distributed: an encyclopedia might fit A and B into one volume while squeezing T through Z into another. Boundaries have to track the actual key distribution, either set by an administrator or adjusted by the database. This is how Bigtable and its open-source relative HBase work, as do RethinkDB and (prior to version 2.4) MongoDB.",
        "Inside a partition, keys are usually stored in sorted order, as in the SSTables and LSM-trees of Chapter 3. Sorted storage makes range scans cheap, and it lets a key assembled from several fields behave like a concatenated index, so one query can fetch a cluster of related records. For a sensor network keyed by a timestamp of the form year-month-day-hour-minute-second, retrieving every reading from one month is a single contiguous scan.",
        "The weakness is that access patterns which cluster in key order produce hot spots. With timestamp keys, each partition covers a window of time, and every write for the current moment lands in the partition for today while the others receive nothing. The standard remedy is to lead the key with a high-cardinality component such as the sensor identifier, so the data is partitioned first by sensor and only then by time. Writes from many concurrent sensors then spread across partitions. The cost shows up on reads: a query covering a time window across many sensors must issue one range scan per sensor and merge the results."
      ],
      keyPoints: [
        "Each partition owns a contiguous key interval; boundaries follow data density rather than uniform spacing.",
        "Sorted keys inside a partition enable efficient range scans and concatenated-index style queries.",
        "Monotonically increasing keys (timestamps, sequence numbers) funnel all writes into one partition.",
        "Fix the hot spot by reordering key components: high-cardinality prefix first, time component second.",
        "The reordering trades a single range query for one range query per prefix value.",
        "Used by Bigtable, HBase, RethinkDB, and MongoDB before 2.4."
      ],
      callout: {
        kind: "example",
        text: "Keying sensor data as (sensor_id, timestamp) spreads writes across partitions and still lets you scan one sensor's readings for a month in order. Keying it by timestamp alone makes today's partition the bottleneck."
      },
      systems: ["Bigtable", "HBase", "RethinkDB", "MongoDB"]
    },
    {
      id: "partitioning-by-hash-of-key",
      title: "Partitioning by Hash of Key, and the Consistent Hashing Confusion",
      body: [
        "To defuse skew, many stores partition on a hash of the key instead of the key itself. A decent hash maps similar inputs to very different outputs, so even tightly clustered keys land uniformly across, say, a 32-bit output range. Cryptographic strength is unnecessary: MD5 serves Cassandra and MongoDB, while Voldemort relies on Fowler-Noll-Vo. But not just any hash will do. Some language-level hash functions are not stable across processes (Java's `Object.hashCode()` and Ruby's `Object#hash` are the usual examples), so two processes could compute different values for the same key and route it to different partitions. Once a stable hash is in place, each partition owns a range of hash values rather than a range of keys. The boundaries can be evenly spaced or picked pseudorandomly.",
        "The pseudorandom-boundary variant is sometimes labeled consistent hashing, a term coined by Karger et al. in 1997 for spreading load across an internet-scale cache such as a CDN, where random boundaries remove the need for a central coordinator or consensus. The word consistent there has nothing to do with replica consistency (Chapter 5) or ACID consistency (Chapter 7); it names a rebalancing technique. That technique works poorly for databases and is rarely implemented as originally described, even though some vendor documentation still uses the label loosely. The chapter's advice is to say hash partitioning and avoid the ambiguity.",
        "The price of hashing is losing key order. Keys that were neighbors are now scattered everywhere, so a range query on the primary key must visit every partition (MongoDB in hash-sharded mode does exactly that) or is not supported at all (Riak, Couchbase, Voldemort). Cassandra offers a middle path through compound primary keys. Only the first component is hashed to pick the partition; the remaining components define the sort order of rows within that partition's SSTables. You cannot range-scan over the first component, but once it is fixed you get efficient ordered scans over the rest. A primary key of (user_id, update_timestamp) keeps all of one user's posts on one partition, sorted by time, while different users spread across the cluster. This is a natural model for one-to-many relationships."
      ],
      keyPoints: [
        "Hashing converts a skewed key distribution into a near-uniform distribution over hash values.",
        "The hash must be deterministic across processes and machines; per-process randomized hashes break routing.",
        "Non-cryptographic hashes are fine: MD5 (Cassandra, MongoDB), FNV (Voldemort).",
        "Consistent hashing in Karger's sense means randomly chosen boundaries for cache load spreading; it is not about data consistency and fits databases poorly.",
        "Hash partitioning gives up efficient range queries on the primary key.",
        "Compound keys (hash the first part, sort by the rest) restore ordered scans within a single partition-key value."
      ],
      table: {
        caption: "Key-range versus hash partitioning",
        columns: ["Property", "Key range", "Hash of key"],
        rows: [
          ["How the partition is chosen", "Key falls within a contiguous key interval", "Hash of the key falls within a hash interval"],
          ["Range queries on primary key", "Efficient; touch one or a few partitions", "Scatter to all partitions, or unsupported"],
          ["Hot-spot risk", "High for sequential or time-ordered keys", "Low for distinct keys; a single very hot key still concentrates"],
          ["Typical rebalancing", "Dynamic splitting of oversized ranges", "Fixed partition count, or fixed count per node"],
          ["Example systems", "Bigtable, HBase, RethinkDB, MongoDB (range mode)", "Cassandra, Riak, Voldemort, Couchbase, MongoDB (hash mode)"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Cassandra's compound key is the pragmatic hybrid: hash the partition key for spread, sort by the remaining columns for locality. Most real schemas want both properties."
      },
      systems: ["Cassandra", "MongoDB", "Voldemort", "Riak", "Couchbase"]
    },
    {
      id: "skewed-workloads-hot-spots",
      title: "Skewed Workloads and Relieving Hot Spots",
      body: [
        "Hashing balances distinct keys, but it cannot split a single key. If a huge share of traffic targets one key, the hash of that key never changes, so every request lands on the same partition. The classic case is a celebrity account on a social network: millions of followers react to one post, and the writes pile up on one user ID or one post ID.",
        "Most databases today do not detect or repair this on their own, so the application has to. A common trick is to salt the hot key by attaching a small random number as a prefix or suffix. A two-digit decimal salt fans one logical key out into 100 physical keys, which hash to different partitions. The write side is now balanced, but reads pay for it: a reader must fetch all 100 variants and merge them. Salting only pays off for the few keys that are genuinely hot; applying it everywhere would burden ordinary low-traffic keys with pointless extra reads. That means the system also needs bookkeeping to record which keys are currently split. Automatic detection and compensation for skew remains a future improvement rather than a standard feature."
      ],
      keyPoints: [
        "Hashing cannot help when skew is concentrated on one key; identical keys always share a partition.",
        "Hot keys are an application-level problem today, not something most databases solve automatically.",
        "Salting a hot key with a random two-digit number spreads its writes over 100 keys and therefore many partitions.",
        "Reads of a salted key must fan out to all variants and combine them.",
        "Track which keys are salted; salting every key wastes read effort."
      ],
      callout: {
        kind: "example",
        text: "A viral post's comment counter is one key receiving a flood of increments. Writing to counter_00 through counter_99 and summing them on read turns one hot partition into a hundred warm ones."
      }
    },
    {
      id: "secondary-indexes-by-document",
      title: "Partitioning and Secondary Indexes: Document-Partitioned (Local) Indexes",
      body: [
        "Everything so far assumed lookups by primary key, which maps cleanly onto a partition. Secondary indexes break that assumption. They do not identify one record; they find every record matching a value, such as all actions by user 123 or all cars whose color is red. Relational databases depend on them, document stores commonly offer them, and they are the entire purpose of search servers like Solr and Elasticsearch. Some key-value stores (HBase, Voldemort) left them out because of the implementation burden; others (Riak) added them later because modeling real applications without them is painful. The core difficulty is that an indexed value does not line up with any one partition. Two designs address it: partitioning the index by document and partitioning it by term. Building a secondary index by hand in application code is risky, by the way: race conditions and partially failed writes can silently desynchronize index and data unless you have multi-object transactions.",
        "In document-partitioned indexing, each partition keeps its own secondary index covering only the documents stored in that partition. Picture a used-car marketplace partitioned by listing ID (partition 0 holding listings 0-499, partition 1 holding 500-999, and so on) with indexes on color and make. When a red car is inserted into partition 1, partition 1 alone appends the listing ID to its own posting list for color:red. A write therefore touches exactly one partition, which is why this design is also called a local index.",
        "Reads are the weak side. Red cars exist in every partition, so a search for color:red must fan out to every partition and merge the partial results. This scatter/gather pattern is expensive even with parallel fan-out, because the slowest partition dictates the response time, which amplifies tail latency (recall the percentile discussion in Chapter 1). Despite that, local indexes are the norm: MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, and VoltDB all use them. Vendors advise choosing the partition key so that common index queries can be answered from one partition, but combined filters such as color and make together often make that impossible."
      ],
      keyPoints: [
        "A secondary index finds many records by value; the value does not determine a partition.",
        "Local index: each partition indexes only its own documents, so a write updates one partition.",
        "Reading a local index means scatter/gather across all partitions followed by a merge.",
        "Scatter/gather suffers from tail latency amplification: the slowest partition sets the pace.",
        "Widely used: MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB.",
        "Design the partition key so frequent secondary-index queries stay within one partition when you can."
      ],
      callout: {
        kind: "pitfall",
        text: "Fanning out to 100 partitions in parallel is not free even when each partition is fast: the chance that at least one of them is slow grows with the fan-out, so p99 latency balloons."
      },
      systems: ["MongoDB", "Riak", "Cassandra", "Elasticsearch", "SolrCloud", "VoltDB", "HBase", "Voldemort", "Solr"]
    },
    {
      id: "secondary-indexes-by-term",
      title: "Term-Partitioned (Global) Secondary Indexes",
      body: [
        "The alternative is one global index that spans all partitions. Keeping it on a single node would create a bottleneck and defeat the point of partitioning, so the global index is itself partitioned, but by the indexed value rather than by document ID. In the car example, entries for colors a through r might live in index partition 0 and s through z in index partition 1, while the make index splits at a different boundary (say between f and h). The indexed value is called a term, a word borrowed from full-text search, where terms are the individual words extracted from documents. The index can be split by the term itself, which supports range queries over numeric attributes such as asking price, or by a hash of the term, which balances load more evenly.",
        "Reads get cheaper: a query for one term goes to exactly one index partition instead of all of them. Writes get slower and more complicated: a single document contains many terms, each possibly owned by a different index partition on a different node, so one document write fans out into several index updates. Making all of them visible atomically would require a distributed transaction across the affected partitions, which many databases do not support (Chapters 7 and 9).",
        "As a result, global indexes are usually updated asynchronously. If you read the index immediately after a write, the write may not be reflected yet. Amazon DynamoDB documents that its global secondary indexes normally catch up within a fraction of a second but can lag longer during infrastructure faults. Two other examples are Riak's search feature and Oracle's data warehouse, where both local and global indexing are available and the administrator picks per index. Chapter 12 returns to how term-partitioned indexes can be built as derived data with stream processing."
      ],
      keyPoints: [
        "A global index is partitioned by term, independently of how the primary data is partitioned.",
        "Partition by term value for range queries over the index, or by hash of the term for even load.",
        "Reads hit one index partition; writes may update many index partitions on many nodes.",
        "Synchronous updates would need distributed transactions, so global indexes are typically asynchronous and can lag.",
        "DynamoDB global secondary indexes: sub-second lag normally, longer under faults.",
        "Riak search and Oracle's data warehouse use or offer global indexing."
      ],
      table: {
        caption: "Local versus global secondary indexes",
        columns: ["Aspect", "Document-partitioned (local)", "Term-partitioned (global)"],
        rows: [
          ["Where index entries live", "Same partition as the document", "Index partition chosen by the term"],
          ["Write cost", "One partition updated", "Potentially many index partitions updated"],
          ["Read cost", "Scatter/gather to all partitions", "Single index partition per term"],
          ["Freshness", "Updated together with the document", "Usually asynchronous; may lag"],
          ["Tail latency exposure", "High (slowest partition dominates)", "Low for point term lookups"],
          ["Examples", "MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB", "DynamoDB GSI, Riak search, Oracle global indexes"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Local and global indexes are the same trade-off seen from two ends: pay at write time (global) or pay at read time (local). Choose based on your read/write ratio and your tolerance for stale index results."
      },
      systems: ["Amazon DynamoDB", "Riak", "Oracle"]
    },
    {
      id: "rebalancing-goals-and-hash-mod-n",
      title: "Rebalancing Partitions: Goals, and Why Not hash mod N",
      body: [
        "Clusters change. Query volume grows and needs more CPUs; data grows and needs more disks and memory; a machine dies and its responsibilities must land elsewhere. Each of these shifts data and request load between nodes, a process called rebalancing. A good rebalancing scheme meets three requirements. First, afterwards the load (storage, reads, and writes) is shared fairly across nodes. Second, the database keeps serving reads and writes while the move is in progress. Third, it transfers no more data than necessary, so the operation finishes quickly and does not saturate the network or disks.",
        "The most obvious scheme fails the third requirement badly. Suppose you place each key on node number `hash(key) mod N` for a cluster of N nodes. Take a key whose hash is 123456. With 10 nodes it lives on node 6; grow to 11 nodes and it must move to node 3; grow to 12 and it moves again, to node 0. Changing N reshuffles the vast majority of keys, so every scaling step becomes a near-total data migration. The fix that underlies every practical scheme is indirection: map keys to partitions in a way that never depends on the node count, and then separately map partitions to nodes."
      ],
      keyPoints: [
        "Triggers for rebalancing: more query load, more data, or a failed node.",
        "Requirements: fair load afterwards, uninterrupted service during, minimal data movement.",
        "hash mod N couples key placement to the node count; changing N relocates most keys.",
        "Worked example: 123456 mod 10 = 6, mod 11 = 3, mod 12 = 0.",
        "All viable strategies separate the key-to-partition mapping from the partition-to-node assignment."
      ],
      callout: {
        kind: "pitfall",
        text: "Taking the modulo of a hash is the first idea everyone has and the one no serious distributed database uses, because adding a single node forces nearly every key to migrate."
      }
    },
    {
      id: "fixed-number-of-partitions",
      title: "Rebalancing Strategy 1: A Fixed Number of Partitions",
      body: [
        "Create far more partitions than nodes at the outset and give each node a bundle of them. A 10-node cluster might be configured with 1,000 partitions, roughly 100 per node. When a node joins, it claims a handful of partitions from each existing node, stopping once every node holds about the same number; when a node leaves, its partitions are handed out among the survivors. Whole partitions are the unit of movement. Neither the partition count nor the key-to-partition mapping is touched; the only thing edited is the table recording which node hosts which partition. Because copying a partition over the network takes time, the old assignment keeps serving reads and writes until the transfer completes, and then ownership flips.",
        "This scheme also accommodates uneven hardware: give more partitions to more powerful machines and they absorb a larger share of the load. Riak, Elasticsearch, Couchbase, and Voldemort rebalance this way. The partition count is normally decided at initial deployment and then left alone for the life of the cluster. Splitting partitions is possible in principle, but it adds operational complexity, so many of these systems do not implement it. The initial count therefore becomes a hard ceiling on cluster size, which pushes you to pick a generous number. Yet each partition carries management overhead, so an excessively high count hurts as well.",
        "The real difficulty appears when total data volume is unpredictable. Each partition holds a fixed fraction of the data, so partitions grow in step with the dataset. Very large partitions make rebalancing and recovery from node failure slow; very small partitions waste overhead. There is a sweet spot in partition size, and a fixed count makes it hard to stay in it when the dataset grows by orders of magnitude."
      ],
      keyPoints: [
        "Many partitions per node (for example 1,000 partitions on 10 nodes); only the partition-to-node assignment changes.",
        "New nodes take a few whole partitions from every existing node; departing nodes give theirs away.",
        "The old assignment serves traffic while transfers run, so rebalancing does not block reads or writes.",
        "Heterogeneous clusters: assign more partitions to stronger nodes.",
        "The partition count is the maximum node count, so choose it high but not absurdly high.",
        "Partition size tracks dataset size, which is awkward when future growth is uncertain.",
        "Used by Riak, Elasticsearch, Couchbase, Voldemort."
      ],
      callout: {
        kind: "example",
        text: "With 1,000 partitions on 10 nodes, adding an eleventh node moves about 91 partitions, roughly 9 taken from each old node, which is about 9% of the data. Under hash mod N the same step would move nearly everything."
      },
      systems: ["Riak", "Elasticsearch", "Couchbase", "Voldemort"]
    },
    {
      id: "dynamic-partitioning",
      title: "Rebalancing Strategy 2: Dynamic Partitioning",
      body: [
        "A fixed set of partitions with fixed key boundaries would be a trap for key-range partitioned systems: guess the boundaries wrong and all the data piles into one partition while the rest stay empty, and correcting it by hand is painful. HBase and RethinkDB therefore create partitions on demand. When a partition exceeds a configured size threshold (HBase defaults to 10 GB), it splits into two halves of roughly equal size. When deletions shrink a partition below a lower threshold, it merges with an adjacent one. The behavior is the same split-and-merge discipline a B-tree applies to its upper-level pages (Chapter 3), just scaled up to whole partitions.",
        "As with the fixed scheme, each partition lives on one node and a node hosts many partitions. After a split, one half can be shipped to a less loaded node; in HBase the partition files move through HDFS, the distributed filesystem underneath it. The benefit is that the partition count follows the data volume: a small dataset has few partitions and little overhead, while a huge dataset still has partitions capped at the configured maximum size.",
        "The catch is the cold start. An empty database has no information about the key distribution, so it begins with a single partition. Until that partition grows large enough to split, one node handles every write while the rest of the cluster idles. HBase and MongoDB let you pre-split an empty table into an initial set of partitions, but with key-range partitioning that requires knowing in advance roughly how keys will be distributed. Dynamic partitioning is not limited to key ranges: MongoDB from version 2.4 supports both range and hash sharding and splits partitions dynamically in both modes."
      ],
      keyPoints: [
        "Partitions split when they exceed a size threshold (HBase default 10 GB) and merge when they shrink below a lower bound.",
        "Analogous to B-tree node split and merge, applied at partition granularity.",
        "Partition count scales with data volume, keeping each partition within a bounded size.",
        "A fresh database starts as one partition, so early writes bottleneck on one node.",
        "Pre-splitting (HBase, MongoDB) avoids the cold start but needs a prior estimate of the key distribution.",
        "Works for hash partitioning as well as key ranges (MongoDB 2.4 and later)."
      ],
      callout: {
        kind: "pitfall",
        text: "Bulk-loading a large dataset into a brand-new HBase table without pre-splitting sends every write to one region server until the first split, no matter how many servers the cluster has."
      },
      systems: ["HBase", "RethinkDB", "MongoDB", "HDFS"]
    },
    {
      id: "partitioning-proportionally-to-nodes",
      title: "Rebalancing Strategy 3: Partitions Proportional to Nodes",
      body: [
        "Compare the first two schemes by what they hold constant. With a fixed partition count, partition size grows with the dataset. With dynamic partitioning, partition size stays within bounds and the count grows with the dataset. In both, the number of partitions has nothing to do with the number of nodes. Cassandra and Ketama take a third route: a fixed number of partitions per node, so the total count is proportional to cluster size. While the node count is stable, partitions grow with the data; when nodes are added, partitions shrink again. Since more data usually brings more nodes, partition sizes stay roughly steady over time.",
        "When a node joins, it selects a fixed number of existing partitions at random, cuts each one in two, keeps one half for itself, and leaves the other half on its current owner. Individual random splits can be lopsided, but averaged over many partitions (Cassandra defaults to 256 per node) the newcomer ends up with a fair share of the load. Cassandra 3.0 added a token allocation algorithm that avoids the unfairness of pure randomness. Because split points are chosen at random from the hash range, this scheme requires hash partitioning, and it is the one that most closely resembles the original consistent hashing paper. Newer hash algorithms achieve a similar effect with much less metadata."
      ],
      keyPoints: [
        "Fixed partitions per node (Cassandra default 256), so total partitions scale with cluster size.",
        "Partition size stays roughly stable because data growth usually brings node growth.",
        "A joining node randomly selects existing partitions, splits them, and claims half of each.",
        "Randomness averages out over many partitions; Cassandra 3.0 improved fairness with a new token allocator.",
        "Requires hash partitioning; this is the closest practical relative of Karger's consistent hashing."
      ],
      table: {
        caption: "Three rebalancing strategies compared (plus the anti-pattern)",
        columns: ["Strategy", "What stays constant", "What changes as data or nodes grow", "Typical pairing", "Examples"],
        rows: [
          ["Fixed number of partitions", "Partition count and key-to-partition map", "Partition size grows with data; whole partitions move between nodes", "Hash partitioning", "Riak, Elasticsearch, Couchbase, Voldemort"],
          ["Dynamic partitioning", "Partition size range (min to max)", "Partition count grows with data via splits and merges", "Key range (also hash in MongoDB)", "HBase, RethinkDB, MongoDB"],
          ["Proportional to nodes", "Partitions per node", "Partition size shrinks when nodes join", "Hash partitioning with random split points", "Cassandra, Ketama"],
          ["hash mod N (anti-pattern)", "Nothing useful", "Most keys relocate whenever N changes", "None", "Avoid"]
        ]
      },
      systems: ["Cassandra", "Ketama"]
    },
    {
      id: "automatic-vs-manual-rebalancing",
      title: "Operations: Automatic or Manual Rebalancing",
      body: [
        "Who decides when partitions move? At one end of the spectrum the system does everything by itself; at the other, an administrator writes the partition-to-node mapping explicitly and changes it only on purpose. Many systems sit in between: Couchbase, Riak, and Voldemort compute a proposed new assignment automatically but wait for an operator to approve it before anything moves.",
        "Full automation saves routine effort, but rebalancing is a heavy operation. It reroutes traffic and copies large volumes of data, and done carelessly it can saturate the network or the nodes and degrade every other request. The nastier risk comes from pairing automatic rebalancing with automatic failure detection. Picture a node that is merely overloaded and slow to respond. Its peers conclude it has died and begin moving its partitions elsewhere, which adds copy traffic to an already struggling node and to the network, which makes more nodes look slow, which triggers more rebalancing. That feedback loop is a cascading failure. A human approval step is slower, but it inserts judgment exactly where an automated system is most likely to misread the situation."
      ],
      keyPoints: [
        "Spectrum from fully automatic to fully manual; Couchbase, Riak, and Voldemort propose an assignment and let an administrator commit it.",
        "Rebalancing moves lots of data and reroutes requests, so it competes with production traffic.",
        "Automatic rebalancing plus automatic failure detection can misjudge a slow node as dead and make it worse.",
        "The result can be a cascading failure across the cluster.",
        "A human in the loop trades speed for predictability."
      ],
      callout: {
        kind: "pitfall",
        text: "A slow node is not a dead node. Rebalancing away from an overloaded node adds load to it, which is the opposite of what it needs."
      },
      systems: ["Couchbase", "Riak", "Voldemort"]
    },
    {
      id: "request-routing",
      title: "Request Routing and Service Discovery",
      body: [
        "After partitioning and rebalancing, one question remains for every client: which network address currently serves the key I care about? Partition assignments change over time, so something must track them. This is a special case of service discovery, a problem shared by any networked service deployed redundantly for availability. There are three places to put the routing decision. First, let clients talk to whichever node they like, perhaps behind a round-robin load balancer; a node that happens to own the partition answers on the spot, and one that does not relays the request to the owner and hands the reply back. Second, put a dedicated routing tier in front that knows the partition map and dispatches each request; it is a partition-aware load balancer that stores no data itself. Third, make clients partition-aware so they connect straight to the right node with no intermediary.",
        "Whichever component decides, it must learn about assignment changes, and all participants must agree on the current map or requests go to the wrong place. Reaching agreement in a distributed system calls for consensus, which is notoriously hard to implement correctly (Chapter 9). The common answer is to delegate to a coordination service such as ZooKeeper. Every node announces itself to ZooKeeper, which becomes the single source of truth for which node owns which partition; routing tiers or partition-aware clients subscribe and receive notifications whenever ownership changes or nodes come and go. LinkedIn's Espresso relies on Helix, which builds on ZooKeeper, to run a routing tier this way; HBase, SolrCloud, and Kafka also keep partition assignments in ZooKeeper. MongoDB follows the same shape with its own config servers plus `mongos` processes playing the routing-tier role.",
        "Cassandra and Riak avoid the external dependency. Nodes exchange cluster-state changes through a gossip protocol, and a client may send a request to any node, which passes it on to the correct one (the first approach above). This moves complexity into the database nodes but removes a separate service to deploy and operate. Couchbase, which does not rebalance automatically, is usually fronted by a routing tier called `moxi`; the cluster nodes themselves keep it informed when routing changes. Finally, clients still need to find the routing tier or some initial node; because those addresses change rarely, plain DNS is usually adequate for that step."
      ],
      keyPoints: [
        "Three routing locations: any node forwards, a dedicated routing tier, or partition-aware clients.",
        "The hard part is agreement on the current partition-to-node map as it changes.",
        "ZooKeeper-based coordination: nodes register, the service holds the authoritative map, subscribers receive change notifications.",
        "ZooKeeper users: HBase, SolrCloud, Kafka, Espresso via Helix; MongoDB uses config servers and mongos instead.",
        "Cassandra and Riak use gossip among nodes and forward from any node, trading internal complexity for independence from an external service.",
        "Couchbase uses the moxi routing tier; DNS is enough for locating slowly changing entry points."
      ],
      table: {
        caption: "Request routing approaches",
        columns: ["Approach", "Who knows the partition map", "Extra network hop?", "Examples"],
        rows: [
          ["Contact any node, it forwards", "Every database node (via gossip or a coordination service)", "Often one forwarding hop", "Cassandra, Riak"],
          ["Routing tier", "The routing tier, fed by a coordination service or the nodes", "Always one hop through the tier", "MongoDB mongos, Espresso via Helix, Couchbase moxi"],
          ["Partition-aware client", "The client library, subscribed to assignment changes", "None", "Smart client libraries subscribed to ZooKeeper metadata"]
        ]
      },
      callout: {
        kind: "insight",
        text: "A routing tier is just a cache of the partition map plus a forwarder. Its correctness depends entirely on how it learns about changes, which is why so many systems anchor it to ZooKeeper."
      },
      systems: ["ZooKeeper", "Espresso", "Helix", "HBase", "SolrCloud", "Kafka", "MongoDB", "Cassandra", "Riak", "Couchbase"]
    },
    {
      id: "parallel-query-execution",
      title: "Parallel Query Execution",
      body: [
        "Most distributed NoSQL stores support only the access patterns discussed so far: single-key reads and writes, plus scatter/gather over local secondary indexes. Massively parallel processing (MPP) relational databases, which dominate analytics, go much further. A typical warehouse query joins several tables, filters, groups, and aggregates. The MPP query optimizer decomposes such a query into execution stages, distributes them across partitions and nodes, and runs as many stages as possible in parallel. Queries that scan large fractions of the dataset gain the most. Fast parallel execution is a specialized field with heavy commercial investment; Chapter 10 revisits related techniques in the context of batch processing."
      ],
      keyPoints: [
        "NoSQL partitioned stores mostly offer point access by key plus scatter/gather on local indexes.",
        "MPP databases parallelize complex analytic queries (joins, filters, grouping, aggregation) across nodes.",
        "The optimizer splits one query into stages that run concurrently on different partitions.",
        "Large scans benefit most from parallel execution.",
        "Deeper treatment arrives with batch processing in Chapter 10."
      ]
    },
    {
      id: "summary",
      title: "Summary: Choosing a Partitioning Design",
      body: [
        "Partitioning becomes necessary when a single machine can no longer store or process the data. The design goal is even distribution of data and load with no hot spots, which depends on picking a scheme that suits the data and on rebalancing as the cluster changes. Key-range partitioning preserves order for range scans but is prone to hot spots on adjacent keys and is usually rebalanced by dynamic splitting. Hash partitioning spreads load but loses order and is usually paired with a fixed partition count or a fixed count per node. Compound keys combine the two: one part chooses the partition, the rest defines sort order.",
        "Secondary indexes must be partitioned too. Local (document-partitioned) indexes make writes single-partition and reads scatter/gather; global (term-partitioned) indexes make reads single-partition and writes multi-partition, usually with asynchronous lag. Request routing ranges from partition-aware load balancing to full MPP query engines. The unifying property is that partitions operate independently, which is precisely what enables scale-out. The unresolved question is what happens when one operation must write to several partitions and only some of those writes succeed. Transactions (Chapter 7) and consensus (Chapter 9) take that up."
      ],
      keyPoints: [
        "Choose range partitioning for ordered access, hash partitioning for load spreading, compound keys for both.",
        "Match the rebalancing strategy to the partitioning scheme: dynamic splits for ranges, fixed counts for hashes.",
        "Local indexes favor writes; global indexes favor reads at the cost of asynchronous updates.",
        "Independence of partitions is both the source of scalability and the source of multi-partition difficulty.",
        "Multi-partition atomicity is deferred to Chapters 7 and 9."
      ]
    }
  ],
  terms: [
    { term: "Partition (shard)", definition: "A subset of a dataset such that every record belongs to exactly one subset; the unit of distribution across nodes. Also called shard, region, tablet, vnode, or vBucket depending on the system." },
    { term: "Skew and hot spot", definition: "Skew is an uneven distribution of data or request load across partitions. A hot spot is a partition (or key) that receives a disproportionate share of load and becomes the bottleneck." },
    { term: "Key-range partitioning", definition: "Assigning each partition a contiguous interval of sorted keys. It enables efficient range scans but risks hot spots when access clusters in key order." },
    { term: "Hash partitioning", definition: "Assigning each partition an interval of hash values and placing a key by hashing it. It evens out skewed key distributions at the cost of primary-key range queries." },
    { term: "Consistent hashing", definition: "Karger et al.'s 1997 technique of pseudorandom partition boundaries for distributing load across caches. The term is misleading for databases and unrelated to replica or ACID consistency." },
    { term: "Compound primary key", definition: "A key with several columns where the first part (the partition key) is hashed to choose the partition and the remaining parts determine sort order within it, as in Cassandra." },
    { term: "Secondary index", definition: "An index on a non-primary attribute that returns all records matching a value rather than identifying a single record; it does not map neatly onto partitions." },
    { term: "Document-partitioned (local) index", definition: "A secondary index maintained separately by each partition and covering only that partition's documents. Writes stay local; reads require scatter/gather." },
    { term: "Term-partitioned (global) index", definition: "A secondary index partitioned by indexed value (term) across the cluster. Reads go to one index partition; a write may update several, usually asynchronously." },
    { term: "Scatter/gather", definition: "Sending a query to all partitions in parallel and merging their partial results. It is prone to tail latency amplification because the slowest partition determines response time." },
    { term: "Rebalancing", definition: "Moving partitions and their load between nodes when nodes are added, removed, or fail, ideally without downtime and while transferring the minimum amount of data." },
    { term: "Pre-splitting", definition: "Configuring an initial set of partitions on an empty, dynamically partitioned database so that early writes are not funneled through a single partition." },
    { term: "Service discovery", definition: "The general problem of finding which network address currently serves a given function or partition; request routing in a partitioned database is one instance." },
    { term: "Gossip protocol", definition: "A peer-to-peer mechanism in which nodes periodically exchange cluster-state information so that changes propagate without a central coordinator; used by Cassandra and Riak." },
    { term: "MPP (massively parallel processing)", definition: "Analytic relational databases that break complex queries into stages executed in parallel across many nodes and partitions." }
  ],
  pitfalls: [
    "Confusing data partitioning with a network partition. The former is a deliberate split of data across nodes; the latter is a communication failure between nodes (Chapter 8).",
    "Assuming hashing eliminates hot spots. It balances distinct keys, but one extremely hot key still hashes to one partition; the application must salt such keys and merge on read.",
    "Placing keys with hash(key) mod N because it needs no metadata. Changing N moves nearly every key; always map keys to partitions first and partitions to nodes second.",
    "Treating consistent hashing as a synonym for hash partitioning or as a consistency guarantee. It is a specific random-boundary scheme from CDN caching that most databases do not actually implement.",
    "Expecting a global secondary index to reflect a write immediately. Term-partitioned indexes are normally updated asynchronously, so a read right after a write may miss it.",
    "Letting fully automatic rebalancing react to automatic failure detection. A slow but alive node can be declared dead, and moving its data adds load and can cascade into a cluster-wide failure."
  ],
  connections: [
    { chapter: 5, note: "Partitioning and replication are combined in practice: every partition has a leader and followers, and a node leads some partitions while following others. The two schemes are chosen independently." },
    { chapter: 3, note: "Sorted keys within a partition come from SSTable and LSM-tree storage; dynamic partition splitting mirrors B-tree node splits; secondary and concatenated indexes come from the indexing discussion." },
    { chapter: 7, note: "Multi-partition writes and synchronous global index updates need multi-object or distributed transactions; without them a write can succeed on one partition and fail on another." },
    { chapter: 8, note: "Network partitions are a fault, not a design choice, and the difficulty of telling a slow node from a dead one is exactly what makes automatic rebalancing dangerous." },
    { chapter: 9, note: "Agreeing on the partition-to-node map is a consensus problem; ZooKeeper is a consensus-based coordination service that many partitioned systems lean on for routing metadata." },
    { chapter: 12, note: "Term-partitioned secondary indexes can be built as derived data by streaming changes from the primary partitions into index partitions, which explains their asynchronous nature." }
  ],
  flashcards: [
    { front: "What problem does partitioning solve that replication alone cannot?", back: "Replication copies the full dataset to each replica, so capacity is capped by one machine. Partitioning splits data into pieces placed on different nodes, letting storage and throughput grow with node count." },
    { front: "Define skew and hot spot in the context of partitioning.", back: "Skew is an uneven share of data or load across partitions. A hot spot is a partition (or key) that absorbs a disproportionate share, making one node the bottleneck while others idle." },
    { front: "Why not assign records to nodes at random?", back: "It balances data well, but a reader has no way to know where a record lives, so every lookup must query all nodes in parallel." },
    { front: "How does key-range partitioning decide where a key goes, and why are boundaries uneven?", back: "Each partition owns a contiguous interval of sorted keys. Boundaries follow data density rather than uniform spacing (A-B in one volume, T-Z in another), set manually or adapted automatically by the database." },
    { front: "What hot-spot problem arises when the partition key is a timestamp, and how do you fix it?", back: "All current writes land in the partition covering now. Put a high-cardinality component first, e.g. (sensor_id, timestamp), so writes spread; range queries across sensors then need one scan per sensor." },
    { front: "Why are Java's Object.hashCode() and Ruby's Object#hash unsuitable for partitioning?", back: "They may produce different values for the same key in different processes. Partitioning needs a deterministic hash (e.g., MD5 or FNV) so every node routes a key identically." },
    { front: "In a Cassandra compound primary key, what is hashed and what is sorted?", back: "Only the first component (partition key) is hashed to choose the partition. The remaining columns define sort order inside that partition, enabling efficient range scans once the first component is fixed." },
    { front: "What did consistent hashing originally mean, and why does the chapter discourage the term?", back: "Karger et al. (1997) described random partition boundaries to spread load across CDN caches without central coordination. It is unrelated to replica or ACID consistency and works poorly for databases, so say hash partitioning instead." },
    { front: "What is the cost of hash partitioning for queries?", back: "Key order is destroyed, so a primary-key range query must go to all partitions (MongoDB hash mode) or is unsupported (Riak, Couchbase, Voldemort)." },
    { front: "A celebrity's post receives millions of writes to one key. Why does hashing not help, and what can the application do?", back: "Identical keys hash identically, so all writes hit one partition. Salt the key with a random two-digit number to spread it over 100 keys; readers then fetch and merge all 100, and the system must track which keys are salted." },
    { front: "Describe the write and read paths for a document-partitioned (local) secondary index.", back: "Write: only the partition holding the document updates its own index. Read: the search term can appear in any partition, so the query goes to all partitions and results are merged (scatter/gather)." },
    { front: "Why is scatter/gather expensive even when partitions are queried in parallel?", back: "Response time equals the slowest partition's time. With many partitions the chance that at least one is slow is high, amplifying tail latency." },
    { front: "How is a term-partitioned (global) secondary index laid out?", back: "The index covers all partitions but is itself partitioned by the indexed value (term), e.g., colors a-r in one index partition and s-z in another, split either by term value or by hash of the term." },
    { front: "Why are global secondary indexes usually updated asynchronously?", back: "One document's terms may live on several index partitions on different nodes. Synchronous updates would require a distributed transaction across them, which many databases lack, so updates lag (DynamoDB: typically sub-second)." },
    { front: "Name the three requirements the chapter sets for rebalancing.", back: "Fair distribution of data and load afterwards; continued reads and writes during the move; and no more data transferred than necessary." },
    { front: "Why does hash(key) mod N make rebalancing expensive? Give the chapter's numeric example.", back: "Changing N remaps most keys. Hash 123456 sits on node 6 with 10 nodes, node 3 with 11, node 0 with 12. Nearly every scaling step migrates nearly all data." },
    { front: "Explain the fixed-number-of-partitions strategy and what changes during rebalancing.", back: "Create many more partitions than nodes (e.g., 1,000 for 10 nodes). Only the partition-to-node assignment changes; a new node takes whole partitions from each existing node. Key-to-partition mapping and partition count stay constant." },
    { front: "What is the main drawback of a fixed number of partitions?", back: "Partition size grows with the dataset. Too few partitions caps the node count and makes partitions huge (slow recovery); too many adds per-partition overhead. Hard to size when future data volume is unknown." },
    { front: "How does dynamic partitioning work in HBase?", back: "A region that exceeds a size threshold (default 10 GB) splits into two halves; shrinking regions merge with neighbors. One half can move to another node via HDFS. The partition count adapts to data volume." },
    { front: "What is pre-splitting and why is it needed?", back: "Configuring an initial set of partitions on an empty table. Without it, a dynamically partitioned database starts as one partition and one node absorbs all writes until the first split. It requires an estimate of the key distribution." },
    { front: "How does Cassandra's partitions-proportional-to-nodes approach rebalance when a node joins?", back: "Each node owns a fixed number of partitions (default 256). A joining node randomly picks existing partitions, splits them, and takes one half of each. Random unfairness averages out; Cassandra 3.0 added a fairer token allocator." },
    { front: "Why does partitioning proportionally to nodes require hash partitioning?", back: "Split points are chosen at random, which only makes sense over a uniform hash range. This is the practical scheme closest to the original consistent hashing idea." },
    { front: "What danger arises from combining automatic rebalancing with automatic failure detection?", back: "An overloaded, slow node may be declared dead. Moving its partitions adds load to it and the network, slowing more nodes and triggering more rebalancing: a cascading failure. A human approval step limits this." },
    { front: "List the three places a routing decision can be made.", back: "(1) Any node receives the request and forwards it to the owner; (2) a dedicated partition-aware routing tier forwards it; (3) the client knows the partition map and connects directly." },
    { front: "How does ZooKeeper support request routing?", back: "Nodes register with ZooKeeper, which holds the authoritative partition-to-node map. Routing tiers or clients subscribe and are notified when ownership changes. Used by HBase, SolrCloud, Kafka, and Espresso via Helix." },
    { front: "How do Cassandra and Riak route requests without ZooKeeper?", back: "Nodes spread cluster-state changes via a gossip protocol. A client can contact any node, which forwards the request to the owner. More complexity inside nodes, but no external coordination service to run." },
    { front: "What distinguishes MPP databases from most NoSQL stores in query capability?", back: "NoSQL stores mostly do single-key access plus scatter/gather. MPP engines decompose complex analytic queries (joins, grouping, aggregation) into stages that run in parallel across nodes, which benefits large scans most." },
    { front: "Which systems use document-partitioned secondary indexes, and which use term-partitioned?", back: "Local: MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB. Global: DynamoDB global secondary indexes, Riak search, Oracle data warehouse (which offers both)." },
    { front: "How does a node's role look when partitioning is combined with leader-based replication?", back: "Each partition has one leader and several followers on different nodes. Any given node leads a subset of partitions and follows the rest, so no node is purely primary or purely secondary and leadership is spread across the cluster." }
  ],
  quiz: [
    {
      question: "A sensor platform keys every reading by timestamp and uses key-range partitioning. Which problem is most likely?",
      choices: [
        "Range queries for a given month become impossible",
        "All current writes concentrate on the partition covering the present time",
        "Hash collisions cause readings to overwrite each other",
        "Each read must be scattered to every partition"
      ],
      answer: 1,
      explanation: "Timestamps increase monotonically, so with range partitioning every new write lands in the newest partition, creating a write hot spot. Range queries remain efficient (that is the strength of range partitioning), no hashing is involved, and a read by key goes to a single partition."
    },
    {
      question: "Why does the chapter recommend against describing a database's scheme as consistent hashing?",
      choices: [
        "Because consistent hashing requires cryptographic hash functions",
        "Because it guarantees linearizable reads, which most databases do not provide",
        "Because the original technique (random boundaries for CDN caches) is rarely what databases implement, and the word consistent wrongly suggests data consistency",
        "Because consistent hashing only works with key-range partitioning"
      ],
      answer: 2,
      explanation: "Karger et al.'s consistent hashing is a specific approach using random partition boundaries for cache load spreading. It works poorly for databases, and consistent there has nothing to do with replica or ACID consistency. It does not need cryptographic hashes, gives no read guarantees, and applies to hash rather than key-range partitioning."
    },
    {
      question: "In Cassandra, a table's primary key is (user_id, update_timestamp). Which query is efficient?",
      choices: [
        "All updates by one user within a time window, sorted by time",
        "All updates by users whose IDs fall in a numeric range",
        "All updates from any user in the last hour",
        "The single most recent update across the entire table"
      ],
      answer: 0,
      explanation: "Only user_id is hashed to pick the partition; update_timestamp orders rows within that partition, so one user's time-window query is a single-partition range scan. Ranges over user_id are impossible because hashing scatters IDs, and queries over all users for recent updates must touch every partition."
    },
    {
      question: "A used-car site uses document-partitioned secondary indexes on color. What happens when a user searches for red cars?",
      choices: [
        "The query goes to the single partition that owns the term color:red",
        "The query is rejected because local indexes do not support equality search",
        "The database first consults ZooKeeper to find the index partition",
        "The query is sent to every partition and the partial results are merged"
      ],
      answer: 3,
      explanation: "With local indexes each partition indexes only its own documents, and red cars can sit in any partition, so the read must scatter to all partitions and gather the results. A single-partition lookup is the behavior of a term-partitioned global index, not a local one; equality search is supported; ZooKeeper is not consulted per query."
    },
    {
      question: "Which statement about term-partitioned (global) secondary indexes is accurate?",
      choices: [
        "Writes touch one partition and reads require scatter/gather",
        "Reads can be served from one index partition, but a write may update several index partitions and is usually applied asynchronously",
        "They are stored entirely on one dedicated index node to avoid distributed transactions",
        "They can only be partitioned by hash of the term, never by the term value"
      ],
      answer: 1,
      explanation: "A global index routes each term to one index partition, so reads are targeted, but a document with many terms updates many index partitions; doing that synchronously would need a distributed transaction, hence asynchronous updates (as in DynamoDB). The first option describes local indexes, the index is partitioned rather than on one node, and it may be split by term value to enable range queries."
    },
    {
      question: "A cluster assigns keys using hash(key) mod N with N = 10 nodes. An 11th node is added. What is the consequence?",
      choices: [
        "Only about one tenth of the keys move to the new node",
        "No keys move until an administrator triggers rebalancing",
        "Most keys change their assigned node and must be migrated",
        "Keys move only within partitions that exceed 10 GB"
      ],
      answer: 2,
      explanation: "Changing the modulus remaps nearly every key; the chapter's example hash 123456 goes from node 6 to node 3 to node 0 as N grows. Moving only a fair fraction is the property of fixed-partition schemes, not mod N, and the 10 GB threshold belongs to HBase's dynamic splitting."
    },
    {
      question: "A database has 1,000 fixed partitions on 10 nodes. What changes when an 11th node is added?",
      choices: [
        "The hash function is replaced so keys map to 1,100 partitions",
        "Each partition is split in two so the new node receives fresh halves",
        "The new node takes roughly 90 whole partitions from the existing nodes; the key-to-partition mapping is unchanged",
        "The new node stays idle until the dataset grows enough to create new partitions"
      ],
      answer: 2,
      explanation: "In the fixed-partition strategy only the partition-to-node assignment changes: the newcomer takes a few entire partitions from each existing node (about 1000/11, roughly 91 in total). The partition count and the hash mapping stay fixed. Splitting halves belongs to dynamic or node-proportional partitioning."
    },
    {
      question: "You bulk-load terabytes into a brand-new HBase table with default settings. What should you expect, and what prevents it?",
      choices: [
        "Writes spread evenly from the start because HBase hashes row keys",
        "A single region server receives all writes until the first split; pre-splitting the table avoids this",
        "HBase refuses writes until regions are manually assigned",
        "The table starts with 256 regions per node, so no action is needed"
      ],
      answer: 1,
      explanation: "Dynamically partitioned databases begin with one partition because they know nothing about the key distribution, so one node handles all writes until the 10 GB split threshold is crossed. Pre-splitting creates initial regions up front. HBase uses key-range rather than hash partitioning, and 256 partitions per node is Cassandra's default."
    },
    {
      question: "How does a node joining a Cassandra cluster (partitions proportional to nodes) obtain its share of data?",
      choices: [
        "It randomly selects a fixed number of existing partitions, splits each, and takes one half of each",
        "It receives whole partitions handed over evenly from each existing node",
        "It waits for the oldest partitions to exceed a size threshold and claims them",
        "An administrator must manually assign it a key range"
      ],
      answer: 0,
      explanation: "With a fixed number of partitions per node (256 by default), the newcomer picks random existing partitions to split and keeps half of each; the randomness evens out over many partitions. Handing over whole partitions is the fixed-count scheme, size thresholds drive dynamic partitioning, and manual key ranges are not how Cassandra works."
    },
    {
      question: "A node becomes slow because it is overloaded. The cluster uses fully automatic failure detection and rebalancing. What is the risk?",
      choices: [
        "The slow node is isolated harmlessly and the cluster speeds up",
        "ZooKeeper loses quorum and routing stops",
        "Clients cache a stale partition map forever",
        "Peers declare the node dead and move its partitions, adding load that can cascade into a wider failure"
      ],
      answer: 3,
      explanation: "Rebalancing is expensive; moving data away from a node that is slow but alive adds load to it and to the network, which can make more nodes look dead and trigger further rebalancing. That feedback loop is why a human approval step is often preferred. The other options are not the mechanism the chapter describes."
    },
    {
      question: "Which routing approach do Cassandra and Riak use, and how do nodes learn about partition changes?",
      choices: [
        "A dedicated routing tier fed by ZooKeeper",
        "Clients send requests to any node, which forwards them; nodes share cluster state via gossip",
        "Partition-aware clients that read assignments from config servers",
        "A DNS round-robin that encodes the partition map in hostnames"
      ],
      answer: 1,
      explanation: "Cassandra and Riak disseminate cluster state with a gossip protocol and let any node forward a request to the owner, avoiding an external coordination service. A ZooKeeper-fed routing tier describes Espresso with Helix, config servers plus mongos are MongoDB's approach, and DNS only helps clients find entry points, not partitions."
    },
    {
      question: "What is the role of ZooKeeper in systems such as HBase, SolrCloud, and Kafka with respect to partitioning?",
      choices: [
        "It stores the partition data itself for durability",
        "It performs the hash computation for every incoming request",
        "It holds the authoritative partition-to-node assignment and notifies subscribers when it changes",
        "It executes scatter/gather queries on behalf of clients"
      ],
      answer: 2,
      explanation: "Nodes register with ZooKeeper, which keeps the cluster metadata about which node owns which partition; routing tiers and partition-aware clients subscribe and are notified of changes. ZooKeeper stores no partition data, is not on the per-request path for hashing, and does not run queries."
    }
  ],
  reviewQuestions: [
    "You are designing storage for a ride-hailing app that records GPS pings from millions of drivers and must answer two queries: show driver X's route between 9:00 and 9:30, and show all pings in city Y during the last minute. Propose a partitioning scheme (key design, range versus hash, secondary indexes), identify which query becomes expensive, and explain why.",
    "Compare local and global secondary indexes for a product catalog that receives 50 writes per second and 50,000 filter queries per second. Which would you choose, what anomaly might users observe with each, and how would your answer change if the ratio were reversed?",
    "A team proposes routing keys with hash(key) mod N because it needs no metadata. Quantify the cost when scaling from 20 to 21 nodes, then design an alternative using a fixed number of partitions and estimate how much data moves in the same step.",
    "Contrast fixed-number, dynamic, and node-proportional partitioning in terms of what stays constant as data and nodes grow. For a dataset expected to grow from 10 GB to 100 TB over three years, which would you pick, and what operational risks (cold start, partition count ceiling, unfair splits) would you plan for?",
    "Design the request-routing layer for a new partitioned datastore. Choose between a ZooKeeper-backed routing tier and gossip-based any-node forwarding, and justify the choice with respect to operational dependencies, how clients learn about changes, and the cascading-failure risk of automatic rebalancing driven by failure detection."
  ]
});
