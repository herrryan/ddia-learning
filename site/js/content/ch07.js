DDIA.registerChapter({
  number: 7,
  part: 2,
  title: "Transactions",
  tagline: "Which guarantees can a database give concurrent, failure-prone clients, and what does each guarantee cost?",
  studyMinutes: 110,
  overview: [
    "A transaction bundles several reads and writes into one unit that either takes effect completely or not at all. This chapter first unpacks what the ACID letters really promise and shows that the acronym hides a lot of ambiguity, especially around isolation. It then spends most of its length on concurrency control: the read committed, snapshot isolation, and serializable levels, each defined by the race conditions it rules out (dirty reads and writes, read skew, lost updates, write skew, phantoms), and the three ways databases implement true serializability: running transactions one at a time, two-phase locking, and serializable snapshot isolation.",
    "The material matters because most production relational databases default to weak isolation, and bugs caused by weak isolation have lost real money and corrupted real data. Picking a database that calls itself ACID does not make your code safe. You need to know which anomalies your isolation level permits, which of your invariants those anomalies can break, and which tool (atomic operation, explicit lock, constraint, or a stronger level) closes each gap.",
    "Within the book, Chapter 7 deliberately stays mostly on a single node so that the vocabulary is clear before distribution complicates it. It leans on Chapter 3 (write-ahead logs and B-trees for crash recovery), Chapter 5 (conflict resolution and durability through replication), and Chapter 6 (partitioning, which decides whether serial execution can scale). Chapters 8 and 9 then take these ideas into distributed systems, where two-phase commit, linearizability, and consensus pick up the story."
  ],
  bigIdeas: [
    "A transaction turns many failure modes into one simple outcome: the whole thing either committed or it did not, so the application can just retry.",
    "ACID is imprecise: atomicity really means abortability, consistency is the application's job, and isolation ranges from weak levels to full serializability depending on the vendor.",
    "Each isolation level is best understood by the race conditions it rules out: dirty reads and writes, read skew, lost updates, write skew, phantoms.",
    "Snapshot isolation via MVCC lets readers and writers never block each other, yet it still permits write skew and, in some systems, lost updates.",
    "Write skew happens when a transaction's decision rests on a premise that a concurrent transaction invalidates; only serializable isolation stops every variant automatically.",
    "Serializability can be achieved three ways: run transactions one at a time, lock pessimistically with 2PL, or validate optimistically at commit with SSI."
  ],
  sections: [
    {
      id: "slippery-concept",
      title: "The Slippery Concept of a Transaction",
      body: [
        "Data systems fail in untidy ways. A database process or its disk can die halfway through a write, an application can crash after finishing only some of a sequence of updates, the network can drop between client and server, and several clients can race to modify the same rows. A transaction is the abstraction that collapses all of these cases into one binary outcome: the client wraps a group of reads and writes into a unit, and the database promises that the unit either takes effect in full (**commit**) or leaves no trace (**abort**). The payoff is simpler application code. After an abort the application knows nothing was changed, so it can retry without risking a double-applied update.",
        "The model in use today goes back to IBM's System R in the mid-1970s, and the transaction support in MySQL, PostgreSQL, Oracle, and SQL Server still resembles it closely. When NoSQL systems arrived in the late 2000s, many dropped transactions or stretched the word to cover much weaker promises, and a belief spread that transactions and scalability are enemies. Vendors on the other side insist that any 'serious' application needs full ACID. The chapter dismisses both positions as exaggeration: transactions are one design option with real costs and real benefits, and you cannot weigh them until you know precisely what they guarantee under normal and abnormal conditions."
      ],
      keyPoints: [
        "A transaction is a group of reads and writes treated as one logical unit with exactly two outcomes: commit or abort.",
        "The main benefit is not speed but a simpler programming model: partial failure disappears from the application's view.",
        "The design has barely changed since System R; the relational mainstream still copies it.",
        "Many NoSQL systems shipped without transactions or with weakened semantics; both 'transactions do not scale' and 'valuable data needs ACID' are oversimplifications.",
        "Everything in this chapter applies to single-node and distributed databases alike; problems unique to distribution come in Chapter 8."
      ],
      callout: {
        kind: "insight",
        text: "Transactions exist so the application can ignore specific failure and concurrency scenarios. Whether you need them depends on which of those scenarios your application can afford to handle by hand."
      },
      systems: ["IBM System R", "MySQL", "PostgreSQL", "Oracle", "SQL Server"]
    },
    {
      id: "meaning-of-acid",
      title: "The Meaning of ACID",
      body: [
        "Härder and Reuter introduced the ACID acronym in 1983 to pin down terminology for database fault tolerance. The intent was precision, but the result has become a marketing label: two databases that both claim ACID can behave quite differently, above all in what they mean by isolation. The rival label BASE (basically available, soft state, eventual consistency) is vaguer still; in practice it only means 'not ACID'.",
        "**Atomicity** in the ACID sense has nothing to do with threads racing on shared memory. It is about faults that strike in the middle of a multi-write transaction: a process crash, a full disk, a broken connection, a constraint check that fails. If the transaction cannot reach commit, the database must undo every write it already applied. The useful consequence is that a client never has to guess which of its writes landed; an aborted transaction changed nothing, so a retry is safe. The chapter suggests 'abortability' would have been a clearer name. **Consistency** is the odd letter out. It refers to invariants the application cares about, such as credits and debits balancing across accounts. A database can enforce a few narrow invariants through unique and foreign-key constraints, but in general it stores whatever it is told. Consistency is therefore a property of application code, which leans on atomicity and isolation from the database to keep its invariants intact. According to Joe Hellerstein, the C was included largely so the acronym would spell a word.",
        "**Isolation** is about concurrency: transactions running at the same time must not see or spoil each other's half-finished work. The textbook formulation is serializability, meaning the final outcome equals that of some one-at-a-time ordering. Few databases run that way by default because it costs throughput; Oracle's level labelled 'serializable' is in fact snapshot isolation. **Durability** is the promise that a committed write survives crashes. On one node that means the data reached nonvolatile storage, usually with a write-ahead log to repair on-disk structures after a crash. In a replicated system it means enough replicas acknowledged the write before the client was told it committed. The chapter is blunt that no durability is perfect: SSDs have been observed to lose fsynced data when power is cut, disk firmware has bugs, filesystem and storage-engine interactions can corrupt files after a crash, data can rot silently until the corruption is also in the backups, one study found 30 to 80 percent of SSDs develop at least one bad block within four years, and an unpowered SSD can begin losing data within weeks. Disk writes, replication, and backups each cover failure modes the others miss and should be layered."
      ],
      keyPoints: [
        "ACID was coined in 1983 as precise terminology, yet today its meaning varies by vendor; treat 'ACID compliant' claims skeptically.",
        "Atomicity means abortability: a failed transaction leaves no partial writes behind, which is what makes blind retries safe.",
        "Consistency (application invariants) is the application's responsibility; the database can only check narrow constraints.",
        "Isolation formally means serializability, but most databases default to weaker levels for performance.",
        "Durability means 'on nonvolatile storage' on one node and 'replicated to enough nodes' in a cluster, and the commit must not be acknowledged before that happens.",
        "Writing to disk, replicating, and backing up protect against different failures; use them together and distrust any single guarantee."
      ],
      table: {
        caption: "The four ACID letters, what each really promises, and who delivers it",
        columns: ["Letter", "What it actually means", "Mechanism or owner", "Common confusion"],
        rows: [
          ["Atomicity", "If a transaction cannot finish, every write it already made is undone: all-or-nothing in the face of faults", "Database: undo via write-ahead log; abort, then the client retries", "Not about concurrency; a better word is abortability"],
          ["Consistency", "Application-defined invariants remain true after each transaction", "Application code, helped by database constraints (unique, foreign key)", "Overloaded word: replica consistency, consistent hashing, and CAP consistency mean other things"],
          ["Isolation", "Concurrent transactions cannot see or disturb each other's intermediate state", "Database: locks, MVCC, or serial execution", "Vendors ship weaker levels under strong names (Oracle 'serializable' is snapshot isolation)"],
          ["Durability", "Once committed, data survives crashes and power loss", "Database: fsync plus WAL, or replication to several nodes before acknowledging", "Never absolute: fsync bugs, firmware bugs, bit rot, correlated failures"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "An SSD that returned from fsync can still lose the write when power is cut, and one buggy input can crash every replica at once. Neither disk nor replication alone is a durability guarantee."
      },
      systems: ["Oracle 11g"]
    },
    {
      id: "single-and-multi-object",
      title: "Single-Object and Multi-Object Operations",
      body: [
        "Atomicity and isolation are usually described for transactions that touch several objects. Consider an email application that caches each user's unread count in its own column to avoid a slow `COUNT(*)`. Delivering a message now means two writes: insert the message and bump the counter. Without isolation, a reader can see the new message in the inbox while the badge still says zero, because it read the insert before the increment committed. Without atomicity, a crash between the two writes leaves the counter permanently wrong. Relational databases decide which operations belong together by connection: everything between `BEGIN TRANSACTION` and `COMMIT` on one TCP session is one transaction. That convention is fragile in its own way: if the connection drops after the client asked to commit but before the acknowledgment arrived, the client cannot tell whether the commit happened. Many non-relational stores have no grouping at all; a multi-key put may succeed on some keys and fail on others.",
        "Even a single object needs these properties. Suppose a client writes a 20 KB JSON document. If the connection dies after 10 KB, should the database keep an unparseable fragment? If power fails while the old value is being overwritten in place, will the result be a splice of old and new bytes? Will a concurrent reader see a half-written value? Because such outcomes would be baffling, storage engines almost always provide atomicity and isolation for one object on one node: a log for crash recovery handles atomicity, and a per-object lock handles isolation. Some systems add richer single-object primitives, notably an atomic increment that removes the read-modify-write cycle and a compare-and-set that writes only if the value is unchanged. These are valuable, but describing them as 'lightweight transactions' or 'ACID' is misleading, because a transaction is understood to span several operations on several objects.",
        "Are multi-object transactions actually needed? In three common situations, yes. Rows with foreign-key references (or vertices with edges) must be inserted so that the references stay valid. Document databases that lack joins push you toward denormalization, and denormalized copies must be updated together or they drift apart. Secondary indexes are separate objects from the storage engine's point of view, so without transactional isolation a record can be visible through one index and missing from another. You can build such applications without transactions, but error handling becomes far more involved and the lack of isolation invites concurrency bugs.",
        "The reason aborts exist is to make retries safe, yet common ORMs such as Rails ActiveRecord and Django do not retry; the exception bubbles up and the user's input is discarded. Retrying is also not trivially correct. If the commit succeeded but the acknowledgment was lost, a retry performs the transaction twice unless the application deduplicates. If the failure was caused by overload, retries deepen the overload, so bound the retry count, use exponential backoff, and treat overload errors differently if the database lets you tell them apart. Only transient errors deserve a retry (deadlock, isolation violation, brief network interruption, failover); a constraint violation will fail again. Side effects outside the database, such as a sent email, are not rolled back, which is one motivation for two-phase commit across systems. And if the client itself crashes mid-retry, the data it was trying to write is gone. Leaderless datastores take a different philosophy entirely: best effort, no undo, and recovery is the application's problem."
      ],
      keyPoints: [
        "Multi-object transactions are needed whenever several records must change together: foreign-key graphs, denormalized counters, secondary indexes.",
        "In SQL databases transaction membership is tied to a TCP connection and `BEGIN`/`COMMIT`; a dropped connection at commit time leaves the client uncertain.",
        "Per-object atomicity and isolation are nearly universal, implemented with a recovery log and a per-object lock.",
        "Atomic increment and compare-and-set prevent lost updates on one key but are not transactions in the multi-object sense.",
        "Retry only transient errors, bound retries with backoff, and deduplicate because a lost commit acknowledgment means the work may already be done.",
        "External side effects such as emails or payments are not undone by a database abort; coordinating them needs something like two-phase commit (Chapter 9)."
      ],
      callout: {
        kind: "example",
        text: "Picture an inbox that lists a new unread email while the unread badge reads 0. That halfway state is exactly what isolation hides from other clients, and atomicity is what stops it from becoming permanent after a crash."
      },
      systems: ["Rails ActiveRecord", "Django"]
    },
    {
      id: "weak-isolation-overview",
      title: "Weak Isolation Levels: Why They Exist",
      body: [
        "Two transactions that touch disjoint data cannot interfere, so they can safely run in parallel. Trouble begins only when one transaction reads what another is concurrently writing, or when both write the same data. The resulting bugs depend on precise timing, surface rarely, and are nearly impossible to reproduce in a test suite. In a large codebase nobody knows every other code path that touches the same tables. Isolation levels are the database's attempt to shield developers from this, but serializable isolation reduces throughput, so most systems default to weaker levels that block some anomalies and allow others. Those levels are harder to reason about, which is precisely why you must learn them.",
        "The stakes are real. Weak isolation has enabled thefts from cryptocurrency exchanges, triggered audits, and corrupted customer records. The reflexive advice 'use an ACID database for money' misses the point, because the popular relational databases regarded as ACID default to weak isolation as well. The productive response is to know each race condition by name, know which level prevents it, and choose deliberately. One footnote completes the ladder: read uncommitted, the weakest level, prevents dirty writes but still allows dirty reads."
      ],
      keyPoints: [
        "Race conditions require overlapping access to the same data; disjoint transactions are always safe to run concurrently.",
        "Concurrency bugs are nondeterministic and evade testing, so you must reason about them up front.",
        "Serializable isolation is the theoretical ideal; weaker levels trade safety for performance and are the default in most popular databases.",
        "Financial losses and data corruption have resulted from running at weak isolation without understanding it.",
        "Read uncommitted is the weakest level: no dirty writes, but dirty reads are allowed."
      ],
      callout: {
        kind: "pitfall",
        text: "Choosing a relational database does not buy you serializability. PostgreSQL, Oracle, and SQL Server default to read committed; stronger levels are opt-in."
      }
    },
    {
      id: "read-committed",
      title: "Read Committed",
      body: [
        "Read committed makes two promises. First, **no dirty reads**: a transaction's writes stay invisible to everyone else until it commits, and then they all appear together. Second, **no dirty writes**: a transaction may not overwrite a value that another, still-uncommitted transaction has written; the later writer waits until the earlier transaction commits or aborts. Dirty reads are harmful because a reader could observe a multi-object update half applied, or could act on data that is later rolled back and therefore never existed in any committed state. Dirty writes are harmful because the writes of two transactions can be interleaved. In the used-car example, Alice and Bob both try to buy the same car, and a purchase requires two writes: set the buyer on the listing and set the recipient on the invoice. With dirty writes the listing can end up recording Bob while the invoice is addressed to Alice.",
        "Read committed does not fix the counter race in which two clients each read 42 and each write back 43. By the time the second client writes, the first has already committed, so no dirty write is involved. The result is still wrong, but for a different reason: it is a lost update, which has its own section later.",
        "Implementation is straightforward for writes: the database takes a row-level lock when a transaction modifies an object and holds it until commit or abort, so a second writer blocks. Dirty reads could be prevented with the same lock by making readers acquire it briefly, but that performs badly: a single long write transaction would stall every reader of that row, and a slowdown in one part of the application would spread to unrelated parts. Nearly every database therefore remembers two values for a locked object, the last committed value and the pending one, and hands readers the committed value until the writer commits. The only mainstream exceptions that still use read locks are IBM DB2 and SQL Server with `read_committed_snapshot` switched off. It is the default level in PostgreSQL, Oracle 11g, MemSQL, SQL Server 2012, and many other systems."
      ],
      keyPoints: [
        "Guarantee one: reads return only committed data (no dirty reads).",
        "Guarantee two: writes only overwrite committed data (no dirty writes); the later writer blocks until the earlier transaction finishes.",
        "Dirty writes are blocked with row-level exclusive locks held until the end of the transaction.",
        "Dirty reads are blocked by serving the old committed value to readers, not by read locks, because read locks let one long writer stall the whole system.",
        "Read committed still allows read skew and lost updates; the counter increment race survives it.",
        "It is the default isolation level in PostgreSQL, Oracle, SQL Server, and MemSQL."
      ],
      callout: {
        kind: "example",
        text: "Two buyers, one car: without the no-dirty-writes rule the listing table can name one buyer while the invoice table names the other, because each transaction's second write clobbered the other's uncommitted first write."
      },
      systems: ["PostgreSQL", "Oracle 11g", "SQL Server 2012", "MemSQL", "IBM DB2"]
    },
    {
      id: "snapshot-isolation",
      title: "Snapshot Isolation and Repeatable Read",
      body: [
        "Read committed still permits **read skew**, also called a nonrepeatable read. Alice holds $1,000 split evenly across two accounts. A transfer moves $100 from account 2 to account 1. If Alice's balance page reads account 1 just before the transfer commits and account 2 just after, she sees $500 and $400, a total of $900, and $100 appears to have vanished. Every value she read was committed when she read it, so read committed is satisfied. A refresh fixes her view, but two workloads cannot shrug it off: a backup that takes hours would capture an inconsistent mixture of old and new, and restoring it would make the inconsistency permanent; and long analytic scans or integrity checks that read many tables would produce nonsense if each table reflected a different moment.",
        "**Snapshot isolation** solves this by giving every transaction a frozen view of the database as it was when the transaction started. Later commits by others never show up inside it. Writers still take write locks to prevent dirty writes, but readers take no locks at all. The guiding principle: a reader never waits for a writer, and a writer never waits for a reader, which is what lets a multi-hour report run alongside normal OLTP traffic. PostgreSQL, MySQL with InnoDB, Oracle, and SQL Server all support it.",
        "The implementation is **multi-version concurrency control (MVCC)**. Read committed only needs two versions per object; snapshot isolation needs as many committed versions as in-flight transactions might require, side by side. In PostgreSQL every transaction gets an always-increasing transaction ID (a 32-bit integer, so it wraps after about four billion transactions, which the vacuum process manages). Every row version carries a `created_by` field holding the txid that inserted it and a `deleted_by` field that is set, rather than physically removing the row, when a transaction deletes it. An update is recorded as a delete of the old version plus an insert of a new one, so a $500-to-$400 balance change leaves two versions of the row until garbage collection confirms no transaction can still see the old one. Visibility is decided from txids: when a transaction starts, the database notes which other transactions are still running. The reader then ignores writes made by any of those in-progress transactions (even if they commit later), writes made by aborted transactions, and writes made by transactions with a higher txid than its own. Everything else is visible. Equivalently, a row version is visible if its creator had committed before the reader's snapshot and its deleter, if any, had not. Many engines reuse the same machinery for read committed by taking a fresh snapshot per statement instead of per transaction.",
        "Indexes need a strategy for multiple versions. One approach lets an index entry point at all versions of a row and makes index scans filter by visibility; dead entries are removed with the dead versions, and PostgreSQL avoids some index updates when versions fit on the same page. CouchDB, Datomic, and LMDB use a different design: append-only, copy-on-write B-trees. A write copies each modified page and every ancestor up to a new root, never touching existing pages. Each root is therefore a complete, immutable snapshot, and no txid filtering is needed, at the price of background compaction.",
        "The naming is a mess. The SQL standard's isolation levels descend from System R's 1975 definitions, which predate snapshot isolation, so the standard only has 'repeatable read'. PostgreSQL and MySQL label their snapshot isolation 'repeatable read' because it satisfies the standard's requirements; Oracle labels it 'serializable'; IBM DB2 uses 'repeatable read' for actual serializability. The standard's definitions are ambiguous enough that the phrase 'repeatable read' tells you almost nothing about the guarantees you will get."
      ],
      keyPoints: [
        "Read skew: a transaction observes different parts of the database as of different times; permitted under read committed.",
        "Snapshot isolation pins each transaction to the state committed at its start, which backups and analytics need.",
        "MVCC keeps multiple committed versions per object tagged with creating and deleting transaction IDs; an update becomes delete plus insert.",
        "Visibility excludes writes by transactions that were in progress at snapshot time, that aborted, or that have a higher txid.",
        "Reads never wait for writes and writes never wait for reads; only write-write conflicts take locks.",
        "Append-only B-trees (CouchDB, Datomic, LMDB) make each tree root a snapshot without txid filtering.",
        "The name 'repeatable read' means snapshot isolation in PostgreSQL and MySQL and serializability in DB2; Oracle's 'serializable' is snapshot isolation."
      ],
      callout: {
        kind: "insight",
        text: "The two-version trick that blocks dirty reads under read committed and the many-version MVCC behind snapshot isolation are the same idea at different scales. The real difference is whether the snapshot lives for one statement or for the whole transaction."
      },
      systems: ["PostgreSQL", "MySQL InnoDB", "Oracle", "SQL Server", "CouchDB", "Datomic", "LMDB", "IBM DB2"]
    },
    {
      id: "preventing-lost-updates",
      title: "Preventing Lost Updates",
      body: [
        "Dirty writes are only one kind of write-write conflict. The most common one is the **lost update**: two transactions each read a value, compute a new one from it, and write the result back, and the second write silently discards the first transaction's change. It shows up whenever there is a read-modify-write cycle: incrementing a counter or adjusting a balance, editing one field inside a JSON document that is read and rewritten whole, or two people saving a wiki page where each save overwrites the full text. Snapshot isolation by itself does not necessarily stop it.",
        "There are five families of remedy. **Atomic write operations** let the database do the read-modify-write itself, as in `UPDATE page_stats SET views = views + 1 WHERE page_id = 42`, MongoDB's operators for modifying part of a document, or Redis commands on its data structures. Internally the engine either takes an exclusive lock on the object for the duration of the operation (a technique called cursor stability) or funnels all such operations through one thread. These are the best choice when your logic fits them; the danger is that ORMs make it easy to do an unsafe load-modify-save in application code instead. **Explicit locking** covers cases that cannot be a single statement, for example validating a game move before writing it: `SELECT ... FOR UPDATE` locks the returned rows so a competing cycle must wait. It works, but one forgotten lock in one code path reintroduces the race. **Automatic detection** flips the strategy: let cycles run concurrently and have the transaction manager abort one when it notices a lost update. This is cheap to add on top of snapshot isolation, and three major engines do it at their snapshot level: PostgreSQL, Oracle, and SQL Server. The repeatable read level of MySQL/InnoDB lacks this check, which leads some researchers to say it does not truly provide snapshot isolation. The great virtue of detection is that it needs no cooperation from application code.",
        "**Compare-and-set** serves databases without transactions: `UPDATE pages SET body = 'v2' WHERE id = 77 AND body = 'v1'` succeeds only if nobody changed the page since you read it, and you must check the affected-row count and retry otherwise. The catch is that if the database evaluates the `WHERE` clause against an old snapshot, the condition can pass despite a concurrent change, so verify your database's semantics. Finally, **replication** changes the problem. Locks and compare-and-set assume one authoritative copy of the data. Multi-leader and leaderless systems accept writes at several nodes and replicate asynchronously, so no such copy exists. They instead keep conflicting versions as siblings and merge them later, ideally with commutative operations such as incrementing a counter or adding to a set, which give the same result in any order; Riak 2.0 data types do exactly this. Last write wins, the default in many replicated stores, simply drops one of the updates."
      ],
      keyPoints: [
        "A lost update is a pair of concurrent read-modify-write cycles where the later write overwrites the earlier change instead of building on it.",
        "Atomic operations are the safest fix when the logic fits them; the engine serializes them with a lock (cursor stability) or a single thread.",
        "`SELECT ... FOR UPDATE` makes the read itself acquire a lock, forcing competing cycles to queue.",
        "PostgreSQL, Oracle, and SQL Server detect lost updates automatically at their snapshot level; MySQL/InnoDB does not.",
        "Compare-and-set is only safe when the comparison reads the latest value rather than an old snapshot.",
        "With multi-leader or leaderless replication there is no single copy to lock; prefer commutative operations or sibling merging over last write wins."
      ],
      table: {
        caption: "Ways to prevent lost updates",
        columns: ["Technique", "How it works", "When it fits", "Weak spot"],
        rows: [
          ["Atomic write operation", "Database performs the read-modify-write itself under an exclusive lock or on a single thread", "Counters, balances, JSON sub-field updates, Redis structures", "Cannot express arbitrary logic such as free-text edits; ORMs tempt you to bypass it"],
          ["Explicit lock (SELECT FOR UPDATE)", "Application locks the rows it will update before reading them", "Validation logic that must run in application code", "Easy to forget the lock in one code path"],
          ["Automatic detection", "Transaction manager aborts a transaction whose read-modify-write raced with a committed write", "PostgreSQL repeatable read, Oracle serializable, SQL Server snapshot", "Absent in MySQL/InnoDB repeatable read; application must handle the abort and retry"],
          ["Compare-and-set", "Write succeeds only if the value still equals what was read", "Stores without transactions", "Unsafe if the condition is evaluated against a stale snapshot"],
          ["Merge or commutative operations", "Keep concurrent versions as siblings and merge, or use operations whose order does not matter", "Multi-leader and leaderless replication (Riak 2.0 data types)", "Last write wins instead of merging discards updates"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "An ORM load-modify-save round trip is a textbook lost-update race. Under PostgreSQL repeatable read the database catches it and aborts; under MySQL repeatable read or any read committed setting it silently drops one update."
      },
      systems: ["MongoDB", "Redis", "PostgreSQL", "Oracle", "SQL Server", "MySQL InnoDB", "Riak 2.0"]
    },
    {
      id: "write-skew-and-phantoms",
      title: "Write Skew and Phantoms",
      body: [
        "A hospital requires at least one doctor on call for every shift. Alice and Bob are both on call tonight and both feel ill, so each clicks the button to drop the shift at the same moment. Each transaction counts the doctors currently on call for the shift, sees two, concludes it is safe to leave, and sets its own `on_call` flag to false. Under snapshot isolation both counts return two, both updates commit, and the shift has no doctor. This anomaly is **write skew**. No dirty write or lost update occurred, since each transaction changed a different row. It is nevertheless a race: run one after the other, the second would have seen only one doctor remaining and refused.",
        "Write skew generalizes the lost update. Two transactions read an overlapping set of objects and then each updates some of them; when they happen to update the same object the result is a dirty write or lost update, and when they update different objects it is write skew. The defenses are weaker. Single-object atomic operations do not apply across rows. The automatic lost-update detection in PostgreSQL, MySQL, Oracle, and SQL Server does not notice write skew. A constraint spanning multiple rows ('at least one on call') is not something most databases can declare, though triggers or materialized views can sometimes emulate it. The pragmatic fallback is to lock the rows the decision depends on: `SELECT ... FOR UPDATE` on all on-call rows for the shift makes the second transaction wait and then re-run its check after the first commits. The clean solution is genuine serializable isolation.",
        "Once you know the shape, write skew is everywhere. A meeting-room system checks for overlapping bookings and inserts one if none exist; two concurrent bookers both see an empty slot. A multiplayer game that locks individual pieces still lets two players move different pieces onto the same square. A signup flow checks that a username is free and then creates the account; here a unique constraint rescues you because the second insert fails. A spending service inserts a tentative charge, sums the account, and checks it is non-negative; two concurrent charges can each pass the check and together overdraw. The pattern is always: a query checks a condition, the application decides based on the result, and a write changes the set of rows the query would match. The order can even be reversed, with the write first and the check second.",
        "In the doctors case the row that was later modified was among the rows returned by the check, so `FOR UPDATE` could lock it. In the other examples the check looks for the absence of rows, and the offending write inserts a new matching row. A query that returns nothing acquires no locks. When a write by one transaction alters which rows another transaction's search would return, that write is called a **phantom**. Snapshot isolation shields a purely read-only query from phantoms, yet inside a transaction that also writes they produce the hardest cases of write skew. One workaround is to **materialize the conflict**: create a table whose rows exist only to be locked, such as one row per room per 15-minute slot for the next six months. A booking transaction first locks the slot rows it needs with `FOR UPDATE`, then checks and inserts as before. The table stores no booking data; it merely gives the phantom a physical row to collide on. This works, but deciding what to materialize is error-prone and it leaks a concurrency mechanism into the data model, so treat it as a last resort behind serializable isolation."
      ],
      keyPoints: [
        "Write skew: two transactions read the same data and each updates different rows based on a premise the other invalidates.",
        "Snapshot isolation does not prevent write skew, and neither does automatic lost-update detection.",
        "When the rows the decision depends on exist, lock them with `SELECT ... FOR UPDATE`; a uniqueness constraint handles the username case.",
        "A phantom is a write that changes another transaction's search result; when the check is for absence, there is no row to lock.",
        "Materializing conflicts manufactures lock rows (room times time slot) so phantoms have something to collide on; it is a last resort.",
        "Only serializable isolation blocks every variant automatically."
      ],
      table: {
        caption: "Write-skew scenarios and whether row locking helps",
        columns: ["Scenario", "Check (premise)", "Write that breaks it", "Can SELECT FOR UPDATE fix it?"],
        rows: [
          ["Doctors on call", "At least two doctors on call for the shift", "Set own on_call flag to false", "Yes: lock the on-call rows that the check returned"],
          ["Meeting room booking", "No booking overlaps the requested slot", "Insert the new booking", "No: an absence check returns no rows to lock; the insert is a phantom"],
          ["Multiplayer game", "Target square is empty", "Move a figure onto it", "Not in general; a unique constraint may work for some rules"],
          ["Username claim", "Name not yet taken", "Insert the account", "No, but a unique constraint handles it cleanly"],
          ["Spending limit", "Sum of items stays non-negative", "Insert another spending item", "No: new rows are phantoms"]
        ]
      },
      callout: {
        kind: "example",
        text: "Both doctors see two colleagues on call, both resign, and the shift is empty. Each transaction was correct on its own; concurrency broke the invariant."
      },
      systems: ["PostgreSQL"]
    },
    {
      id: "serializability-overview",
      title: "Serializability: Why and How",
      body: [
        "The tour of anomalies paints a discouraging picture. The levels are confusing and inconsistently implemented ('repeatable read' means three different things). Looking at application code does not tell you whether it is safe at a given level, especially when you cannot see every other concurrent code path. Tooling barely exists: static analysis for isolation anomalies is a research topic, and tests rarely reproduce timing-dependent failures. Since weak isolation first appeared in the 1970s, researchers have given the same answer: use **serializable isolation**. It guarantees that a concurrent execution produces the same result as some serial ordering of the same transactions, so if every transaction is correct in isolation, the system is correct under any interleaving.",
        "Serializability is not universal because of its cost, and the cost depends heavily on how it is implemented. Three families exist. The first literally runs transactions one at a time on a single thread. The second is two-phase locking, which for roughly thirty years was the only practical option. The third is optimistic concurrency control, specifically serializable snapshot isolation. The chapter treats all three on a single node; Chapter 9 extends them across machines."
      ],
      keyPoints: [
        "Serializability means the concurrent execution is equivalent to some serial order, which excludes every race condition discussed in the chapter.",
        "Weak isolation levels are hard to reason about and nondeterministic to test, which is the central argument for serializability.",
        "Three practical implementations exist: serial execution, two-phase locking, and serializable snapshot isolation.",
        "The right choice turns on dataset size, transaction length, contention level, and whether blocking or aborting is more tolerable."
      ],
      table: {
        caption: "Three ways to implement serializable isolation",
        columns: ["Approach", "Core mechanism", "Style", "Best when", "Main cost"],
        rows: [
          ["Actual serial execution", "One thread runs whole transactions (stored procedures) one after another", "Pessimistic in the extreme", "Dataset fits in RAM, transactions are tiny, write load fits one core per partition", "Single-core throughput; cross-partition transactions are slow"],
          ["Two-phase locking", "Shared and exclusive locks held until commit; predicate or index-range locks for phantoms", "Pessimistic", "Low-contention workloads that need serializability in a traditional engine", "Readers and writers block each other; unstable tail latency; deadlocks"],
          ["Serializable snapshot isolation", "Run on MVCC snapshots, track read and write dependencies, abort at commit if not serializable", "Optimistic", "Spare capacity and moderate contention; read-heavy workloads", "Aborts under high contention; long read-write transactions likely to abort"]
        ]
      }
    },
    {
      id: "actual-serial-execution",
      title: "Actual Serial Execution",
      body: [
        "The most direct route to serializability is to remove concurrency altogether: run each transaction to completion on one thread before starting the next. Nothing needs to be detected or locked, because the execution is serial by construction. Database designers only took this seriously around 2007 because two things had changed. RAM became cheap enough that the active dataset of many applications fits in memory, eliminating the disk waits that originally justified multithreading. And designers recognized that OLTP transactions are short and touch few rows, while the long-running work is analytic and read-only, so it can run on a consistent snapshot outside the serial loop. VoltDB/H-Store, Redis, and Datomic all execute transactions this way. Dropping lock coordination can make a single thread outperform a multithreaded engine, but throughput is capped by one CPU core.",
        "Interactive transactions are incompatible with this design. Early database designers imagined a transaction wrapping an entire human workflow such as booking a flight, but humans are slow, so a database would accumulate huge numbers of idle open transactions; in practice a web transaction lives and dies within one HTTP request. Even without a human in the loop, the usual client/server style sends one statement, waits for the result, decides what to send next, and so on. A single-threaded engine would sit idle for most of each transaction, waiting on the network. Serial systems therefore require the whole transaction to be submitted in advance as a **stored procedure**, which runs start to finish with no network round trips and, if the data is in memory, no disk waits either.",
        "Stored procedures have a poor reputation for good reasons: each vendor has its own language (PL/SQL, T-SQL, PL/pgSQL) that has aged badly and lacks libraries; code inside the database is awkward to version, test, debug, and monitor; and a wasteful procedure hurts a shared database far more than wasteful code hurts one application server. Newer systems blunt these objections by using general-purpose languages: VoltDB runs Java or Groovy, Datomic runs Java or Clojure, Redis runs Lua. VoltDB also replicates by re-executing each stored procedure on every replica rather than shipping its writes, which requires procedures to be deterministic; the current time, for example, must come from a special deterministic API.",
        "To go beyond one core, partition the data so that each transaction reads and writes only one partition. Each partition then gets its own thread and throughput scales linearly with cores, which VoltDB supports. Any transaction that spans partitions must be coordinated in lock-step across all of them, and that is dramatically slower: VoltDB quotes about 1,000 writes per second when transactions cross partitions, a ceiling that adding machines does not raise. Whether your transactions can be single-partition depends on the data: simple key-value access partitions well, while multiple secondary indexes tend to demand cross-partition work. The constraints add up: transactions must all be short, since a single slow one stalls everything behind it; the active dataset must fit in memory (a technique called anti-caching aborts a transaction that needs on-disk data, fetches it asynchronously, and restarts the transaction); write throughput must fit one core or be partitionable without coordination; and cross-partition transactions must stay rare."
      ],
      keyPoints: [
        "One thread, one transaction at a time, gives serializability with zero conflict detection.",
        "The approach became viable around 2007 thanks to cheap RAM and the realization that OLTP transactions are short.",
        "Interactive multi-statement transactions are forbidden; the whole transaction ships as a stored procedure.",
        "Modern engines use Java, Groovy, Clojure, or Lua for stored procedures instead of PL/SQL-style languages.",
        "VoltDB requires deterministic procedures because replication re-executes them on each replica.",
        "Partitioning one thread per core scales throughput, but cross-partition transactions are orders of magnitude slower (about 1,000 writes per second in VoltDB).",
        "Read-only analytics run on snapshots outside the serial loop, so they do not stall it."
      ],
      callout: {
        kind: "insight",
        text: "Serial execution is equivalent to every transaction holding an exclusive lock on its whole partition. It only works because each transaction holds that lock for microseconds."
      },
      systems: ["VoltDB", "H-Store", "Redis", "Datomic"]
    },
    {
      id: "two-phase-locking",
      title: "Two-Phase Locking (2PL)",
      body: [
        "For roughly three decades two-phase locking (strictly, strong strict 2PL) was the only serializable algorithm in wide use. It has nothing to do with two-phase commit despite the similar name. Read committed uses locks only to make writers wait for other writers. 2PL extends locking so that writers also wait for readers and readers wait for writers. Once A has read an object, B cannot write it until A finishes, so the object cannot change under A. Once A has written an object, B cannot read it until A finishes; handing B an older version, as snapshot isolation would, is not allowed. This is the exact opposite of the snapshot isolation slogan, and it is what makes 2PL immune to lost updates and write skew. MySQL/InnoDB and SQL Server use 2PL for their serializable level, and DB2 for the level it calls repeatable read.",
        "Mechanically, each object has a lock with a shared mode and an exclusive mode. A reader takes the shared lock, which many transactions can hold together but which blocks while someone holds the exclusive lock. A writer takes the exclusive lock, which blocks while anyone holds the lock in either mode. A transaction that reads and then writes upgrades from shared to exclusive. Every lock is held until the transaction commits or aborts; the name refers to an acquiring phase during execution and a releasing phase at the end. With so many locks held for so long, deadlocks (A waits on B while B waits on A) are routine; the database detects them and aborts one victim, which the application must retry.",
        "Performance is why 2PL never became the default. Part of the cost is the bookkeeping of acquiring and releasing locks, but the larger cost is lost concurrency: whenever two transactions might conflict, one waits. Traditional databases place no limit on transaction duration, so a wait can last indefinitely, and even short transactions queue behind one another on a hot object. The result is erratic latency at high percentiles, where one slow transaction or one that locks many rows can stall much of the system. Deadlock aborts add wasted work on top.",
        "Phantoms need their own treatment. A serializable database must stop a second transaction from inserting a conflicting booking while the first has searched for overlaps. Conceptually this calls for a **predicate lock**, which belongs not to a row but to every object matching a search condition, including rows that do not exist yet. A reader takes a shared predicate lock on its `WHERE` clause and waits if any matching object is exclusively locked; a writer checks whether its old or new value matches any outstanding predicate lock and waits if so. 2PL plus predicate locks is fully serializable. Checking many predicates on every write is slow, however, so real systems use **index-range locks** (also called next-key locks), which widen the predicate to something an index can represent: lock the index entry for room 123 at all times, or lock a time range in the time index for all rooms. Over-approximation is safe because anything that matches the original predicate also matches the wider one. A writer that touches that index region encounters the shared lock and waits. If no suitable index exists, the fallback is a shared lock covering the whole table, which is correct but stops all concurrent writers to it."
      ],
      keyPoints: [
        "2PL is not 2PC: a locking algorithm for isolation versus a commit protocol for distributed atomicity.",
        "Shared locks for reads, exclusive locks for writes, upgrades allowed, all held until the transaction ends.",
        "Readers block writers and writers block readers, the reverse of snapshot isolation.",
        "Deadlocks are frequent; the database aborts one participant, and the retry repeats its work.",
        "Latency is unstable at high percentiles because one slow or lock-heavy transaction can stall many others.",
        "Predicate locks cover rows that do not yet exist; index-range locks approximate them cheaply by locking a wider index region; a table lock is the fallback.",
        "Used by MySQL/InnoDB and SQL Server for serializable, and by DB2 for repeatable read."
      ],
      callout: {
        kind: "pitfall",
        text: "Locking the rows you read with FOR UPDATE does not stop a concurrent INSERT that matches your query. Only a predicate or index-range lock on the search condition protects against phantoms."
      },
      systems: ["MySQL InnoDB", "SQL Server", "IBM DB2"]
    },
    {
      id: "serializable-snapshot-isolation",
      title: "Serializable Snapshot Isolation (SSI)",
      body: [
        "Serializable snapshot isolation, first described by Cahill in 2008 and shipped in PostgreSQL since version 9.1 (FoundationDB uses a related algorithm), promises full serializability at a small premium over plain snapshot isolation. The contrast with earlier approaches is one of temperament. 2PL is **pessimistic**: if something could go wrong, as signalled by a lock someone else holds, wait until it is safe. Serial execution is pessimism taken to the limit, equivalent to an exclusive lock on the whole partition, made bearable by keeping each transaction tiny. SSI is **optimistic**: transactions run on their snapshot without blocking, and at commit time the database checks whether isolation was violated and aborts the transaction if so. Optimistic control is an old idea with a known weakness: under heavy contention many transactions abort, and retries add load to a system that may already be saturated. With spare capacity and moderate contention it tends to outperform locking. Commutative atomic operations lower contention: concurrent increments of a counter can be applied in any order, provided the transaction does not also read the counter. What separates SSI from older optimistic schemes is that all reads come from a consistent MVCC snapshot; SSI adds conflict detection on top of that.",
        "The organizing idea is the **outdated premise**. Every write-skew example followed the same script: read something, decide based on it, write. Under snapshot isolation the query result may be stale by commit time. The database cannot know how the application used a query result, so it must assume any change to that result could invalidate the transaction's writes, and it must abort a transaction that may have acted on a premise that no longer holds. A premise goes stale in two ways: the transaction read a version that was already superseded by an uncommitted write at snapshot time, or another transaction wrote the data after this one read it.",
        "Detecting stale MVCC reads: whenever visibility rules cause a transaction to skip over another transaction's uncommitted writes, the database records that fact. At commit, if any of those ignored writers has since committed, the committing transaction aborts. In the doctors example transaction 43 reads Alice as on call because transaction 42's change is uncommitted; by the time 43 commits, 42 has committed, so 43's premise is false and 43 aborts. The abort is deliberately deferred: at read time the database does not know whether 43 will ever write (a read-only transaction needs no abort), and 42 might yet abort, so an eager abort would be wasted. Deferral keeps long read-only queries cheap, exactly as under plain snapshot isolation. Detecting writes that affect prior reads: this is the index-range lock idea without blocking. When transactions 42 and 43 both query doctors for shift 1234, the database notes against the `shift_id` index entry (or the table, if there is no index) that they read it. When a transaction later writes matching data, it looks up recent readers in the index and notifies them that their read is now outdated; the lock behaves as a tripwire, not a barrier. Both 42 and 43 trip each other's wire. 42 commits first and succeeds, because 43's conflicting write has not committed and so has not taken effect. When 43 tries to commit, 42's write has committed, so 43 must abort. The tracking data can be discarded once a transaction and all its concurrent peers have finished.",
        "Performance hinges on engineering choices. Finer-grained tracking of what each transaction read and wrote reduces false aborts but costs bookkeeping; coarser tracking is cheaper but aborts more than necessary. PostgreSQL applies theory from the literature to avoid aborting in some cases where a read of overwritten data still yields a serializable outcome. Against 2PL, SSI's advantage is that nobody waits on anyone else's locks, so latency is far more predictable and read-only queries run lock-free on a snapshot, which suits read-heavy workloads. Against serial execution, SSI is not bound to one core: FoundationDB spreads conflict detection across machines and allows transactions to span partitions while staying serializable. The abort rate governs throughput, so read-write transactions should be short (long read-only ones are fine), though SSI tolerates slow transactions better than either 2PL or serial execution."
      ],
      keyPoints: [
        "SSI is snapshot isolation plus commit-time detection of serialization conflicts; first described in 2008, in PostgreSQL since 9.1, with a similar design in FoundationDB.",
        "It is optimistic: never block, validate at commit, abort the transactions that would make the history non-serializable.",
        "It detects two situations: reading a version that a now-committed transaction had overwritten, and a later write to data this transaction read.",
        "Reads are registered on index entries (or whole tables) and act as tripwires that notify, rather than block, conflicting transactions.",
        "Aborts are deferred to commit so read-only transactions, and transactions whose conflicting peer aborts, are not penalized.",
        "It wins when contention is moderate and capacity is spare; it loses under heavy contention because of retry storms.",
        "Keep read-write transactions short; long read-only transactions are fine."
      ],
      callout: {
        kind: "insight",
        text: "SSI reuses the index-range-lock idea from 2PL but turns the lock into a notification. Nobody waits; instead the database remembers who read what and settles conflicts at commit."
      },
      systems: ["PostgreSQL", "FoundationDB"]
    },
    {
      id: "summary-isolation-levels",
      title: "Summary: Anomalies Versus Isolation Levels",
      body: [
        "Transactions are an abstraction layer that lets application code behave as if certain crashes and races never happen; a large class of errors collapses into 'abort and retry'. A workload that only ever reads and writes one record at a time can live without them. Anything involving denormalized copies, secondary indexes, or invariants across rows gains enormously, because without transactions it becomes very hard to reason about how concurrent, failure-prone accesses interact.",
        "The chapter's vocabulary of race conditions is the key to choosing a level. Dirty reads are stopped from read committed upward. Dirty writes are stopped by almost every implementation. Read skew is stopped by snapshot isolation, usually built on MVCC. Lost updates are detected automatically by some snapshot implementations and otherwise need atomic operations or `FOR UPDATE`. Write skew is stopped only by serializable isolation. Phantoms are harmless to read-only queries under snapshot isolation but require index-range locks or SSI's tripwires in read-write transactions. For serializability itself there are three implementations: serial execution for small, fast, in-memory transactions; two-phase locking, long the standard but burdened by blocking and tail latency; and serializable snapshot isolation, an optimistic newcomer that sidesteps the main weaknesses of both. Distributed transactions, with their own hazards, are the subject of the next two chapters."
      ],
      keyPoints: [
        "Read committed: no dirty reads or writes, nothing more.",
        "Snapshot isolation: adds a consistent snapshot per transaction; lost-update detection varies by vendor; write skew remains.",
        "Serializable: prevents everything, via serial execution, 2PL, or SSI.",
        "Dirty writes are prevented by virtually every system with transactions; read uncommitted is the only level that allows dirty reads.",
        "The right level depends on which anomalies your invariants cannot tolerate and how much contention your workload has."
      ],
      table: {
        caption: "Which isolation level prevents which anomaly",
        columns: ["Anomaly", "What goes wrong", "Read committed", "Snapshot isolation", "Serializable"],
        rows: [
          ["Dirty read", "Seeing another transaction's uncommitted write", "Prevented", "Prevented", "Prevented"],
          ["Dirty write", "Overwriting another transaction's uncommitted write", "Prevented", "Prevented", "Prevented"],
          ["Read skew (nonrepeatable read)", "Observing different parts of the database as of different times", "Allowed", "Prevented", "Prevented"],
          ["Lost update", "Concurrent read-modify-write; one change is overwritten", "Allowed (use atomic ops or FOR UPDATE)", "Detected in PostgreSQL, Oracle, SQL Server; allowed in MySQL InnoDB", "Prevented"],
          ["Write skew", "Decision based on a premise another transaction invalidates", "Allowed", "Allowed", "Prevented"],
          ["Phantom in a read-write transaction", "A write changes another transaction's search result", "Allowed", "Allowed", "Prevented (predicate or index-range locks, or SSI)"]
        ]
      }
    }
  ],
  terms: [
    { term: "Transaction", definition: "A group of reads and writes that the database executes as one logical unit, which either commits in full or aborts leaving no trace, so the client can safely retry." },
    { term: "Atomicity (ACID)", definition: "The guarantee that if a transaction cannot complete because of a fault, all of its writes so far are undone. It concerns failures, not concurrency, and is better described as abortability." },
    { term: "Serializability", definition: "The strongest isolation guarantee: concurrently executed transactions produce the same result as if they had run one at a time in some order, which rules out every race condition." },
    { term: "Dirty read", definition: "A transaction observes a write made by another transaction that has not yet committed. Prevented by read committed and all stronger levels." },
    { term: "Dirty write", definition: "A transaction overwrites a value whose writer has not yet committed. Nearly every transactional database blocks this with row-level write locks held to the end of the transaction." },
    { term: "Read skew", definition: "A nonrepeatable read: one transaction sees some rows as they were at one moment and other rows as they were at a later moment. Permitted under read committed, prevented by snapshot isolation." },
    { term: "Snapshot isolation", definition: "An isolation level that pins every transaction to the committed state that existed when it started, so readers and writers never wait for one another." },
    { term: "Multi-version concurrency control (MVCC)", definition: "An implementation technique that keeps several committed versions of each object, tagged with the transactions that created and deleted them, so each transaction can see a consistent snapshot." },
    { term: "Lost update", definition: "Two transactions perform concurrent read-modify-write cycles on the same object, and the later write discards the earlier modification." },
    { term: "Write skew", definition: "Two transactions read overlapping data, make decisions based on it, and update different objects, so that together they violate an invariant neither would have violated alone." },
    { term: "Phantom", definition: "A write by one transaction that alters which rows another transaction's search would return, usually by inserting a row that newly satisfies the search condition." },
    { term: "Materializing conflicts", definition: "Creating rows whose only purpose is to be locked, so that a phantom becomes a lock conflict on concrete rows. A last resort when serializable isolation is unavailable." },
    { term: "Two-phase locking (2PL)", definition: "A serializable concurrency control algorithm in which transactions acquire shared locks to read and exclusive locks to write, hold all locks until they finish, and therefore block each other." },
    { term: "Index-range lock", definition: "A cheap approximation of a predicate lock that locks a wider region of an index covering all rows a query might match, including rows not yet inserted, to prevent phantoms." },
    { term: "Serializable snapshot isolation (SSI)", definition: "An optimistic algorithm that runs transactions on MVCC snapshots, tracks read and write dependencies, and aborts at commit any transaction whose premise was invalidated by a committed peer." }
  ],
  pitfalls: [
    "Assuming 'ACID' or 'relational' means serializable. Most relational databases default to read committed, and the levels they call 'repeatable read' or even 'serializable' may be snapshot isolation; check the vendor's actual anomaly behavior.",
    "Believing ACID atomicity protects against concurrent access. Atomicity covers faults mid-transaction (abort and undo); concurrency is the job of isolation.",
    "Thinking snapshot isolation removes all write conflicts. It removes read skew but still lets write skew through, and in MySQL/InnoDB it does not even detect lost updates.",
    "Using SELECT FOR UPDATE as a universal fix. It locks rows that exist; it cannot lock the absence of rows, so booking, username, and spend-limit checks remain exposed to phantoms.",
    "Retrying every failed transaction blindly. A lost commit acknowledgment causes double execution, overload-induced errors get amplified, and constraint violations will never succeed; retry only transient failures, with backoff and deduplication.",
    "Treating fsync or replication as a durability guarantee. SSDs can lose fsynced data on power loss, correlated bugs can take out every replica, and bit rot can propagate into backups; layer disk, replication, and backups."
  ],
  connections: [
    { chapter: 3, note: "The write-ahead log and B-tree crash recovery from Chapter 3 are what give single-object atomicity and durability here; append-only B-trees (LMDB) reappear as a way to produce MVCC snapshots." },
    { chapter: 5, note: "Replication supplies an alternative notion of durability, and Chapter 5's conflict handling (siblings, last write wins, Riak data types) is how lost updates are addressed when there is no single copy to lock." },
    { chapter: 6, note: "Whether serial execution can scale depends on partitioning: single-partition transactions parallelize per core, while secondary indexes from Chapter 6 tend to force slow cross-partition coordination." },
    { chapter: 8, note: "Chapter 8 introduces the network partitions and process pauses that undermine the lock-holding and acknowledgment assumptions made here, especially around lost commit acknowledgments." },
    { chapter: 9, note: "Two-phase commit (not to be confused with 2PL) provides atomic commit across nodes, linearizability formalizes the single up-to-date copy that locks and compare-and-set rely on, and distributed serializability builds on this chapter's algorithms." },
    { chapter: 12, note: "Chapter 12 revisits the end-to-end argument: application-level request IDs and idempotence handle duplicate retries that the database alone cannot deduplicate, and derived-data pipelines offer an alternative to multi-object transactions." }
  ],
  flashcards: [
    { front: "In ACID, what does atomicity guarantee, and what does it NOT cover?", back: "If a transaction cannot complete (crash, disk full, constraint violation), all writes it has made so far are undone, so the client can retry safely. It says nothing about concurrent access; that is isolation's job. 'Abortability' would be a more accurate name." },
    { front: "Why does the chapter argue that the C in ACID does not really belong there?", back: "Consistency means application-defined invariants hold. The database can only check narrow constraints such as uniqueness and foreign keys; it cannot know your business rules. Consistency is a property of the application, achieved by building on the atomicity and isolation the database supplies." },
    { front: "What does durability mean on a single node versus in a replicated database, and why is it never absolute?", back: "Single node: written to nonvolatile storage, usually with a write-ahead log. Replicated: copied to enough nodes before the commit is acknowledged. Not absolute because fsync can misbehave on power loss, firmware has bugs, disks corrupt data silently, and correlated faults can kill all replicas at once." },
    { front: "Give three situations that require multi-object transactions even outside relational databases.", back: "Foreign-key or graph-edge references that must remain valid across inserts; denormalized copies (such as an unread counter) that must change together with the source; and secondary indexes, which are separate objects and can otherwise be observed out of sync with the row." },
    { front: "Why are compare-and-set and atomic increment not 'transactions' in the usual sense?", back: "They provide atomicity and isolation for a single object only. A transaction groups several operations on several objects into one unit. Marketing them as 'lightweight transactions' or 'ACID' overstates what they cover." },
    { front: "List four ways a blind retry of an aborted transaction can go wrong.", back: "The commit actually succeeded but the acknowledgment was lost, so the retry runs it twice; retrying during overload worsens the overload; permanent errors such as constraint violations never succeed; side effects outside the database (emails) are repeated; and a crashed client loses the data entirely." },
    { front: "What are the two guarantees of read committed isolation?", back: "No dirty reads: a transaction's reads return committed values only. No dirty writes: a transaction may overwrite only committed values, so a second writer waits for the first transaction to commit or abort." },
    { front: "How do most databases prevent dirty reads without read locks, and why do they avoid read locks?", back: "For each object with an uncommitted write they keep both the old committed value and the new value, and readers get the old value until commit. Read locks would let one long-running write transaction stall every reader, spreading slowdowns across the application." },
    { front: "What is read skew, and why is it acceptable under read committed?", back: "A transaction reads different parts of the database as of different moments; for example Alice sees $500 in one account and $400 in the other during a $100 transfer, 'losing' $100. Every value read was committed at the time, so read committed is satisfied." },
    { front: "Which two workloads make read skew intolerable and motivate snapshot isolation?", back: "Multi-hour backups, where an inconsistent copy becomes permanent after a restore, and long analytic scans or integrity checks that read many tables and would return nonsense if they saw different points in time." },
    { front: "State the MVCC visibility rules PostgreSQL uses to build a consistent snapshot.", back: "Ignore writes by transactions still in progress when the snapshot was taken (even if they commit later), by aborted transactions, and by transactions with a higher txid. Everything else is visible. A row version is visible if its creator committed before the snapshot and its deleter, if any, had not." },
    { front: "How does an UPDATE work internally in PostgreSQL's MVCC?", back: "It becomes a delete plus an insert: the old row version gets its deleted_by field set to the updating txid, and a new version is created with created_by set to that txid. Garbage collection removes old versions once no transaction can still see them." },
    { front: "Why do PostgreSQL and MySQL call snapshot isolation 'repeatable read', and what does Oracle call it?", back: "The SQL standard, based on System R's 1975 levels, predates snapshot isolation and only defines repeatable read, which snapshot isolation satisfies, so they can claim compliance. Oracle calls it 'serializable'. DB2 uses 'repeatable read' to mean actual serializability." },
    { front: "What is the lost update problem? Name three places it appears.", back: "Two transactions each read a value, modify it, and write it back; the later write omits the earlier change. It appears with counters and balances, edits to part of a JSON document, and wiki pages saved as whole-page overwrites." },
    { front: "Which databases automatically detect lost updates at their snapshot level, and which notable one does not?", back: "PostgreSQL repeatable read, Oracle serializable, and SQL Server snapshot isolation abort the losing transaction. MySQL/InnoDB's repeatable read lacks the check, which leads some authors to say it does not truly provide snapshot isolation." },
    { front: "When is a compare-and-set statement like UPDATE ... WHERE body = 'v1' unsafe?", back: "If the database evaluates the WHERE clause against an old snapshot rather than the latest committed value, the condition can pass even though a concurrent write changed the row, so the lost update is not prevented. Verify the implementation before relying on it." },
    { front: "Why do locks and compare-and-set fail to prevent lost updates in multi-leader or leaderless systems?", back: "Both assume there is one authoritative, current copy. With asynchronous multi-leader or leaderless replication, writes happen concurrently on different nodes. Such systems instead keep sibling versions and merge them, or use commutative operations like Riak 2.0 data types; last write wins loses updates." },
    { front: "Define write skew and explain how it differs from a lost update.", back: "Two transactions read the same data, then each updates different objects based on what they saw, jointly violating an invariant (both on-call doctors resign). In a lost update both write the same object; write skew generalizes the pattern to different objects." },
    { front: "Why does SELECT FOR UPDATE fix the doctors-on-call write skew but not the meeting-room double booking?", back: "In the doctors case the rows being modified were returned by the check query, so they can be locked. The booking check looks for the absence of overlapping rows; it returns nothing, so there is nothing to lock. The conflicting insert is a phantom." },
    { front: "What is a phantom?", back: "A write by one transaction that alters which rows another transaction's search would return, usually by inserting a row that newly matches the condition. Read-only queries under snapshot isolation are unaffected, but a transaction that reads and then writes can suffer write skew from one." },
    { front: "What does 'materializing conflicts' mean, and why is it a last resort?", back: "Creating artificial rows (for example one per room per 15-minute slot) purely to lock with SELECT FOR UPDATE, turning a phantom into a concrete row conflict. It is error-prone and leaks concurrency control into the data model; serializable isolation is preferable." },
    { front: "What two developments made single-threaded serial transaction execution viable around 2007?", back: "RAM became cheap enough to hold the active dataset in memory, removing disk waits, and designers realized OLTP transactions are short with few operations, while long analytic reads can run on a snapshot outside the serial loop." },
    { front: "Why do serial-execution systems require stored procedures instead of interactive transactions?", back: "An interactive transaction spends most of its time waiting on the network between statements, so a single thread would sit idle. Submitting the whole transaction as a stored procedure lets it run to completion with no network or disk waits." },
    { front: "How does VoltDB scale serial execution, and what is the catch?", back: "Partition the data so each transaction touches one partition; each partition gets its own thread, scaling linearly with cores. Cross-partition transactions need lock-step coordination and run at roughly 1,000 writes per second, a limit that adding machines does not raise." },
    { front: "Describe the locking rules of two-phase locking and where the 'two phases' come from.", back: "Reads take shared locks, writes take exclusive locks, and a reader may upgrade; writers block readers and vice versa. Phase one acquires locks during execution; phase two releases them all at commit or abort. Deadlocks are detected and one victim is aborted." },
    { front: "Contrast predicate locks and index-range locks.", back: "A predicate lock covers every object matching a search condition, including future rows, but checking many predicates is slow. Index-range (next-key) locks approximate the predicate by locking a wider region of an index; safe because any matching write also hits that region. Fallback: lock the whole table." },
    { front: "What two kinds of staleness does SSI detect, and when does it abort?", back: "Stale MVCC reads: the transaction ignored an uncommitted write that has since committed. Writes affecting prior reads: another transaction wrote data this one read. Checks happen at commit; the transaction aborts if a conflicting peer has already committed." },
    { front: "Why does SSI defer aborting a transaction that read a stale value until commit time?", back: "At read time the database does not know whether the transaction will write (read-only transactions need no abort), and the conflicting writer might still abort. Deferring avoids unnecessary aborts and keeps long-running read-only snapshot queries viable." },
    { front: "Under what workload conditions does optimistic concurrency control (SSI) beat pessimistic locking (2PL), and when does it lose?", back: "It wins with spare capacity and moderate contention: no blocking, predictable latency, lock-free read-only queries. It loses under high contention, where many transactions abort and the retries add load to an already saturated system." },
    { front: "Which isolation level is the minimum to prevent each: dirty read, read skew, write skew?", back: "Dirty read: read committed. Read skew: snapshot isolation. Write skew: serializable; no weaker level prevents it automatically, although explicit row locks can patch specific cases where the decisive rows exist." }
  ],
  quiz: [
    {
      question: "A transaction inserts an email and increments an unread counter. The database crashes after the insert but before the increment, and on restart the email is present while the counter is unchanged. Which ACID property was violated?",
      choices: ["Isolation", "Consistency", "Durability", "Atomicity"],
      answer: 3,
      explanation: "Atomicity requires that a transaction which cannot complete leaves no partial writes; the surviving insert is exactly such a partial write. Isolation concerns what concurrent transactions see, not crash recovery. Consistency is the application invariant broken as a consequence, not the database guarantee at fault. Durability is about committed data surviving, and this transaction never committed."
    },
    {
      question: "Which of the following anomalies is still possible under read committed isolation?",
      choices: ["Reading a value written by a transaction that later aborts", "Two transactions interleaving uncommitted writes to the same rows", "A single transaction seeing two account balances as of different moments", "Overwriting a row that another uncommitted transaction has already written"],
      answer: 2,
      explanation: "Read skew, in which one transaction sees parts of the database from different moments, is permitted under read committed because each value read was committed at the time it was read. The other three describe dirty reads and dirty writes, both of which read committed rules out."
    },
    {
      question: "Why do most databases avoid implementing 'no dirty reads' by having readers briefly take the row's write lock?",
      choices: ["A long-running write transaction would block many read-only transactions, spreading latency across the application", "Read locks cannot be combined with write-ahead logging", "Read locks are impossible to implement without MVCC", "Read locks would allow dirty writes"],
      answer: 0,
      explanation: "A reader taking the lock must wait for any writer that holds it until that writer commits, so one slow write transaction stalls unrelated reads. Keeping the old committed value and serving it to readers avoids this. Read locks are perfectly implementable (DB2 and SQL Server in one configuration use them) and have no bearing on the WAL or on dirty writes."
    },
    {
      question: "In PostgreSQL's MVCC, transaction 12 starts; then transaction 13 starts, updates account 2 from $500 to $400, and commits. What does transaction 12 see for account 2 afterwards?",
      choices: ["$400, because transaction 13 has committed", "An error, because the row version it read was deleted", "Either value, depending on which index is used", "$500, because transaction 13 has a higher txid than 12"],
      answer: 3,
      explanation: "The visibility rules ignore writes by transactions with a higher transaction ID than the reader's, regardless of whether they committed, so transaction 12 keeps seeing the $500 version. MVCC never raises errors for superseded versions; it retains the old version until no transaction needs it. Index choice does not change visibility."
    },
    {
      question: "Which approach to lost updates works WITHOUT any changes to application code?",
      choices: ["Automatic lost-update detection in PostgreSQL repeatable read", "SELECT ... FOR UPDATE before the read-modify-write", "Compare-and-set with a WHERE clause on the old value", "Riak 2.0 commutative data types"],
      answer: 0,
      explanation: "Automatic detection happens inside the transaction manager: if a read-modify-write raced with a committed write, the transaction is aborted and retried, with no special statements required. Explicit locks and compare-and-set must be written into every relevant code path. Riak data types require choosing a specific data type with merge semantics."
    },
    {
      question: "Two on-call doctors each run: count on-call doctors for the shift; if at least two, set own on_call to false. Under snapshot isolation both commit and nobody is on call. Which of the following would NOT reliably prevent this?",
      choices: ["Running at serializable isolation implemented with SSI", "Adding SELECT ... FOR UPDATE on the shift's on-call rows before the update", "Relying on the database's automatic lost-update detection", "Running the check and update inside a serially executed stored procedure"],
      answer: 2,
      explanation: "Lost-update detection fires only when two transactions write the same object; here each doctor updates a different row, so it is write skew and goes unnoticed. SSI detects that each transaction's write invalidates the other's premise. FOR UPDATE on the rows that were read makes the second transaction wait and re-check. Serial execution removes concurrency entirely."
    },
    {
      question: "A booking system checks for overlapping reservations and inserts one if none exist. Why does adding SELECT ... FOR UPDATE to the check query fail to prevent double booking?",
      choices: ["FOR UPDATE only works at the serializable isolation level", "The check returns no rows when the slot is free, so nothing is locked; the competing insert is a phantom", "FOR UPDATE locks are released before the INSERT executes", "Overlapping time ranges cannot be expressed in SQL"],
      answer: 1,
      explanation: "Row locks attach to existing rows. An absence check that returns zero rows acquires zero locks, so a concurrent transaction can insert a conflicting booking. This is a phantom, which needs predicate or index-range locks, serializable isolation, or materialized conflict rows. FOR UPDATE works at any level and holds locks until commit, and the range query itself is ordinary SQL."
    },
    {
      question: "What is the main reason single-threaded serial execution systems such as VoltDB forbid interactive multi-statement transactions?",
      choices: ["Interactive transactions cannot be made deterministic for replication", "SQL does not support stored procedures", "Interactive transactions would require two-phase locking", "The single thread would spend most of its time idle, waiting for the next statement to arrive over the network"],
      answer: 3,
      explanation: "With one thread and interactive clients, every network round trip between statements stalls all other transactions, making throughput terrible. Stored procedures submit the whole transaction at once so it runs without waiting. Determinism is a separate VoltDB replication requirement, stored procedures have been in the SQL standard since 1999, and 2PL is unrelated."
    },
    {
      question: "Which statement correctly contrasts two-phase locking with snapshot isolation?",
      choices: ["Under 2PL writers and readers block each other; under snapshot isolation readers and writers never block each other", "Under 2PL readers never block writers; under snapshot isolation they do", "Both avoid blocking between readers and writers, but 2PL adds predicate locks", "Snapshot isolation blocks readers while 2PL blocks only writers"],
      answer: 0,
      explanation: "2PL requires a shared lock to read and an exclusive lock to write, so a writer must wait for readers and a reader must wait for a writer until that transaction ends. Snapshot isolation serves readers old versions from MVCC, so neither side waits for the other; only writer-writer conflicts take locks. The other options invert or blur this distinction."
    },
    {
      question: "Index-range locks approximate predicate locks. Why is it safe to lock a wider range than the query actually needs?",
      choices: ["Because wider locks are released earlier", "Because the database rewrites the query to match the wider range", "Because any write matching the original predicate necessarily also matches the wider approximation, so no conflict can slip through", "Because readers under 2PL never take locks on indexes"],
      answer: 2,
      explanation: "Over-approximation errs toward blocking more writes than necessary, never fewer, so serializability is preserved; the price is reduced concurrency. Locks are still held until the end of the transaction, the query is not rewritten, and readers do attach shared locks to the index region they searched."
    },
    {
      question: "In SSI, transactions 42 and 43 both read the on-call doctors for a shift and each updates a different doctor's row. Transaction 42 commits first. What happens to 43 at commit?",
      choices: ["43 commits, because it modified a different row than 42", "43 blocks until 42's locks are released, then commits", "43 aborts, because data it read was changed by 42, which committed before 43", "43 was already aborted the moment 42 performed its write"],
      answer: 2,
      explanation: "SSI recorded that 43 read data that 42 later wrote. When 43 tries to commit, 42's conflicting write has already committed, so 43's premise is stale and it must abort; writing different rows is exactly the write-skew pattern SSI exists to catch. SSI never blocks on locks, and it defers the abort decision to commit time because 42 might still have aborted."
    },
    {
      question: "Which workload characteristic argues most strongly against choosing SSI over two-phase locking?",
      choices: ["Many long-running read-only analytic queries", "Very high contention where most transactions touch the same hot rows", "A dataset larger than RAM", "A need for predictable query latency"],
      answer: 1,
      explanation: "Optimistic control degrades under heavy contention because a large share of transactions abort and retry, which can push an already busy system past saturation. Long read-only queries are a strength of SSI since they run on snapshots without locks, SSI does not require in-memory data (that constraint belongs to serial execution), and predictable latency favors SSI over blocking 2PL."
    }
  ],
  reviewQuestions: [
    "You are building a ticket-selling service on PostgreSQL. Each purchase must (a) decrement an inventory counter, (b) insert an order row, and (c) ensure no customer buys more than four tickets per event. For each requirement, name the anomaly that threatens it at read committed, at repeatable read (snapshot isolation), and at serializable, then propose the cheapest isolation level plus any explicit measures (atomic UPDATE, FOR UPDATE, unique constraint) that make the whole flow correct.",
    "Compare how two-phase locking, serializable snapshot isolation, and serial execution each handle the meeting-room double-booking phantom. For each, describe the mechanism that catches the conflict, what the second transaction experiences (blocks, aborts, or waits in a queue), and how performance would change if bookings became highly contended on a handful of popular rooms.",
    "A team claims its system is 'ACID' because it runs MySQL/InnoDB at repeatable read. Walk through what each ACID letter actually guarantees in that configuration, which anomalies remain possible (be specific about lost updates and write skew), and what you would change to close each gap.",
    "Explain the MVCC visibility rules precisely enough to predict what a long-running backup transaction sees while hundreds of short transactions commit around it. Then discuss the costs this imposes (garbage collection, index maintenance, transaction ID wraparound) and how append-only B-tree systems such as LMDB or Datomic trade those costs differently.",
    "Your application retries any transaction that fails. Describe a concrete sequence of events in which this policy (a) performs a payment twice, (b) worsens an outage, and (c) can never succeed. For each, state the fix (deduplication key, backoff with error classification, distinguishing transient from permanent errors) and relate it to why ACID databases prefer aborting over leaving a transaction half done."
  ]
});
