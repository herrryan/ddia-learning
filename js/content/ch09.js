DDIA.registerChapter({
  number: 9,
  part: 2,
  title: "Consistency and Consensus",
  tagline: "How can replicas agree on one truth when packets vanish, clocks drift, and nodes crash mid-sentence?",
  studyMinutes: 110,
  overview: [
    "Chapter 9 closes Part II by asking what guarantees a distributed data system can still offer once you accept every fault from Chapter 8. It works through three tightly linked topics. First, **linearizability**: the strongest consistency model in common use, which makes a replicated cluster behave like a single variable. Second, **ordering and causality**: what happened-before means without a global clock, how Lamport timestamps capture it, and why a total order is only useful if you also know when it is final. Third, **consensus**: how a group of nodes can reach one irrevocable decision, why two-phase commit is a weak form of it, and how Paxos, Raft, Zab, and Viewstamped Replication do better.",
    "The chapter matters because almost every hard coordination problem turns out to be the same problem wearing a different hat. Leader election, distributed locks, uniqueness constraints, atomic commit, total order broadcast, and cluster membership are all provably equivalent to consensus. Once you see that, you can decide deliberately whether a given feature needs consensus (and must pay its latency and availability cost) or can be built on something cheaper such as causal consistency or plain convergence.",
    "It builds directly on replication (Chapter 5), transactions (Chapter 7), and the failure models of Chapter 8, and it sets up Part III: the closing discussion of coordination services and the limits of distributed transactions motivates the log-based designs of Chapters 11 and 12."
  ],
  bigIdeas: [
    "Linearizability means a replicated system behaves like one copy of the data with atomic operations; it is a recency guarantee, and it is inherently slow.",
    "Linearizability (single-object recency) and serializability (multi-object isolation) are independent; together they form strict serializability, which SSI does not provide.",
    "Causality is a partial order and linearizability a total order; causal consistency is the strongest model that stays fast and available under partitions.",
    "Lamport timestamps give a causally consistent total order, but a node cannot tell when that order is final; total order broadcast closes that gap.",
    "Two-phase commit achieves atomic commit but blocks on coordinator failure; real consensus uses elected leaders, epochs, and overlapping majority quorums to keep deciding.",
    "Compare-and-set registers, total order broadcast, atomic commit, locks, and uniqueness constraints all reduce to consensus; outsource it to ZooKeeper or etcd instead of reinventing it."
  ],
  sections: [
    {
      id: "consistency-guarantees",
      title: "Consistency Guarantees: From Convergence to Strong Models",
      body: [
        "Look at two replicas at the same instant and you will usually see different data, because writes reach them at different times. This is true for single-leader, multi-leader, and leaderless replication alike. The weakest promise most replicated stores make is **eventual consistency**: if writes stop and you wait long enough, every replica ends up holding the same value. A more honest name is **convergence**, because the promise says nothing about how long the wait is or what reads return before it ends. A read issued one millisecond after a successful write may legitimately return the old value.",
        "That behavior is hard to program against because a database superficially resembles an ordinary local variable in sequential code, yet it does not act like one. Code that assumes write-then-read returns the new value works fine in development and fails under network trouble or heavy concurrency, which is exactly when you least want surprises. Weak guarantees push the burden of correctness onto the application developer.",
        "Stronger models reduce that burden at a cost in performance or fault tolerance. The chapter also separates two ideas that are easy to blur: transaction isolation levels (Chapter 7) prevent races between concurrently running transactions, whereas distributed consistency models coordinate the state of replicas across delays and faults. The chapter then follows one thread through three topics: linearizability, ordering and causality, and finally distributed transactions and consensus."
      ],
      keyPoints: [
        "Eventual consistency only promises convergence after writes stop; it bounds neither time nor the values seen in between.",
        "Bugs caused by weak consistency are latent: they appear under faults and high concurrency, not in ordinary testing.",
        "Stronger guarantees trade throughput, latency, or availability for code that is easier to get right.",
        "Isolation levels and consistency models overlap a little but address different threats: concurrent transactions versus replica coordination.",
        "Linearizability, ordering, and consensus are presented as one connected story, not three unrelated topics."
      ],
      callout: {
        kind: "insight",
        text: "An eventually consistent store is allowed to hand back the value you just overwrote. Code that assumes otherwise is not wrong because of a bug in the database; it is wrong because it relied on a guarantee that was never given."
      }
    },
    {
      id: "what-makes-a-system-linearizable",
      title: "What Makes a System Linearizable?",
      body: [
        "Linearizability (also called atomic consistency, strong consistency, immediate consistency, or external consistency) asks the system to pretend the whole cluster is a single variable: one copy of each object, every operation applied atomically at some instant. The practical consequence is a **recency guarantee**: the moment any client's write has completed, every read that starts afterwards, on any client, must return that value or a newer one. The chapter's running example is two friends in one room refreshing a sports site. One sees the final score and says so out loud; the other reloads a second later, is served by a lagging replica, and sees the match still in progress. Because the second request began after the first finished, the stale answer is a linearizability violation.",
        "To make this precise, model one object (a key, row, or document) as a **register** supporting `read(x)`, `write(x, v)`, and `cas(x, old, new)`. Each client request occupies a time interval from send to response; the database applies it at some unknown instant inside that interval. Three rules follow. A read whose interval ends before a write begins must return the old value. A read that begins after the write's response arrived must return the new value. A read that overlaps the write may return either. But that last rule alone is too weak: it would let reads flip between old and new several times during one write (a so-called regular register). Linearizability adds that there is a single instant at which the value switches, so once any read has returned the new value, no later-starting read anywhere may return the old one, even while the writer is still waiting for its acknowledgment.",
        "The visual check: place a marker inside each operation's interval at the moment it appears to take effect, join the markers in sequence, and require that the line only ever moves forward in time while the resulting sequence is a valid register history (each read returns the most recent preceding write). Some consequences are counterintuitive. A read that was sent before a write may still return the written value, because the two were concurrent and the read was simply processed later. A read may observe a value before the writer receives its `ok`, because the acknowledgment was delayed. And there is no isolation: between two reads by one client, another client may have written, which is why `cas` exists. Recording every request and response and searching for a valid sequential order lets you test linearizability after the fact, though the search is expensive."
      ],
      keyPoints: [
        "Linearizability = one apparent copy of the data + atomic operations; operationally it is a guarantee about recency.",
        "Non-overlapping operations must respect real-time order; overlapping ones may be ordered either way, but only once.",
        "After any client observes the new value, every subsequently started read must also observe it, even before the write is acknowledged.",
        "Each operation appears to take effect at one instant within its request interval, and those instants form a forward-moving, valid history.",
        "The model has no transactions: use compare-and-set to detect that another client changed a value between your read and your write.",
        "Linearizability of a recorded history can be checked by searching for a valid sequential ordering of the observed intervals."
      ],
      callout: {
        kind: "example",
        text: "Register x goes from 0 to 1. Client A reads 1. Client B then starts a read and gets 0. Even though B's read overlaps the write, this history is not linearizable: a value that has been observed cannot un-happen."
      }
    },
    {
      id: "linearizability-vs-serializability",
      title: "Linearizability Versus Serializability",
      body: [
        "Both words suggest that operations can be lined up one after another, which is why they are so often confused. **Serializability** concerns isolation between transactions, each of which may touch many objects. It requires the outcome to equal some serial execution of those transactions, but the serial order is allowed to differ from the order in which the transactions actually ran. **Linearizability** is a recency property on a single object. It knows nothing about transactions, so by itself it does not prevent multi-object anomalies such as write skew unless you take extra steps like materializing conflicts.",
        "A system that provides both is called **strict serializability** (or strong one-copy serializability). Implementation technique determines whether you get it. Two-phase locking and actual serial execution operate on the current live state, so they are normally linearizable as well as serializable. Serializable snapshot isolation is the notable exception: it reads from a consistent snapshot precisely so that readers and writers do not block each other, and a snapshot by design excludes writes that committed after it was taken. SSI transactions are serializable, but their reads are stale, so SSI is not linearizable."
      ],
      keyPoints: [
        "Serializability: multi-object transaction isolation; the equivalent serial order need not match wall-clock order.",
        "Linearizability: single-object recency; real-time ordering of non-overlapping operations is mandatory.",
        "Strict serializability = both guarantees together.",
        "2PL and serial execution usually give strict serializability; SSI gives serializability without linearizability.",
        "Linearizability alone does not stop write skew, because it never groups operations into transactions."
      ],
      table: {
        caption: "Linearizability versus serializability at a glance",
        columns: ["Dimension", "Linearizability", "Serializability"],
        rows: [
          ["Unit of guarantee", "One object (register) at a time", "Transactions spanning many objects"],
          ["Core promise", "Reads reflect the latest completed write (recency)", "Outcome equals some serial order of transactions"],
          ["Must order match real time?", "Yes, for non-overlapping operations", "No, any serial order is acceptable"],
          ["Prevents write skew?", "No (unless conflicts are materialized)", "Yes"],
          ["Typical implementations", "Consensus-backed stores, 2PL-based engines", "2PL, serial execution, SSI"],
          ["Does SSI satisfy it?", "No, snapshot reads are stale by design", "Yes"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Hearing that a database is serializable and concluding its reads are fresh is a trap. An SSI database can be fully serializable while returning a value that was overwritten a moment earlier."
      }
    },
    {
      id: "relying-on-linearizability",
      title: "Relying on Linearizability: Locks, Uniqueness, and Cross-Channel Races",
      body: [
        "A sports score that is a few seconds stale harms nobody, so where does linearizability actually matter? The first case is **locking and leader election**. A common election scheme is a lock: every starting node tries to acquire it and the winner leads. If different nodes can disagree about who holds the lock, two nodes may both act as leader, which is split brain and often means data loss. The lock must therefore be linearizable. Coordination services such as Apache ZooKeeper and etcd provide exactly this, using consensus internally, and libraries such as Apache Curator offer higher-level recipes on top. One subtlety: by default these services make writes linearizable but let any replica answer reads, so a read may be stale unless you ask for a quorum read (etcd) or call `sync()` first (ZooKeeper). Oracle Real Application Clusters applies the same idea at a much finer grain, with a linearizable lock per disk page shared by nodes on common storage, which is why RAC deployments typically dedicate a separate interconnect network to lock traffic.",
        "The second case is **constraints and uniqueness**. Enforcing that usernames, email addresses, or file paths are unique at write time is a lock in disguise: registering a name is a compare-and-set from unclaimed to your user ID. The same shape appears in rules such as an account balance that must not go negative, stock that must not be oversold, or a seat that may be booked once. All require one agreed, up-to-date value. A hard uniqueness constraint of the kind relational databases enforce needs linearizability; foreign-key and attribute constraints do not; and some business rules can be relaxed (overbook, then compensate the displaced customer), a theme Chapter 12 returns to.",
        "The third case is **cross-channel timing dependencies**. The second sports fan only noticed the stale result because a second channel, the first fan's voice, told him what to expect. Systems have the same structure. A web server stores an uploaded photo in a file service and then puts a resize job on a message queue; a worker picks up the job and fetches the photo. If the queue is faster than the file service's internal replication, the worker may fetch an old version or nothing, and the thumbnail becomes permanently inconsistent with the original. A linearizable file service removes the race. If you control the second channel (you do with a queue, not with a human voice), you can instead carry read-your-writes style information through it, at the cost of extra complexity."
      ],
      keyPoints: [
        "A lock used for leader election is worthless unless every node agrees who holds it, which means it must be linearizable.",
        "Coordination services give linearizable writes by default; linearizable reads require an explicit quorum read or sync.",
        "Hard uniqueness constraints and single-value invariants (balances, stock, seats) need linearizability when enforced synchronously.",
        "Foreign-key and attribute constraints do not need it, and some business constraints can be relaxed and compensated later.",
        "Two communication paths between the same components (storage plus queue) race unless the shared store is linearizable or the second path carries version information."
      ],
      callout: {
        kind: "example",
        text: "Upload flow: write photo to storage, enqueue resize job, worker reads photo. If the queue outruns storage replication, the worker thumbnails yesterday's picture. Linearizable storage, or passing the stored version through the queue, closes the race."
      },
      systems: ["Apache ZooKeeper", "etcd", "Apache Curator", "Oracle Real Application Clusters (RAC)"]
    },
    {
      id: "implementing-linearizable-systems",
      title: "Implementing Linearizable Systems",
      body: [
        "One copy of the data on one node is trivially linearizable and trivially fragile: lose the node and the data is gone or unreachable. Fault tolerance comes from replication, so the real question is which replication scheme admits linearizability at all. **Single-leader replication** qualifies, if reads go to the leader or to followers that are updated synchronously, and if you genuinely know who the leader is. A node that wrongly believes it is still leader will serve stale data, and asynchronous failover can discard committed writes, violating both durability and linearizability. Snapshot-isolation designs and plain concurrency bugs also break it. **Consensus-based systems** (ZooKeeper, etcd) resemble single-leader replication but include machinery against split brain and stale replicas, so they can be linearizable safely. **Multi-leader replication** is not linearizable: accepting concurrent writes at several nodes produces conflicts, and conflicts are direct evidence that there is no single copy. **Leaderless** Dynamo-style systems are usually claimed to be strongly consistent with strict quorums, but that claim does not hold up.",
        "The counterexample uses n = 3, w = 3, r = 2. A writer sends x = 1 to all three replicas, but the message reaches one replica quickly and the other two slowly. Reader A contacts the fresh replica and one stale replica and returns 1. After A has finished, reader B contacts the two stale replicas and returns 0. The quorum condition is satisfied, yet a later read saw an older value than an earlier read. Quorums can be repaired at a price: readers must perform read repair synchronously before answering, and writers must first read the latest state from a quorum. Riak skips synchronous read repair for performance reasons. Cassandra does wait for read repair on quorum reads, but its last-write-wins resolution loses linearizability under concurrent writes to one key. Even with the fixes, these repairs buy you linearizable reads and writes and nothing more; compare-and-set with linearizable semantics still demands a consensus algorithm. Last-write-wins based on wall clocks and sloppy quorums rule linearizability out completely.",
        "A footnote worth remembering: splitting a single-leader database into partitions, each with its own leader, does not hurt linearizability, because the guarantee is per object. Transactions that span partitions are a different problem, addressed by atomic commit later in the chapter."
      ],
      keyPoints: [
        "Replication is required for fault tolerance, and the replication scheme decides whether linearizability is achievable.",
        "Single-leader: linearizable only if the leader identity is certain and the read replica is synchronously updated; async failover can lose committed writes.",
        "Multi-leader: never linearizable, because conflicting concurrent writes prove there is no single copy.",
        "Strict quorums are not enough: with n = 3, w = 3, r = 2 a later reader can see an older value than an earlier reader.",
        "Synchronous read repair plus writer read-before-write yields linearizable reads and writes, but not compare-and-set.",
        "Wall-clock last-write-wins and sloppy quorums make linearizability impossible; assume Dynamo-style stores are not linearizable."
      ],
      table: {
        caption: "Can this replication method be linearizable?",
        columns: ["Replication method", "Linearizable?", "What makes or breaks it"],
        rows: [
          ["Single-leader", "Potentially", "Reads from the leader or synchronous followers; broken by a stale self-declared leader, async failover, or snapshot isolation"],
          ["Consensus-based (ZooKeeper, etcd)", "Yes", "Leader-style replication plus split-brain prevention and quorum-confirmed decisions"],
          ["Multi-leader", "No", "Concurrent writes on several nodes; conflicts show there is no single copy"],
          ["Leaderless, strict quorum", "Probably not", "Variable delays allow a later reader to miss a write an earlier reader saw; fixable only for reads/writes via sync read repair"],
          ["Leaderless with LWW or sloppy quorum", "No", "Clock skew reorders writes; sloppy quorums may not even overlap"]
        ]
      },
      systems: ["ZooKeeper", "etcd", "Riak", "Cassandra"]
    },
    {
      id: "cost-of-linearizability",
      title: "The Cost of Linearizability: CAP and Network Delays",
      body: [
        "Picture two datacenters whose interconnect fails while each remains healthy internally and reachable by its own clients. With multi-leader replication both sites keep working; writes queue up and are exchanged once the link returns. With single-leader replication the leader sits in one datacenter, so clients attached to the other cannot write or perform linearizable reads until the link heals. They can still read from the local follower, but those reads may be stale. This is not an artifact of the replication style: any linearizable system has the property, and any unreliable network triggers it, not just long-haul links. The dilemma is simple. If you require linearizability, replicas cut off from the rest must wait or return errors. If you do not, each replica can keep serving independently, but the result is not linearizable.",
        "This observation goes by the name **CAP theorem**, named by Eric Brewer in 2000, though database designers understood the trade-off in the 1970s. Its real contribution was cultural: it pushed engineers away from shared-storage linearizable clusters toward shared-nothing designs and helped trigger the NoSQL wave. But the slogan **pick two of three** misleads. Partitions are faults, not options; they will happen. When the network works you can have both linearizability and availability, and when it fails you must choose one, so a better phrasing is **consistent or available when partitioned**. The formal theorem is also narrow: it considers one consistency model (linearizability) and one fault (partitions), says nothing about latency or crashed nodes, and uses a definition of availability that many so-called highly available systems do not meet. The chapter recommends avoiding the CP/AP labels in favor of more precise results that have since superseded CAP.",
        "The deeper cost is latency, and it applies all the time, not only during faults. Even the RAM in a multi-core machine is not linearizable: each core has its own cache and store buffer, writes propagate asynchronously, and a thread on another core can read stale data unless a memory fence is used. CPU designers accepted this purely for speed; a core that loses contact with the rest of the machine is not expected to carry on working alone, so fault tolerance was never the motive. Many distributed databases drop linearizability for the same reason. Attiya and Welch proved the cost is unavoidable: however cleverly you implement it, a linearizable read or write cannot complete faster than a bound that grows with how uncertain the network's delays are. On real networks with highly variable latency, linearizable operations are inherently slow, whereas weaker models can be much faster. Chapter 12 explores how to keep applications correct without paying that price."
      ],
      keyPoints: [
        "During a partition, a linearizable system must make cut-off replicas block or fail; multi-leader keeps serving but is not linearizable.",
        "CAP is better read as a forced choice during partitions than as a menu of two from three.",
        "Formal CAP covers only linearizability versus partitions and uses an unusual availability definition, so CP/AP labels are best avoided.",
        "Linearizability is slow at all times, not just during faults; CPU memory models abandon it for performance alone.",
        "Attiya and Welch: linearizable latency is bounded below by network delay uncertainty, so no faster linearizable algorithm exists."
      ],
      callout: {
        kind: "insight",
        text: "A computer's internal bus almost never partitions, yet CPU designers still gave up linearizable memory. That tells you the main price of linearizability is latency, which you pay every day, not availability, which you lose only during faults."
      }
    },
    {
      id: "ordering-and-causality",
      title: "Ordering and Causality",
      body: [
        "Ordering keeps resurfacing in this book: the leader exists to order the replication log, serializability is about an equivalent serial order, and timestamps attempt to order events. One reason ordering matters so much is **causality**: cause precedes effect, a message is sent before it is received, a row is created before it is updated. Earlier chapters were full of causal violations in disguise: an observer seeing an answer before the question it answers (consistent prefix reads), a multi-leader replica receiving an update for a row that does not yet exist, the happened-before relation used to detect concurrent writes, snapshot isolation's notion of a consistent snapshot (if it contains the answer it must contain the question, and read skew is exactly a causal violation), write skew (an action taken because of an observation that was already outdated), and the sports-score example. A system that respects this ordering is **causally consistent**; snapshot isolation is one example.",
        "The key distinction is between total and partial orders. Integers are totally ordered: any two can be compared. Sets under inclusion are only partially ordered: the sets {a, b} and {b, c} are incomparable. Linearizability yields a total order: a single timeline on which every operation is atomic and nothing is truly concurrent. Causality yields a partial order: causally related operations are ordered, concurrent ones are incomparable, and the history looks like a Git graph with branches and merges rather than a straight line.",
        "Linearizability is strictly stronger than causal consistency. Any linearizable system preserves causality automatically, even across separate channels such as the queue and the file store, without passing timestamps around. The reverse does not hold, and that is good news: causal consistency is the strongest model that does not slow down because of network delay and remains available during partitions, so CAP's forced choice does not apply to it. Many applications that appear to require linearizability actually need only causality. Research systems that preserve causality while performing like eventually consistent stores exist, though little has reached production and open problems remain.",
        "Capturing causal dependencies means a replica must not apply an operation until every operation it depends on has been applied; if a prerequisite is missing, the operation waits. To know the dependencies you must know what a node had seen when it issued a write, the same question a fraud investigator asks: did the decision-maker know about X when deciding Y? Version vectors, generalized to cover the whole database rather than a single key, can track this. It is why a leaderless store asks the client to pass back the version it read when writing, and why SSI records which data each transaction read so it can check at commit time whether those reads are still current."
      ],
      keyPoints: [
        "Causality (happened-before) explains many anomalies: answers before questions, updates before inserts, read skew, write skew.",
        "Linearizability is a total order (one timeline); causality is a partial order (a branching, merging graph).",
        "Linearizable implies causally consistent; the converse is false.",
        "Causal consistency is the strongest model that stays available under partitions and does not pay for delay uncertainty.",
        "Tracking causality means knowing what a node had seen when it wrote; generalized version vectors do this across keys.",
        "Snapshot isolation and SSI both embody causal reasoning: consistent snapshots and read-version checks at commit."
      ],
      callout: {
        kind: "insight",
        text: "If you can draw your system's history as a Git graph with branches and merges, you are reasoning about a partial order. Linearizability insists that the graph is a single straight line."
      }
    },
    {
      id: "sequence-number-ordering",
      title: "Sequence Number Ordering and Lamport Timestamps",
      body: [
        "Tracking every causal dependency explicitly is expensive: a client typically reads many things before writing, and it is unclear which reads the write actually depends on. A cheaper approach assigns each operation a compact sequence number from a **logical clock**, a counter-based scheme with no connection to wall-clock time. The goal is a total order that **never contradicts causality**: if A happened before B, then A's number is smaller; concurrent operations can land in whatever order. Such an order contains all the causal information plus some extra ordering that causality never demanded. A single-leader replication log already does this: the leader increments a counter per write, and a follower that applies the log in order is always causally consistent even when it lags.",
        "Without a single leader (multi-leader, leaderless, or partitioned systems) several generators are used in practice: independent per-node counters (one node issues odd numbers, another even, or node IDs occupy some bits); wall-clock timestamps, as in last-write-wins; and pre-allocated blocks (node A owns 1 to 1,000, node B owns 1,001 to 2,000). All scale better than a single counter, and all are causally inconsistent. Nodes process different volumes, so the odd counter may lag the even one; clock skew can stamp a causally later operation with an earlier time, unless you use Spanner's trick of waiting out a known clock uncertainty interval; and a later operation can draw a smaller number from an earlier block. Random UUIDs give a valid total order that carries no causal information at all.",
        "**Lamport timestamps** (Lamport, 1978) fix this with one rule. Each operation is stamped with a pair (counter, node ID); compare counters first, then node IDs to break ties. Crucially, every node and every client remembers the largest counter it has ever seen and sends that maximum along with every request and response, and a recipient whose own counter is smaller immediately jumps forward to it. If a client receives counter 5 from node 2 and then contacts node 1, whose counter is only 1, node 1 advances to 5 and stamps the next operation 6. Since every causal link forces the timestamp upward, the resulting total order respects causality. Lamport timestamps are not version vectors: version vectors can distinguish concurrent operations from dependent ones, whereas Lamport timestamps always impose an order and cannot distinguish the two cases. Their advantage is size.",
        "Yet timestamp ordering alone is not enough for problems like unique usernames. After the fact you could collect every claim and let the lowest timestamp win. But the node handling a registration must answer now, and it cannot know whether some other node is at this moment stamping a claim for the same name with a smaller timestamp. Asking every other node would stall whenever one of them is unreachable, which is the opposite of fault tolerance. The total order only emerges once all operations are known; an operation you have not heard about may belong anywhere in it. What you need is not only a total order but knowledge of when that order is **final**, which is what total order broadcast provides."
      ],
      keyPoints: [
        "A causality-consistent total order encodes every causal dependency plus arbitrary ordering of concurrent operations.",
        "Per-node counters, physical timestamps, and block allocation scale well but are not consistent with causality.",
        "Lamport timestamp = (counter, node ID); carry the maximum counter seen on every message and fast-forward on receipt.",
        "Lamport timestamps are compact but cannot detect concurrency; version vectors can, at a cost in size.",
        "Timestamps decide a uniqueness winner only in hindsight; a node answering now cannot know whether a smaller timestamp is in flight.",
        "The missing ingredient is finality: knowing that no operation can still be inserted earlier in the order."
      ],
      table: {
        caption: "Ways to generate sequence numbers and what each sacrifices",
        columns: ["Generator", "Unique?", "Consistent with causality?", "Main weakness"],
        rows: [
          ["Single-leader counter", "Yes", "Yes", "Throughput capped by one node; unclear what happens on leader failure"],
          ["Per-node counters (odd/even, node-ID bits)", "Yes", "No", "Nodes advance at different rates, so numbers say nothing about happened-before"],
          ["Physical clock timestamps", "Usually", "No", "Clock skew can stamp a later event earlier (the LWW data-loss problem)"],
          ["Pre-allocated blocks", "Yes", "No", "A causally later operation may draw from an earlier block"],
          ["Lamport timestamp (counter, node ID)", "Yes", "Yes", "Cannot tell concurrent from dependent; order is never known to be final"],
          ["Version vector", "Yes", "Yes, and detects concurrency", "Grows with the number of nodes"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Lamport timestamps look like a uniqueness solution: lowest timestamp wins. But the node that must accept or reject a registration right now has no way to learn whether a smaller timestamp is still travelling through the network."
      }
    },
    {
      id: "total-order-broadcast",
      title: "Total Order Broadcast",
      body: [
        "On a single CPU core the total order of operations is simply execution order. Across nodes it has to be agreed. Single-leader replication agrees by funnelling every write through one node, which caps throughput and makes failover the hard part. The general problem is **total order broadcast** (also atomic broadcast or total order multicast), a messaging protocol with two safety properties: **reliable delivery** (a message delivered to any node is delivered to all) and **totally ordered delivery** (every node delivers messages in the same sequence). Both must hold despite faults; during a partition delivery pauses, but when the network recovers the messages still arrive in the correct order. Databases with one leader per partition usually guarantee ordering only within a partition; a global order spanning every partition can be built, but only with additional coordination.",
        "Total order broadcast is what database replication really wants. If every message is a write and every replica applies an identical sequence of writes, replicas stay consistent apart from lag; this is **state machine replication**. If every message is a deterministic stored procedure, the same mechanism yields serializable transactions across partitions and replicas. Two features distinguish it from timestamp ordering: the order is fixed at delivery time, so no message can be slipped in before already-delivered ones; and it is naturally a log, where delivering a message is appending to it and every node reads the same sequence. A log also supplies fencing tokens: lock requests appended to the log receive monotonically increasing positions, which ZooKeeper exposes as the `zxid`. ZooKeeper and etcd are, at heart, total order broadcast implementations, a strong hint of the link to consensus.",
        "Total order broadcast is asynchronous: it promises order, not timeliness, so a recipient may lag. Linearizability is about recency. The two are therefore not identical, but each can be built from the other. To implement a linearizable compare-and-set for username claims on a log: append a message tentatively claiming the name; read the log until your own message is delivered back to you; then check whether the first claim for that name in the log is yours. If it is, commit and acknowledge; if another client's claim came first, abort. Every node sees the same order, so every node agrees on the winner. This gives linearizable writes, but a read served by a replica that merely trails the log may still be stale; what you have is sequential (timeline) consistency. Three fixes make reads linearizable: append a read marker and perform the read when it is delivered (roughly how etcd quorum reads work); linearizably fetch the latest log position and wait until you have applied everything up to it (ZooKeeper's `sync()`); or read from a replica that is updated synchronously (chain replication).",
        "The reverse construction starts from a linearizable integer register with an atomic increment-and-get (or compare-and-set). For each message, increment-and-get to obtain a sequence number, attach it, and send the message to every node, resending if lost. Recipients deliver messages in sequence-number order. Because the numbers have no gaps, a node that has delivered message 4 and receives message 6 knows message 5 exists and waits for it. Lamport timestamps can never tell you that something is missing, and that is the essential difference. Building such a fault-tolerant counter, however, drags you straight into consensus: a linearizable compare-and-set register, total order broadcast, and consensus are all provably equivalent. Solve one and you have solved the others."
      ],
      keyPoints: [
        "Total order broadcast = reliable delivery plus identical order on every node, even under faults; delivery may pause but never reorders.",
        "It underpins state machine replication, deterministic serializable transactions, replicated logs, and fencing tokens such as ZooKeeper's zxid.",
        "The order is final at delivery time; nothing can be inserted retroactively, unlike timestamp ordering.",
        "Linearizable CAS from a log: append your claim, wait for it to come back, check who claimed first.",
        "Reads need extra work to be linearizable: a read marker in the log, a sync-then-read, or a synchronously updated replica.",
        "Gap-free sequence numbers from a linearizable counter turn plain broadcast into total order broadcast.",
        "Linearizable CAS register, total order broadcast, and consensus are equivalent problems."
      ],
      callout: {
        kind: "insight",
        text: "Gap-free numbering is the whole trick: a node holding message 4 that receives message 6 knows it must wait for 5. A Lamport timestamp of 6 after a 4 tells you nothing about whether a 5 ever existed."
      },
      systems: ["ZooKeeper", "etcd"]
    },
    {
      id: "atomic-commit-and-2pc",
      title: "Atomic Commit and Two-Phase Commit (2PC)",
      body: [
        "Two situations make agreement unavoidable: leader election, where disagreement means split brain, and **atomic commit**, where a transaction spanning several nodes or partitions must either commit everywhere or abort everywhere. Before tackling them, note the **FLP result** (Fischer, Lynch, Paterson): no deterministic algorithm can always reach consensus if even one node may crash. The catch is that FLP assumes the fully asynchronous model, with no clocks and no timeouts. Allow timeouts, even unreliable ones, or allow randomness, and consensus becomes solvable. FLP is a profound theoretical boundary, not a practical obstacle.",
        "On a single node, atomicity rests on the order of disk writes: data pages first, commit record last. The instant the commit record becomes durable is the deciding moment, and a single disk controller makes that moment atomic. Across nodes you cannot simply send commit to everyone, because one participant may detect a constraint violation, a commit message may be lost and time out, or a node may crash before its commit record lands. Once a node has committed it cannot change its mind: committed data is already visible to others under read committed isolation, so a retroactive abort would cascade through every transaction that read it. Compensating transactions can later undo effects, but as far as the database is concerned that is a fresh transaction and the application's responsibility. Therefore a node may commit only when it is certain that every other participant will commit too.",
        "**Two-phase commit** delivers that certainty. Do not confuse it with two-phase locking, which is about isolation. 2PC introduces a **coordinator** (transaction manager), often a library inside the application process but sometimes a separate service; examples include Narayana, JOTM, BTM, and MSDTC. The flow: the application obtains a globally unique transaction ID from the coordinator; it runs an ordinary single-node transaction on each **participant**, tagged with that ID, and anything that fails here causes an abort; once the application wants to commit, phase one begins: the coordinator asks every participant, via a **prepare** message, whether it is able to commit; a participant that answers yes has first written all transaction data durably and checked every constraint, and by answering yes it gives up its right to abort regardless of crashes, power loss, or a full disk; once every vote is in, the coordinator decides and writes the decision to its own log, the **commit point**; finally it sends commit or abort to all participants and retries forever until each acknowledges. A participant that crashed after voting yes must commit when it recovers. The protocol thus contains two points of no return: the participant's yes vote and the coordinator's logged decision. 2PC is also exposed to applications as XA transactions (via the Java Transaction API) and as WS-AtomicTransaction for SOAP services.",
        "The weak spot is **coordinator failure**. Before receiving prepare, a participant may abort on its own. After voting yes, it is **in doubt**: it may not abort, because others may already have committed, and may not commit, because others may have aborted. A timeout does not help, and participants talking among themselves is not part of the protocol. The only way out is for the coordinator to recover and consult its log; transactions without a commit record are aborted. So the commit point of 2PC is really an ordinary one-node commit performed by the coordinator, and 2PC is a **blocking** protocol. Three-phase commit (3PC) is non-blocking in theory, but it assumes bounded network delay and bounded response times. Non-blocking atomic commit in general needs a perfect failure detector, and a timeout on a network with unbounded delay is not one, which is why 2PC remains in use despite its known flaw."
      ],
      keyPoints: [
        "FLP rules out deterministic consensus only in the pure asynchronous model; timeouts or randomness make it achievable.",
        "Single-node commit is one durable commit record; distributed commit needs unanimous certainty because commits are irrevocable.",
        "2PC: prepare collects binding promises; the coordinator logs its decision (commit point) before telling anyone.",
        "A yes vote means the participant has made the transaction durable and has surrendered its right to abort.",
        "If the coordinator crashes after prepare, participants are in doubt and can only wait; 2PC blocks.",
        "3PC avoids blocking only under bounded delays, which amounts to assuming a perfect failure detector.",
        "2PC is atomic commit; 2PL is serializable isolation. Different problems, unfortunate names."
      ],
      callout: {
        kind: "example",
        text: "Wedding as 2PC: each partner may still back out until they say yes; the officiant's pronouncement is the commit point. Faint right after saying yes and you are still married; when you wake up, ask the officiant for the outcome of your transaction ID."
      },
      systems: ["Narayana", "JOTM", "BTM", "MSDTC"]
    },
    {
      id: "distributed-transactions-in-practice",
      title: "Distributed Transactions in Practice: XA and Its Problems",
      body: [
        "Distributed transactions have a split reputation: an important safety guarantee that is hard to obtain otherwise, and a source of operational pain, poor performance, and over-promising. Many cloud services simply do not offer them. Distributed transactions in MySQL have been reported to be more than ten times slower than single-node ones, mostly because of the extra `fsync` calls needed for crash recovery and the additional network round trips. Before judging, separate two very different things. **Database-internal** distributed transactions (VoltDB, MySQL Cluster's NDB engine) involve nodes all running the same software, so they can use any specialized protocol and often work well. **Heterogeneous** distributed transactions span different technologies, such as two vendors' databases or a database plus a message broker, and that is where the difficulties concentrate.",
        "The attraction of heterogeneous transactions is integration. The classic case is **exactly-once message processing**: acknowledge a queue message in the same atomic transaction as the database writes its processing produced. If either side fails, both roll back and the broker redelivers; after however many retries, the effects appear exactly once. This only works if every side effect participates in the same commit protocol. An email server that does not speak 2PC may send the message twice when processing is retried.",
        "**XA** (eXtended Architecture, X/Open, 1991) is the standard for heterogeneous 2PC. Relational databases that implement it include Oracle, SQL Server, DB2, MySQL, and PostgreSQL; message brokers include IBM MQ, MSMQ, ActiveMQ, and HornetQ. Despite the name, nothing goes over the wire in an XA-defined format: XA is a C-level programming interface through which a transaction coordinator talks to each participant's client driver (Java exposes it as JTA, with JDBC and JMS drivers doing the work). The coordinator is typically a library loaded into the application process, tracking participants, collecting prepare votes through driver callbacks, and recording decisions in a log kept on the local disk of the application server. If that process or machine dies, the coordinator dies with it, and participants with prepared transactions are stuck until the same server restarts and replays the log. The databases cannot contact the coordinator themselves; all communication runs through the client library.",
        "Being in doubt is harmful because of **locks**. A participant holds exclusive row locks on everything it modified (and, under two-phase locking, shared locks on everything it read) until it learns the outcome. A coordinator that takes twenty minutes to restart means twenty minutes of locked rows; a coordinator whose log is lost means rows locked until an administrator intervenes. Other transactions touching those rows block, so large parts of an application can freeze. Orphaned in-doubt transactions do occur in practice, through lost or corrupted logs, and rebooting the database does not help, because a correct 2PC implementation must preserve in-doubt locks across restarts. Resolution is manual: inspect every participant, find out whether any already committed or aborted, and apply the same outcome elsewhere, usually under outage pressure. XA offers **heuristic decisions** as an escape hatch, letting a participant unilaterally commit or abort; the word heuristic is a polite way of saying atomicity is probably being violated, so this is for emergencies only.",
        "The broader lesson is that the coordinator is itself a database of transaction outcomes and deserves the same care as any other database. Yet many coordinators are not replicated, making them a single point of failure. Supposedly stateless application servers suddenly hold crucial durable state in their coordinator logs. XA, needing to work with everything, is a lowest common denominator: it cannot detect deadlocks spanning systems and cannot support SSI, which would require exchanging conflict information across systems. Even database-internal transactions share one flaw: 2PC needs every participant to respond, so any broken component fails the whole transaction. Distributed transactions amplify failures, the opposite of what fault-tolerant design wants. Chapters 11 and 12 show ways to keep systems consistent without this machinery."
      ],
      keyPoints: [
        "Internal distributed transactions (same software everywhere) can be optimized and usually work; heterogeneous ones via XA are the painful kind.",
        "Exactly-once processing = message acknowledgment and database writes in one atomic commit; every side effect must join the protocol.",
        "XA is a C API, not a wire protocol; the coordinator is usually an in-process library logging to local disk.",
        "In-doubt participants hold locks until the coordinator decides; a lost coordinator log means locks held until a human intervenes.",
        "Heuristic decisions resolve in-doubt transactions unilaterally and probably break atomicity; emergency use only.",
        "Costs: extra fsyncs and round trips (over 10x slower in MySQL), unreplicated coordinators, stateful app servers, failure amplification."
      ],
      callout: {
        kind: "pitfall",
        text: "Treating the XA coordinator as a disposable part of a stateless application server. Its log is as critical as the databases it coordinates: lose it, and the in-doubt rows stay locked until someone decides by hand."
      },
      systems: ["VoltDB", "MySQL Cluster (NDB)", "PostgreSQL", "MySQL", "DB2", "SQL Server", "Oracle", "ActiveMQ", "HornetQ", "MSMQ", "IBM MQ"]
    },
    {
      id: "fault-tolerant-consensus",
      title: "Fault-Tolerant Consensus: Properties and Algorithms",
      body: [
        "Informally, consensus means several nodes agreeing on something, such as which of several customers gets the last seat or which registration wins a contested username. Formally, nodes **propose** values and the algorithm **decides** one of them, subject to four properties. **Uniform agreement**: whatever one node decides, every other deciding node must decide the same thing. **Integrity**: a node decides at most once and can never revise its decision. **Validity**: the chosen value must be one that somebody actually proposed, which rules out degenerate algorithms that always pick null. **Termination**: each node that stays alive must eventually arrive at a decision. The first three are safety properties; termination is a liveness property and is what makes the algorithm fault-tolerant. A hard-coded dictator node satisfies the three safety properties trivially and fails termination the moment it dies, which is exactly the 2PC coordinator problem. The system model assumes a crashed node never comes back (imagine the datacenter buried by a landslide), so any protocol that waits for recovery, including 2PC, cannot satisfy termination.",
        "There are limits. Any consensus algorithm needs at least a majority of nodes working and reachable to guarantee termination, and that majority is what forms a quorum. Most implementations keep the safety properties intact even when a majority is down or the network is badly broken: a large outage can halt progress but cannot cause an invalid decision. The standard algorithms also assume no Byzantine faults; a node that violates the protocol, for example by sending contradictory messages, can break safety. Byzantine-tolerant consensus exists when fewer than one third of nodes misbehave, but it is outside the chapter's scope.",
        "The well-known fault-tolerant algorithms are Viewstamped Replication, Paxos, Raft, and Zab. They share high-level ideas but differ in detail, and the chapter's advice is not to implement your own. Notably, in practice none of them is used to settle one isolated value. Each runs as an engine that agrees on message after message, producing an ordered stream, which is precisely total order broadcast. Seen the other way round, total order broadcast is consensus run repeatedly, one round per delivered message, and the four properties map neatly: agreement gives every node an identical sequence, integrity prevents duplicates, validity prevents invented messages, and termination guarantees nothing is dropped. Viewstamped Replication, Raft, and Zab are built as broadcast protocols from the start, since agreeing on a stream is cheaper than running an independent round per value; Paxos achieves the same through its batched form, Multi-Paxos.",
        "Why, then, did Chapter 5's single-leader replication not need consensus? Because the leader was chosen by humans. That is a dictatorial consensus algorithm: only one node orders writes, and when it dies the system waits for an operator to appoint a successor. It works, but it fails termination because progress requires human action. Automatic failover brings you closer to a fault-tolerant version of total order broadcast, but choosing a new leader safely requires every node to agree on who the leader is, which is itself consensus. And the consensus algorithms just named all use a leader internally. So to elect a leader you apparently need a leader, and to solve consensus you must first solve consensus. The next section shows how the algorithms escape this circle."
      ],
      keyPoints: [
        "Consensus = uniform agreement + integrity + validity (safety) + termination (liveness and fault tolerance).",
        "A dictator or a 2PC coordinator satisfies safety for free and fails termination when it crashes.",
        "A majority must be alive for progress; safety typically survives even larger outages; Byzantine faults need special algorithms and fewer than one third faulty nodes.",
        "Viewstamped Replication, Paxos (Multi-Paxos), Raft, and Zab are total order broadcast protocols, which equals repeated consensus.",
        "Manually configured single-leader replication is consensus by dictator; automatic failover needs the real thing.",
        "The apparent paradox: consensus protocols rely on a leader, yet choosing a leader requires consensus."
      ],
      systems: ["Viewstamped Replication", "Paxos", "Raft", "Zab", "ZooKeeper", "etcd"]
    },
    {
      id: "epoch-numbering-and-quorums",
      title: "Epoch Numbering and Quorums: Breaking the Circle",
      body: [
        "The escape is to stop insisting on a globally unique leader and instead guarantee a unique leader **per epoch**. An epoch (Raft calls it a term, Paxos a ballot number, Viewstamped Replication a view number) is a counter that increases every time nodes suspect the leader has died and start an election. Epochs are totally ordered, so if two nodes both believe they lead, perhaps because the old leader was merely slow rather than dead, the one with the higher epoch wins.",
        "A leader must not decide anything until it has confirmed it has not been replaced. It cannot trust its own opinion, since, as Chapter 8 argued, majority opinion defines what counts as true. So for each proposed value it sends the proposal to the other nodes and waits for a **quorum**, usually a majority, to accept. A node accepts only if it knows of no leader with a higher epoch. There are therefore two rounds of voting, one to elect the leader and one for each proposal, and the critical requirement is that the two quorums **overlap**: any quorum that accepts a proposal shares at least one node with the quorum of the most recent election. If none of the accepting nodes reports a higher epoch, no newer election can have completed, so the leader knows it still holds office and may safely decide. Later work (Flexible Paxos) shows the quorums need not be majorities as long as they intersect.",
        "This looks superficially like 2PC, but three differences explain why one is fault-tolerant and the other blocks. In 2PC the coordinator is fixed rather than elected. 2PC requires a yes from every participant, whereas consensus needs only a majority. And consensus algorithms define a recovery procedure that brings nodes to a consistent state after a leader change, preserving safety throughout."
      ],
      keyPoints: [
        "Leader uniqueness is guaranteed per epoch, not globally; a higher epoch overrides an older leader.",
        "Each proposal needs acceptance from a quorum; acceptors refuse if they know a higher epoch.",
        "Because election and proposal quorums overlap, a successful proposal proves no newer leader exists.",
        "Versus 2PC: elected rather than fixed leader, majority rather than unanimity, and a defined recovery path instead of blocking."
      ],
      table: {
        caption: "Two-phase commit versus fault-tolerant consensus",
        columns: ["Aspect", "Two-phase commit (2PC)", "Consensus (Raft, Paxos, Zab, VSR)"],
        rows: [
          ["Who decides", "A fixed coordinator", "A leader elected for the current epoch"],
          ["Votes required", "Unanimous yes from every participant", "A quorum, usually a majority"],
          ["Leader or coordinator crash", "Participants block in doubt until it recovers", "New election with a higher epoch; progress resumes"],
          ["Recovery after failure", "Coordinator replays its own log", "Protocol-defined procedure brings nodes to a consistent state"],
          ["Termination property", "Not satisfied", "Satisfied while a majority is reachable"],
          ["What is decided", "Commit or abort for one transaction", "A sequence of values (total order broadcast)"]
        ]
      },
      callout: {
        kind: "insight",
        text: "A leader never knows it is still leader by inspecting its own state. It knows because a majority just accepted its proposal without mentioning a newer epoch, and any newer election would have needed some of those same nodes."
      }
    },
    {
      id: "limitations-of-consensus",
      title: "Limitations of Consensus",
      body: [
        "Consensus is a major achievement: concrete safety guarantees in an environment where nothing else is certain, liveness as long as a majority is up, and, via total order broadcast, fault-tolerant linearizable atomic operations. It is still not used everywhere, for good reasons. Voting on every proposal before deciding is a form of synchronous replication, and many databases deliberately run asynchronous replication, accepting possible loss of recent commits on failover in exchange for speed. The strict majority requirement means three nodes to tolerate one failure and five to tolerate two, and during a partition only the majority side can proceed. Most algorithms also assume a fixed set of voting nodes; dynamic membership extensions exist but are far less well understood.",
        "Failure detection is the other weak point. Consensus systems rely on timeouts to decide that a leader is dead. On networks with highly variable delay, especially geographically distributed ones, followers frequently suspect a healthy leader, trigger an election, and halt progress while it runs. Safety is never at risk, but a cluster that re-elects constantly spends more time choosing a leader than serving requests. Some algorithms have specific pathologies: Raft has been shown to bounce leadership between two nodes indefinitely, or repeatedly force the leader to step down, when a single network link is unreliable while everything else works. Making consensus robust to unreliable networks remains an open research problem."
      ],
      keyPoints: [
        "Every decision is effectively synchronous replication, which many systems avoid for performance.",
        "Majority rule: n = 3 tolerates one failure, n = 5 tolerates two; the minority side of a partition is stuck.",
        "Static membership is the norm; adding or removing voters safely is hard.",
        "Timeout-based failure detection produces spurious elections and throughput collapse under variable latency.",
        "A single flaky link can destabilize Raft leadership; network robustness is unsolved."
      ],
      callout: {
        kind: "pitfall",
        text: "Spreading a consensus cluster across continents and then wondering why it keeps re-electing leaders: long, variable round trips make timeouts fire falsely, and every election is a pause in service."
      },
      systems: ["Raft"]
    },
    {
      id: "membership-and-coordination-services",
      title: "Membership and Coordination Services: ZooKeeper and Friends",
      body: [
        "ZooKeeper and etcd expose a key-value API, so why build a consensus algorithm underneath? Application developers rarely call them directly; they inherit them through projects such as HBase, Hadoop YARN, OpenStack Nova, and Kafka. These services hold small datasets that fit in memory (persisted to disk as well), replicated across all nodes by fault-tolerant total order broadcast. Modeled on Google's Chubby lock service, ZooKeeper bundles four capabilities that together make distributed coordination workable. **Linearizable atomic operations**: a compare-and-set implements a lock that exactly one contender wins, normally as a lease with an expiry so a dead client eventually releases it. **Total ordering of operations**: each operation is stamped with an ever-growing transaction ID (`zxid`) and each node with a version counter (`cversion`), and either number can act as a fencing token. **Failure detection**: clients keep long-lived sessions with heartbeats; transient hiccups are tolerated, but when heartbeats stop for longer than the session timeout the session is declared dead and its **ephemeral nodes** disappear, releasing any locks. **Change notifications**: clients can watch keys and learn when another client joins or when its ephemeral nodes vanish, without polling. Only the atomic operations strictly require consensus, but the combination is what makes the service valuable.",
        "Typical uses are **allocating work to nodes**: electing a primary among service instances (databases, job schedulers, other stateful systems) and assigning partitions of a database, stream, or storage system to nodes, with rebalancing when nodes join, leave, or fail. Atomic operations plus ephemeral nodes plus watches make this automatic, so the system heals without a human. It is not easy even with Curator's recipes, but it beats writing your own consensus, which has a poor track record. ZooKeeper runs on a small fixed group of voters (usually three or five) while serving many clients, so it effectively **outsources** consensus, ordering, and failure detection. The data it manages changes slowly, on the order of minutes or hours (which node leads partition 7), not thousands of times per second. Rapidly changing application state belongs elsewhere, for instance in Apache BookKeeper.",
        "**Service discovery** (ZooKeeper, etcd, Consul) lets services register their network endpoints at startup so others can find them in a cloud where virtual machines come and go. Whether this needs consensus is doubtful. DNS has done the job for decades with layers of caching; its reads are far from linearizable, slightly stale answers are acceptable, and availability during network trouble matters more than freshness. Leader election, however, does need consensus, so it is natural to let the consensus system publish who the leader is. Some consensus systems add read-only caching replicas that follow the decision log without voting, serving reads that need not be linearizable.",
        "Finally, these tools belong to a long line of **membership services** dating to 1980s research on highly reliable systems such as air traffic control. A membership service decides which nodes are currently live members of the cluster. Unbounded delays make it impossible to detect failure reliably, but coupling a failure detector with consensus lets nodes agree on a membership view even if it is occasionally wrong about a slow node. That agreement is what makes simple schemes work, such as choosing the lowest-numbered current member as leader, which would be meaningless if nodes disagreed about who the members are."
      ],
      keyPoints: [
        "Coordination services keep small, slow-changing data replicated by total order broadcast; the feature bundle is the point, not storage capacity.",
        "Four features: linearizable CAS (locks as leases), total ordering (zxid and cversion as fencing tokens), session-based failure detection (ephemeral nodes), and watches.",
        "Common jobs: leader election, partition assignment and rebalancing, automatic recovery without operators.",
        "A fixed quorum of three or five voters serves many clients; do not store high-churn application state there.",
        "Service discovery needs availability more than linearizability (DNS proves it); leader election is the part that needs consensus.",
        "Membership service = failure detector + consensus, yielding an agreed (if occasionally wrong) list of live nodes."
      ],
      callout: {
        kind: "example",
        text: "Kafka historically stored which broker currently leads each partition in ZooKeeper. The data is tiny and changes rarely, but every broker must agree on it, which is precisely the profile a consensus-backed coordination service is built for."
      },
      systems: ["ZooKeeper", "etcd", "Consul", "Chubby", "Apache Curator", "HBase", "Hadoop YARN", "OpenStack Nova", "Kafka", "Apache BookKeeper"]
    },
    {
      id: "summary-everything-reduces-to-consensus",
      title: "Summary: Many Problems, One Consensus",
      body: [
        "The chapter's thread runs like this. Linearizability makes replicated data behave like a single variable, which is easy to reason about but slow, especially across long network paths. Causality offers a weaker model in which histories branch and merge; it avoids linearizability's coordination cost and tolerates network problems. But even a causally consistent total order, such as Lamport timestamps provide, cannot enforce a uniqueness constraint, because the node answering a request cannot know whether a conflicting operation is still on its way. Resolving that requires deciding something so that every node agrees and no one can later change the decision, which is consensus.",
        "Many problems turn out to be consensus in disguise and are reducible to one another: linearizable compare-and-set registers, atomic transaction commit, total order broadcast, locks and leases, membership and coordination services, and uniqueness constraints. All of them are easy with a single node or a single designated decider, which is exactly what a single-leader database is and why it can offer linearizable operations, unique indexes, and an ordered replication log. The trouble starts when that leader fails or becomes unreachable. There are three responses: wait for it to recover (what many XA/JTA coordinators do, giving up termination); have humans pick a new leader (what many relational databases do, consensus by operator, limited by human reaction time); or run a proven consensus algorithm to elect one automatically. A single leader does not remove the need for consensus; it moves it to leadership changes, where it is needed less often.",
        "Practical guidance follows. If you need something on the list above and want it fault-tolerant, use a coordination service such as ZooKeeper rather than hand-rolling an algorithm that must survive every fault from Chapter 8. At the same time, not every system needs consensus: leaderless and multi-leader designs run without global agreement, and the conflicts they produce are the price of that choice. Sometimes living with branching, merging histories is the right trade. Part III picks up here, building applications from heterogeneous components and using logs where distributed transactions would be too fragile."
      ],
      keyPoints: [
        "Linearizability: simple to reason about, costly in latency; causality: cheaper and partition-tolerant, but branching.",
        "Six classic problems are equivalent to consensus; a solution to one yields solutions to all.",
        "A single leader makes every one of them easy until it fails; then you wait, call a human, or run consensus.",
        "Leaders do not eliminate consensus; they relocate it to leadership changes.",
        "Not every system needs consensus: multi-leader and leaderless designs trade it away for availability and accept conflicts."
      ],
      table: {
        caption: "Problems that are equivalent to consensus",
        columns: ["Problem", "What must be decided", "Where it appeared in the chapter"],
        rows: [
          ["Linearizable compare-and-set register", "Whether the value changes, given its current value", "Username claims, lock acquisition"],
          ["Atomic transaction commit", "Commit or abort, identically on every participant", "2PC, XA"],
          ["Total order broadcast", "The single delivery order of messages", "Replication logs, ZooKeeper, etcd"],
          ["Locks and leases", "Which contender acquires the lock", "Leader election, fencing tokens"],
          ["Membership and coordination", "Which nodes count as alive", "Session timeouts, ephemeral nodes"],
          ["Uniqueness constraint", "Which of several conflicting records is allowed", "Usernames, seat and ticket booking"]
        ]
      }
    }
  ],
  terms: [
    { term: "Linearizability", definition: "A consistency model in which a replicated system behaves as if there were a single copy of each object and every operation took effect atomically at one instant between its request and its response. It is fundamentally a recency guarantee." },
    { term: "Strict serializability", definition: "Serializability combined with linearizability: transactions appear to run one at a time in an order that also respects real time. Two-phase locking and serial execution typically provide it; SSI does not." },
    { term: "CAP theorem", definition: "The observation that during a network partition a system must choose between linearizability and continuing to serve every request. Formally narrow (one consistency model, one fault type) and often misstated as pick two of three." },
    { term: "Causal consistency", definition: "A model in which an operation becomes visible only after every operation it causally depends on; concurrent operations may be observed in different orders on different nodes. Strongest model that stays available under partitions." },
    { term: "Total order versus partial order", definition: "In a total order any two elements are comparable (linearizable histories, sequence numbers). In a partial order some pairs are incomparable (causality, where concurrent operations have no defined order)." },
    { term: "Lamport timestamp", definition: "A (counter, node ID) pair assigned to each operation. Nodes and clients carry the largest counter they have seen on every message and fast-forward their own counter on receipt, giving a compact total order consistent with causality." },
    { term: "Total order broadcast", definition: "A protocol guaranteeing that every node receives an identical message sequence, reliably, even under node and network faults. Equivalent to consensus and the basis of state machine replication." },
    { term: "Sequential (timeline) consistency", definition: "A guarantee slightly weaker than linearizability: all nodes observe operations in one agreed order, but a read need not reflect the most recent write. It is what you get from writes through a log plus reads from asynchronously updated replicas." },
    { term: "Atomic commit", definition: "The problem of making a transaction that spans several nodes or partitions either commit on all of them or abort on all of them, never a mixture." },
    { term: "Two-phase commit (2PC)", definition: "An atomic commit protocol in which a coordinator asks all participants to prepare, records its commit-or-abort decision durably, then instructs every participant. It blocks if the coordinator fails after participants have voted yes." },
    { term: "In-doubt transaction", definition: "A participant's transaction after it has voted yes to prepare but before it learns the coordinator's decision. It can neither commit nor abort on its own and must keep holding its locks." },
    { term: "XA transactions", definition: "The X/Open standard (1991) for two-phase commit across heterogeneous systems such as databases and message brokers. It is a C API between a coordinator and client drivers, exposed in Java through JTA, not a network protocol." },
    { term: "Heuristic decision", definition: "An XA escape hatch allowing a participant to unilaterally commit or abort an in-doubt transaction without the coordinator's verdict. It likely violates atomicity and is intended only for catastrophic situations." },
    { term: "Consensus", definition: "The problem of getting nodes that each propose a value to settle on a single one, such that all deciding nodes choose the same value (agreement), nobody decides twice (integrity), the value was really proposed (validity), and every surviving node eventually decides (termination)." },
    { term: "Epoch number", definition: "A monotonically increasing election counter (term in Raft, ballot in Paxos, view in Viewstamped Replication). Leadership is unique within an epoch, and a higher epoch overrides a leader from an older one." }
  ],
  pitfalls: [
    "Believing that serializable implies fresh reads. Serializability only requires an equivalent serial order, and serializable snapshot isolation reads from a deliberately stale snapshot. Only strict serializability (serializable plus linearizable) guarantees recency.",
    "Assuming quorum reads and writes with w + r > n give linearizability. Under variable network delay a later reader can see an older value than an earlier reader. You need synchronous read repair and read-before-write, and even then compare-and-set is impossible without consensus.",
    "Reading CAP as pick two of three. Partitions are not optional, so the only real choice is between linearizability and availability while a partition lasts. The formal theorem also ignores latency, which is the price of linearizability you pay every day.",
    "Expecting Lamport timestamps to enforce uniqueness. They order operations correctly in hindsight, but a node that must accept or reject a request immediately cannot know whether a smaller timestamp is still in flight. Finality requires total order broadcast.",
    "Confusing two-phase commit with two-phase locking, or assuming 2PC is fault-tolerant. 2PC is atomic commit, 2PL is isolation; and 2PC blocks whenever the coordinator fails after participants voted yes, so it does not satisfy consensus termination.",
    "Using ZooKeeper or etcd as a general database. They are designed for small, slow-changing coordination data replicated across three or five voters; high-churn application state belongs in a system built for it, such as Apache BookKeeper."
  ],
  connections: [
    { chapter: 5, note: "Each replication method from Chapter 5 is re-examined for linearizability; read-your-writes offers an alternative to cross-channel races; version vectors and happened-before reappear as causality tracking; the single-leader log is a causally consistent total order." },
    { chapter: 7, note: "Serializability is contrasted with linearizability; 2PL and serial execution are linearizable while SSI is not; single-node atomicity via the commit record generalizes to atomic commit; 2PC must not be confused with 2PL; in-doubt transactions hold Chapter 7's locks." },
    { chapter: 8, note: "Consensus must survive Chapter 8's lost packets, unbounded delays, drifting clocks, and process pauses; the truth-by-majority principle, fencing tokens, failure detectors, timeouts, and Byzantine faults all return in the discussion of epochs, quorums, and ZooKeeper sessions." },
    { chapter: 6, note: "Per-partition leaders preserve linearizability because it is a per-object guarantee, but cross-partition transactions and term-partitioned secondary indexes need atomic commit; partition assignment and rebalancing are classic ZooKeeper jobs." },
    { chapter: 11, note: "The log view of total order broadcast (delivering equals appending) and state machine replication are the theoretical core of log-based stream processing; exactly-once processing and log-based alternatives to XA are developed there." },
    { chapter: 12, note: "Chapter 12 builds on the idea that many constraints do not need linearizability: coordination-avoiding designs, timeliness versus integrity, and relaxed constraints such as overbooking with compensation." }
  ],
  flashcards: [
    { front: "State in one sentence what linearizability promises.", back: "The system behaves as if there were one copy of each object and every operation took effect atomically at one instant between request and response, so any read that starts after a write completes returns that value or a newer one." },
    { front: "A read overlaps in time with a write changing x from 0 to 1. What may the read return, and what restriction applies?", back: "Either 0 or 1. But once any client has received 1, every read that starts afterwards on any client must also return 1, even if the write has not yet been acknowledged. The value may not flip back." },
    { front: "Linearizability versus serializability: which is about recency and which about transactions?", back: "Linearizability: recency guarantee on single-object reads and writes, order consistent with real time, no transactions. Serializability: isolation for multi-object transactions, equivalent to some serial order that may differ from real time. Both together form strict serializability." },
    { front: "Why is serializable snapshot isolation not linearizable?", back: "SSI reads from a consistent snapshot so readers and writers do not block each other. A snapshot excludes writes committed after it was taken, so reads may be stale even though the transactions are serializable." },
    { front: "Why must a lock used for leader election be linearizable?", back: "Every node must agree who holds the lock. If nodes can see different lock states, two may act as leader simultaneously (split brain), causing divergent data and loss. ZooKeeper and etcd provide such locks through consensus." },
    { front: "Describe the photo-thumbnail race and how to fix it.", back: "The web server stores a photo, then enqueues a resize job; the worker fetches the photo. If the queue outruns storage replication, the worker sees an old or missing photo and the thumbnail is permanently wrong. Fix: linearizable storage, or carry version information through the queue (read-your-writes techniques)." },
    { front: "Which replication methods can be linearizable?", back: "Single-leader: potentially, if reads hit the leader or synchronous followers and the leader identity is certain. Consensus-based systems (ZooKeeper, etcd): yes. Multi-leader: no, because concurrent conflicting writes exist. Leaderless Dynamo-style: probably not, even with strict quorums." },
    { front: "Show that w + r > n does not guarantee linearizability.", back: "n = 3, w = 3, r = 2. A write of 1 reaches one replica first. Reader A queries that replica plus a stale one and returns 1. Reader B, starting after A finishes, queries the two stale replicas and returns 0. A later read saw an older value." },
    { front: "What would make Dynamo-style quorums linearizable, and what still cannot be done?", back: "Readers must perform read repair synchronously before returning, and writers must read the latest quorum state before writing. That yields linearizable reads and writes only; a linearizable compare-and-set still requires consensus." },
    { front: "State the CAP trade-off in the chapter's preferred wording.", back: "While the network works you can have both linearizability and availability. During a partition you must choose: linearizable (disconnected replicas block or error) or available (replicas keep serving, non-linearizably). In short: consistent or available when partitioned." },
    { front: "Why does the chapter call the CAP theorem unhelpful?", back: "Partitions are not a choice, so pick-two misleads. The formal result covers only linearizability and only partitions, ignores latency and dead nodes, and uses an availability definition most highly available systems do not meet. More precise results have replaced it." },
    { front: "What did Attiya and Welch prove about linearizability?", back: "Linearizable read and write response times are at least proportional to the uncertainty in network delay. On networks with variable latency, linearizable operations are inherently slow; no faster algorithm exists, but weaker models can be much faster." },
    { front: "What is the relationship between linearizability and causal consistency?", back: "Linearizability implies causal consistency; any linearizable system preserves causality automatically. The converse is false. Causal consistency is the strongest model that stays available under partitions and is not slowed by network delay uncertainty." },
    { front: "How do Lamport timestamps work?", back: "Each operation gets (counter, node ID), compared by counter then node ID. Every node and client tracks the largest counter it has seen and attaches it to each message; a receiver with a smaller counter jumps forward to it. Every causal link therefore raises the timestamp." },
    { front: "Lamport timestamps versus version vectors.", back: "Version vectors can distinguish concurrent operations from ones where one depends on the other. Lamport timestamps always impose a total order and cannot distinguish concurrency from dependency, but they are far more compact." },
    { front: "Why can Lamport timestamps not enforce a unique-username constraint?", back: "A node must decide immediately whether a registration succeeds, but it cannot know whether another node is concurrently stamping the same name with a smaller timestamp. Asking every node fails if one is down. The order is known only after all operations are collected." },
    { front: "Define the two safety properties of total order broadcast.", back: "Reliable delivery: a message delivered to one node is delivered to all. Totally ordered delivery: every node delivers messages in the same order. Both must hold despite faults; delivery may be delayed but never reordered." },
    { front: "How do you build a linearizable compare-and-set (for example a username claim) on total order broadcast?", back: "Append a tentative claim to the log, read the log until your own message is delivered back, then check whether the first claim for that name is yours. If so, commit; otherwise abort. All nodes see the same order, so all agree on the winner." },
    { front: "Name three ways to make reads linearizable on top of a log.", back: "Append a read marker and perform the read when it is delivered (etcd quorum reads). Linearizably fetch the latest log position and wait until you have caught up (ZooKeeper sync). Read from a replica that is updated synchronously (chain replication)." },
    { front: "How do you build total order broadcast from a linearizable increment-and-get register, and why do gaps matter?", back: "For each message, increment-and-get the register and attach the result as a sequence number; receivers deliver in sequence order. The numbers have no gaps, so a node holding 4 that receives 6 waits for 5. Lamport timestamps can never signal a missing message." },
    { front: "What does the FLP result say, and why do practical systems still reach consensus?", back: "No deterministic algorithm can always reach consensus if a node may crash, in the asynchronous model with no clocks or timeouts. Real systems use timeouts (unreliable failure detectors) or randomness, either of which is enough to make consensus solvable." },
    { front: "Walk through the two points of no return in 2PC.", back: "First: a participant replies yes to prepare after durably writing its data and checking constraints; it can no longer abort unilaterally. Second: the coordinator writes its commit or abort decision to its log, the commit point. After that it retries the decision messages forever." },
    { front: "What is an in-doubt transaction and why is it harmful?", back: "A participant that voted yes but has not heard the coordinator's decision. It cannot commit or abort alone, so it keeps its row locks, possibly for minutes or forever if the coordinator's log is lost, blocking every other transaction that touches those rows." },
    { front: "Why does three-phase commit not help in practice?", back: "3PC is non-blocking only if network delay and node response times are bounded. Non-blocking atomic commit needs a perfect failure detector, and timeouts on networks with unbounded delay are not perfect, so 2PC remains the common choice despite blocking." },
    { front: "List the four properties of consensus and classify them.", back: "Uniform agreement (all deciding nodes pick the same value), integrity (a node decides at most once), and validity (the value was genuinely proposed) are safety properties. Termination (every node that stays alive eventually decides) is a liveness property that encodes fault tolerance." },
    { front: "How do epochs and overlapping quorums prevent split brain in consensus algorithms?", back: "Each election increments an epoch (term, ballot, view); the leader is unique per epoch. Before deciding, the leader needs a quorum to accept the proposal, and nodes refuse if they know a higher epoch. Because proposal and election quorums overlap, acceptance proves no newer leader exists." },
    { front: "Name three ways fault-tolerant consensus differs from 2PC.", back: "The leader is elected rather than fixed; decisions need only a majority rather than unanimous yes votes; and the algorithm defines a recovery procedure so nodes reach a consistent state after a leader change. Hence consensus keeps going where 2PC blocks." },
    { front: "Why can consensus systems perform badly on geo-distributed or flaky networks?", back: "They detect failures with timeouts. Variable delay makes followers falsely suspect a live leader and trigger elections that halt progress. Raft can even bounce leadership endlessly when one link is unreliable. Safety holds, but throughput collapses." },
    { front: "Which ZooKeeper features together make it a coordination service, and which one strictly needs consensus?", back: "Linearizable atomic operations (compare-and-set locks as leases), total ordering with monotonically increasing zxid and cversion (fencing tokens), session heartbeats with ephemeral nodes for failure detection, and watches for change notification. Only the atomic operations strictly require consensus." },
    { front: "When a single leader fails, what are the three ways to proceed, and what does each cost?", back: "Wait for it to recover (XA coordinators; no termination). Manual failover by operators (many relational databases; consensus by human, slow). Automatic election with a proven consensus algorithm. A leader only defers consensus to leadership changes." }
  ],
  quiz: [
    {
      question: "A client's read of x begins after another client's write of x has returned ok. In a linearizable system, which outcome is permitted?",
      choices: [
        "The read may return the old value if it is routed to a lagging replica",
        "Old or new are both acceptable, since the two operations count as concurrent",
        "The read must return the new value or the value of an even later write",
        "The read must return exactly the written value, and no later write can have occurred"
      ],
      answer: 2,
      explanation: "Linearizability is a recency guarantee: once a write has completed, every read that starts afterwards must observe it or something newer. Choice 0 is the eventual-consistency behavior that linearizability forbids; choice 1 applies only to operations whose intervals overlap; choice 3 is too strong, since other writes may legitimately land in between."
    },
    {
      question: "A database implements serializable snapshot isolation. Which statement is correct?",
      choices: [
        "It is serializable but not linearizable, because snapshot reads can be stale",
        "It is linearizable but not serializable, because snapshots avoid locking",
        "It is both, which is called strict serializability",
        "It is neither, because snapshots violate isolation"
      ],
      answer: 0,
      explanation: "SSI guarantees an equivalent serial order of transactions, so it is serializable. But it reads from a snapshot that excludes newer commits by design, so reads are not guaranteed to be recent and it is not linearizable. Choice 1 reverses the facts, choice 2 describes 2PL or serial execution, and choice 3 is wrong because SSI is a valid serializable isolation level."
    },
    {
      question: "Why are strict quorums (w + r > n) in a Dynamo-style store not sufficient for linearizability?",
      choices: [
        "Because replicas use different hash functions for the same key",
        "Because quorum writes are always acknowledged asynchronously",
        "Because sloppy quorums are mandatory in Dynamo-style systems",
        "Because with variable delays a later reader can contact replicas that have not yet received a write that an earlier reader already observed"
      ],
      answer: 3,
      explanation: "The chapter's n = 3, w = 3, r = 2 example shows a write arriving at replicas at different times: reader A sees the new value from one replica, then reader B, starting later, reads two still-stale replicas and gets the old value. Choices 0 and 1 are not how quorums work, and sloppy quorums (choice 2) are optional and only make things worse."
    },
    {
      question: "Which phrasing of the CAP trade-off does the chapter endorse?",
      choices: [
        "Choose any two of consistency, availability, and partition tolerance",
        "When partitioned, choose either consistency or availability; when the network works, you can have both",
        "Partition-tolerant systems must always sacrifice consistency",
        "Consistency and availability are incompatible even on reliable networks"
      ],
      answer: 1,
      explanation: "Partitions are faults that will happen regardless, so they are not a design option. The real choice arises only during a partition: block (consistent) or keep serving non-linearizably (available). Choice 0 is the misleading pick-two slogan; choices 2 and 3 misstate the trade-off, since a working network allows both properties."
    },
    {
      question: "Node 1's Lamport counter is 1. A client that previously received counter 5 from node 2 sends a request to node 1 carrying max = 5. What counter does node 1 assign to this operation?",
      choices: ["6", "2", "5", "1"],
      answer: 0,
      explanation: "On receiving a maximum larger than its own counter, node 1 fast-forwards to 5 and then increments for the new operation, producing 6. Choice 1 ignores the carried maximum, choice 2 forgets the increment, and choice 3 would reuse a counter already in the past."
    },
    {
      question: "Why are Lamport timestamps insufficient for enforcing a uniqueness constraint at request time?",
      choices: [
        "They are not unique across nodes",
        "A node cannot know whether another node is concurrently issuing a smaller timestamp for the same key; the total order is only known after all operations are collected",
        "They are not consistent with causality",
        "They require synchronized physical clocks"
      ],
      answer: 1,
      explanation: "Lamport timestamps are unique (node ID breaks ties), causally consistent, and clock-free, so choices 0, 2, and 3 are false. Their limitation is finality: the order emerges only once every operation is known, so a node deciding immediately might be overtaken by a lower-timestamped claim still in transit."
    },
    {
      question: "Which statement about total order broadcast is true?",
      choices: [
        "It guarantees every message is delivered within a bounded time",
        "It allows a node to insert a message before messages that were already delivered",
        "It is strictly weaker than Lamport timestamp ordering",
        "Messages are delivered reliably and in the same order on all nodes, with no guarantee about when"
      ],
      answer: 3,
      explanation: "Total order broadcast is asynchronous: it promises reliable, identically ordered delivery, not timeliness. Choice 0 contradicts that. Choice 1 is forbidden; the order is fixed at delivery, which is exactly what makes it stronger, not weaker, than timestamp ordering (choice 2)."
    },
    {
      question: "In 2PC, a participant has answered yes to prepare and the coordinator then crashes before sending its decision. What should the participant do?",
      choices: [
        "Wait for the coordinator to recover and read its log; it may neither commit nor abort unilaterally",
        "Abort after a timeout to release its locks",
        "Commit, since it already promised it could",
        "Ask the application to retry the transaction"
      ],
      answer: 0,
      explanation: "After voting yes the participant is in doubt. Aborting (choice 1) risks inconsistency with participants that already committed; committing (choice 2) risks inconsistency with participants that aborted. Retrying (choice 3) does not resolve the original transaction. Only the coordinator's log determines the outcome, which is why 2PC is a blocking protocol."
    },
    {
      question: "What is the main reason three-phase commit is not used in practice despite being non-blocking in theory?",
      choices: [
        "It requires more disk writes than 2PC",
        "It cannot handle more than two participants",
        "It assumes bounded network delay and response times, effectively a perfect failure detector, which real networks do not provide",
        "It is incompatible with the XA standard"
      ],
      answer: 2,
      explanation: "Non-blocking atomic commit needs to tell a crashed node from a slow one reliably. On networks with unbounded delay a timeout cannot do that, so 3PC's guarantees evaporate. Disk writes (choice 0), participant count (choice 1), and XA compatibility (choice 3) are not the reasons the chapter gives."
    },
    {
      question: "Which property of consensus does 2PC fail to satisfy, and why?",
      choices: [
        "Validity, because the coordinator may decide a value nobody proposed",
        "Termination, because in-doubt participants may wait forever for a crashed coordinator",
        "Uniform agreement, because some participants may commit while others abort",
        "Integrity, because participants can decide twice"
      ],
      answer: 1,
      explanation: "2PC preserves the safety properties: it never decides an unproposed outcome, never lets participants disagree, and never decides twice. What it lacks is liveness: if the coordinator dies after participants voted yes, nothing forces a decision, so termination is violated. The chapter calls it a consensus algorithm, just not a good one."
    },
    {
      question: "How does a consensus leader confirm it has not been superseded before deciding a value?",
      choices: [
        "It compares its local epoch number against a wall-clock lease",
        "It sends a heartbeat to the previous leader and waits for a reply",
        "It waits for every node in the cluster to acknowledge the proposal",
        "It collects acceptances from a quorum that overlaps the election quorum; acceptors refuse if they know a higher epoch"
      ],
      answer: 3,
      explanation: "A leader cannot trust its own view, so it needs a quorum to accept each proposal. Since that quorum must share a node with any later election's quorum, a clean acceptance proves no higher epoch exists. Wall clocks (choice 0) and pinging old leaders (choice 1) are unreliable, and unanimity (choice 2) is 2PC's requirement, not consensus's."
    },
    {
      question: "Which of the following does NOT strictly require consensus, according to the chapter?",
      choices: [
        "Service discovery (finding the address of a service)",
        "Leader election",
        "A linearizable compare-and-set operation",
        "Atomic commit of a transaction across heterogeneous systems"
      ],
      answer: 0,
      explanation: "Service discovery tolerates slightly stale answers and values availability over linearizability, which is why DNS with its layers of caching works fine. Leader election, linearizable compare-and-set, and atomic commit are all listed among the problems equivalent to consensus."
    }
  ],
  reviewQuestions: [
    "A ticketing service runs in two regions. Product management wants two things: never sell the same seat twice, and keep selling if the inter-region link fails. Explain why both cannot hold for the same operation, then design the system so that each operation type gets the right guarantee: which operations need linearizability, which can run under causal consistency, and which can be eventually consistent? Where would you place a consensus-backed component, and what happens in each region during a partition?",
    "Compare three deployments: (a) a single-leader PostgreSQL with manual failover, (b) a five-node Raft-based etcd cluster, and (c) a Cassandra cluster using QUORUM reads and writes with last-write-wins. For each, state whether reads and writes are linearizable, what happens to writes during a network partition, and which consensus property (if any) the system lacks. Which would you use to store the identity of a partition leader, and why?",
    "A team proposes XA transactions across a message broker and two databases to obtain exactly-once message processing. Enumerate the operational risks (coordinator crash, in-doubt locks, heuristic decisions, failure amplification, the stateful application server) and sketch an alternative built on total order broadcast or a log. Precisely which guarantees change, and what does the application have to handle itself under the alternative?",
    "Using the unique-username example, explain why a causally consistent total order such as Lamport timestamps is weaker than total order broadcast. Then write out, step by step, how to implement a linearizable username claim on top of a log, explain why reads from that system are only sequentially consistent, and describe two ways to make the reads linearizable.",
    "A colleague says: we will write our own leader election; each node sends heartbeats, and any node that misses three heartbeats is declared dead and replaced. Using epochs, quorum overlap, fencing tokens, and the chapter's warnings about timeout-based failure detection, explain the failure modes of this design and how ZooKeeper's sessions, ephemeral nodes, and zxid ordering avoid them."
  ]
});
