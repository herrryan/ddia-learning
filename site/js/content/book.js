/* Book-level metadata authored for this study guide: parts, cross-cutting themes, and a study plan.
   Chapter content lives in ch01.js … ch12.js; the glossary in glossary.js. */
DDIA.book = {
  title: "Designing Data-Intensive Applications",
  shortTitle: "DDIA",
  author: "Martin Kleppmann",
  publisher: "O'Reilly Media, 2017",

  /* Fallback titles so navigation works even if a chapter file fails to load. */
  chapterTitles: {
    1: "Reliable, Scalable, and Maintainable Applications",
    2: "Data Models and Query Languages",
    3: "Storage and Retrieval",
    4: "Encoding and Evolution",
    5: "Replication",
    6: "Partitioning",
    7: "Transactions",
    8: "The Trouble with Distributed Systems",
    9: "Consistency and Consensus",
    10: "Batch Processing",
    11: "Stream Processing",
    12: "The Future of Data Systems"
  },

  parts: [
    {
      number: 1,
      title: "Foundations of Data Systems",
      chapters: [1, 2, 3, 4],
      question: "What do we want from a data system, and how does a single machine deliver it?",
      summary: "The first four chapters set up the vocabulary for the rest of the book and look inside a single-node data system. You learn how to talk about reliability, scalability, and maintainability; how different data models shape what applications can express; how storage engines lay out bytes on disk; and how encoding formats let data and code evolve independently."
    },
    {
      number: 2,
      title: "Distributed Data",
      chapters: [5, 6, 7, 8, 9],
      question: "What changes when data lives on many machines, and what can we still guarantee?",
      summary: "Spreading data across nodes buys scalability, fault tolerance, and lower latency, but it exposes the application to replication lag, partial failure, unreliable clocks, and the limits of coordination. These five chapters move from the mechanics of replication and partitioning, through transactions, to the hardest questions: what is true in a distributed system, and how do nodes agree on it?"
    },
    {
      number: 3,
      title: "Derived Data",
      chapters: [10, 11, 12],
      question: "How do we integrate many specialised systems into one coherent, correct application?",
      summary: "Real applications combine several datastores, caches, indexes, and analytics systems. Part III frames those secondary systems as derived data, computed from a system of record, and shows how batch processing and stream processing keep derived data up to date. The final chapter sketches a dataflow-centric architecture and asks what correctness and ethics demand of the people who build it."
    }
  ],

  themes: [
    {
      id: "trade-offs",
      title: "Every design is a trade-off",
      summary: "The book never crowns a winner. Each chapter frames a decision, shows what you gain and what you give up, and asks which side matters for your workload. Learning to name the axis of a trade-off is the core skill the book teaches.",
      threads: [
        { chapter: 2, text: "Relational vs document vs graph models: joins and normalisation against locality and schema flexibility." },
        { chapter: 3, text: "B-trees vs LSM-trees: read amplification against write amplification and compaction cost." },
        { chapter: 5, text: "Synchronous vs asynchronous replication: durability against write latency and availability." },
        { chapter: 7, text: "Isolation levels: correctness guarantees against throughput and the risk of aborts." },
        { chapter: 9, text: "Linearizability vs availability and latency when the network partitions." }
      ]
    },
    {
      id: "logs",
      title: "The log is everywhere",
      summary: "An append-only sequence of records is the simplest durable data structure, and it keeps reappearing: as the write-ahead log of a storage engine, as the replication stream between leader and followers, as a message broker's partition, and as the event history in event sourcing. If you understand the log, you understand half the book.",
      threads: [
        { chapter: 3, text: "Hash indexes over append-only segments, SSTables, and the write-ahead log that protects B-trees." },
        { chapter: 5, text: "Replication logs: statement, WAL shipping, logical (row-based), and trigger-based." },
        { chapter: 9, text: "Total order broadcast is a shared log; consensus decides what goes in it." },
        { chapter: 11, text: "Log-based message brokers, change data capture, and event sourcing all treat the log as the source of truth." },
        { chapter: 12, text: "Unbundled databases connect components through logs of state changes." }
      ]
    },
    {
      id: "ordering",
      title: "Ordering, causality, and time",
      summary: "Many distributed-systems problems reduce to a question about order: which write came first, did this read see that write, and can two nodes agree on a sequence? The book builds the answer up gradually, from replication-lag anomalies to Lamport timestamps and total order broadcast.",
      threads: [
        { chapter: 5, text: "Read-your-writes, monotonic reads, and consistent prefix reads are all ordering anomalies." },
        { chapter: 8, text: "Time-of-day clocks drift, monotonic clocks cannot be compared across nodes, and processes pause unexpectedly." },
        { chapter: 9, text: "Causal order vs total order; Lamport timestamps; why total order broadcast is equivalent to consensus." },
        { chapter: 11, text: "Event time vs processing time, windows, and straggler events in stream processing." },
        { chapter: 12, text: "Why a global total order does not scale, and how to capture causality without one." }
      ]
    },
    {
      id: "faults",
      title: "Design for partial failure",
      summary: "On one machine a fault usually crashes everything cleanly. In a distributed system some parts fail, some are slow, and nobody can tell the difference. The recurring remedies are timeouts, retries made safe by idempotence, quorums, fencing tokens, and algorithms that stay correct under any interleaving.",
      threads: [
        { chapter: 1, text: "Hardware, software, and human faults; fault tolerance as the route to reliability." },
        { chapter: 5, text: "Follower catch-up, leader failover, split brain, and quorum reads and writes." },
        { chapter: 8, text: "Unbounded network delay, unreliable clocks, process pauses, and the majority as the definition of truth." },
        { chapter: 9, text: "Two-phase commit blocks when the coordinator dies; fault-tolerant consensus does not." },
        { chapter: 11, text: "Checkpointing, microbatching, idempotent writes, and rebuilding state after failure." }
      ]
    },
    {
      id: "consistency",
      title: "The consistency spectrum",
      summary: "Consistency is not one thing. The book separates transaction isolation on a single node from replica consistency across nodes, and lays both out as a spectrum from weak-but-fast to strong-but-coordinated. Knowing which guarantee you actually need is what keeps systems both correct and fast.",
      threads: [
        { chapter: 5, text: "Eventual consistency and the specific anomalies replication lag produces." },
        { chapter: 7, text: "Read committed, snapshot isolation, and serializability; lost updates, write skew, and phantoms." },
        { chapter: 9, text: "Linearizability, causal consistency, and why the CAP theorem is less useful than it sounds." },
        { chapter: 12, text: "Timeliness vs integrity: which half of consistency matters most, and which can wait." }
      ]
    },
    {
      id: "evolution",
      title: "Schemas evolve; data outlives code",
      summary: "Requirements change, so formats, schemas, and derived views must change without downtime or data loss. The book treats compatibility as a first-class design constraint, from encoding formats to database migrations to reprocessing whole datasets.",
      threads: [
        { chapter: 2, text: "Schema-on-write vs schema-on-read, and what each makes easy or hard to change." },
        { chapter: 4, text: "Backward and forward compatibility in Thrift, Protocol Buffers, Avro, and across services and queues." },
        { chapter: 10, text: "Batch jobs rebuild derived datasets from scratch, which makes experimentation and rollback cheap." },
        { chapter: 12, text: "Reprocessing streams and running old and new views side by side to migrate gradually." }
      ]
    },
    {
      id: "derived-data",
      title: "Derived data and dataflow",
      summary: "Caches, indexes, materialised views, search engines, and analytics tables are all derived from some system of record. Making that derivation explicit, as a batch job or a stream processor, clarifies ownership, makes failures recoverable, and turns integration from an afterthought into an architecture.",
      threads: [
        { chapter: 3, text: "Indexes and materialised views are the first derived data you meet, inside a single database." },
        { chapter: 10, text: "MapReduce and dataflow engines derive outputs from immutable inputs." },
        { chapter: 11, text: "Change data capture and event sourcing turn the database into a stream others can derive from." },
        { chapter: 12, text: "Unbundling the database: application code as a derivation function between streams of state." }
      ]
    },
    {
      id: "end-to-end",
      title: "Idempotence and end-to-end correctness",
      summary: "Retries create duplicates, and no single layer can suppress them for the whole system. The reliable approach is to give each operation an identifier, make writes idempotent, and verify integrity end to end instead of trusting every component to be perfect.",
      threads: [
        { chapter: 4, text: "At-least-once message delivery means consumers must tolerate repeats." },
        { chapter: 8, text: "A timed-out request may or may not have been executed; the sender cannot know." },
        { chapter: 11, text: "Exactly-once processing is really effectively-once: idempotence plus atomic offset commits." },
        { chapter: 12, text: "The end-to-end argument, uniqueness constraints via logs, and a culture of auditing data." }
      ]
    }
  ],

  plan: [
    {
      week: 1,
      title: "Vocabulary and data models",
      chapters: [1, 2],
      focus: "Build the lens you will use for the whole book, then compare the major data models.",
      goals: [
        "Define reliability, scalability, and maintainability in your own words and give one concrete metric for each.",
        "Explain why percentiles, not averages, describe response time.",
        "Decide for a sample application whether relational, document, or graph fits best, and defend the choice."
      ]
    },
    {
      week: 2,
      title: "Storage engines and encodings",
      chapters: [3, 4],
      focus: "Go below the query language: how bytes reach disk and how they travel between processes.",
      goals: [
        "Trace a write and a read through an LSM-tree and through a B-tree.",
        "Explain why column stores compress so well and when they fit.",
        "State the schema evolution rules of Protocol Buffers and Avro, and what each format needs at read time."
      ]
    },
    {
      week: 3,
      title: "Replication and partitioning",
      chapters: [5, 6],
      focus: "Spread data across nodes and confront the first anomalies of distribution.",
      goals: [
        "Compare single-leader, multi-leader, and leaderless replication on availability, latency, and conflicts.",
        "Diagnose a replication-lag anomaly and pick the guarantee that fixes it.",
        "Choose a partitioning scheme for a skewed workload and plan how to rebalance it."
      ]
    },
    {
      week: 4,
      title: "Transactions",
      chapters: [7],
      focus: "A full week for one dense chapter: isolation levels and the anomalies each one prevents.",
      goals: [
        "Give an example of a dirty read, a lost update, write skew, and a phantom.",
        "Explain how snapshot isolation works with MVCC and what it still allows.",
        "Contrast actual serial execution, two-phase locking, and serializable snapshot isolation."
      ]
    },
    {
      week: 5,
      title: "The hard parts of distribution",
      chapters: [8, 9],
      focus: "Networks, clocks, and process pauses; then linearizability, ordering, and consensus.",
      goals: [
        "Explain why a timeout cannot distinguish a slow node from a dead one, and what fencing tokens fix.",
        "Define linearizability and show how it differs from serializability and from causal consistency.",
        "Describe two-phase commit and why fault-tolerant consensus is a different problem."
      ]
    },
    {
      week: 6,
      title: "Batch and stream processing",
      chapters: [10, 11],
      focus: "Derive data at scale, first in bulk, then continuously.",
      goals: [
        "Walk through a MapReduce job with a reduce-side join and a map-side join.",
        "Explain how log-based brokers differ from traditional message queues.",
        "Compare change data capture with event sourcing and describe event-time windowing."
      ]
    },
    {
      week: 7,
      title: "Putting it together",
      chapters: [12],
      focus: "Dataflow architectures, end-to-end correctness, and the ethics of data systems. Then review everything.",
      goals: [
        "Sketch an application built from a system of record plus derived views connected by streams.",
        "Apply the end-to-end argument to a duplicate-request scenario.",
        "Revisit flashcards marked 'still learning' from every chapter and retake the weakest quizzes."
      ]
    }
  ]
};
