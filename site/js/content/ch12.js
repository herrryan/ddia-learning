DDIA.registerChapter({
  number: 12,
  part: 3,
  title: "The Future of Data Systems",
  tagline: "How should we compose, correct, and ethically operate data systems built from many specialized, imperfect tools?",
  studyMinutes: 110,
  overview: [
    "The closing chapter changes register. Earlier chapters described how storage engines, replication, partitioning, transactions, consensus, and batch and stream processing work today. Here Kleppmann argues, explicitly in the first person, for how applications **should** be built. The argument has three technical legs and one ethical one. First, no single database serves every access pattern, so real applications combine several tools, and the cleanest way to keep them consistent is to designate a system of record and derive everything else from an ordered log of changes. Second, once you see indexes, caches, and search engines as derived views, a whole organization starts to look like one big database that has been taken apart (unbundled) into independently operated pieces, with stream processors playing the role of index-maintenance machinery. Third, correctness in such a loosely coupled world cannot come from distributed transactions alone; it comes from end-to-end operation identifiers, deterministic derivation, constraints checked asynchronously, and continuous auditing.",
    "The chapter matters because it reconciles ideas that are often treated as rivals: Unix-style small tools versus integrated relational databases, batch versus streaming, eventual consistency versus strong guarantees. Its central analytical move is to split the overloaded word consistency into **timeliness** (do readers see fresh data?) and **integrity** (is the data uncorrupted?), and to show that dataflow systems can deliver strong integrity with little coordination even when they cannot deliver timeliness.",
    "The final third of the chapter steps outside engineering. Predictive analytics can trap people in an algorithmic prison, machine learning launders historical bias, and advertising-funded tracking amounts to surveillance that shifts privacy rights away from individuals and into corporate hands. Kleppmann asks engineers to treat users as people rather than metrics, to purge data they no longer need, and to accept responsibility for the consequences of the systems they build."
  ],
  bigIdeas: [
    "No single data tool fits all workloads; integrate specialized systems by writing to one system of record and deriving the rest through an ordered event log.",
    "Dataflow applications are an unbundled database: stream processors are the index-maintenance code, and derived stores are the index types, run by separate teams.",
    "The write path precomputes eagerly and the read path computes lazily; indexes, caches, and materialized views just move the boundary between them.",
    "Low-level guarantees such as TCP deduplication or exactly-once stream processing are not enough; correctness needs end-to-end operation identifiers carried from client to database.",
    "Timeliness and integrity are different requirements; dataflow systems can preserve integrity without coordination, and many businesses can tolerate late constraint checks plus apologies.",
    "Hardware and software both fail silently, so audit continuously; and because data is about people, engineers must weigh bias, surveillance, and privacy as design concerns."
  ],
  sections: [
    {
      id: "combining-tools-by-deriving-data",
      title: "Data Integration: Combining Specialized Tools by Deriving Data",
      body: [
        "A theme that runs through the whole book is that every data problem has several reasonable solutions, each optimized for a particular usage pattern. A codebase that tries to serve every access pattern at once usually serves none of them well, so even products marketed as general-purpose databases are in fact tuned for one kind of workload. The practical consequence is that nontrivial applications end up pairing a transactional database with a dedicated search engine (PostgreSQL's built-in search is adequate for simple needs but not for serious information retrieval), plus caches, a data warehouse, batch and stream pipelines, machine learning and recommendation systems, and notification services. Kleppmann is skeptical of claims like 'in my experience nobody needs feature X'; such statements describe the speaker's experience, not the technology. The integration problem becomes visible only when you look at how data moves across an entire organization.",
        "Once the same data lives in several stores, you have to be explicit about which system receives writes first and which copies are computed from it. The recommended pattern is to send every write to one system of record, capture its changes (via CDC, or by making the event log itself the source), and feed them to the search index, cache, and other derived stores in that same order. If CDC is the only route by which the index is updated, the index is guaranteed to be a function of the system of record, barring bugs. The alternative, letting the application write to both the database and the index itself, reopens the dual-write race from Chapter 11: two concurrent writes can be applied in opposite orders by the two stores, and because neither store is in charge of ordering, they stay inconsistent forever. Deciding on a single total order is an instance of state machine replication via total order broadcast; whether the order comes from CDC or from event sourcing matters less than having one. Applying a log to a derived store can usually be made deterministic and idempotent, which makes recovery after a crash simple.",
        "How does this compare with the classic answer, distributed transactions? Both aim to keep several systems in agreement, but by different mechanisms. A distributed transaction orders writes with locks (two-phase locking) and makes them take effect once through atomic commit; a log-based system orders writes by their position in the log and gets effectively-once behavior from deterministic replay plus idempotent consumers. The decisive difference is timing: transactions are typically linearizable, so a client can immediately read its own write, whereas derived systems update asynchronously and offer no such promise by default. Kleppmann's judgment is that XA tolerates faults badly and performs poorly, that a better distributed transaction protocol is unlikely to be widely adopted soon, and that log-based derivation is therefore the most promising integration mechanism. At the same time he refuses to tell readers to simply accept eventual consistency; the later section on correctness looks for a middle ground."
      ],
      keyPoints: [
        "Every storage product is specialized; complex applications inevitably combine several, so data integration is unavoidable.",
        "Pick one system of record, and let all other representations be derived from its ordered change log.",
        "Dual writes from the application to two stores create permanent inconsistency because no component decides the order.",
        "Distributed transactions order with locks and commit atomically; logs order by position and rely on deterministic retry and idempotence.",
        "Transactions give linearizability (read-your-writes); asynchronous derivation does not, which is their main cost.",
        "XA is judged too fragile and slow; the author prefers log-based derivation for integration."
      ],
      table: {
        caption: "Two ways to keep several data systems in agreement",
        columns: ["Aspect", "Distributed transactions (XA / 2PC)", "Log-based derived data"],
        rows: [
          ["How writes are ordered", "Locks and mutual exclusion (2PL)", "Position in a shared log"],
          ["How effects happen once", "Atomic commit protocol", "Deterministic replay plus idempotent consumers"],
          ["Timing guarantee", "Linearizable; read your own writes immediately", "Asynchronous; derived views lag behind"],
          ["Behavior on a participant failure", "Whole transaction blocks or aborts; failures spread", "Fault stays local; log buffers until the consumer recovers"],
          ["Works across heterogeneous tools?", "Only with a shared protocol; XA support is patchy", "Any system that can consume a log"],
          ["Author's verdict", "Usable in limited, controlled environments", "Most promising general integration mechanism"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Writing to the database and the search index from application code looks harmless when both writes succeed. The danger is ordering, not failure: two clients racing on the same key can leave the two stores disagreeing permanently."
      },
      systems: ["PostgreSQL"]
    },
    {
      id: "limits-of-total-ordering",
      title: "The Limits of Total Ordering and Capturing Causality",
      body: [
        "For a modest system a single totally ordered log is entirely practical; every single-leader replicated database builds one. At larger scale the approach hits four walls. If event throughput exceeds what one machine can sequence, the log must be partitioned, and the relative order of events in different partitions is undefined. If servers span datacenters for fault tolerance, each datacenter usually has its own leader because synchronous cross-datacenter coordination is too slow, so events originating in different datacenters have no defined order. In a microservice deployment each service owns its durable state, so events produced by two services are unordered with respect to each other. And clients that apply user input locally before the server confirms it (including offline operation) will observe events in a different order than the server does. Formally, agreeing on a total order is the total order broadcast problem, and that problem is equivalent to consensus. Existing consensus algorithms assume a single node can handle the entire event stream and offer no way for several nodes to share the sequencing work; consensus that scales past one node and tolerates geographic distribution remains an open research problem.",
        "A missing total order is harmless for events with no causal connection, since concurrent events may be ordered arbitrarily. Updates to the same object are easy too: route all updates for one object ID to the same partition. The subtle cases involve causal links across different kinds of data. Consider someone who removes a former partner from their friends list and then posts a message meant only for remaining friends. If friendship state and messages are stored in different systems, the ordering relationship between unfriending and posting can be lost; a notification service that processes the message before the unfriend will alert the ex-partner. The notification is really a join between messages and the friend list, so this is the time-dependence of joins from Chapter 11 in disguise.",
        "There is no clean solution yet, but the chapter lists starting points. Logical timestamps provide an ordering without coordination, at the price of extra metadata and recipients that must cope with out-of-order delivery. Alternatively, record an event that captures the state the user saw when they made a decision, give it a unique identifier, and have later events reference that identifier to make the causal dependency explicit; the later section on reads as events develops this. Automatic conflict resolution helps maintain state under reordering, but it cannot retract external side effects such as a notification that has already been sent. Kleppmann hopes that application patterns will emerge that capture causality efficiently without pushing every event through a single sequencing bottleneck."
      ],
      keyPoints: [
        "Total ordering breaks down with partitioned logs, multi-datacenter leaders, independent microservices, and offline-capable clients.",
        "Total order broadcast equals consensus, and current consensus algorithms are bounded by one node's throughput.",
        "Concurrent, causally unrelated events can be ordered arbitrarily; same-object updates can be ordered by routing to one partition.",
        "Causal dependencies between different data types (friend list versus messages) are easy to lose and effectively form a time-dependent join.",
        "Mitigations: logical timestamps, explicitly recorded 'what the user saw' events with identifiers, and conflict resolution for state (but not for side effects)."
      ],
      callout: {
        kind: "example",
        text: "Unfriend, then vent to your remaining friends. If the notification pipeline sees the message before the unfriend, your ex gets the alert. No amount of per-store ordering fixes a dependency that spans stores."
      }
    },
    {
      id: "maintaining-derived-state-and-reprocessing",
      title: "Batch and Stream Processing: Maintaining Derived State and Reprocessing",
      body: [
        "Kleppmann frames the goal of data integration as getting data into the correct shape wherever it is needed, and that work falls to batch and stream processors: they consume inputs, transform, join, filter, aggregate, train models, and write outputs such as materialized views, search indexes, recommendation lists, and metrics. The fundamental difference between the two is bounded versus unbounded input; the implementation differences are eroding. Spark does streaming by cutting the stream into microbatches on top of a batch engine, while Flink treats batch as a special case of streaming. Each style can emulate the other, but performance differs; microbatching, for example, handles hopping and sliding windows poorly.",
        "Batch jobs have a functional flavor regardless of language: deterministic functions, immutable inputs, append-only outputs, no hidden side effects. Stream processing keeps that shape and adds managed, fault-tolerant operator state. Determinism is good for fault tolerance because replay is safe, and it makes an organization's dataflows easier to reason about: a cache, a statistical model, and a search index are all just pipelines that push state changes through functional code into a derived store. Derived state could in principle be maintained synchronously, the way a relational database updates a secondary index inside the writing transaction. Asynchrony is nonetheless what makes log-based systems robust. A fault in one consumer stays contained, whereas a distributed transaction aborts whenever any participant fails and thus amplifies local problems into system-wide ones. Cross-partition secondary indexes, which need either writes to several partitions (term-partitioned) or scatter-gather reads (document-partitioned), are likewise most reliable when maintained asynchronously.",
        "Stream processing reflects changes quickly; batch processing can rerun history to build a brand-new view. That reprocessing ability is what makes large-scale application evolution feasible. Without it, schema evolution is limited to additive tweaks such as a new optional field or a new record type, whether you use schema-on-write or schema-on-read. With it, you can restructure a dataset into an entirely different model. The chapter illustrates this with 19th-century English railways: after a standard gauge was chosen in 1846, lines were converted by adding a third rail so that trains of both gauges could run during a multi-year transition, after which the obsolete rail was removed. The conversion was so costly that nonstandard gauges survive today (BART in the San Francisco area is one). The software analogue is to maintain the old and new schemas as two independently derived views over the same input, send a small slice of traffic to the new view to shake out bugs and performance problems, ramp up gradually, and finally retire the old view. Every step is reversible, which lowers the risk of each change and therefore lets teams move faster."
      ],
      keyPoints: [
        "Batch and stream processors are the derivation engines of data integration; their main difference is bounded versus unbounded input.",
        "Spark streams via microbatches on a batch engine; Flink runs batch on a streaming engine; emulation works but performance differs.",
        "Deterministic, side-effect-free derivation makes replay safe and dataflows easy to reason about.",
        "Asynchronous maintenance contains faults; distributed transactions spread them.",
        "Reprocessing history allows wholesale restructuring, not just additive schema changes.",
        "Run old and new derived views side by side and migrate users gradually; reversibility is what makes the migration safe."
      ],
      callout: {
        kind: "insight",
        text: "Dual-gauge track is the mental model for schema migration: keep both representations live, shift traffic gradually, and only remove the old one once nothing depends on it."
      },
      systems: ["Apache Spark", "Apache Flink"]
    },
    {
      id: "lambda-architecture-and-unification",
      title: "The Lambda Architecture and Unifying Batch and Stream",
      body: [
        "If batch handles historical reprocessing and streaming handles fresh events, how should the two be combined? The lambda architecture was the best-known proposal. Incoming data is appended as immutable events to an ever-growing dataset, much like event sourcing, and read-optimized views are derived from those events by two parallel pipelines: a batch layer (for example Hadoop MapReduce) and a speed layer (for example Storm). The stream processor quickly produces a rough update of the view, and the batch job later re-reads the same events and emits an exact version. The rationale was that batch jobs are simpler and less bug-prone, that stream processors were considered hard to make fault-tolerant, and that the speed layer could use quick approximations while the batch layer used slower exact algorithms.",
        "The idea was influential and did real good by popularizing immutable event streams and reprocessing, but Kleppmann lists three practical problems. The same logic has to be written and maintained in two frameworks; Summingbird can abstract over both, but debugging, tuning, and operating two systems remains costly. The two pipelines produce separate outputs that must be merged at query time, which is trivial for a tumbling-window count but hard for joins, sessionization, or any output that is not a time series. And reprocessing the full history frequently is too expensive on large datasets, so the batch layer tends to become incremental (say, one hour of data per run), which imports the streaming problems of stragglers and windows that straddle batch boundaries and undermines the whole point of a simple batch layer.",
        "More recent systems get the benefits without the duplication by running both historical reprocessing and live processing in one engine. Three capabilities make that possible, and all are now common: replaying historical events through the engine that also handles live ones (log-based brokers can replay, and certain stream processors can ingest files from HDFS); exactly-once semantics, so that the result matches a fault-free execution, which like batch processing requires discarding partial output from failed tasks; and windowing by event time rather than processing time, because during a replay the processing time carries no information. Apache Beam offers an API for such computations that can execute on Flink or Google Cloud Dataflow."
      ],
      keyPoints: [
        "Lambda: immutable event store, a batch layer that computes exact views, and a speed layer that computes fast approximations, merged at read time.",
        "Its lasting contribution is the principle of deriving views from immutable events and reprocessing when needed.",
        "Costs: duplicated logic in two frameworks, hard output merging for joins and sessions, and incremental batches that reintroduce streaming complexity.",
        "Unification needs replayable history, exactly-once output, and event-time windowing in one engine.",
        "Beam on Flink or Cloud Dataflow is the chapter's example of the unified approach."
      ],
      table: {
        caption: "Lambda architecture versus a unified batch/stream engine",
        columns: ["Concern", "Lambda architecture", "Unified engine"],
        rows: [
          ["Where logic lives", "Written twice: batch layer and speed layer", "Written once, run over history or live data"],
          ["Reprocessing history", "Batch layer reruns everything, or becomes incremental", "Replay the event log through the same operators"],
          ["Serving a query", "Merge batch output with speed-layer output", "Single output view"],
          ["Trust in streaming output", "Approximate; corrected later by batch", "Authoritative, thanks to exactly-once semantics"],
          ["Time semantics", "Batch boundaries create straggler and window problems", "Event-time windows behave identically in replay and live mode"],
          ["Representative tools", "Hadoop MapReduce plus Storm; Summingbird", "Flink, Apache Beam, Google Cloud Dataflow, replayable logs"]
        ]
      },
      systems: ["Hadoop MapReduce", "Apache Storm", "Summingbird", "Apache Beam", "Apache Flink", "Google Cloud Dataflow", "HDFS"]
    },
    {
      id: "composing-data-storage-technologies",
      title: "Unbundling Databases: Composing Data Storage Technologies",
      body: [
        "Operating systems, databases, and Hadoop all do the same abstract job: store data and let you process and query it. Unix and relational databases simply chose opposite philosophies. Unix exposes a thin, low-level abstraction over hardware (files as byte sequences, pipes), while relational databases offer a high-level abstraction (SQL, transactions) that hides on-disk structures, concurrency control, and crash recovery. Each is simple in its own sense: Unix because it is close to the metal, SQL because a short declarative query can harness optimizers, indexes, join algorithms, and replication without the author understanding them. The two camps have coexisted since the early 1970s, and Kleppmann reads NoSQL as an attempt to bring Unix-style low-level abstractions to distributed OLTP storage. The unbundling idea is his attempt to reconcile them.",
        "Consider what `CREATE INDEX` actually does: scan a consistent snapshot of the table, extract and sort the indexed values, write out the index, apply the backlog of writes that arrived during the build, and from then on keep the index current on every write. That is the same procedure as adding a new follower replica or bootstrapping change data capture from an initial snapshot. In other words, creating an index is reprocessing existing data to derive a new view. From this angle the dataflow of an entire organization resembles one enormous database: every ETL job, batch job, and stream job is doing what a database's index-maintenance subsystem does, batch and stream processors are elaborate versions of triggers, stored procedures, and view-maintenance routines, and each derived store is a different index type, except that the pieces are separate products running on separate machines and operated by separate teams.",
        "Kleppmann sees two routes for composing heterogeneous storage into a coherent whole. A federated database or polystore unifies reads: one query interface spans many underlying engines (PostgreSQL's foreign data wrappers are an example), following the relational tradition of an integrated system with elegant semantics and a complicated implementation. An unbundled database unifies writes: it makes it easy to reliably plug storage systems together through CDC and event logs, effectively extracting the database's index-maintenance machinery so it can synchronize writes across different technologies, following the Unix lineage of small tools, a uniform low-level interface, and a composition language. The term unbundling comes from Jay Kreps. Of the two, synchronizing writes is the harder engineering problem, so the chapter focuses there. Heterogeneous distributed transactions are the wrong tool for it; transactions inside a single system are fine (some stream processors use them internally for exactly-once), but across technologies written by different groups there is no standard protocol, and an ordered log with idempotent consumers is far simpler. Log-based integration also buys loose coupling at two levels: at the system level a slow or failed consumer does not affect the producer or other consumers because the log buffers events until it catches up, and at the human level teams can develop and operate their components independently behind an interface that is strong (durable, ordered) yet general.",
        "Unbundling does not abolish databases. Stream processors still need databases to hold state, batch and stream outputs still need query engines to serve them, and MPP data warehouses remain the right tool for exploratory analytics. Every additional component brings a learning curve, configuration, and operational quirks, and an integrated product may deliver better and more predictable performance for the workloads it was designed for; building for scale you do not need is premature optimization. The point of unbundling is breadth, not depth: covering a wider range of workloads than any single product can, and only when no single product meets your requirements. What is still missing is the equivalent of the Unix shell: a high-level, declarative way to compose storage systems. Kleppmann's wish is to write something like `mysql | elasticsearch` and have it behave as an unbundled `CREATE INDEX`, bulk-loading the documents and then continuously applying every subsequent change without custom glue code. Materialized views declared for complex queries, recursive graph queries included, along with application logic, would do the same for caches; differential dataflow is early research in that direction."
      ],
      keyPoints: [
        "Unix and relational databases are two philosophies of information management: thin low-level abstraction versus rich declarative abstraction.",
        "`CREATE INDEX` is a reprocessing job: snapshot, derive, catch up, then maintain continuously, exactly like adding a replica or bootstrapping CDC.",
        "An organization's dataflow is one big unbundled database: stream processors are the triggers and view maintainers, derived stores are the index types.",
        "Federation unifies reads with one query interface; unbundling unifies writes with logs and CDC. Writes are the harder problem.",
        "Logs give loose coupling at the system level (fault containment via buffering) and the human level (team independence).",
        "Unbundling is for breadth of workloads; if one product does everything you need, use it. The missing piece is a declarative shell for composing stores."
      ],
      table: {
        caption: "Federated versus unbundled databases",
        columns: ["Dimension", "Federated database (polystore)", "Unbundled database"],
        rows: [
          ["What it unifies", "Reads: one query interface over many engines", "Writes: changes propagate reliably to every derived store"],
          ["Mechanism", "Query translation across data models", "Change data capture and event logs feeding consumers"],
          ["Tradition", "Relational: integrated system, high-level language", "Unix: small tools, uniform low-level interface, composition"],
          ["Example", "PostgreSQL foreign data wrappers", "Database log feeding Elasticsearch, caches, and warehouses"],
          ["Hard part", "Mapping between data models (manageable)", "Keeping writes in sync under faults (harder)"],
          ["Still missing", "Nothing fundamental", "A declarative shell, like `mysql | elasticsearch`"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Secondary indexes, materialized views, replication logs, and full-text indexes are all derived data that databases maintain internally. Unbundling just performs the same derivations across product boundaries, which is why an ordered log is the right interface."
      },
      systems: ["PostgreSQL", "MySQL", "Elasticsearch", "Hadoop", "Naiad (differential dataflow)"]
    },
    {
      id: "designing-applications-around-dataflow",
      title: "Designing Applications Around Dataflow",
      body: [
        "Building applications by composing specialized stores with application code has come to be called the 'database inside-out' approach, after a 2014 talk by the author, though he insists it is a design pattern rather than a grand new architecture. It borrows from dataflow languages such as Oz and Juttle, functional reactive programming such as Elm, logic programming such as Bloom, and above all from spreadsheets. In a spreadsheet, a formula cell recomputes automatically whenever any of its inputs change; VisiCalc had this in 1979. That is precisely what we want from data systems: change a record and every index, cache, and aggregate that depends on it is refreshed without the developer orchestrating it. The difference is that data systems must additionally be fault-tolerant, scalable, durable, and able to integrate tools written by different teams in different languages.",
        "Every derived dataset is the output of a derivation function. In the case of a secondary index that function is trivial (pick out the indexed fields and sort), which is why databases ship it as `CREATE INDEX`. A full-text index needs language detection, tokenization, stemming (or lemmatization), spell correction, and synonym expansion before an inverted index can be built, and the sophisticated parts need domain tuning. A machine learning model is derived from training data by feature extraction and statistics, and the model's output is derived from the input plus the model. A UI cache aggregates data in exactly the shape the interface displays, so a UI change changes the derivation and may require a rebuild. Whenever the derivation is not a standard one, custom code is needed, and databases are weak at hosting custom code: stored procedures, triggers, and UDFs have always been afterthoughts. Databases also make poor application runtimes, lacking dependency management, version control, rolling upgrades, monitoring, and clean access to external services, whereas Mesos, YARN, Docker, and Kubernetes exist precisely to run application code. Today's norm is therefore stateless services plus a separate database, the 'separation of Church and state' joke. In that model the database is a mutable shared variable reached over the network. The trouble is that you cannot subscribe to a variable; you can only poll it. The observer pattern is not built into most languages, and change-stream APIs are only beginning to appear in databases.",
        "Thinking in dataflow renegotiates that relationship. Instead of a passive variable manipulated by the application, state, state changes, and the code that reacts to them collaborate: code observes a change in one place and produces changes elsewhere, as in CDC-as-stream, actor systems, and the tuple spaces of the 1980s. Inside a database this is what a trigger or index update does; unbundling applies it to caches, search indexes, models, and analytics via stream processors. Two requirements distinguish derived-data maintenance from traditional asynchronous job queues. Ordering matters, because several views derived from the same log must apply events in the same order to stay mutually consistent, and many message brokers lose ordering when they redeliver unacknowledged messages (dual writes are ruled out for the same reason). Fault tolerance is essential, because losing one message leaves the derived view permanently out of sync; many actor frameworks, by contrast, keep state and messages in memory and lose them on a crash. Modern stream processors meet both demands at scale, and they let application code run as operators that compose like Unix pipes, each consuming streams of state changes and producing new ones.",
        "How does this relate to microservices? Both offer organizational scalability through loose coupling between teams, but microservices communicate through synchronous request/response while dataflow uses one-directional asynchronous streams. The chapter's example is a purchase priced in one currency and paid in another. A microservice would call an exchange-rate service during purchase processing. A dataflow operator would instead consume the stream of rate changes continuously, keeping the latest rate in a local store, and simply look it up when a purchase arrives: a stream-table join replaces a remote call. The result is faster and more resilient to the rate service being down, since no network call is faster or more reliable than one you never make. Two caveats apply. The join is time-dependent, so reprocessing old purchases requires the historical rate at the time of purchase, a problem that exists equally in the RPC design. And a microservice that caches rates locally must poll or subscribe to stay fresh, which is the dataflow approach by another name."
      ],
      keyPoints: [
        "The 'database inside-out' pattern treats indexes, caches, and models as spreadsheet-like formulas that recompute automatically when inputs change.",
        "Custom derivation functions (full-text processing, feature engineering, UI-shaped caches) need real application runtimes, not database stored procedures.",
        "Separating stateless code from stateful stores is good, but a database that can only be polled is a passive variable; dataflow needs subscriptions.",
        "Derived-data maintenance demands stable ordering and no message loss, which rules out many brokers' redelivery semantics and in-memory actor state.",
        "Stream operators compose like Unix pipes, with application code running inside the dataflow.",
        "Subscribing to a dependency's change stream and joining locally replaces synchronous RPC, improving latency and fault isolation, but joins remain time-dependent."
      ],
      table: {
        caption: "Synchronous services versus dataflow operators for the exchange-rate example",
        columns: ["Aspect", "Microservice (request/response)", "Dataflow operator (stream join)"],
        rows: [
          ["Communication style", "Synchronous RPC at request time", "One-way asynchronous event streams"],
          ["Getting the current rate", "Call the exchange-rate service per purchase", "Subscribe to rate updates in advance; read a local table"],
          ["Latency on the critical path", "One network round trip", "Local lookup, possibly in-process"],
          ["If the rate service is down", "Purchases fail or time out", "Keep serving from the last known rate"],
          ["Reprocessing old purchases", "Need the historical rate from somewhere", "Need the historical rate; the join is explicitly time-dependent"],
          ["Team coupling", "Loose, through APIs", "Loose, through streams"]
        ]
      },
      callout: {
        kind: "example",
        text: "Purchase in euros, pay in dollars. Instead of asking a rate service on every order, consume the stream of rate changes and keep a local copy; the conversion becomes a join between purchase events and rate-update events."
      },
      systems: ["Oz", "Juttle", "Elm", "Bloom", "VisiCalc", "Mesos", "YARN", "Docker", "Kubernetes"]
    },
    {
      id: "observing-derived-state",
      title: "Observing Derived State: The Write Path Meets the Read Path",
      body: [
        "Dataflow gives you a way to create derived datasets and keep them current. Call that the **write path**: when information enters the system it may pass through several batch and stream stages until every derived dataset has absorbed it. The work is done eagerly, whether or not anyone will ever ask for it. The reason to build a derived dataset, though, is to query it later. That is the **read path**: when a request arrives you read the derived data, maybe do more processing, and build the response. Read-path work happens lazily, only on demand. In functional programming terms the write path behaves like eager evaluation while the read path behaves like lazy evaluation, and the derived dataset is where they meet. Its design is a trade-off between how much work happens at write time and how much at read time.",
        "Full-text search makes the trade-off concrete. With an index, a write updates the posting list of every term in the document, and a read looks up each query term and combines the results with Boolean logic. With no index, writes cost nothing extra but every query scans every document like `grep`. At the other extreme you could precompute the answer to every possible query so that reads are a single lookup, but the set of possible queries is unbounded (even the set with non-empty results is exponential in the number of terms), so the write path would need infinite time and space. A middle option is to precompute results only for the most common queries and fall back to the index for the rest; that is a cache, but it is equally a materialized view, because it has to be refreshed when new documents match a cached query. The general lesson is that indexes, caches, and materialized views all do one thing: they shift the write/read boundary, doing more work up front to save work at query time. This is exactly the Twitter timeline problem from Chapter 1, where fan-out on write serves ordinary users and fan-out on read serves celebrities; after 500 pages the book has come full circle.",
        "The client/server assumption that clients are stateless and servers own the data is a habit, not a law. Single-page web apps and mobile apps now hold substantial local state, and offline-first applications do as much as possible against an on-device database, syncing to the server opportunistically whenever connectivity returns, so the interface never blocks on an unreliable cellular link. On-device state is best understood as a cache of server state: the pixels on screen are a materialized view of the client's model objects, and the model objects are a replica of state in a datacenter. Traditional pages read once and then go stale (RSS is merely polling), but WebSockets and server-sent events (`EventSource`) let a server push messages down an open connection. Pushing changes stretches the write path out to the user's device: the client uses the read path once to fetch initial state and then relies on a stream of updates. Offline gaps are handled just like a disconnected consumer of a log-based broker: reconnect and resume from the last offset, with each device acting as a tiny consumer of its own narrow stream.",
        "Client-side frameworks such as Elm and the React, Flux, and Redux toolchain already manage UI state as a stream of events (user input, server responses) in a structure that resembles event sourcing. Letting the server push state-change events into that same pipeline yields an end-to-end write path: an interaction on one device flows through event logs, derived systems, and stream processors to the screen of another user, plausibly in under a second. Messaging apps and online games already work this way; most applications do not, because request/response is baked into databases, libraries, frameworks, and protocols, and few datastores support a request answered by an ongoing stream rather than a single reply. Kleppmann argues that more responsive interfaces and better offline behavior justify shifting toward publish/subscribe dataflow, and asks designers to remember that subscribing to changes is an alternative to querying current state."
      ],
      keyPoints: [
        "Write path = eager precomputation as data arrives; read path = lazy computation when someone asks; the derived dataset is their meeting point.",
        "No index, an index, a cache of common queries, and precomputing everything are points on a spectrum of write-time versus read-time work.",
        "A cache of query results is a materialized view and must be invalidated or refreshed when the underlying data changes.",
        "Offline-first clients treat device state as a replica, with the screen as a materialized view of local model objects.",
        "Server push (EventSource, WebSockets) extends the write path to the client; consumer offsets handle reconnection after offline periods.",
        "An end-to-end event stream from one user's action to another user's screen is feasible today but requires replacing request/response habits with publish/subscribe."
      ],
      table: {
        caption: "Where to draw the write/read boundary",
        columns: ["Strategy", "Work on the write path", "Work on the read path", "Typical use"],
        rows: [
          ["No index (scan)", "None", "Scan everything, like grep", "Small datasets only"],
          ["Index", "Update entries for every indexed term or field", "Look up terms and combine results", "Full-text search, secondary indexes"],
          ["Cache / materialized view", "Recompute affected cached results on change", "Return the stored result", "Hot queries, UI-shaped aggregates"],
          ["Precompute every query", "Infinite for open-ended query spaces", "Trivial lookup", "Impossible in general"],
          ["Push to clients", "Propagate each change to every subscribed device", "Read local state", "Chat, games, offline-first apps"]
        ]
      },
      systems: ["Elm", "React", "Flux", "Redux", "WebSockets", "EventSource", "RSS"]
    },
    {
      id: "reads-as-events-and-multi-partition",
      title: "Reads Are Events Too, and Multi-Partition Processing",
      body: [
        "In the designs so far, writes travel through an event log, whereas a read is a short-lived network request sent directly to whichever node holds the data; the store sits at the boundary between the two paths and provides random access that a raw log cannot. Stream processors already hold state for joins and aggregations, and some frameworks expose that state to external queries, turning the processor into a rudimentary database. Kleppmann proposes going one step further: represent read requests as events, send both reads and writes through the same stream operator, and have the operator emit read results onto an output stream. Serving a query then becomes a stream-table join, with the query stream on one side and the state table on the other. As with any join, the read event must be routed to the partition that holds the relevant data, just as batch and stream joins copartition their inputs. A one-off read passes through the join and is forgotten; a subscription is a persistent join against both past and future events.",
        "Logging reads has a payoff beyond symmetry: provenance and causality. If reads are durable events, you can reconstruct what a user saw before they acted. In an online shop the predicted delivery date and the stock status shown on the page probably influence whether the customer buys; analyzing that link requires recording the result of the query that produced the page. The costs are extra storage and I/O, and reducing that overhead is still a research problem, but if request logging already happens for operational reasons, making the log the actual source of requests is a modest step.",
        "For queries that touch a single partition, routing reads through a stream is heavier than necessary. The payoff comes with queries that must combine data from many partitions, because the stream processor's routing, partitioning, and joining machinery can execute them in a distributed fashion. Storm's distributed RPC supports this pattern; one use was computing how many Twitter users had seen a URL, merging the follower sets of all users who had tweeted it, which spans many partitions of the user base. Fraud detection is another: scoring a purchase means looking up reputation scores for the IP address, email, billing address, and shipping address, each kept in a differently partitioned dataset, so one request becomes a chain of joins. MPP databases execute similar query graphs internally, and if a database offers the needed multi-partition joins it is simpler to use it. Treating queries as streams is an option for applications that outgrow off-the-shelf systems."
      ],
      keyPoints: [
        "Stream processors with queryable state blur the line between processor and database.",
        "Sending reads through the processor turns query serving into a stream-table join; reads must be routed to the right partition.",
        "A subscription is simply a long-lived join; a one-off query is a join that forgets its left side immediately.",
        "Durable read events capture what users saw, enabling causality and provenance analysis at the cost of storage and I/O.",
        "Multi-partition queries (Twitter URL reach, fraud scoring across reputation stores) can reuse stream infrastructure; Storm's distributed RPC is an example.",
        "Prefer a database with built-in multi-partition joins when one fits; stream-based query execution is for cases beyond conventional tools."
      ],
      callout: {
        kind: "insight",
        text: "Serving a request and performing a join are the same operation viewed from different angles. Once you see that, subscriptions, provenance tracking, and distributed query execution all fall out of the same machinery."
      },
      systems: ["Apache Storm", "Kafka Streams", "Twitter"]
    },
    {
      id: "end-to-end-argument",
      title: "Aiming for Correctness: The End-to-End Argument for Databases",
      body: [
        "Stateless services forgive bugs: fix, redeploy, done. Stateful systems remember, so a bug's effects can persist indefinitely, and that demands more care. For four decades ACID transactions have been the standard tool for correctness, yet the foundation is shakier than it looks: weak isolation levels confuse practitioners, consistency is vaguely defined, and some systems have dropped transactions for models with better scalability but messier semantics. It is genuinely hard to tell whether an application is safe at a given isolation level or replication setup, and Kyle Kingsbury's Jepsen tests have exposed large gaps between vendors' claimed guarantees and their behavior under partitions and crashes. Serializability and atomic commit are proven, but they generally work only within one datacenter and cap the scale and fault tolerance you can achieve. Even a serializable database cannot save you from an application bug that writes garbage or deletes good data; immutability helps you recover but is not a complete answer.",
        "The subtle failure is duplicate execution. If a request fails in an uncertain way, you can drop it (data loss) or retry it (risk of applying it twice: a double charge, a double-counted metric). Exactly-once means structuring the computation so that the final effect matches a fault-free run even though retries happened. Idempotence is the main tool, but making a non-idempotent operation idempotent requires extra bookkeeping, for instance the IDs of operations already applied, and fencing during failover. Deduplication mechanisms exist at several layers, each with a limited scope. TCP sequence numbers remove duplicate packets, but only within one connection. Many databases bind a transaction to a connection, so if a client times out after sending `COMMIT` but before receiving the reply, it cannot tell whether the commit happened; reconnecting and retrying the classic two-statement transfer (add 11 to one balance, subtract 11 from another) can move 22 instead of 11. That standard textbook example is therefore not actually correct, and banks do not work that way. Two-phase commit breaks the connection-to-transaction binding so a coordinator can resolve in-doubt transactions, but it still does nothing about the hop from the user's browser to the application server. A POST sent over a weak cellular link may reach the server while the response is lost; the user sees an error, the browser asks whether to resubmit, and the user agrees, since the action was intended. The server treats it as a new request and the database as a new transaction. Post/Redirect/Get avoids the warning in normal operation but cannot help with a timeout.",
        "The fix is an **operation identifier** generated at the true origin: a UUID placed in a hidden form field, or a hash of the relevant form fields, so that a resubmitted form carries the same ID. The ID travels with the request all the way to the database, which records it in a `requests` table that has a uniqueness constraint on `request_id`, within the same transaction that updates the balances. A second attempt violates the constraint, the insert is rejected, and the whole transaction aborts. Relational databases get uniqueness constraints right regardless of isolation level, whereas a check-then-insert done in application code is vulnerable to write skew. There is a bonus: the requests table is effectively an event log, and the balance updates could be derived downstream from those request events by a consumer that deduplicates on the same ID, which points toward event sourcing.",
        "Duplicate suppression is one instance of the **end-to-end argument** formulated in 1984 by Saltzer, Reed, and Clark: certain functions can be implemented completely and correctly only with the knowledge of the application at the endpoints, so building them into a lower layer cannot fully solve the problem, though a partial lower-layer version may be a useful optimization. TCP, database transactions, and exactly-once stream processing each handle one layer but none covers the whole path from user to storage; only an identifier carried end to end does. The same reasoning applies to integrity (Ethernet, TCP, and TLS checksums catch network corruption but not endpoint software bugs or disk rot, so you need end-to-end checksums) and to confidentiality (a WiFi password protects one hop, TLS protects the network path, and only end-to-end encryption and authentication protect against a compromised server). Low-level mechanisms remain valuable because they make higher-level failures rare; HTTP would be a mess without TCP reordering packets. For data systems the conclusion is uncomfortable: using a database with strong guarantees does not make the application correct, so the application must take its own end-to-end measures. Transactions collapse concurrency, constraint violations, crashes, and network faults into commit or abort, a huge simplification that is nonetheless insufficient. They are also expensive across heterogeneous systems, and when teams avoid them they reimplement fault tolerance in application code, usually incorrectly, because concurrency and partial failure defy intuition. Kleppmann calls for new abstractions that deliver end-to-end correctness tailored to each application while keeping good performance and operability at scale."
      ],
      keyPoints: [
        "Stateful systems preserve the effects of bugs, and Jepsen shows that products often fail to meet their advertised guarantees.",
        "Retrying an uncertain operation risks double execution; exactly-once requires idempotence plus metadata and fencing.",
        "TCP deduplication, connection-bound transactions, and 2PC each cover one hop; a browser resubmitting a form defeats them all.",
        "The two-UPDATE transfer transaction is incorrect in practice: a retry after a lost COMMIT acknowledgment doubles the amount.",
        "Generate a request ID at the origin, enforce uniqueness on it in the database, and the retry is safely rejected even at weak isolation.",
        "The end-to-end argument applies equally to duplicate suppression, checksums, and encryption: lower layers reduce risk but cannot complete the job.",
        "Strong database guarantees do not make applications correct; applications need their own end-to-end mechanisms, ideally wrapped in better abstractions."
      ],
      table: {
        caption: "Duplicate suppression at different layers and what each one misses",
        columns: ["Layer", "What it deduplicates", "What slips through"],
        rows: [
          ["TCP sequence numbers", "Duplicate packets within one connection", "A retry sent over a new connection"],
          ["Transaction bound to a connection", "Statements inside one transaction", "A client retry after the COMMIT acknowledgment was lost"],
          ["Two-phase commit coordinator", "In-doubt transactions after reconnection", "The end user resubmitting the whole request"],
          ["Exactly-once stream processing", "Redelivered messages inside the pipeline", "Duplicate requests that enter the pipeline as distinct events"],
          ["End-to-end request ID", "Every hop from browser to database", "Nothing, provided the ID is created at the real origin"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "A money transfer written as two UPDATE statements inside a transaction is the canonical atomicity example, yet a client that retries after a timed-out COMMIT can execute it twice. Atomicity does not imply idempotence."
      }
    },
    {
      id: "enforcing-constraints",
      title: "Enforcing Constraints Without Atomic Commit",
      body: [
        "Deduplication is one constraint; the chapter next asks how an unbundled system can enforce others, especially uniqueness: usernames and email addresses must identify one account, a file store cannot hold two files with one name, a seat can be sold to only one person. Related constraints such as a non-negative balance, never selling more stock than you hold, or non-overlapping room bookings can be handled with the same techniques. Chapter 9 established that uniqueness in a distributed system requires consensus: when several concurrent requests claim the same value, something must pick one winner and reject the rest. The usual implementation is a single leader, which is fine as long as you accept routing every request through one node and can handle that node failing (which lands you back at consensus). Uniqueness checking scales out by partitioning on the value that must be unique, for example by hash of username or by request ID. Asynchronous multi-leader replication is excluded, because two leaders could independently accept conflicting values. If violating writes must be rejected immediately, synchronous coordination cannot be avoided.",
        "A log-based system has the ingredients already: a partitioned log provides total order broadcast within each partition, and a stream processor consumes each partition sequentially on one thread. To allocate usernames, append every claim request to the partition chosen by a hash of the username; a stream processor reads the partition in order, keeps a local table of taken names, records each new name and emits a success message, or emits a rejection if the name is taken; the requesting client watches the output stream for the verdict on its request. This is the same algorithm as implementing linearizable storage on top of total order broadcast, and it scales by adding partitions since each is independent. The underlying principle generalizes well beyond uniqueness: route all writes that might conflict to the same partition and process them in sequence, using whatever application logic defines a conflict. Bayou explored similar ideas in the 1990s.",
        "Things get interesting when one operation spans partitions. The money transfer with a request ID touches three: the one holding the request ID, the one holding the payer's account, and the one holding the payee's account, and nothing forces those onto the same partition. The traditional answer is atomic commit across all three, which effectively imposes a total order over every transaction touching any of them and destroys the independence that gave partitions their throughput. The chapter shows that equivalent correctness is achievable without it. Step one: the client assigns a unique request ID and appends the transfer request to a log partitioned by that ID. Step two: a stream processor reads the request log and emits two messages, a debit routed to the payer's partition and a credit routed to the payee's partition, each carrying the original request ID. Step three: processors for the account partitions consume those instructions, discard duplicates by request ID, and update balances. The first two steps exist because sending the credit and debit directly from the client would require atomic commit across two partitions; instead the request is durably recorded as a single message, and writes to a single object are atomic in nearly every data system, so the request is either in the log or not. If the stage-two processor crashes it resumes from its checkpoint and may re-emit instructions, but because it is deterministic the duplicates are identical and stage three discards them by ID. To prevent overdrafts, add a processor partitioned by payer account that maintains balances and admits only valid requests into the log in step one. Every request is thereby applied exactly once to both accounts, under faults, with no atomic commit protocol."
      ],
      keyPoints: [
        "Uniqueness and similar constraints need consensus: one winner among concurrent conflicting requests.",
        "Scale uniqueness checks by partitioning on the constrained value; asynchronous multi-leader replication cannot enforce them.",
        "A single-threaded stream processor per log partition decides conflicts deterministically and reports verdicts on an output stream.",
        "General rule: route potentially conflicting writes to one partition and process them sequentially with arbitrary validation logic.",
        "Multi-partition operations: log the intent once as a single atomic append, then derive per-partition instructions carrying the request ID.",
        "Crashes cause duplicate instructions, not missing ones; deterministic derivation plus end-to-end IDs makes them harmless.",
        "Pre-validation (e.g., overdraft checks) can be another partitioned processor placed before the request log."
      ],
      callout: {
        kind: "insight",
        text: "The trick that replaces atomic commit is to record intent exactly once and derive effects deterministically. A single log append is atomic everywhere; everything downstream can be retried because it is a pure function of that append."
      },
      systems: ["Bayou"]
    },
    {
      id: "timeliness-and-integrity",
      title: "Timeliness and Integrity",
      body: [
        "Transactions are convenient because they are usually linearizable: the writer waits for the commit, and afterwards every reader sees the write. A multi-stage pipeline of stream processors offers no such thing by design; producers do not wait for consumers. A client can nevertheless block until a verdict shows up on an output stream, as the username example did. Notice that the uniqueness check is correct whether or not the client waits; waiting only tells the client the verdict synchronously, and that notification is separable from the effects of processing. This observation motivates splitting the word consistency into two requirements. **Timeliness** means users observe an up-to-date state. Reading a stale replica violates timeliness, but the violation is temporary; waiting and retrying fixes it. Linearizability is a strong timeliness property and read-after-write consistency a weaker one. **Integrity** means the absence of corruption: no lost data, no contradictions, no false data, and derived views that correctly reflect their sources. An index missing some records has lost integrity. Integrity violations are permanent; no amount of waiting repairs them, only explicit checking and repair. ACID's C is essentially an application-specific notion of integrity, and atomicity and durability are tools for protecting it. In slogan form: timeliness violations are eventual consistency, integrity violations are perpetual inconsistency. Kleppmann asserts that integrity matters far more. On a credit card statement, a day's delay before a purchase appears is normal and expected, because banks settle asynchronously; a statement whose balance does not equal the previous balance plus the listed transactions, or a charge that never reaches the merchant, would be a disaster.",
        "ACID transactions bundle both properties, so the distinction rarely arises in that world. Event-based dataflow systems pull them apart: they provide no timeliness unless you build consumers that wait, but integrity is at their core. Exactly-once (or effectively-once) semantics is an integrity mechanism, since a lost or doubled event corrupts derived state; fault-tolerant delivery and idempotent processing exist to protect integrity. The previous section's transfer achieved integrity without atomic commit through four mechanisms working together: represent the write as a single message that can be appended atomically (which suits event sourcing); derive every other state change from that message with deterministic functions, much like stored procedures; carry the client's request ID through every stage for end-to-end deduplication; and keep messages immutable so derived data can be reprocessed when bugs are found. Kleppmann considers this combination a very promising foundation for fault-tolerant applications.",
        "Strict uniqueness demands consensus and timeliness, and streaming cannot change that. But many real businesses do not actually need the strict form. If two people grab the same username or seat, apologize to one and ask them to pick again; this corrective action is a compensating transaction. If customers order more than the warehouse holds, order more stock, apologize, and offer a discount, which is exactly what you would do if a forklift crushed part of the inventory, so the apology workflow must exist anyway. Airlines and hotels overbook on purpose and run refund and upgrade processes to handle excess demand, processes they would need regardless for weather cancellations and strikes. Banks let accounts go overdrawn, charge a fee, and bound the risk with daily limits. The cost of an apology varies, from a follow-up email, to refunding one of two duplicate charges, to sending debt collectors after cash dispensed by an ATM, but whether it is acceptable is a question for the business rather than for engineers. Where it is acceptable, checking every constraint before writing is needlessly restrictive: write optimistically, validate afterwards, and reserve synchronous checks for actions that are expensive to undo. Such applications still require integrity (a lost reservation or mismatched debits and credits is unacceptable) but not timeliness of constraint enforcement.",
        "Two observations now combine. Dataflow systems can maintain integrity with no atomic commit, no linearizability, and no synchronous coordination across partitions, and many applications tolerate loose constraints as long as integrity holds. Together they describe **coordination-avoiding** data systems: strong integrity, weak timeliness, and far better performance and availability than designs that coordinate synchronously. Such a system can run multi-leader across datacenters with asynchronous replication, each region continuing independently during a partition; it cannot be linearizable without adding coordination, but it never corrupts data. Serializable transactions remain useful at small scope, where they are effective, and synchronous coordination can be introduced exactly where an irreversible action requires it, without the whole application paying for it. Kleppmann offers a memorable framing: coordination and constraints reduce the apologies you owe for inconsistencies but increase the apologies you owe for outages and slowness. You cannot drive apologies to zero; you can only look for the sweet spot."
      ],
      keyPoints: [
        "Timeliness: readers see fresh state; violations are temporary. Integrity: data is uncorrupted and derivations are correct; violations are permanent.",
        "Integrity usually matters far more than timeliness, as the credit card statement example shows.",
        "ACID bundles both; dataflow decouples them, offering integrity by default and timeliness only when consumers wait.",
        "Integrity without atomic commit rests on single atomic appends, deterministic derivation, end-to-end request IDs, and immutable replayable events.",
        "Many constraints can be checked after the fact and repaired with compensating transactions and apologies; this is a business decision.",
        "Coordination-avoiding systems achieve strong integrity and high availability across datacenters by giving up linearizability.",
        "Coordination trades apologies for inconsistencies against apologies for outages; aim for the best balance, not zero."
      ],
      table: {
        caption: "Timeliness versus integrity",
        columns: ["Dimension", "Timeliness", "Integrity"],
        rows: [
          ["Question", "Do readers see the latest state?", "Is the data correct and uncorrupted?"],
          ["Violation", "Temporary ('eventual consistency')", "Permanent ('perpetual inconsistency')"],
          ["Remedy", "Wait and retry", "Explicit detection and repair"],
          ["Strong form", "Linearizability", "Atomic, exactly-once derivation of all state"],
          ["Weaker form", "Read-after-write consistency", "Loose constraints fixed by compensation, but no data loss"],
          ["In ACID", "Linearizable commit", "Atomicity, durability, declared constraints"],
          ["In dataflow", "Only if a consumer waits for the output stream", "Single atomic append, deterministic derivation, request IDs"],
          ["Importance", "Nice to have in most applications", "Usually essential"]
        ]
      },
      callout: {
        kind: "example",
        text: "A purchase that shows up on your card statement a day late is a timeliness lapse nobody minds. A statement whose totals do not add up, or money charged but never paid out, is an integrity failure that destroys trust."
      }
    },
    {
      id: "trust-but-verify",
      title: "Trust, but Verify: Auditing and Integrity Checking",
      body: [
        "All reasoning about correctness relies on a system model: processes crash, machines lose power, networks delay or drop messages, but fsynced data persists, memory is not corrupted, and the CPU multiplies correctly. Those assumptions are reasonable, yet reality is probabilistic rather than binary. Data rots silently on disks; some network corruption evades TCP checksums; Kleppmann has seen crash reports explainable only by bit flips in device memory; and the rowhammer effect shows that specific DRAM access patterns induce bit flips in healthy memory, enough to break operating system security. Such events are rare on modern hardware but not impossible, and at sufficient scale rare things happen. Software is worse. Even battle-tested databases have shipped integrity bugs: MySQL once failed to enforce a unique secondary index, and PostgreSQL's serializable isolation once permitted write skew. Less mature software should be assumed to have more such bugs, and application code far more, since it receives much less review; many applications do not even use the foreign key and uniqueness constraints their database offers. ACID consistency presumes that transactions themselves are bug-free, an assumption that fails as soon as an application misuses a weak isolation level.",
        "If corruption is eventually inevitable, you need a way to detect it so you can repair it and find its cause. Checking data integrity is **auditing**, and it is not only for finance; finance merely has a culture that openly assumes mistakes happen. Mature storage systems already behave this way: Neither HDFS nor Amazon S3 trusts disks; both run background processes that reread files, compare them with other replicas, and rewrite data to counter silent corruption. The only way to know your data is intact is to read it and check, and the only way to know your backups work is to restore them periodically. Few systems adopt this 'trust, but verify' stance; most treat guarantees as absolute and never plan for rare corruption. Kleppmann's diagnosis is historical: the ACID era taught developers to trust the transaction mechanism blindly, so auditing seemed not worth the investment; then NoSQL normalized weaker guarantees and less mature storage, but the habit of blind trust persisted, making it more dangerous than before. He hopes for self-validating systems that continuously check their own integrity.",
        "Event-based designs are inherently more auditable. A transaction that mutates several rows leaves inserts, updates, and deletes in a log, but not the reason they happened; the application decision was transient and cannot be replayed. With event sourcing, user input is recorded as one immutable event and all state changes are derived from it deterministically, so replaying the same log through the same code version reproduces the same state. Explicit dataflow makes provenance visible, which makes verification practical: hash the event log to detect storage corruption, rerun the batch and stream derivations and compare results, or run a second, redundant derivation alongside. Deterministic dataflow also gives you something like time-travel debugging, the ability to reproduce the exact circumstances behind a surprising outcome. The end-to-end argument returns here: the wider the span of an integrity check, the fewer places corruption can hide, and a check that covers a whole derived pipeline implicitly covers every disk, network, service, and algorithm along it. Like automated tests, continuous end-to-end checks catch problems early and therefore make it safer to change the system, adopt new storage technology, and evolve the application.",
        "Tooling for auditability is immature. Applications often maintain an audit table, but ensuring that the audit trail itself is trustworthy is hard; signing a transaction log with a hardware security module proves it was not altered afterwards, not that the correct transactions went in. Cryptocurrencies and distributed ledgers such as Bitcoin, Ethereum, Ripple, and Stellar are interesting from a data-systems perspective: they are distributed databases whose replicas are operated by organizations that do not trust each other, which continuously verify one another's integrity and use consensus to agree on which transactions execute. Kleppmann is skeptical about their Byzantine fault tolerance claims, finds proof of work extraordinarily wasteful, and notes that Bitcoin's low throughput is more political and economic than technical, but he finds the integrity-checking machinery worthwhile. Much of it rests on Merkle trees, hash trees that efficiently prove a record belongs to a dataset; certificate transparency uses the same structure to audit TLS certificates. He expects such techniques to spread into general data systems once their performance overhead is tamed."
      ],
      keyPoints: [
        "System models are approximations: disks, memory, and networks corrupt data at low but nonzero rates, and rowhammer shows software can induce bit flips.",
        "Even MySQL and PostgreSQL have shipped integrity bugs; application code is far less trustworthy and often ignores available constraints.",
        "Auditing means actually reading and checking data; HDFS and S3 scrub disks in the background, and backups must be test-restored.",
        "Blind trust inherited from the ACID era became more dangerous once weaker NoSQL guarantees became common.",
        "Event sourcing with deterministic derivation enables replay, hashing, redundant recomputation, and time-travel debugging.",
        "End-to-end integrity checks cover every component on the path and, like tests, make change safer.",
        "Merkle trees and certificate transparency show cryptographic auditing outside the cryptocurrency hype; proof of work is judged wasteful."
      ],
      callout: {
        kind: "pitfall",
        text: "A backup that has never been restored is an assumption, not a backup. The same goes for replicas that are never compared and derived views that are never recomputed from source."
      },
      systems: ["MySQL", "PostgreSQL", "HDFS", "Amazon S3", "Bitcoin", "Ethereum", "Ripple", "Stellar", "Certificate Transparency"]
    },
    {
      id: "predictive-analytics-ethics",
      title: "Doing the Right Thing: Predictive Analytics",
      body: [
        "The last section of the book steps back from mechanisms. Systems are built to serve a purpose, yet their consequences reach beyond it, and much of our data describes people: how they behave, what they care about, who they are. Engineers therefore make ethical choices whether they acknowledge it or not. The ACM publishes a code of ethics for software engineers, but such codes are seldom discussed or enforced, and some teams treat privacy and harm casually. A technology is neither good nor bad in itself; what counts is the use it is put to and whom it affects, and that responsibility falls partly on the people who build it. Predictive analytics is the first case study. Forecasting weather or epidemics is one thing; predicting whether a convict will reoffend, a borrower will default, or an insurance customer will file costly claims directly shapes individual lives. From an organization's standpoint a wrong 'no' costs little while a wrong 'yes' costs a lot, so caution is rational. But a person flagged as risky, accurately or not, may collect such refusals across employment, air travel, insurance, housing, and credit, an exclusion from society that has been called an **algorithmic prison**, imposed without proof and with scant opportunity to appeal.",
        "Algorithmic decisions are not automatically fairer than human ones. Humans are biased too, and there was hope that data could give overlooked people a better chance. But a machine learning system does not merely automate a human rule; it infers the rule from data, the learned patterns are opaque, and any systematic bias in the inputs is learned and amplified. Anti-discrimination law forbids decisions based on protected characteristics like gender, age, ethnicity, disability, sexual orientation, or religion, yet other features are often strong proxies: in segregated neighborhoods a postal code or even an IP address predicts race. Expecting fair outputs from biased inputs is naive, which is why one critic likened machine learning to money laundering for bias. A predictive model extrapolates from history; if that history was discriminatory, the model codifies the discrimination. Making the future better than the past takes moral imagination, which only people can supply. Data and models should be tools, not masters.",
        "Automation also blurs accountability. A human decision-maker can be held responsible and their decision appealed; who answers when a self-driving car crashes, when a credit model systematically discriminates, or when a judge asks you to explain how your model reached its conclusion? Traditional credit scores at least rest on a person's own borrowing history and can, with effort, be corrected. Machine-learned scores draw on far broader, opaque inputs. The deeper shift is from asking how you behaved to asking how people similar to you behaved, which is stereotyping by proxy, often by neighborhood, a close stand-in for race and class, with no recourse if you land in the wrong bucket or the data about you is wrong. Statistics describe populations, not individuals: an average life expectancy of 80 says nothing about when any one person will die, and a model's output is likewise probabilistic and may be wrong in your case. The same analytics that could direct aid to those who need it most is also used by predatory businesses to find vulnerable people and sell them high-cost loans and worthless degrees. We need ways to hold algorithms accountable and make them transparent, to avoid reinforcing bias, and to fix errors when they occur.",
        "Even lower-stakes predictions such as recommendations create feedback loops. A service that is good at predicting what you want to see may show only opinions you already hold, producing echo chambers where misinformation and polarization thrive, with visible effects on elections. When predictions affect livelihoods, loops become vicious: an employer screens applicants by credit score; a stroke of bad luck makes you miss payments; your score falls; you cannot find work; poverty lowers the score further. The spiral rests on poisonous assumptions dressed in mathematical rigor. Such loops cannot always be foreseen, but **systems thinking**, analyzing the whole system including the people who interact with it, predicts many of them. Ask whether a system amplifies existing differences or counteracts injustice, and expect unintended consequences even from good intentions."
      ],
      keyPoints: [
        "Technology is judged by its effects on people; engineers share ethical responsibility for the systems they build.",
        "Predictive decisions about reoffending, lending, insurance, and hiring can trap individuals in an algorithmic prison with no appeal.",
        "Models learn and amplify input bias; proxies such as postal code or IP address reintroduce protected traits.",
        "Predictive analytics stereotypes by similarity ('people like you') rather than judging a person's own record, and offers little recourse.",
        "Population statistics do not determine individual outcomes; probabilistic outputs will be wrong for some people.",
        "Accountability, transparency, and error correction are unsolved; the same tools can target aid or prey on the vulnerable.",
        "Feedback loops (echo chambers, credit-score hiring spirals) demand systems thinking about the whole socio-technical system."
      ],
      callout: {
        kind: "insight",
        text: "A model trained on yesterday's decisions reproduces yesterday's prejudices with the authority of mathematics. Fairness is not a property you get for free from data; it has to be designed, measured, and defended."
      }
    },
    {
      id: "privacy-and-tracking",
      title: "Privacy, Tracking, and the Responsibility of Engineers",
      body: [
        "Collection itself raises ethical questions, not just the decisions made from the data. When a system stores only what a user deliberately entered, the user is the customer and the system serves them. When activity is recorded as a byproduct of using the service, the service acquires interests of its own that can run against the user's. Some tracking benefits users: click data improves search ranking, co-purchase data powers recommendations, A/B tests improve interfaces. But under an advertising business model the advertisers are the real customers, so tracking becomes more detailed, retention longer, and the goal becomes a profile of each person for marketing; the free service exists to maximize engagement. Kleppmann argues that the honest word for this relationship is **surveillance**, and suggests a test: replace 'data' with 'surveillance' in your company's slogans and see whether they still sound appealing. The Internet of Things is putting a networked microphone in nearly every inhabited room (phones, televisions, voice assistants, baby monitors, toys), often with dreadful security. Totalitarian regimes could only dream of such coverage; we adopt it voluntarily, with corporations rather than governments doing the collecting. The 'nothing to hide' response presumes you are aligned with existing power and not part of a persecuted minority. Surveillance is already tied to consequences: auto insurers pricing policies from in-car trackers, health coverage contingent on fitness trackers, and research showing a smartwatch's motion sensors can infer what you type, including passwords.",
        "The consent defense is weak. Users rarely know what is collected or how it is processed, and privacy policies obscure more than they reveal, so consent cannot be meaningful. Data about one user also describes other people who never agreed to anything, and the derived datasets that Part III describes, which combine the whole user base with behavioral tracking and external sources, are beyond anyone's comprehension. The exchange is one-sided: terms are dictated, nothing is negotiated, and there is no reciprocity. Opting out is not a real choice when a service is effectively required for social or professional participation (smartphones, Facebook, Google) and network effects impose a social cost on abstainers. Only the privileged have the time, knowledge, and economic slack to decline, so for everyone else surveillance is inescapable.",
        "The claim that 'privacy is dead' because people overshare misunderstands privacy. Privacy is not secrecy; it is the freedom to choose what you disclose, to whom, and when, a decision right that is central to autonomy. Surveillance does not erase that right so much as transfer it from the person to the company, which then exercises it to maximize profit while keeping its inferences secret because revealing them would seem creepy and would erode its advantage. Intimate facts surface only indirectly, for example as ad targeting aimed at people with a particular illness; even if no individual can be reidentified, each has lost agency over that disclosure. Companies manage perceptions of creepiness rather than reducing intrusion. Data can also be wrong, undesirable, or painful (an accurate reminder can reopen a wound), and algorithms are oblivious to such human meanings unless engineers deliberately build for them, so humility is required. Privacy settings control what other users see, not what the service does internally with unrestricted access. Historically this transfer of privacy rights is unprecedented: surveillance used to be costly, manual labor, and trusted confidants such as doctors and lawyers were bound by ethics and law in ways that internet services are not.",
        "Calling behavioral data 'exhaust' suggests worthless waste being recycled. The economics say the opposite: when advertising pays, behavioral data is the core asset and the application is bait for collecting more of it, as the existence of a secretive data-broker industry and valuations based on 'eyeballs' confirm. Because the data is valuable, governments seek it through deals, coercion, legal compulsion, or theft; it is sold off in bankruptcies; and it leaks constantly. Critics therefore call it a toxic asset or hazardous material: collecting it means weighing benefits against criminals, hostile intelligence services, insider leaks, future unscrupulous management, and future governments that may not respect civil liberties, since deploying infrastructure that a future police state could exploit is bad civic hygiene. Knowledge is power, and scrutinizing others while escaping scrutiny is an especially potent form of it, which is why surveillance appeals to authoritarian states and why technology companies wield quiet, unaccountable power today. The chapter ends with the Industrial Revolution as a parallel: enormous long-term gains alongside pollution, brutal working conditions, and child labor, until regulation arrived late, raised costs, and left society better off. Bruce Schneier's analogy is that data is to the information age what pollution was to the industrial age, and future generations will judge how we handled it. Legislation can help: the 1995 European Data Protection Directive required that personal data be collected for specific, explicit purposes and be limited to what those purposes need, principles directly opposed to the Big Data habit of collecting everything and exploring later, and updated rules were in preparation when the book was written. Industry objects that regulation hinders innovation, with some justification (shared medical data could save lives). Kleppmann's prescription is a culture shift: treat users as humans with dignity rather than metrics to optimize, self-regulate, explain to users what happens to their data, delete data once it is no longer needed (which conflicts with immutability but can be reconciled), and enforce access control cryptographically rather than only by policy. Ubiquitous surveillance is not inevitable."
      ],
      keyPoints: [
        "When tracking serves advertisers rather than users, the honest term is surveillance, and the IoT is extending it into every room.",
        "Terms-of-service consent is not meaningful: users cannot understand derived datasets, data implicates non-users, and opting out of essential services is a privilege.",
        "Privacy is a decision right over disclosure, not secrecy; surveillance transfers that right to companies, which keep their inferences hidden.",
        "Privacy settings restrict other users, not the service's own unlimited internal use.",
        "Behavioral data is a core asset, not exhaust, and therefore a target for criminals, governments, and future bad actors; treat it as hazardous material.",
        "Purpose limitation and data minimization (1995 EU directive) clash with collect-everything analytics; regulation and culture both need to change.",
        "Engineers should purge unneeded data, enforce access cryptographically, educate users, and treat them as people rather than metrics."
      ],
      table: {
        caption: "Common justifications for tracking and the chapter's rebuttals",
        columns: ["Justification", "Rebuttal"],
        rows: [
          ["Users accepted the terms of service", "Consent without understanding is not consent; the data also describes people who never agreed"],
          ["Users get a valuable free service in return", "The exchange is dictated and one-sided, with no negotiation or reciprocity"],
          ["Anyone can choose not to use the service", "Opting out of de facto essential services is a privilege, not a free choice"],
          ["Privacy is dead; people overshare anyway", "Privacy is the right to choose disclosure; it was transferred to companies, not abandoned"],
          ["Privacy settings give users control", "They limit other users, not the service's own unrestricted internal processing"],
          ["We only keep harmless behavioral exhaust", "Inference reveals intimate traits, and the data outlives today's management and government"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Data you never collect cannot leak, cannot be subpoenaed, and cannot be abused by whoever runs your company or your country in twenty years. Minimization and deletion are engineering safeguards, not just legal compliance."
      },
      systems: ["Facebook", "Google"]
    },
    {
      id: "chapter-summary",
      title: "Summary: How the Pieces Fit",
      body: [
        "The chapter's argument runs in one line from engineering to ethics. Because no single tool can serve every use case, applications must compose several, and the robust way to do so is to let changes flow from systems of record through batch and stream processing into derived views such as indexes, caches, models, and summaries. Making those derivations asynchronous and loosely coupled contains faults, and expressing them as transformations lets you evolve the application by rerunning new code over old input, or recover from bugs by reprocessing. Since this is what databases already do internally, the architecture is best understood as unbundling the database into independently operated components. Derived state can itself be observed, so the same dataflow can continue out to the devices in users' hands that update live and keep working offline.",
        "Correctness in this world does not come from distributed transactions. Strong integrity is achievable scalably by assigning end-to-end operation identifiers, deriving effects deterministically from a single atomic append, and checking constraints asynchronously, with clients either waiting for the verdict or proceeding and accepting the occasional apology. Separating timeliness from integrity shows that most coordination is unnecessary, enabling systems that stay correct across datacenters and under faults. Because hardware and software both fail silently, integrity must be audited rather than assumed. Finally, data describes people, and the same systems that can do good can impose unaccountable decisions, launder bias, normalize surveillance, and expose intimate information. The book closes by asking engineers to build toward a world in which people are treated with dignity."
      ],
      keyPoints: [
        "Compose specialized tools by deriving data through ordered logs rather than by distributed transactions or dual writes.",
        "Reprocessing and asynchronous derivation make systems both evolvable and fault-contained.",
        "End-to-end IDs plus deterministic derivation give integrity without coordination; timeliness is a separate, often optional, requirement.",
        "Audit continuously because every component can corrupt data.",
        "Reliability, scalability, and maintainability are necessary but not sufficient; systems must also be beneficial and respectful to the people they describe."
      ]
    }
  ],
  terms: [
    { term: "System of record", definition: "The authoritative store that receives writes first; every other representation of the data is derived from it rather than written independently." },
    { term: "Derived data", definition: "Any dataset computed from another, such as an index, cache, materialized view, or model; it can be rebuilt from its source by rerunning the derivation." },
    { term: "Total order broadcast", definition: "Delivering all events to all consumers in the same order; equivalent to consensus and the foundation for keeping derived systems mutually consistent." },
    { term: "Lambda architecture", definition: "A design that runs a batch layer and a stream layer in parallel over an immutable event store, merging approximate fast results with exact later ones." },
    { term: "Unbundled database", definition: "An architecture in which indexing, caching, and view maintenance are performed by separate systems connected through event logs, instead of inside one database product." },
    { term: "Federated database (polystore)", definition: "A single query interface layered over several heterogeneous storage engines; it unifies reads but does not synchronize writes." },
    { term: "Write path and read path", definition: "The write path is eager precomputation performed as data arrives; the read path is lazy work done per query. Indexes and caches move the boundary between them." },
    { term: "End-to-end argument", definition: "The principle that some functions, such as duplicate suppression or integrity checking, can only be completed at the application endpoints; lower layers can help but cannot finish the job." },
    { term: "Operation identifier", definition: "A unique ID created at the origin of a request and carried through every hop so that retries can be recognized and suppressed all the way to the database." },
    { term: "Timeliness", definition: "The property that readers observe up-to-date state; its violations (stale reads) are temporary and resolve by waiting." },
    { term: "Integrity", definition: "The absence of corruption: no lost, contradictory, or false data, and derived views that correctly reflect their sources. Violations are permanent until explicitly repaired." },
    { term: "Compensating transaction", definition: "A later corrective action, such as a refund or apology, that repairs a constraint violation that was allowed to happen rather than prevented up front." },
    { term: "Coordination-avoiding system", definition: "A data system that preserves integrity without synchronous cross-partition or cross-region coordination, accepting weaker timeliness in exchange for availability and performance." },
    { term: "Auditing", definition: "Actively checking that data is intact and that derived state matches its sources, rather than assuming hardware and software guarantees hold." },
    { term: "Merkle tree", definition: "A tree of hashes that lets one efficiently prove a record is part of a dataset; used in certificate transparency and distributed ledgers for integrity checking." }
  ],
  pitfalls: [
    "Believing that exactly-once semantics in a stream processor means each business operation happens once. It only covers redelivery inside the pipeline; a user resubmitting a form enters as a new event. Correction: generate an operation ID at the origin and deduplicate on it end to end.",
    "Treating eventual consistency and data corruption as the same kind of inconsistency. Stale reads (timeliness) heal by waiting; lost or doubled updates (integrity) never heal on their own. Correction: design for integrity first and treat timeliness as a separate, often negotiable, requirement.",
    "Assuming unbundling means replacing databases with stream processors. Databases remain essential for processor state and for serving queries, and a single integrated product is the better choice whenever it meets all requirements. Correction: unbundle only when no single system covers your workloads.",
    "Writing to the database and the search index directly from application code and considering it safe because both writes usually succeed. Concurrent writers can be applied in different orders in the two stores, producing permanent divergence. Correction: route all writes through one ordered log and derive the index from it.",
    "Expecting a model trained on historical data to produce unbiased decisions because the data is 'objective'. Historical bias is learned and amplified, and proxies such as postal codes reintroduce protected traits. Correction: measure outcomes across groups, keep humans accountable, and provide recourse.",
    "Trusting that serializable transactions make an application's data correct. Application bugs, database bugs, and silent hardware corruption all bypass transaction guarantees. Correction: audit continuously, prefer immutable events you can replay, and verify derived state against its sources."
  ],
  connections: [
    { chapter: 1, note: "The Twitter timeline example of fan-out on write versus fan-out on read is exactly the write-path/read-path boundary discussed here, and the book's goals of reliability, scalability, and maintainability gain a fourth: being beneficial to people." },
    { chapter: 5, note: "Read-your-writes consistency, multi-leader replication across datacenters, and offline-capable clients reappear as the timeliness guarantees that asynchronous derived systems give up and as the settings where total ordering is impossible." },
    { chapter: 7, note: "The textbook two-statement money transfer from the transactions chapter is shown to be non-idempotent; ACID consistency is reinterpreted as integrity, and weak isolation levels motivate relying on database-enforced uniqueness constraints." },
    { chapter: 9, note: "Linearizability, consensus, and total order broadcast underpin the claims that uniqueness requires consensus, that partitioned logs can implement linearizable constraint checks, and that scalable geo-distributed consensus remains open." },
    { chapter: 10, note: "The Unix philosophy, deterministic batch jobs with immutable inputs, and reprocessing whole datasets provide the model for unbundled composition and for gradual schema migration via side-by-side derived views." },
    { chapter: 11, note: "Change data capture, event sourcing, log-based brokers, stream-table joins, exactly-once processing, and time-dependent joins are the raw materials this chapter assembles into dataflow applications and coordination-avoiding correctness." }
  ],
  flashcards: [
    { front: "Why route all writes through one ordered log instead of letting the application update both the database and the search index?", back: "With two independent writers, concurrent updates can be applied in different orders by the two stores, and no component is responsible for ordering, so they diverge permanently. One log fixes a total order; derived stores consume it in that order and stay consistent." },
    { front: "Contrast how distributed transactions and log-based derived data achieve ordering and once-only effects.", back: "Transactions order writes with locks (2PL) and guarantee single effect via atomic commit. Log-based systems order by log position and achieve effectively-once behavior through deterministic replay and idempotent consumers." },
    { front: "What guarantee do you give up when moving from distributed transactions to asynchronously derived data?", back: "Linearizability, and with it read-your-writes: a derived view may lag behind the system of record, so a client cannot assume its own write is immediately visible everywhere." },
    { front: "List four situations where a single total order of events becomes infeasible.", back: "Throughput beyond one node forces partitioned logs; multi-datacenter deployments use a leader per region; microservices each own private state; offline-capable clients apply input before the server sees it. Each leaves some events mutually unordered." },
    { front: "What goes wrong in the unfriend-then-message scenario, and what kind of problem is it?", back: "Friendship state and messages live in different systems, so the notification service may process the message before the unfriend and alert the ex-partner. It is a lost causal dependency, effectively a time-dependent join between two streams." },
    { front: "What does reprocessing enable for application evolution that ordinary schema evolution cannot?", back: "Schema evolution alone supports additive changes like new optional fields. Reprocessing lets you rebuild the whole dataset into a completely different structure as a new derived view while the old view keeps serving." },
    { front: "How does the dual-gauge railway story map to data migrations?", back: "Adding a third rail let old and new trains share track during a long transition. Likewise, maintain old and new derived views side by side, shift users gradually, and remove the old view only when nothing depends on it. Each step is reversible." },
    { front: "Summarize the lambda architecture and its three practical drawbacks.", back: "Immutable events feed a batch layer (exact, slow) and a speed layer (approximate, fast), merged at read time. Drawbacks: logic duplicated across two frameworks, hard output merging for joins and sessions, and incremental batching that reintroduces streaming complexity." },
    { front: "Which three capabilities let a single engine replace the lambda architecture?", back: "Replaying historical events through the same engine that handles live events, exactly-once output (discarding partial results of failed tasks), and windowing by event time rather than processing time, as Apache Beam on Flink or Cloud Dataflow provides." },
    { front: "In what sense is CREATE INDEX the same as setting up a replica or bootstrapping CDC?", back: "All three take a consistent snapshot, derive a new representation from it, apply the backlog of writes made during the build, and then keep the derived copy current from the ongoing change stream. Index creation is reprocessing existing data into a new view." },
    { front: "Federated versus unbundled databases: what does each unify, and which tradition does each follow?", back: "Federation unifies reads behind one query interface (relational tradition: integrated system, high-level language). Unbundling unifies writes by propagating changes via logs and CDC (Unix tradition: small tools composed through a uniform interface)." },
    { front: "What two levels of loose coupling does log-based integration provide?", back: "System level: a slow or failed consumer does not affect producers or other consumers because the log buffers events until it catches up. Human level: teams build and operate components independently behind a durable, ordered, general-purpose interface." },
    { front: "Why are databases poor hosts for application-specific derivation code?", back: "Triggers, stored procedures, and UDFs are afterthoughts, and databases lack dependency management, version control, rolling upgrades, monitoring, and clean access to external services. Runtimes like Kubernetes, Mesos, YARN, and Docker are built for that job." },
    { front: "What distinguishes maintaining derived data from ordinary asynchronous job execution?", back: "Ordering: all views derived from a log must apply events in the same order, which many brokers break on redelivery. Fault tolerance: losing a single message leaves the view permanently inconsistent, so in-memory actor state is inadequate." },
    { front: "In the exchange-rate example, how does the dataflow approach differ from the microservice approach, and what caveat applies to both?", back: "The microservice calls a rate service per purchase; the dataflow operator subscribes to rate updates in advance and joins locally, avoiding a network call and tolerating the rate service being down. Both must handle time dependence: reprocessing needs historical rates." },
    { front: "Define write path and read path, and say what an index does to the boundary between them.", back: "The write path is eager work done as data arrives (updating derived views); the read path is lazy work done per query. An index shifts work from read time to write time, so queries do lookups instead of scans." },
    { front: "How does server push relate to the write path, and how are offline devices handled?", back: "Pushing changes via EventSource or WebSockets extends the write path to the client, which fetches initial state once and then consumes a stream. An offline device behaves like a disconnected log consumer: on reconnect it resumes from its last offset." },
    { front: "What does it mean to treat reads as events, and what does it enable?", back: "Read requests are appended to a stream and joined against state by a partitioned stream operator, which emits results. This unifies queries and subscriptions (persistent joins), records what users saw for provenance, and enables distributed multi-partition query execution." },
    { front: "Why is the classic two-UPDATE money transfer transaction not actually correct?", back: "If the client times out after sending COMMIT, it cannot tell whether the transfer happened. Retrying on a new connection is outside TCP deduplication and the transaction is not idempotent, so the money may move twice." },
    { front: "How does an end-to-end operation identifier suppress duplicates, and why is it safe at weak isolation?", back: "The client generates a UUID (or field hash), carries it to the database, and inserts it into a requests table with a UNIQUE constraint alongside the updates. A retry violates the constraint and aborts. Databases enforce uniqueness correctly even at weak isolation, unlike check-then-insert." },
    { front: "State the end-to-end argument and give two applications besides duplicate suppression.", back: "Some functions can only be fully implemented with application knowledge at the endpoints; lower layers can at best optimize. Examples: integrity needs end-to-end checksums because TCP and TLS miss endpoint bugs and disk corruption; confidentiality needs end-to-end encryption because TLS does not cover a compromised server." },
    { front: "How can a uniqueness constraint be enforced using a partitioned log without a distributed transaction?", back: "Partition the log by hash of the value. A single-threaded processor per partition reads claims in order, tracks taken values locally, and emits accept or reject messages; the client waits for its verdict. This is linearizable storage via total order broadcast, scaled by adding partitions." },
    { front: "Describe the three-stage log-based money transfer that avoids multi-partition atomic commit.", back: "1: client assigns a request ID and appends the transfer to a log partitioned by that ID. 2: a processor emits a debit to the payer partition and a credit to the payee partition, both tagged with the ID. 3: account processors deduplicate by ID and apply. Crashes only produce identical duplicates." },
    { front: "Distinguish timeliness from integrity. Which does the author rank higher, and why?", back: "Timeliness: readers see current state; violations are temporary. Integrity: no lost, false, or contradictory data; violations are permanent. Integrity matters more: a late card transaction is normal, but wrong totals or vanished money are catastrophic." },
    { front: "What four mechanisms let dataflow systems preserve integrity without atomic commit?", back: "Record each write as one atomically appended message; derive all other updates deterministically from it; pass the client's request ID through every stage for deduplication; keep messages immutable so derived data can be reprocessed after bugs." },
    { front: "What is a compensating transaction, and when is relaxing a constraint acceptable?", back: "A later corrective action (apology, refund, reorder, upgrade) that repairs a violated constraint. Acceptable when the business cost of the apology is tolerable, as with overbooked flights or oversold stock, provided integrity is never lost and irreversible actions are still validated first." },
    { front: "What is a coordination-avoiding data system and what does it trade away?", back: "A system that maintains strong integrity through dataflow and asynchronous constraint checks without synchronous cross-partition or cross-region coordination. It can run multi-leader across datacenters with high availability but cannot be linearizable, so it sacrifices timeliness." },
    { front: "Name faults that fall outside typical system models and the practice that addresses them.", back: "Silent disk corruption, network corruption evading TCP checksums, memory bit flips including rowhammer, and integrity bugs even in MySQL and PostgreSQL. The response is auditing: reading data back, comparing replicas, test-restoring backups, and recomputing derived state." },
    { front: "Why do event-sourced systems offer better auditability than database transaction logs?", back: "A transaction log shows row mutations but not why they happened. An immutable event records the user's intent, and deterministic derivation reproduces state on replay, so you can hash the log, rerun or duplicate derivations, compare results, and debug by replaying history." },
    { front: "How does the chapter define privacy, and what happens to it under surveillance?", back: "Privacy is the freedom to choose what you disclose and to whom, not secrecy. Surveillance moves that decision right away from the person and into the company, which exercises it for profit, keeps its inferences hidden, and leaves users without agency over disclosure." }
  ],
  quiz: [
    {
      question: "An application writes each new product record to PostgreSQL and then to Elasticsearch directly. Both writes almost always succeed. What is the fundamental problem the chapter identifies with this design?",
      choices: [
        "Elasticsearch cannot store the full document, so data is lost",
        "The second write doubles latency, which violates timeliness",
        "Concurrent writers can be applied in different orders by the two stores, so they diverge permanently with no component in charge of ordering",
        "PostgreSQL's full-text search makes Elasticsearch redundant"
      ],
      answer: 2,
      explanation: "Dual writes have no single arbiter of order, so two racing updates to the same key can land in opposite orders in the two systems and never reconcile. Latency and storage capacity are not the core issue, and PostgreSQL's built-in search is only adequate for simple cases, so Elasticsearch is not redundant."
    },
    {
      question: "Compared with distributed transactions, what do asynchronously derived data systems lack by default?",
      choices: [
        "Linearizability, including the ability to read your own writes immediately",
        "Durability of the system of record",
        "Idempotent processing of change events",
        "A defined order of writes within one partition"
      ],
      answer: 0,
      explanation: "Derived views update after the fact, so a client may not see its own write in the index or cache right away; transactions, being linearizable, provide that. Durability, idempotence, and per-partition ordering are strengths of log-based systems, not weaknesses."
    },
    {
      question: "Which of the following is a genuine drawback of the lambda architecture as described in the chapter?",
      choices: [
        "It cannot store events immutably",
        "The same processing logic must be implemented and operated in both a batch framework and a stream framework",
        "It forbids reprocessing historical data",
        "It requires event-time windowing, which batch systems cannot provide"
      ],
      answer: 1,
      explanation: "Running parallel batch and speed layers means duplicating logic and operating two systems; Summingbird eases the coding but not the operations. Lambda is built on immutable events and explicitly embraces reprocessing, and event-time windowing is a feature of unified systems, not a flaw of lambda."
    },
    {
      question: "In the chapter's terminology, what does an unbundled database unify, and through what mechanism?",
      choices: [
        "Reads, through a single SQL interface over heterogeneous engines",
        "Schemas, through a shared data dictionary",
        "Writes, by propagating changes through event logs and change data capture to every derived store",
        "Transactions, through a standardized two-phase commit protocol"
      ],
      answer: 2,
      explanation: "Unbundling extracts the database's index-maintenance role so that writes reliably reach all storage systems via ordered logs. Unifying reads through one query interface describes a federated database or polystore. Standardized heterogeneous 2PC is exactly what the chapter rejects."
    },
    {
      question: "In the currency-conversion example, what does the dataflow design replace, and with what?",
      choices: [
        "A synchronous call to an exchange-rate service, replaced by a local lookup in a table maintained from a stream of rate updates",
        "A local cache, replaced by a remote database query for freshness",
        "Event-time processing, replaced by processing-time windows",
        "An idempotent operation, replaced by an atomic commit"
      ],
      answer: 0,
      explanation: "Subscribing to rate updates ahead of time turns the conversion into a stream-table join against local state, removing a network round trip and tolerating the rate service being down. The other options invert the chapter's point or describe unrelated mechanisms."
    },
    {
      question: "A user submits a payment form over a weak mobile connection, the server processes it, the response is lost, and the browser resubmits. Which single mechanism prevents a double charge?",
      choices: [
        "TCP sequence numbers on the connection",
        "A client-generated request ID stored under a uniqueness constraint within the payment's own transaction",
        "Using two-phase commit between the application server and the database",
        "Post/Redirect/Get after a successful submission"
      ],
      answer: 1,
      explanation: "Only an identifier created at the origin and checked end to end recognizes the resubmission as a duplicate. TCP deduplication covers one connection, 2PC covers the coordinator-to-database hop, and Post/Redirect/Get only avoids the resubmit prompt when the response actually arrived."
    },
    {
      question: "In the log-based money transfer, why is the request first appended as a single message before separate debit and credit instructions are emitted?",
      choices: [
        "Because stream processors cannot write to two partitions",
        "To make the transfer linearizable for the client",
        "Because the log is faster than the account databases",
        "Because a single-object append is atomic in almost every system, so it records intent without a multi-partition atomic commit, and everything else can be derived deterministically"
      ],
      answer: 3,
      explanation: "Sending debit and credit directly would need atomic commit across two partitions. Logging one message is atomic, and the downstream instructions carry the request ID so duplicates after a crash are harmless. Linearizability is not provided, and speed is not the motivation."
    },
    {
      question: "Which of these is an integrity violation rather than a timeliness violation?",
      choices: [
        "A credit card statement whose closing balance does not equal the opening balance plus the listed transactions",
        "A purchase that appears on the statement a day after it was made",
        "A follower reading a replica that is a few seconds behind the leader",
        "A search index that reflects a document update only after a short delay"
      ],
      answer: 0,
      explanation: "Wrong totals mean the data itself is corrupt and will not fix itself; that is lost integrity, or perpetual inconsistency. The other three are stale-but-correct states that resolve by waiting, which is the definition of a timeliness lapse."
    },
    {
      question: "Which statement about a coordination-avoiding data system is correct?",
      choices: [
        "It achieves linearizability by using a global leader",
        "It cannot run across multiple datacenters",
        "It abandons integrity in favor of availability",
        "It preserves strong integrity without synchronous cross-region coordination, accepting weaker timeliness and occasional compensating actions"
      ],
      answer: 3,
      explanation: "Such systems keep derived state correct through dataflow and asynchronous constraint checks while running multi-leader across regions. They are not linearizable, they explicitly target multi-datacenter operation, and preserving integrity is their defining goal."
    },
    {
      question: "Which practice best embodies the chapter's 'trust, but verify' principle?",
      choices: [
        "Relying on serializable isolation so corruption cannot occur",
        "Background processes that reread stored files, compare them with replicas, and rewrite corrupted copies, as HDFS and S3 do",
        "Keeping audit records in the same mutable table as the data they describe",
        "Assuming fsynced data on disk is never lost"
      ],
      answer: 1,
      explanation: "Scrubbing storage assumes disks mostly work but checks anyway, which is the essence of auditing. Serializability does not stop bugs or hardware faults, mutable audit tables lack integrity guarantees of their own, and trusting fsync unconditionally is the blind trust the chapter warns against."
    },
    {
      question: "A lending model is trained without any protected attributes, yet it still discriminates by race. What explanation does the chapter give?",
      choices: [
        "The model has too few parameters to be accurate",
        "Anti-discrimination law does not apply to automated decisions",
        "Features such as postal code or IP address act as proxies for protected traits, so historical bias in the training data is learned and amplified",
        "Predictive models always favor minorities, so the result must be a data error"
      ],
      answer: 2,
      explanation: "Models extrapolate from past outcomes, and correlated proxies reintroduce protected characteristics even when they are omitted. Model size is irrelevant to the mechanism, the law does apply, and there is no general tendency for models to favor any group."
    },
    {
      question: "According to the chapter, what does the right to privacy consist of?",
      choices: [
        "Keeping all personal information secret from everyone",
        "The absence of any data collection by online services",
        "A guarantee that collected data will not be sold to third parties",
        "Each person's freedom to decide what to reveal, to whom, and what to keep private in each situation"
      ],
      answer: 3,
      explanation: "Privacy is framed as a decision right over disclosure, which is why oversharing does not prove privacy is dead and why surveillance transfers rather than destroys the right. It is not total secrecy, not an absence of collection, and not merely a no-resale promise, which still leaves the service free to exploit data internally."
    }
  ],
  reviewQuestions: [
    "You run an e-commerce platform whose product data must appear in PostgreSQL, Elasticsearch, a Redis cache, and a data warehouse. Design the dataflow using the chapter's principles: identify the system of record, the ordering mechanism, how each derived store is bootstrapped and kept current, how you would migrate the search index to a new schema without downtime, and which guarantees users lose compared with a single-database design.",
    "A product manager insists that account registration must guarantee unique usernames and that the system must survive a full datacenter outage with no downtime. Using the concepts of consensus, partitioned logs, timeliness, integrity, and compensating transactions, lay out the options, explain what each one can and cannot promise, and recommend one with justification.",
    "Take the end-to-end argument and apply it to a payment flow that passes through a mobile app, an API gateway, a stream processor with exactly-once semantics, and a relational database. For each hop, state which duplicate-suppression mechanism exists, what failure it misses, and how a client-generated operation ID closes the gap. Then explain how the same argument applies to data integrity checks across that pipeline.",
    "Compare the lambda architecture, a unified stream engine such as Flink with event-time windows, and the 'reads are events' design in which queries themselves flow through the stream processor. For a real-time fraud-scoring system that joins purchase events with several partitioned reputation datasets, which approach would you choose, and what operational, correctness, and cost trade-offs drive that decision?",
    "Your team proposes retaining all clickstream data indefinitely to train future recommendation models, funded by advertising. Evaluate the proposal using the chapter's discussion of surveillance, meaningful consent, privacy as a decision right, data as a hazardous asset, feedback loops, and purpose limitation. Propose concrete engineering changes (retention, access control, auditing, user education) that would make the system defensible, and identify what you would refuse to build."
  ]
});
