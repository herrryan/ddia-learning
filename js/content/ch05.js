DDIA.registerChapter({
  number: 5,
  part: 2,
  title: "Replication",
  tagline: "How do you keep copies of changing data in sync across machines when nodes and networks fail?",
  studyMinutes: 110,
  overview: [
    "Replication keeps the same data on several machines joined by a network. There are three reasons to do it: put data physically close to users so requests are faster, keep serving when some machines die, and spread read traffic over more hardware. This chapter assumes the whole dataset fits on every machine; splitting data that is too large for one node is the subject of Chapter 6. Copying data that never changes is trivial. Every hard problem in replication comes from writes that keep arriving while copies are being propagated, and from nodes and links that fail in the middle of that propagation.",
    "The chapter works through the three families of replication algorithm that almost every distributed database uses: single-leader, multi-leader, and leaderless. For each one it explains the mechanics (replication logs, failover, quorums, read repair), the failure modes (acknowledged writes lost on failover, split brain, stale reads, silently discarded concurrent writes), and the guarantees an application can rely on. It gives precise names to the anomalies users actually notice under replication lag: read-after-write, monotonic reads, and consistent prefix reads.",
    "This is the opening chapter of Part II on distributed data. The vocabulary introduced here recurs throughout the rest of the book: failover and timeouts return in Chapter 8, leader election and the limits of quorums in Chapter 9, write conflicts in Chapter 7, and the happens-before relation plus version vectors underpin much of the later discussion of consistency. Understanding why asynchronous replication is both indispensable and dangerous is the key that unlocks the rest of Part II."
  ],
  bigIdeas: [
    "Replicating static data is easy; all the difficulty lies in propagating changes while nodes crash and networks delay, reorder, or drop messages.",
    "Synchronous replication buys durability at the cost of availability; asynchronous replication keeps accepting writes while followers lag but can lose writes it already acknowledged.",
    "Replication lag has no upper bound, so applications need explicit guarantees such as read-after-write, monotonic reads, and consistent prefix reads instead of hoping followers are fresh.",
    "Any design that lets several nodes accept writes to the same data must detect concurrent writes and converge; last write wins converges by silently throwing data away.",
    "The quorum rule w + r > n makes stale reads unlikely, not impossible: sloppy quorums, partial failures, and concurrent writes all break the overlap argument.",
    "Concurrency is about information, not clocks: two operations are concurrent when neither knew about the other, which version numbers and version vectors can track exactly."
  ],
  sections: [
    {
      id: "leader-based-replication",
      title: "Leaders and Followers: Single-Leader Replication",
      body: [
        "A **replica** is any node that holds a copy of the database. The central question is how every write reaches every replica. The most widespread answer is **leader-based replication**, also called active/passive or master–slave. Exactly one replica, the leader, accepts client writes. It applies each write to its own storage and then streams the change to the other replicas, the followers, through a replication log. Followers apply the changes in precisely the order the leader used, so they converge on the same state. Clients may read from the leader or from any follower, but from the client's perspective followers are read-only.",
        "Relational systems ship this pattern as a built-in feature: MySQL, PostgreSQL (from version 9.0 onward), SQL Server AlwaysOn Availability Groups, and Oracle Data Guard. Non-relational stores such as MongoDB, RethinkDB, and LinkedIn's Espresso use it too. It also extends beyond databases: Kafka and RabbitMQ's highly available queues replicate the same way, and DRBD-style replicated block devices and some network filesystems follow a similar design.",
        "The most consequential setting is whether the leader waits for followers. With **synchronous** replication the leader withholds its success response (and keeps the write invisible to other readers) until the follower confirms it has the change. The follower is then guaranteed to be current, so a leader crash loses nothing. The price is that if that follower crashes or the network stalls, the leader cannot finish any write. Making every follower synchronous is therefore unworkable: one slow node would halt the whole system. The usual compromise is **semi-synchronous**: one follower is synchronous and the rest are asynchronous. If the synchronous follower stops responding, an asynchronous one takes over that role, so a current copy always exists on at least two nodes.",
        "Fully **asynchronous** replication is nonetheless common, particularly with many followers or followers spread across regions. The leader never blocks on followers, but if it dies before a write reaches any follower, that write is gone even though the client was told it succeeded. Replication normally completes in well under a second, yet there is no guarantee: a recovering follower, a saturated system, or a flaky network can push the delay to minutes. Researchers keep looking for schemes that avoid data loss without giving up performance; chain replication, used in Microsoft Azure Storage, is one such variant. The deeper connection between replication and consensus is taken up in Chapter 9."
      ],
      keyPoints: [
        "One leader takes all writes; followers replay the leader's log in the leader's order; reads can be served by any replica.",
        "Synchronous: the follower is guaranteed current, but a single unresponsive follower blocks every write.",
        "Asynchronous: writes never wait, but a leader crash can erase writes already confirmed to clients.",
        "Semi-synchronous: one synchronous follower guarantees two up-to-date copies; another follower is swapped in if it stalls.",
        "Replication lag is usually sub-second but has no upper bound.",
        "Naming varies by vendor: master or primary for the leader; read replica, secondary, slave, or hot standby for followers."
      ],
      table: {
        caption: "Synchronous, semi-synchronous, and asynchronous replication compared",
        columns: ["Mode", "Leader confirms the write when", "If the leader dies", "Availability cost", "Where it is used"],
        rows: [
          ["Synchronous (all followers)", "Every follower has acknowledged", "No acknowledged write is lost", "Any slow or dead follower blocks all writes", "Rarely practical"],
          ["Semi-synchronous", "One designated follower has acknowledged", "Write survives on at least one follower", "Only one follower sits on the critical path; it is replaced if it stalls", "Common when durability matters"],
          ["Asynchronous", "Written to the leader's local storage only", "Recently acknowledged writes may be lost", "Leader keeps running even if every follower lags", "Many followers or geo-distributed replicas"]
        ]
      },
      callout: {
        kind: "insight",
        text: "A write acknowledged by an asynchronously replicated leader is a promise the system may not keep. Decide explicitly whether your application can tolerate that before choosing asynchronous replication for its speed."
      },
      systems: ["PostgreSQL", "MySQL", "Oracle Data Guard", "SQL Server AlwaysOn Availability Groups", "MongoDB", "RethinkDB", "Espresso", "Kafka", "RabbitMQ", "DRBD", "Microsoft Azure Storage"]
    },
    {
      id: "setting-up-new-followers",
      title: "Setting Up New Followers",
      body: [
        "You add followers to grow read capacity or to replace a node that died. Simply copying the leader's data files does not produce a valid replica: writes keep arriving during the copy, so each file reflects a different instant and the combination may be nonsense. Locking the database for the duration would make the copy consistent, but blocking writes defeats the goal of staying available.",
        "The standard recipe avoids downtime in four steps. First, capture a point-in-time snapshot of the leader's data, ideally without a global lock; databases already need this capability for backups, though MySQL may need an external tool such as `innobackupex` from Percona XtraBackup. Second, transfer the snapshot to the new node. Third, the new follower opens a replication connection to the leader and asks for every change made after the snapshot was taken. This step only works if the snapshot is labeled with an exact offset in the replication log: PostgreSQL's name for that offset is the log sequence number, MySQL's is the binlog coordinates. Fourth, once the follower has worked through that backlog it is caught up and simply keeps consuming the live change stream.",
        "How much of this is automated varies enormously. Some systems do it with one command; others leave an administrator to perform a fragile multi-step procedure by hand."
      ],
      keyPoints: [
        "A plain file copy captures a moving target and yields an internally inconsistent replica.",
        "Consistent snapshot plus 'replay everything after log position X' builds a correct follower without blocking writes.",
        "The snapshot must record its exact log position; otherwise the follower cannot know where replay should begin.",
        "The same snapshot-and-log mechanism underlies backups and point-in-time recovery."
      ],
      systems: ["MySQL", "PostgreSQL", "Percona XtraBackup"]
    },
    {
      id: "handling-node-outages",
      title: "Handling Node Outages: Catch-up Recovery and Failover",
      body: [
        "Nodes go down because of crashes and, at least as often, because of planned work such as kernel patches. The goal is for the service to keep running while individual nodes restart. A follower failure is the easy case. Each follower keeps a local log of the changes it has received, so after a crash or a network interruption it knows the last transaction it processed. It reconnects to the leader, asks for everything after that point, applies it, and resumes streaming. This is **catch-up recovery**.",
        "A leader failure requires **failover**: promote a follower, redirect client writes to it, and make the remaining followers consume from it. Automatic failover usually proceeds in three steps. Detect the failure, typically by a timeout: nodes exchange heartbeats and a leader that stays silent for, say, 30 seconds is presumed dead. Choose a successor, either by an election among the surviving replicas or by appointment from a controller node; the best candidate is the follower with the most recent data, so that the least is lost. Reaching agreement on who leads is a consensus problem, covered in Chapter 9. Finally reconfigure: clients must direct writes to the new leader, and should the former leader reappear still thinking it is in charge, the system has to demote it into a follower of the new one.",
        "Failover is where leader-based systems break. With asynchronous replication the new leader may lack writes the old leader had acknowledged; when the old leader rejoins, its unreplicated writes are usually discarded, violating the durability clients assumed. Discarding writes is especially harmful when other systems depend on the database's state. In a well-known GitHub outage a lagging MySQL follower was promoted; its autoincrement counter was behind the old leader's, so it reissued primary keys that were already in use, and because a Redis store also referenced those keys, some users were shown other people's private data. **Split brain**, where two nodes both act as leader, can lose or corrupt data unless conflicts are handled; fencing mechanisms (STONITH) shut one node down, but a careless design can take down both. The detection timeout is a genuine dilemma: a long timeout means slow recovery, while a short one triggers needless failovers during load spikes or network glitches, adding churn precisely when the system is weakest.",
        "None of these problems has a clean solution, which is why some operations teams keep failover a manual, human-approved step even when the software could do it automatically. Node failures, unreliable networks, and the tension between consistency, durability, availability, and latency are fundamental to distributed systems and are examined in depth in Chapters 8 and 9."
      ],
      keyPoints: [
        "Follower recovery is local and simple: resume the replication stream from the last applied log position.",
        "Failover means detecting leader death, choosing a successor, rerouting writes, and forcing the old leader to step down.",
        "Asynchronous replication plus failover can discard acknowledged writes; this is the main durability hole in leader-based systems.",
        "Reissued autoincrement IDs after failover corrupt any external system that stored those IDs.",
        "Split brain needs fencing; the failure-detection timeout trades recovery speed against false positives.",
        "Manual failover remains a legitimate operational choice."
      ],
      callout: {
        kind: "pitfall",
        text: "Promoting a stale follower does not merely lose a few rows. If the new leader reuses identifiers the old leader already handed out, every downstream system that stored those IDs (caches, queues, other databases) silently becomes inconsistent."
      },
      systems: ["GitHub", "MySQL", "Redis"]
    },
    {
      id: "replication-logs",
      title: "Implementation of Replication Logs",
      body: [
        "**Statement-based replication** ships the text of each write statement (`INSERT`, `UPDATE`, `DELETE`) and followers re-execute it as if a client had sent it. It is compact but fragile. Nondeterministic functions such as `NOW()` or `RAND()` evaluate differently on each node. Statements that depend on existing state, including autoincrement columns and `UPDATE ... WHERE` conditions, only produce identical effects if every replica executes them in exactly the same order, which constrains concurrency. Triggers, stored procedures, and user-defined functions may cause divergent side effects. A leader can mitigate some of this by substituting concrete values for nondeterministic calls before logging, but the edge cases keep multiplying. MySQL used this mode before version 5.1 and now switches to row-based logging whenever a statement is nondeterministic. VoltDB still relies on statement shipping, but it closes the loophole by insisting that every transaction be fully deterministic.",
        "**Write-ahead log (WAL) shipping** reuses the storage engine's own append-only log, whether that is the WAL that protects a B-tree or the segment log of an LSM-tree engine, and streams those same bytes to followers, which rebuild identical on-disk structures. PostgreSQL and Oracle take this route. The drawback is that the log speaks in terms of disk blocks and byte offsets, so it is welded to a specific storage-engine version. Leader and followers usually must run the same software, which rules out the zero-downtime upgrade technique of upgrading the followers first and then failing over to one of them.",
        "**Logical (row-based) replication** uses a separate log format that describes changes at the row level, independent of storage internals: all column values for an inserted row, enough information to identify a deleted row (the primary key, or all old column values if there is none), and a row identifier plus the new values for an update, with a commit record closing each transaction. MySQL's binlog in row mode is the canonical example. Because the format is decoupled from the engine, it can stay backward compatible, letting leader and followers run different versions or even different storage engines. It is also easy for outside consumers such as data warehouses, search indexes, and caches to parse, which is the foundation of change data capture, discussed in Chapter 11.",
        "**Trigger-based replication** moves the work into application space. Database triggers record each change into a side table; an external process reads that table and forwards the changes wherever they need to go, applying arbitrary logic on the way. Databus for Oracle and Bucardo for PostgreSQL work this way, while Oracle GoldenGate reads the database log directly. It costs more and breaks more often than built-in replication, but it is the option when you need to replicate only part of the data, bridge two different database products, or inject custom conflict resolution."
      ],
      keyPoints: [
        "Statement-based: smallest log, but nondeterminism and order dependence make it unsafe without extra care.",
        "WAL shipping: exact physical copy, but couples replication to one storage-engine version and prevents rolling upgrades.",
        "Logical (row-based): version-tolerant, engine-independent, and parseable by external systems (change data capture).",
        "Trigger-based: maximum flexibility (filtering, cross-database, custom logic) at the cost of overhead and fragility.",
        "Rolling upgrades require that a newer follower can consume the log of an older leader."
      ],
      table: {
        caption: "Four ways to implement a replication log",
        columns: ["Method", "What is shipped", "Main strength", "Main weakness", "Examples"],
        rows: [
          ["Statement-based", "Text of each write statement", "Compact", "Nondeterministic functions, order dependence, side effects", "MySQL before 5.1; VoltDB with deterministic transactions"],
          ["WAL shipping", "Physical log of changed bytes in disk blocks", "Exact replica from a log that already exists", "Tied to storage-engine version; no rolling upgrades", "PostgreSQL, Oracle"],
          ["Logical (row-based)", "Row-level change records plus commit markers", "Backward compatible, engine-independent, externally parseable", "A second log format to maintain", "MySQL binlog in row mode"],
          ["Trigger-based", "Changes captured by triggers into a side table", "Arbitrary application logic; partial or cross-database replication", "Higher overhead, more bugs", "Databus, Bucardo, Oracle GoldenGate"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "If your replication log is the physical WAL, a storage-format change between versions forces downtime: you cannot upgrade followers ahead of the leader and then fail over. Logical logs avoid this trap."
      },
      systems: ["MySQL", "VoltDB", "PostgreSQL", "Oracle", "Oracle GoldenGate", "Databus", "Bucardo"]
    },
    {
      id: "replication-lag-and-read-your-writes",
      title: "Problems with Replication Lag and Reading Your Own Writes",
      body: [
        "Read-heavy web workloads invite a read-scaling architecture: one leader, many followers, and reads spread across followers near the users. This only works with asynchronous replication. Synchronous replication to dozens of followers would stall whenever any one of them hiccupped, and more nodes means more hiccups. The price is that a follower may serve data the leader has already changed. Issue an identical query to the leader and to a follower simultaneously and the two answers can differ, because some writes have not arrived at the follower yet. The discrepancy heals once writes stop, hence the name **eventual consistency**, a term coined by Terry and colleagues and popularized by Werner Vogels. But 'eventually' has no bound. Replication lag is often milliseconds, yet under load or network trouble it stretches to seconds or minutes, and then applications misbehave in ways users can see.",
        "The first anomaly: a user submits data, reloads the page, and the data is missing because the read hit a follower that has not yet received the write. From where the user sits, the save apparently failed. The guarantee that rules this out is **read-after-write consistency**, also called read-your-writes: a user always sees their own writes. It promises nothing about other users' writes, which may remain invisible for a while.",
        "Several techniques provide it under a single leader. Route reads of anything the user could have modified to the leader. On a social network, for instance, only the owner can edit a profile, so the viewer's own profile is fetched from the leader while other people's profiles come from followers. If most data is editable by the user, use time instead: for one minute after a user's last write send all their reads to the leader, or measure each follower's lag and take any follower lagging by over a minute out of the read pool. More precisely, the client can remember the position of its latest write (a log sequence number, or a timestamp) and the system serves the read only from a replica that has reached that position, waiting or redirecting otherwise. If the position is a wall-clock timestamp, clock synchronization becomes critical (Chapter 8). With replicas in several datacenters, any read that must hit the leader also has to be routed to the leader's datacenter.",
        "Cross-device read-after-write is harder still: a user who writes on a phone and reads on a laptop expects to see the write. Per-device memory of the last write position no longer works, so that metadata has to be stored centrally. And because different devices may be routed to different datacenters (home broadband versus a cellular network), you may have to force every device belonging to one user into a single datacenter before a read-from-leader strategy can work."
      ],
      keyPoints: [
        "Read scaling with many followers is only feasible with asynchronous replication, which guarantees some staleness.",
        "Eventual consistency promises convergence but sets no limit on how stale a follower may be.",
        "Read-after-write consistency covers only the user's own writes, which is usually where users notice problems.",
        "Implementation options: read-from-leader rules, a time window after a write, or tracking the write's log position and demanding a sufficiently caught-up replica.",
        "Multiple devices per user require centralized last-write tracking and consistent datacenter routing."
      ],
      callout: {
        kind: "example",
        text: "A social network can serve any profile page from a follower except the viewer's own page, which it reads from the leader. Only the owner can edit a profile, so this single rule provides read-after-write consistency exactly where users would notice its absence."
      }
    },
    {
      id: "monotonic-reads-and-consistent-prefix",
      title: "Monotonic Reads, Consistent Prefix Reads, and Why Transactions Exist",
      body: [
        "The second anomaly is time running backward. A user refreshes a page twice. The first request reaches a nearly current follower and shows a fresh comment; the second reaches a lagging follower and the comment has vanished. **Monotonic reads** forbids this: once a user has observed a given state, later reads never show an earlier state. It is weaker than strong consistency but stronger than eventual consistency. A cheap implementation routes each user to a fixed replica, for instance chosen by hashing the user ID, with a fallback when that replica fails.",
        "The third anomaly violates causality. Think of a question and its answer, written in that order. If the answer lands on a partition that replicates quickly and the question on one that replicates slowly, an observer reading through followers sees the reply before the question it responds to. **Consistent prefix reads** guarantees that if writes happened in a certain order, anyone reading them sees them in that order. A single leader that applies every write in one sequence provides this automatically. The problem arises in partitioned databases, where each partition orders its own writes independently and there is no global order (Chapter 6). Mitigations include writing causally related data to the same partition, or using algorithms that track causal dependencies explicitly, which this chapter returns to under the happens-before relation.",
        "How should you think about lag in general? Ask what happens if it reaches minutes or hours. If the honest answer is 'nothing bad', fine. If users would be harmed, design for a stronger guarantee rather than pretending asynchronous replication is synchronous. Application-level workarounds are possible, but they are intricate and easy to get wrong. Transactions exist precisely so that the database, rather than every application, carries this burden. Many distributed databases abandoned transactions, arguing that they cost too much performance and availability and that eventual consistency is unavoidable at scale. The book treats that claim as too simple and develops a more nuanced position in Chapters 7 and 9 and in Part III."
      ],
      keyPoints: [
        "Monotonic reads: no going back in time for one user; pin each user to a replica to get it cheaply.",
        "Consistent prefix reads: causally ordered writes appear in causal order; hard in partitioned systems without a global write order.",
        "Each guarantee is weaker than strong consistency but prevents one specific, user-visible anomaly.",
        "Plan explicitly for pathological lag; do not assume it stays small.",
        "Pushing consistency logic into application code works but is fragile; transactions move that responsibility into the database."
      ],
      table: {
        caption: "Three replication-lag anomalies and the guarantees that prevent them",
        columns: ["What the user experiences", "Guarantee", "Scope", "Typical implementation"],
        rows: [
          ["My own update seems lost after I reload", "Read-after-write (read-your-writes)", "One user's own writes", "Read possibly-modified data from the leader; track last-write log position; time window after writes"],
          ["Data I just saw disappears on the next refresh", "Monotonic reads", "One user's sequence of reads", "Route each user to the same replica, e.g. by hashing the user ID"],
          ["I see the reply before the question", "Consistent prefix reads", "Causally related writes, possibly across partitions", "Keep causally related writes in one partition; track causal dependencies"]
        ]
      },
      callout: {
        kind: "example",
        text: "Picture two people talking, where the second line answers the first. If each speaker's words flow through a different follower with different lag, a listener on the slow path hears the answer before the question. That is a consistent-prefix violation."
      }
    },
    {
      id: "multi-leader-use-cases",
      title: "Multi-Leader Replication and Its Use Cases",
      body: [
        "Single-leader replication has one choke point: every write must reach the leader (each partition has exactly one), so a client that cannot connect to it cannot write at all. **Multi-leader replication**, also called master–master or active/active, lets several nodes accept writes. Each leader forwards its changes to every other leader and simultaneously acts as a follower for theirs. Within a single datacenter the added complexity rarely pays off, but three situations justify it.",
        "Multi-datacenter deployment. With one leader, every write crosses the internet to the leader's datacenter, adding latency that undermines the reason for having several datacenters. With a leader in each datacenter, writes commit locally and replicate asynchronously to the others, hiding the inter-datacenter delay from users. Each datacenter also keeps operating on its own if another datacenter fails or the link between them drops, whereas a single-leader setup needs a failover for a datacenter outage and stalls writes whenever the link misbehaves. Tungsten Replicator for MySQL, BDR for PostgreSQL, and GoldenGate for Oracle implement this externally. The costs are write conflicts between datacenters and awkward interactions with features built for a single leader: autoincrement keys, triggers, and integrity constraints. Many practitioners regard multi-leader as dangerous territory to avoid unless truly needed.",
        "Clients that work offline. A calendar app on a phone, a laptop, and a tablet must accept new events with no connectivity and synchronize later. Each device's local database is a leader, and the sync process is asynchronous multi-leader replication with lag measured in hours or days. Architecturally this is multi-datacenter replication taken to an extreme, with each device a tiny datacenter behind an extremely unreliable link. The long history of broken calendar sync shows how hard it is to get right; CouchDB is one database built specifically around this offline-first style of operation.",
        "Collaborative editing. Google Docs and Etherpad apply a user's edits to their local copy instantly and propagate them asynchronously to the server and other editors. You could avoid conflicts entirely by locking the document for one editor at a time, but that is just single-leader replication with transactions. Making the unit of change a single keystroke and dropping locks gives fast collaboration and brings every multi-leader conflict problem with it."
      ],
      keyPoints: [
        "Multi-leader removes the single write path, so writes survive link failures and avoid cross-datacenter round trips.",
        "Each leader is simultaneously a follower of the others; replication between leaders is asynchronous.",
        "Three sanctioned use cases: geographically separate datacenters, devices that must work offline, and real-time collaborative editing.",
        "Conflicts are inherent, and features that assume one leader (autoincrement, triggers, constraints) misbehave.",
        "Often retrofitted via external tools (Tungsten Replicator, BDR, GoldenGate) rather than supported natively."
      ],
      table: {
        caption: "Single-leader versus multi-leader across several datacenters",
        columns: ["Concern", "Single leader", "One leader per datacenter"],
        rows: [
          ["Write latency", "Every write travels to the leader's datacenter", "Writes commit locally; replication to other datacenters is asynchronous"],
          ["Datacenter outage", "Failover must promote a follower elsewhere", "Remaining datacenters keep accepting writes; the failed one catches up on return"],
          ["Inter-datacenter link failure", "Writes stall because the synchronous path crosses the link", "Local writes continue; changes queue until the link returns"],
          ["Write conflicts", "Impossible: one node orders all writes", "Possible whenever two datacenters modify the same data concurrently"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "A table whose primary key is an autoincrement counter will generate colliding keys on two leaders. Multi-leader setups need globally unique identifiers (UUIDs or per-leader ranges) before anything else."
      },
      systems: ["Tungsten Replicator", "BDR", "Oracle GoldenGate", "CouchDB", "Etherpad", "Google Docs"]
    },
    {
      id: "handling-write-conflicts",
      title: "Handling Write Conflicts",
      body: [
        "Two users in two datacenters change the title of the same wiki page at the same moment, one to B and the other to C. Each local leader accepts its write; the conflict only surfaces later when the changes cross. A single-leader database would have made the second writer wait or abort. Here both succeed, and by the time the asynchronous replication stream exposes the clash, the users have long since moved on and cannot be consulted. You could make detection synchronous by waiting for every replica before acknowledging, but that forfeits the independence that motivated multiple leaders in the first place; you might as well use a single leader.",
        "Avoidance is the most pragmatic strategy: route all writes for a given record through one leader, for example by assigning each user a home datacenter based on location. As far as that individual user can tell, the system behaves like a single-leader database. Avoidance breaks down when the home has to change, say after a datacenter failure or when a user moves, and at that moment concurrent writes on different leaders become possible again.",
        "When conflicts do occur, every replica must still converge on the same final value. Options: stamp every write with a unique identifier (timestamp, random number, UUID, or hash) and keep the highest, which is **last write wins** when the identifier is a timestamp; or let writes from a higher-numbered replica always beat those from a lower-numbered one. Both converge by discarding data. Alternatively merge the values somehow (for instance concatenate them as B/C), or preserve the conflict as a first-class data structure holding every version and let application code resolve it later, perhaps by asking a user.",
        "Most tools let you supply custom resolution code. It can run on write, as soon as the replication log reveals the conflict; such a handler executes in the background, must be quick, and cannot prompt a user (Bucardo accepts a Perl snippet for this). Or it can run on read: conflicting versions are stored and all handed to the application on the next read, which resolves them and writes the result back (CouchDB works this way). Resolution applies per row or document, not per transaction, so a transaction that wrote several rows may be resolved piecewise. Hand-written rules are error-prone: Amazon's shopping-cart handler for a time preserved additions but not removals, so deleted items reappeared. Research offers automatic alternatives: **CRDTs** (counters, sets, maps, and lists that merge deterministically using two-way merges; available in Riak 2.0), mergeable persistent data structures (Git-like explicit history with three-way merges), and **operational transformation** (the algorithm behind Etherpad and Google Docs, designed for concurrent edits to ordered sequences such as the characters of a document). Finally, not every conflict is two writes to one field. In a meeting-room booking system, two leaders can each accept a booking that is valid on its own but together double-book the room, even though each checked availability first. Chapters 7 and 12 return to this kind of conflict."
      ],
      keyPoints: [
        "Multi-leader conflicts are detected after both writes were acknowledged, so a human cannot easily be consulted.",
        "Best strategy: avoid conflicts by giving each record a single home leader; resolve only when homes must move.",
        "Convergence is mandatory; LWW and replica-priority rules converge by throwing writes away.",
        "Custom handlers run on write (fast, background) or on read (application sees all versions); resolution is per row or document, not per transaction.",
        "CRDTs, mergeable persistent structures, and operational transformation automate merging for specific data types.",
        "Some conflicts are application invariants (no double bookings) that are invisible at the level of individual rows."
      ],
      callout: {
        kind: "example",
        text: "Amazon's shopping cart merged conflicting versions by keeping anything present in either copy. That rule can never represent a removal, so customers found items they had deleted creeping back into their carts."
      },
      systems: ["Bucardo", "CouchDB", "Riak", "Etherpad", "Google Docs", "Amazon Dynamo"]
    },
    {
      id: "multi-leader-topologies",
      title: "Multi-Leader Replication Topologies",
      body: [
        "A topology is the set of paths along which writes travel between leaders. Two leaders have only one option: send everything to each other. With more leaders you can choose all-to-all (every leader sends to every other), circular (each node receives from one neighbor and forwards those writes, plus its own, to the next; MySQL supports only this shape by default), or star (one root forwards to all others, which generalizes to a tree).",
        "In ring and star shapes a write hops through intermediate nodes, so nodes must forward changes they did not originate. To stop a change circulating forever, every node has a unique identifier and each write carries the list of nodes it has already visited; a node drops any write stamped with its own identifier. The shared weakness of ring and star layouts is that one failed node severs the flow between the others until someone reconfigures the topology, which is usually a manual job. All-to-all tolerates node failure better because messages have alternative routes.",
        "All-to-all has its own hazard: links differ in speed, so messages can overtake one another. Client A inserts a row at leader 1, client B updates that row at leader 3, and leader 2 receives the update before the insert, an update to a row it does not yet have. This is a causality problem of the same shape as consistent prefix reads. Attaching timestamps does not fix it, because clocks on different leaders are not synchronized well enough to order the events (Chapter 8); version vectors, covered under detecting concurrent writes, can. Many products are weak here: PostgreSQL BDR did not provide causal ordering, and Tungsten Replicator did not attempt to detect conflicts at all. Read the documentation closely and test the guarantees yourself rather than assuming them."
      ],
      keyPoints: [
        "Options: all-to-all, circular (MySQL's default), star or tree.",
        "Forwarding topologies tag each write with the identifiers of visited nodes to avoid infinite loops.",
        "Ring and star: one dead node breaks the replication flow; all-to-all: more fault tolerant.",
        "All-to-all: messages can arrive out of causal order (update before insert); timestamps are not a fix, version vectors are.",
        "Conflict detection quality varies wildly across multi-leader products; verify rather than trust."
      ],
      callout: {
        kind: "insight",
        text: "Topology is a fault-tolerance decision. Sparse shapes are simple but have single points of failure; dense shapes survive node loss but expose you to reordering, which only causal tracking can repair."
      },
      systems: ["MySQL", "PostgreSQL BDR", "Tungsten Replicator"]
    },
    {
      id: "leaderless-basics",
      title: "Leaderless Replication: Writing When a Node Is Down",
      body: [
        "Both previous designs funnel every write through a leader that fixes the order. Leaderless systems drop the leader entirely: any replica accepts writes, either directly from clients or through a coordinator node that does not impose an ordering. The idea goes back to the earliest replicated systems, faded during the relational era, and became fashionable again after Amazon published its internal Dynamo design. The open-source stores Riak, Cassandra, and Voldemort descend from that design, hence the label **Dynamo-style**. (AWS's DynamoDB is a different, single-leader architecture despite the name.)",
        "Suppose three replicas, one of which is rebooting. A leader-based system might need a failover to keep accepting writes. In a leaderless system there is no failover. The client fires the same write at all three replicas at once; two of them acknowledge, and if two acknowledgments is the configured threshold the write counts as successful, with the client simply shrugging off the silent third node. The missed write is absent from that node, so when it comes back it will answer reads with stale data. The remedy is to read from several nodes in parallel as well; version numbers attached to the values tell the client which response is newest.",
        "Two mechanisms bring lagging replicas back in line. **Read repair**: when a parallel read returns differing versions, the client pushes the freshest one to whichever replicas answered with outdated data, which keeps frequently read keys fresh. **Anti-entropy**: a background process compares replicas and copies missing data, in no particular order and possibly with a long delay. Not every system has both; Voldemort lacked anti-entropy. Without it, keys that are rarely read may stay missing from some replicas indefinitely, which quietly reduces their durability."
      ],
      keyPoints: [
        "No leader means no write ordering and no failover; a write succeeds when enough replicas acknowledge it.",
        "Clients (or a coordinator) send each write and each read to several replicas in parallel.",
        "Version numbers let a reader pick the newest among differing responses.",
        "Read repair fixes stale copies of hot keys on the read path; anti-entropy fixes everything else in the background.",
        "Read repair alone leaves cold keys under-replicated."
      ],
      callout: {
        kind: "pitfall",
        text: "If your leaderless store only performs read repair, a value written once and never read again may exist on fewer replicas than you believe. Durability of cold data depends on anti-entropy."
      },
      systems: ["Amazon Dynamo", "Riak", "Cassandra", "Voldemort"]
    },
    {
      id: "quorums",
      title: "Quorums for Reading and Writing, and Their Limits",
      body: [
        "Generalize the example: `n` replicas hold each value, a write needs `w` acknowledgments, and a read queries `r` replicas. If `w + r > n`, the set of nodes written and the set of nodes read must overlap in at least one node, so at least one read response carries the latest write. Dynamo-style stores make these parameters configurable. The usual choice is an odd `n` (3 or 5) with both `w` and `r` set to a bare majority, so 2 of 3 or 3 of 5, which lets one or two nodes respectively be unavailable. A read-heavy workload might instead pick `w = n, r = 1` for fast reads, at the price that a single dead node blocks all writes. Requests normally go to all `n` replicas; `w` and `r` only determine how many responses to wait for. If fewer than `w` or `r` nodes respond, the operation returns an error, regardless of why nodes were unreachable (crash, full disk, network). A cluster may hold many more than `n` nodes; each key lives on only `n` of them, which is what makes partitioning possible (Chapter 6).",
        "Quorums need not be majorities. All that matters is that the read set and write set intersect, which gives algorithm designers flexibility (research such as Flexible Paxos exploits this). You may also deliberately set `w + r ≤ n` to gain lower latency and higher availability during network interruptions, accepting a higher chance of stale reads.",
        "Even with `w + r > n`, stale reads can slip through. A sloppy quorum can place the `w` writes on nodes outside the read set. Concurrent writes have no defined order and must be merged; picking a winner by timestamp (LWW) loses data under clock skew. A read that overlaps a write in time may see the new value on some replicas and not others, with an undefined outcome. A write that succeeded on fewer than `w` nodes is reported as failed but is not rolled back, so later reads may or may not return it. A node restored from a replica holding an old value can push the number of copies of the new value below `w`. And timing edge cases exist even when everything works, as the discussion of linearizability and quorums in Chapter 9 shows. Treat `w` and `r` as knobs on the probability of staleness, not as guarantees. In particular, Dynamo-style systems generally do not deliver read-after-write, monotonic reads, or consistent prefix reads; stronger guarantees need transactions or consensus.",
        "Staleness should be monitored either way. With a leader, lag is the leader's log position minus the follower's, an easy metric to export because both apply writes in the same order. Without a leader there is no fixed order to measure against, and if a system relies solely on read repair a rarely read key can be arbitrarily old. Research such as PBS predicts the fraction of stale reads from `n`, `w`, and `r`, but quantifying how long 'eventual' really is remains uncommon in practice despite being essential for operations."
      ],
      keyPoints: [
        "Quorum condition `w + r > n` guarantees read/write overlap under ideal conditions.",
        "Common settings: n = 3 with w = r = 2 (tolerates one failure); n = 5 with w = r = 3 (tolerates two).",
        "With w < n writes stay available when a node is down; with r < n the same holds for reads.",
        "Stale reads remain possible: sloppy quorums, concurrent writes, partially failed writes, restores from stale replicas, timing races.",
        "Leaderless systems do not provide the session guarantees discussed under replication lag.",
        "Lag is easy to measure with a leader (log position difference) and hard without one."
      ],
      table: {
        caption: "Quorum configurations and what they trade",
        columns: ["Configuration", "Unavailable nodes tolerated", "Effect on reads", "Effect on writes"],
        rows: [
          ["n = 3, w = 2, r = 2", "1", "Wait for 2 of 3; overlap with latest write guaranteed", "Succeed with 2 of 3 acknowledgments"],
          ["n = 5, w = 3, r = 3", "2", "Wait for 3 of 5", "Succeed with 3 of 5 acknowledgments"],
          ["w = n, r = 1", "0 for writes, n − 1 for reads", "Fastest reads; any single replica suffices", "One dead node blocks all writes"],
          ["w + r ≤ n", "More, at the cost of correctness", "Higher chance of stale values", "Higher availability and lower latency during partitions"]
        ]
      },
      callout: {
        kind: "insight",
        text: "The overlap argument assumes the same n nodes serve both the write and the read, that writes are all-or-nothing across replicas, and that nothing restores old data. Every real-world violation of those assumptions is a way to read a stale value despite w + r > n."
      },
      systems: ["Riak", "Cassandra", "Voldemort"]
    },
    {
      id: "sloppy-quorums-and-multi-dc",
      title: "Sloppy Quorums, Hinted Handoff, and Multi-Datacenter Operation",
      body: [
        "Well-tuned quorums survive single-node failures and slow nodes without any failover, because a request completes as soon as `w` or `r` nodes answer rather than all `n`. That makes leaderless stores attractive for workloads needing high availability and low latency that can tolerate the occasional stale read. But a network interruption can leave a client able to reach many nodes, just not the particular `n` home nodes of a key. Designers then face a choice: return errors for every request that cannot assemble a quorum from the home nodes, or accept the write anyway on reachable nodes that are not normally responsible for that key. The second option is a **sloppy quorum**: `w` and `r` acknowledgments are still required, but they may come from nodes outside the key's home set. When the interruption ends, the stand-in nodes forward the writes they held to the proper home nodes, a process called **hinted handoff**.",
        "Sloppy quorums raise write availability, since any `w` live nodes suffice, but they break the overlap argument: the newest value may sit on nodes no reader consults, so `w + r > n` no longer implies a fresh read. A sloppy quorum is therefore a durability assurance (the value is on `w` nodes somewhere), not a consistency guarantee, until handoff completes. All common Dynamo implementations make it optional: Riak enables sloppy quorums by default, while Cassandra and Voldemort disable them by default.",
        "Leaderless designs also suit multi-datacenter deployments, since they already expect conflicting writes, partitions, and latency spikes. Cassandra and Voldemort fold datacenters into the normal model: `n` counts replicas across all datacenters, the configuration says how many live in each, every write is sent to all replicas, but the client waits only for a quorum within its local datacenter, so remote delays do not affect latency; the cross-datacenter writes typically complete asynchronously. Riak takes the opposite approach: clients only ever talk to nodes in their own datacenter, `n` is scoped to that datacenter, and a separate background process copies data between clusters asynchronously, which makes the cross-datacenter layer look much like multi-leader replication."
      ],
      keyPoints: [
        "Sloppy quorum: accept w or r responses from non-home nodes during a partition; hinted handoff later moves the data home.",
        "Gain: writes stay available; loss: reads may miss the newest value even when w + r > n.",
        "Defaults differ: enabled in Riak, disabled in Cassandra and Voldemort.",
        "Cassandra and Voldemort use a global n with a local-datacenter quorum for latency; Riak uses a per-datacenter n plus asynchronous cross-cluster replication."
      ],
      callout: {
        kind: "insight",
        text: "Think of a sloppy quorum as a promise about where data will eventually be, not about what a read will return right now. If you need read-your-writes behavior, disable it or route around it."
      },
      systems: ["Riak", "Cassandra", "Voldemort"]
    },
    {
      id: "detecting-concurrent-writes",
      title: "Detecting Concurrent Writes: LWW, Happens-Before, and Version Vectors",
      body: [
        "In Dynamo-style stores several clients may write the same key at once, so conflicts arise even with strict quorums, and they can also be introduced by read repair and hinted handoff. Picture clients A and B writing key X to three nodes: node 1 receives only A's write, node 2 receives A then B, and node 3 receives B then A. If each node simply keeps the last write it saw, the replicas disagree permanently. Convergence requires a rule, and most databases implement this so poorly that you must understand the mechanism yourself to avoid losing data.",
        "**Last write wins (LWW)** attaches a timestamp to each write, keeps the largest, and discards the rest. Replicas converge, but concurrent writes that were all acknowledged are silently dropped, and because clocks drift LWW can even discard writes that were not concurrent at all (Chapter 8). It is the only conflict-resolution method in Cassandra and an option in Riak. It is acceptable for caches and for keys that are written exactly once and never updated; Cassandra recommends UUID keys partly for this reason. For anything else it is a data-loss policy.",
        "The right notion of concurrency is the **happens-before** relation. Operation A happens before B if B knew about A, depended on it, or built on it in some way. Concurrency is simply the absence of that relation in both directions: each operation was issued in ignorance of the other. For any pair exactly one of three relations holds: A before B, B before A, or concurrent. Physical time is irrelevant: two operations hours apart are still concurrent if a network outage kept each from seeing the other, much as relativity says events can only influence each other if information had time to travel between them. If one operation happens before the other, the later one should overwrite; if they are concurrent, there is a conflict to resolve.",
        "A single server can detect this with one version number per key. Every write increments the version. When a client reads, the server hands back every value that no later write has superseded, together with the current version number. Clients are obliged to read a key before writing it, to merge every value that read returned, and to attach the version from that read to the write. On receiving a write tagged with version v, the server overwrites every value with version at most v (the client has seen and merged them) and keeps any value with a higher version as a concurrent **sibling** (Riak's term). A write with no version is concurrent with everything and overwrites nothing. A short trace shows the protocol at work. Two friends build a shared playlist. Alice adds song P; the server stores [P] as version 1. Bob, who has not read yet, adds Q with no version; the server now holds [P] at v1 and [Q] at v2 and returns both to Bob. Alice, still holding v1, adds R and sends [P, R] with v1; the server replaces [P] but keeps [Q], because v2 is newer than what Alice saw. Bob merges what he received and adds S, sending [P, Q, S] with v2; that replaces [Q] but not Alice's [P, R] at v3. Nothing is lost, but each client keeps receiving two siblings to merge. Merging is application work. For a list or cart the union of items is natural, but a union cannot express removal, so a deletion must leave a **tombstone** with a version number so that merges respect it. Riak's CRDT data types automate such merges, including deletions.",
        "With several leaderless replicas a single counter is insufficient, because writes arrive at different replicas concurrently. Each replica keeps its own counter per key and records the counters it has seen from every other replica. This collection is a **version vector**; Riak 2.0 uses the dotted version vector variant and hands it to clients as an opaque causal context. Clients receive it on read and return it on write, which lets the database distinguish overwrites from concurrent writes even if a client reads from one replica and writes to another. Siblings may result, but no data is lost provided they are merged correctly. Version vectors are often conflated with vector clocks, but the two differ in subtle ways; when the job is deciding whether one replica's state supersedes another's, the version vector is the appropriate tool."
      ],
      keyPoints: [
        "Without a leader, replicas can receive the same writes in different orders; a convergence rule is mandatory.",
        "LWW converges by discarding writes, including acknowledged ones; it is safe only for immutable or cache-like data.",
        "Concurrent means neither operation knew about the other; wall-clock overlap is irrelevant.",
        "Per-key version numbers plus read-before-write and merge-on-write distinguish overwrite from concurrency without inspecting the values.",
        "Merging siblings needs tombstones for deletions; CRDTs can automate the merge.",
        "Version vectors extend the scheme to many replicas and travel with reads and writes as causal context."
      ],
      callout: {
        kind: "pitfall",
        text: "A write that arrives without the version (or version vector) from a prior read cannot overwrite anything. It is treated as concurrent with every existing value and simply adds another sibling, so clients that skip the read step accumulate conflicts instead of resolving them."
      },
      systems: ["Cassandra", "Riak", "Amazon Dynamo"]
    },
    {
      id: "chapter-summary",
      title: "Summary: Choosing Among Three Replication Models",
      body: [
        "Replication serves four purposes: staying up when machines or whole datacenters fail, continuing to work while disconnected, cutting latency by placing data near users, and scaling read throughput beyond one machine. The goal sounds modest, but doing it correctly demands careful thinking about concurrency and about every way nodes and networks can fail, and that is before considering subtler faults such as silent corruption from software bugs.",
        "Single-leader replication is the easiest to reason about and has no write conflicts, because one node orders every write; its weak points are failover and the staleness of asynchronous followers. Multi-leader and leaderless replication cope better with faulty nodes, partitions, and latency spikes, but they provide only weak consistency and push conflict handling onto the application. Synchronous versus asynchronous is the second axis: asynchronous replication is fast when all is well but loses recently committed data if a lagging follower is promoted.",
        "The chapter's consistency vocabulary (read-after-write, monotonic reads, consistent prefix reads) names the anomalies users actually notice, and the happens-before relation together with version vectors gives a precise tool for separating overwrites from genuine conflicts. Chapter 6 takes up the complementary question: when the data no longer fits on one machine, how do you break it into partitions and spread them around?"
      ],
      keyPoints: [
        "Four reasons to replicate: availability, disconnected operation, latency, and read scalability.",
        "Single-leader: simple and conflict-free, but failover is risky and followers lag.",
        "Multi-leader: local writes across datacenters and offline devices, at the cost of conflict resolution.",
        "Leaderless: no failover and tunable quorums, but only probabilistic freshness and client-side merging.",
        "Always ask what happens under heavy lag and during leader failure before trusting asynchronous replication."
      ],
      table: {
        caption: "The three replication approaches side by side",
        columns: ["Property", "Single-leader", "Multi-leader", "Leaderless"],
        rows: [
          ["Who accepts writes", "One leader (per partition)", "Any of several leaders", "Any replica, often via a coordinator"],
          ["Write ordering", "Total order set by the leader", "No global order; conflicts possible", "No order; concurrency detected with versions"],
          ["Node failure handling", "Follower catch-up; leader failover", "Other leaders continue; the failed one catches up", "Quorum continues; read repair and anti-entropy heal"],
          ["Conflict resolution", "Not needed", "Required: avoidance, LWW, merge, custom code, CRDTs", "Required: LWW or sibling merging with version vectors"],
          ["Typical systems", "PostgreSQL, MySQL, MongoDB, Kafka", "BDR, Tungsten Replicator, CouchDB, GoldenGate", "Dynamo, Riak, Cassandra, Voldemort"],
          ["Best fit", "Most applications; simple, strong semantics", "Multi-datacenter, offline clients, collaborative editing", "High availability and low latency with tolerance for stale reads"]
        ]
      },
      callout: {
        kind: "insight",
        text: "The choice is really about where you put the complexity: in failover (single-leader), in conflict resolution (multi-leader), or in client-side merging and quorum tuning (leaderless)."
      }
    }
  ],
  terms: [
    { term: "Leader-based replication", definition: "A scheme in which one replica (the leader) accepts all writes and streams them in order to followers, which apply them identically and serve reads. Also called active/passive or master–slave." },
    { term: "Semi-synchronous replication", definition: "A configuration with exactly one synchronous follower and the rest asynchronous, guaranteeing that an up-to-date copy exists on at least two nodes without letting any single slow follower block writes." },
    { term: "Failover", definition: "The process of promoting a follower to leader after the leader fails, rerouting client writes to it, and making other followers (and the returning old leader) follow it." },
    { term: "Split brain", definition: "A fault in which two nodes both believe they are the leader and both accept writes, risking lost or corrupted data; fencing (STONITH) is used to shut one of them down." },
    { term: "Replication lag", definition: "The delay between a write being applied on the leader and becoming visible on a follower. Usually sub-second, but unbounded under load, recovery, or network faults." },
    { term: "Eventual consistency", definition: "The guarantee that if writes stop, all replicas will converge to the same state after some unspecified time. It says nothing about how stale a read may be in the meantime." },
    { term: "Read-after-write consistency", definition: "A guarantee that a user always sees the effects of their own previous writes; also called read-your-writes. It makes no promise about seeing other users' writes." },
    { term: "Monotonic reads", definition: "A guarantee that a user who has observed some state will never subsequently observe an older state, so time does not appear to go backward across successive reads." },
    { term: "Consistent prefix reads", definition: "A guarantee that if writes occurred in a certain order, any reader sees them in that same order, preserving causality such as a question appearing before its answer." },
    { term: "Conflict-free replicated data type (CRDT)", definition: "A data structure (set, map, counter, ordered list) designed so that concurrent updates on different replicas can be merged automatically and deterministically, including handling deletions." },
    { term: "Quorum", definition: "With n replicas, a write confirmed by w nodes and a read of r nodes such that w + r > n, ensuring at least one node in the read set holds the latest write." },
    { term: "Sloppy quorum", definition: "A relaxed quorum in which, during a network interruption, writes and reads may be satisfied by reachable nodes outside a key's n home nodes; writes are later moved home via hinted handoff." },
    { term: "Read repair", definition: "A leaderless repair technique in which a client that receives differing responses from parallel reads writes the newest value back to the replicas that returned stale data." },
    { term: "Last write wins (LWW)", definition: "A conflict-resolution rule that keeps the write with the highest timestamp and discards the others. It guarantees convergence but silently loses acknowledged concurrent writes." },
    { term: "Version vector", definition: "A per-key collection of version counters, one per replica, sent to clients on read and returned on write so the database can tell whether a new write supersedes or is concurrent with existing values." }
  ],
  pitfalls: [
    "Believing that w + r > n means every read returns the latest write. It only makes a fresh read likely: sloppy quorums, concurrent writes, partially failed writes, and restores from stale replicas all produce stale reads. Treat the parameters as probability knobs.",
    "Treating last write wins as a harmless default. LWW discards writes the database already acknowledged, and with skewed clocks it can discard writes that were not even concurrent. Use it only for immutable keys or cache-like data.",
    "Assuming eventual consistency means a short, bounded delay. Nothing bounds replication lag; under load, during recovery, or with a network fault it can reach minutes or more. Design for the worst case and monitor lag.",
    "Thinking a shorter failure-detection timeout makes the system more available. Short timeouts fire during load spikes and network glitches, causing unnecessary failovers that add load exactly when the system is weakest.",
    "Thinking two writes are concurrent only if they happen at the same instant. Concurrency means mutual unawareness: writes hours apart are concurrent if neither client saw the other's result, which is why version information, not timestamps, detects it.",
    "Merging conflicting versions by taking their union and assuming it is safe. A union cannot represent a deletion, so removed items reappear. Deletions must leave tombstones that the merge logic honors."
  ],
  connections: [
    { chapter: 3, note: "WAL shipping reuses the B-tree write-ahead log or LSM-tree segment log described there, and the tombstone markers needed for merging deletions are the same idea that log-structured storage uses to record deleted keys during compaction." },
    { chapter: 6, note: "Partitioning is the complement of replication. Consistent prefix reads break down because partitions order writes independently, and a leaderless cluster holds each key on only n of its many nodes, which is what makes partitioning possible." },
    { chapter: 7, note: "Transactions are the database-side answer to replication-lag anomalies. Conflict resolution works per row rather than per transaction, and the meeting-room double booking is an example of the write skew discussed there." },
    { chapter: 8, note: "Failure detection by timeout, clock skew breaking LWW and timestamp ordering, and fencing against split brain are all explored in depth as consequences of unreliable networks and clocks." },
    { chapter: 9, note: "Electing a replacement leader during failover requires consensus, and the discussion of linearizability there explains why even strict quorums fall short of the strongest guarantees." },
    { chapter: 11, note: "Logical replication logs that external systems can parse are the basis of change data capture, used to derive search indexes, caches, and warehouses from a database." }
  ],
  flashcards: [
    { front: "In leader-based replication, what exactly do followers do with the replication log?", back: "They apply every change from the leader in the same order the leader applied it, so their copy converges on the leader's state. Followers serve reads but never accept client writes." },
    { front: "What does semi-synchronous replication guarantee, and how does it cope with a stalled synchronous follower?", back: "One follower is synchronous, so a current copy exists on at least two nodes (leader plus that follower). If the synchronous follower stops responding, an asynchronous follower is switched into the synchronous role." },
    { front: "What is lost when a fully asynchronous leader fails permanently?", back: "Every write that was acknowledged to clients but had not yet reached any follower. Acknowledged writes are therefore not guaranteed to be durable." },
    { front: "Outline the four steps for adding a follower without downtime.", back: "Snapshot the leader's data at a known replication-log position without locking; ship the snapshot to the new node; have the node pull every change recorded after that position; once the backlog is applied it is caught up and keeps streaming." },
    { front: "How does a follower recover after a crash or a network interruption?", back: "Its local log tells it the last change it applied, so it reconnects and asks the leader for everything after that position. This is catch-up recovery." },
    { front: "What are the three steps of automatic failover?", back: "Detect that the leader is dead (usually a heartbeat timeout); choose a new leader by election or appointment, preferring the most up-to-date follower; reconfigure clients and followers to use it while forcing the old leader to step down." },
    { front: "Describe the GitHub failover incident and its root cause.", back: "A lagging MySQL follower was promoted. Its autoincrement counter trailed the old leader's, so it reissued primary keys already in use. Redis stored data under those keys, so records got mixed up and private data was shown to the wrong users." },
    { front: "What is split brain and how do systems guard against it?", back: "Two nodes simultaneously believe they are leader and both accept writes, risking lost or corrupted data. Fencing (STONITH) shuts one down, but a poorly designed mechanism can shut down both." },
    { front: "Why is the failover timeout a trade-off?", back: "A long timeout delays recovery after a real crash. A short one misfires during load spikes or network glitches, causing unnecessary failovers that add stress when the system is already struggling." },
    { front: "Name three ways statement-based replication can diverge between replicas.", back: "Nondeterministic functions like NOW() or RAND(); statements that depend on existing state or autoincrement values and therefore on exact execution order; side effects from triggers, stored procedures, or user-defined functions." },
    { front: "What operational limitation comes with WAL shipping?", back: "The WAL describes byte-level changes to disk blocks, so leader and followers must run the same storage-engine version. You cannot upgrade followers first and fail over, so upgrades need downtime." },
    { front: "What does a logical (row-based) log record for an insert, a delete, and an update?", back: "Insert: new values of all columns. Delete: enough to identify the row (primary key, or all old values if none). Update: row identifier plus new values of changed columns. A commit record ends each transaction." },
    { front: "Define read-after-write consistency and state what it does not promise.", back: "After a user writes, any later read by that same user reflects the write. It says nothing about when other users will see it." },
    { front: "Give two implementation strategies for read-after-write consistency.", back: "Route reads of data the user may have modified to the leader (e.g., their own profile); or have the client remember its last write's log position and serve reads only from replicas that have reached it, waiting or redirecting otherwise." },
    { front: "What anomaly do monotonic reads prevent, and what is a cheap implementation?", back: "Seeing newer data and then older data on a later read, typically from hitting replicas with different lag. Route each user to one fixed replica, for example by hashing the user ID." },
    { front: "Why do consistent-prefix violations occur mainly in partitioned databases?", back: "Each partition applies writes in its own order with no global sequence, so a reader can see an effect in a fast partition before its cause in a slow one. A single leader ordering all writes avoids this." },
    { front: "What is conflict avoidance in multi-leader replication, and when does it fail?", back: "Route all writes to a given record through one leader, such as a user's home datacenter. It fails when the home must change, after a datacenter outage or a user relocating, allowing concurrent writes on different leaders." },
    { front: "Contrast on-write and on-read custom conflict resolution.", back: "On write: a handler runs in the background as soon as the conflict appears in the log; must be fast; cannot ask the user (Bucardo). On read: all versions are stored and returned on the next read for the application to resolve (CouchDB)." },
    { front: "Name three research approaches to automatic conflict resolution.", back: "CRDTs (sets, maps, counters, lists that merge deterministically; in Riak 2.0), mergeable persistent data structures (Git-like history with three-way merge), and operational transformation (Etherpad, Google Docs; concurrent edits to ordered sequences)." },
    { front: "How do circular and star topologies prevent a write from looping forever?", back: "Every node has a unique ID, and each replicated write accumulates the IDs of every node that has forwarded it. When a node sees its own ID already in that list, it knows it has processed the write and drops it." },
    { front: "What causality problem can occur in an all-to-all topology?", back: "Messages can overtake each other on faster links, so one leader may receive an update to a row before the insert that created it. Timestamps cannot fix this because clocks are not synchronized; version vectors can." },
    { front: "State the quorum condition and explain why it works.", back: "With n replicas, w write acknowledgments, and r read responses, require w + r > n. The write set and read set must then share at least one node, so some read response holds the latest write." },
    { front: "Compare read repair and anti-entropy.", back: "Read repair: a client that detects a stale value during a parallel read writes the fresh value back; only helps keys that get read. Anti-entropy: a background process compares replicas and copies missing data, in no particular order, possibly with large delay." },
    { front: "List four situations where a read can be stale despite w + r > n.", back: "Sloppy quorums writing to non-home nodes; concurrent writes with no defined order; a write that succeeded on fewer than w nodes and was not rolled back; a node restored from a stale replica reducing the up-to-date copies below w." },
    { front: "What is a sloppy quorum and what does hinted handoff do?", back: "During a partition, writes are accepted on any w reachable nodes, even outside the key's n home nodes. When the partition heals, those nodes forward the writes to the home nodes (hinted handoff). Durability is kept; read freshness is not." },
    { front: "When is last write wins an acceptable conflict-resolution choice?", back: "When losing writes is tolerable (caches) or when each key is written once and then immutable, such as Cassandra's recommended UUID keys. Otherwise LWW silently drops acknowledged writes and, with clock skew, even non-concurrent ones." },
    { front: "Define happens-before and concurrent.", back: "A happens before B if B knew about, depended on, or built on A. A and B are concurrent if neither knew about the other. Exactly one of the three relations holds. Physical timing is irrelevant." },
    { front: "In the single-server version-number algorithm, what must a client do before writing, and what does the server overwrite?", back: "Read the key first, merge all returned values, and send the write with the version from that read. The server overwrites values with version at most that number and keeps higher-versioned values as siblings." },
    { front: "Why do deletions require tombstones when merging siblings?", back: "A merge by union cannot distinguish 'never added' from 'removed in one branch', so a removed item resurfaces. A tombstone with a version number records the removal so the merge keeps it deleted." },
    { front: "What does a version vector add over a single version number?", back: "One counter per replica per key, plus knowledge of counters seen from other replicas. This distinguishes overwrites from concurrent writes across many leaderless replicas, so a client may read from one node and later write to a different one without any update being lost." }
  ],
  quiz: [
    {
      question: "A leader-based system uses semi-synchronous replication with five followers. The synchronous follower becomes unreachable. What happens?",
      choices: [
        "All writes block until that follower returns",
        "The leader switches to fully asynchronous mode and continues without any synchronous follower",
        "An asynchronous follower is reassigned to the synchronous role, so writes continue and two up-to-date copies are still maintained",
        "The leader fails over to the most up-to-date follower"
      ],
      answer: 2,
      explanation: "Semi-synchronous replication swaps in another follower as the synchronous one, preserving the guarantee of two current copies. Blocking all writes is fully synchronous behavior; dropping to pure asynchronous would abandon the durability guarantee; failover is a response to leader failure, not follower failure."
    },
    {
      question: "What was the most direct cause of the GitHub incident in which private data was exposed after a failover?",
      choices: [
        "The promoted follower's autoincrement counter lagged, so it reused primary keys that Redis already associated with other records",
        "Split brain caused two MySQL leaders to accept conflicting writes",
        "A sloppy quorum stored writes on nodes outside the key's home set",
        "Statement-based replication evaluated NOW() differently on each replica"
      ],
      answer: 0,
      explanation: "A stale follower became leader with a lagging counter and reissued keys already used, and Redis keyed data by those IDs, so users were matched with the wrong records. Split brain was not the issue, sloppy quorums belong to leaderless systems, and nondeterministic statements were not involved."
    },
    {
      question: "Why does WAL shipping make zero-downtime database upgrades difficult?",
      choices: [
        "The WAL is too large to transfer during an upgrade",
        "Followers must be upgraded after the leader, which requires a restart",
        "WAL records contain SQL statements that newer versions may parse differently",
        "The WAL describes physical block changes tied to a specific storage-engine version, so leader and followers cannot run different versions"
      ],
      answer: 3,
      explanation: "The WAL is a low-level physical format coupled to the storage engine, so version mismatch is usually impossible, which blocks the upgrade-followers-then-failover technique. Size is not the problem, the ordering in choice B is backwards, and WAL records are bytes in blocks, not SQL."
    },
    {
      question: "A user posts a comment, refreshes, and the comment is gone; a second refresh shows it. Which guarantee did the first refresh violate?",
      choices: [
        "Monotonic reads",
        "Read-after-write consistency",
        "Consistent prefix reads",
        "Linearizable writes"
      ],
      answer: 1,
      explanation: "The user could not see their own write, which is exactly what read-after-write consistency promises. Monotonic reads would be violated by seeing the comment and then losing it; consistent prefix reads concerns causal order between different writes; linearizability is a stronger model not defined in this chapter."
    },
    {
      question: "Which technique gives monotonic reads most cheaply in a single-leader system with many followers?",
      choices: [
        "Route each user's reads to the same follower, chosen by hashing the user ID",
        "Send all reads to the leader",
        "Make replication synchronous to every follower",
        "Attach a wall-clock timestamp to every read and reject older results"
      ],
      answer: 0,
      explanation: "Pinning a user to one replica means their successive reads never move to a more lagged replica. Reading everything from the leader destroys read scaling, fully synchronous replication destroys availability, and rejecting results by wall-clock timestamp relies on unreliable clocks and does not address replica choice."
    },
    {
      question: "Which of the following is NOT one of the chapter's accepted use cases for multi-leader replication?",
      choices: [
        "Replicas in several datacenters that should accept writes locally",
        "Mobile apps that must keep working offline and sync later",
        "Scaling read throughput inside a single datacenter",
        "Real-time collaborative editing of documents"
      ],
      answer: 2,
      explanation: "Read scaling is served by adding followers under a single leader; the chapter says multi-leader rarely makes sense within one datacenter. Multi-datacenter writes, offline clients, and collaborative editing are the three use cases given."
    },
    {
      question: "In a multi-leader system, why does last write wins based on timestamps risk data loss?",
      choices: [
        "It requires synchronous conflict detection",
        "It only works in star topologies",
        "It cannot pick a winner when two writes have different IDs",
        "It discards all but one of the concurrent writes even though each was acknowledged, and clock skew can make it drop writes that were not concurrent"
      ],
      answer: 3,
      explanation: "LWW converges by throwing away every write except the one with the highest timestamp, including acknowledged ones, and unsynchronized clocks can misorder even causally related writes. It is asynchronous, topology-independent, and always picks a winner, which is the problem."
    },
    {
      question: "In a circular multi-leader topology, what prevents a change from being forwarded around the ring forever?",
      choices: [
        "Each node waits for a quorum before forwarding",
        "Each write carries the identifiers of nodes it has visited, and a node ignores writes already tagged with its own identifier",
        "Only the root node is allowed to forward writes",
        "Writes carry a hop counter that is decremented at each node"
      ],
      answer: 1,
      explanation: "Tagging writes with visited node IDs lets each node recognize changes it has already processed. Quorums belong to leaderless systems, a root node is a star topology concept, and the chapter does not describe hop counters."
    },
    {
      question: "A leaderless store has n = 5. Which setting tolerates two unavailable nodes for both reads and writes while keeping w + r > n?",
      choices: [
        "w = 5, r = 1",
        "w = 2, r = 2",
        "w = 3, r = 3",
        "w = 4, r = 4"
      ],
      answer: 2,
      explanation: "With w = r = 3, the sum is 6 > 5 and each operation needs only 3 of 5 nodes, so two can be down. w = 5 fails writes if any node is down; w = r = 2 sums to 4, which does not satisfy the quorum condition; w = r = 4 satisfies it but tolerates only one failure."
    },
    {
      question: "A write succeeded on only 1 of 3 replicas (w = 2) and the client received an error. According to the chapter, what happens next?",
      choices: [
        "The accepting replica keeps the value anyway, since nothing undoes it, so future reads might or might not surface the 'failed' write",
        "The replica that accepted the write discards it when the error is returned",
        "Read repair immediately removes the value from that replica",
        "The write is queued via hinted handoff until two replicas accept it"
      ],
      answer: 0,
      explanation: "Dynamo-style stores do not undo partial writes, so a value from a 'failed' write can still surface in reads. There is no rollback protocol, read repair propagates newer values rather than deleting them, and hinted handoff concerns writes accepted by stand-in nodes during partitions."
    },
    {
      question: "What does a sloppy quorum guarantee once a write is acknowledged?",
      choices: [
        "That any read with r responses will see the value",
        "That the value is stored on w of the key's n home nodes",
        "That the write is causally ordered after all previous writes",
        "Only that the value is durably stored on w nodes somewhere; reads may miss it until hinted handoff completes"
      ],
      answer: 3,
      explanation: "A sloppy quorum is a durability assurance, not a consistency one: the w nodes may lie outside the home set, so the overlap with r readers is not guaranteed. It says nothing about causal ordering, and by definition the nodes need not be home nodes."
    },
    {
      question: "Using the single-server version-number scheme, a client sends a write without including any version number. What does the server do?",
      choices: [
        "Rejects the write as malformed",
        "Stores it as a new concurrent value (sibling) without overwriting anything",
        "Overwrites all existing values because the write is the newest",
        "Assigns it the latest version and merges it automatically with the existing values"
      ],
      answer: 1,
      explanation: "A write with no version carries no evidence of having seen earlier values, so it is concurrent with all of them and becomes another sibling. The server neither rejects it nor treats it as superseding anything, and merging is the client's job, not the server's."
    }
  ],
  reviewQuestions: [
    "You run a read-heavy social application on one leader with eight asynchronous followers spread over two datacenters. Users report that edits to their own profiles sometimes disappear for a few seconds. Design a solution that provides read-after-write consistency, including the case where a user edits on their phone and reads on their laptop, and explain the costs you accept in read scalability and routing complexity.",
    "Compare how single-leader, multi-leader, and leaderless systems behave when one node is rebooted for maintenance and when an inter-datacenter link fails for ten minutes. For each combination describe what clients observe during the fault and what reconciliation happens afterwards.",
    "A team proposes automatic failover with a 5-second detection timeout to minimize downtime. Argue for and against this choice using the failure modes in the chapter (lost acknowledged writes, split brain, reused identifiers, cascading failures), and list the safeguards you would require before enabling it in production.",
    "You must choose a replication-log format for a database that needs rolling version upgrades and also has to feed a search index and a data warehouse. Evaluate statement-based, WAL shipping, logical (row-based), and trigger-based replication against those requirements and justify your choice.",
    "Design the conflict-handling strategy for a shopping-cart service on a Dynamo-style store that must support both adding and removing items from several devices. Explain how version vectors would be used, how siblings would be merged, why tombstones are required, and what would go wrong if you used last write wins instead."
  ]
});
