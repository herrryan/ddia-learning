DDIA.registerChapter({
  number: 3,
  part: 1,
  title: "Storage and Retrieval",
  tagline: "How does a database lay out bytes on disk so writes stay fast and reads stay findable?",
  studyMinutes: 90,
  overview: [
    "This chapter switches from the application's view of data (Chapter 2) to the database's view: given some bytes to keep, how does an engine arrange them on disk so it can hand them back quickly later? The first half builds the two dominant families of OLTP storage engines from first principles. Log-structured engines start with a plain append-only file, add a hash index (Bitcask), then sorted segments (SSTables), and finally the memtable-plus-compaction design of LSM-trees. Page-oriented engines, dominated by the B-tree, instead overwrite fixed-size pages in place and lean on a write-ahead log for crash safety. The chapter compares the two families, tours secondary, clustered, multi-dimensional, and fuzzy indexes, and looks at databases that keep everything in RAM.",
    "The second half asks a different question: what if your queries scan millions of rows instead of fetching a few by key? That is the analytics (OLAP) world of data warehouses, ETL pipelines, and star schemas, where disk bandwidth rather than seek time is the constraint. Column-oriented storage, bitmap compression, sort orders, and materialized aggregates such as data cubes all exist to shrink the number of bytes an analytic query must touch.",
    "You will probably never write a storage engine, but you will choose one, size it, and tune it. Knowing whether your engine buffers writes in a memtable or splits B-tree pages tells you what a configuration knob actually does, why tail latency spikes during compaction, or why an analyst's query is hurting your transactional database. These ideas return throughout the book: logs reappear in replication (Chapter 5) and stream processing (Chapter 11), B-tree locking in transactions (Chapter 7), and warehouses in batch processing (Chapter 10)."
  ],
  bigIdeas: [
    "Appending to a log is the cheapest possible write; every index you add trades some write speed for faster reads on one access path.",
    "LSM-trees turn random writes into sequential ones by sorting in memory first and merging immutable sorted files in the background.",
    "B-trees overwrite fixed-size pages in place, rely on a write-ahead log for crash safety, and remain the default index in relational databases.",
    "Neither family wins outright: LSM-trees usually win on write throughput and compression, B-trees on predictable latency and single-copy keys.",
    "OLTP (few records by key) and OLAP (scan millions, aggregate) differ so much that they deserve separate systems and storage layouts.",
    "Column storage, compression, and sorting cut the bytes an analytic query reads, which is the real bottleneck in a warehouse."
  ],
  sections: [
    {
      id: "simplest-database-and-indexes",
      title: "The Simplest Database and the Case for Indexes",
      body: [
        "Picture a key-value store made of two shell functions. One appends a line of the form key,value to a file; the other greps for the key and returns the last line that matches. Writes are about as cheap as writes can be, because appending to the end of a file is a purely sequential operation. Reads are the opposite: every lookup scans the whole file, so cost grows linearly with the number of records. Double the data and you double the read time. Surprisingly, many production engines keep exactly this kind of append-only file at their core. The book uses the word **log** for any file that only ever grows by appending records, binary or text, not just the human-readable messages an application prints. Real systems add concurrency control, space reclamation, and detection of half-written records on top of the basic idea.",
        "To find one key without reading everything, you need an **index**: an extra structure derived from the primary data that acts like a signpost. An index never changes what is stored; it changes only how fast certain queries run, which is why you can add and drop indexes freely. The price is paid on the write path. Each write must now also update every index, so no indexed engine can match the raw speed of a plain append. This is the trade-off that shapes the whole chapter, and it is why databases make you choose indexes deliberately, based on the queries your application actually runs, instead of indexing every field by default."
      ],
      keyPoints: [
        "A log in this book means any file that grows only by appending records, whether binary or text.",
        "Appending is the fastest write; a full-file scan is an O(n) read that doubles when the data doubles.",
        "An index is derived metadata; adding or dropping one changes performance, never the stored content.",
        "Every index speeds some reads and slows every write, so indexes are chosen per workload.",
        "Production engines layer concurrency control, space reclamation, and corruption handling on top of the log."
      ],
      callout: {
        kind: "insight",
        text: "Keep the read/write trade-off in mind for the whole chapter. Every structure that follows (hash index, SSTable, B-tree, column file) is a different answer to the same question: how much write cost will you pay for faster reads?"
      }
    },
    {
      id: "hash-indexes",
      title: "Hash Indexes",
      body: [
        "The simplest index for an append-only log is an in-memory hash map from each key to the byte offset where its latest value begins. On a write, append the record and point the map entry at the new offset; on a read, look up the offset, seek to it, and read one record. This is essentially how Bitcask, the default engine in Riak, works. Its defining constraint is that every key must fit in RAM. Values can be far larger than memory because a read costs at most one disk seek, and none at all if the block already sits in the OS page cache. The ideal workload has a huge number of updates spread over a modest number of keys, such as a play counter keyed by video URL.",
        "To keep the log from growing forever, the engine closes the active file once it reaches a size limit and opens a new **segment**. Closed segments are immutable, so a background thread can **compact** them: read a segment, keep only the newest value for each key, and write the survivors to a fresh file. Because compaction usually shrinks segments a lot, several can be merged in the same pass. Reads continue against the old files until the merged file is complete; then the engine switches lookups to the new file and deletes the old ones. Each segment keeps its own hash map, so a lookup consults the newest segment first and falls back through older ones. Merging keeps the segment count small, so this fallback chain stays short.",
        "Several details separate the sketch from a working engine. A binary format that prefixes each string with its length is faster and simpler than CSV, and needs no escaping. Deleting a key means appending a **tombstone**, a marker that tells the next merge to discard earlier values for that key. After a crash the in-memory maps are gone; rebuilding them by scanning every segment would make restarts slow, so Bitcask persists each segment's map to disk and reloads it at startup instead. Checksums catch a record that was only partly written when the crash hit, so it can be skipped. Finally, a single writer thread keeps appends strictly ordered, while immutable segments can be read by many threads at once.",
        "Why not just overwrite values in place? Append-only wins for three reasons. Appends and merges are sequential writes, which are dramatically faster than random writes on spinning disks and still preferable on SSDs. Crash recovery is simpler because you never find a file holding half of an old value spliced with half of a new one. And periodic merging removes fragmentation. Hash indexes nevertheless have two hard limits. The complete key set must fit in memory, since on-disk hash maps need lots of random I/O, are expensive to grow, and make collision handling awkward. And range queries are hopeless: to scan every key between two bounds you would have to probe each possible key individually."
      ],
      keyPoints: [
        "In-memory map of key to byte offset; values stay on disk and cost at most one seek to read.",
        "Segments plus background compaction keep only the latest value per key and reclaim disk space.",
        "Tombstones record deletions so merges can discard earlier values of a deleted key.",
        "Restart speed depends on snapshotting each segment's hash map to disk (Bitcask does this).",
        "Checksums detect partially written records; one writer thread serializes appends, many threads read.",
        "Hard limits: all keys must fit in RAM, and range scans are not supported."
      ],
      callout: {
        kind: "example",
        text: "Counting plays for cat videos: millions of increments land on a few hundred thousand URLs. Every key fits in RAM, each write is a pure append, and compaction later collapses a key's long update history into one record."
      },
      systems: ["Bitcask", "Riak"]
    },
    {
      id: "sstables-and-lsm-trees",
      title: "SSTables and LSM-Trees",
      body: [
        "Now change one rule: inside each segment file, store entries in key order, and let each key occur only once. This format is the **Sorted String Table (SSTable)**, a name from Google's Bigtable paper. Sorting pays off three ways. Merging segments becomes a streaming mergesort: compare the heads of all input files, copy the smallest key to the output, advance that input, and repeat; when several inputs contain the same key, keep the copy from the newest segment. This works even when the files are far bigger than memory. Second, the in-memory index can be sparse. If you know the offsets of the keys `handbag` and `handsome`, you know `handiwork` must lie between them, so one index entry every few kilobytes is enough and the gap is scanned. Third, since reads already scan a small block, each block can be compressed on disk, saving space and I/O bandwidth.",
        "But writes arrive in arbitrary order, so how do segments end up sorted? Sort in memory first. Incoming writes go into a balanced tree such as a red-black or AVL tree, called the **memtable**. When it grows past a threshold, typically a few megabytes, it is written out in key order as a new SSTable, which becomes the newest segment, while a fresh memtable accepts new writes. A read checks the memtable, then each on-disk segment from newest to oldest. Background merging and compaction combine segments and drop overwritten or deleted values. Since a crash would lose the memtable, every write is also appended to an unsorted log on disk; that log exists only to rebuild the memtable and is thrown away once the memtable has been flushed.",
        "This design is the **Log-Structured Merge-Tree (LSM-tree)**, named by O'Neil and colleagues and rooted in earlier log-structured filesystems. LevelDB and RocksDB implement it as embeddable libraries (LevelDB is an alternative to Bitcask inside Riak). Cassandra and HBase use the same scheme, following Bigtable. Lucene, the full-text engine beneath Elasticsearch and Solr, stores its term dictionary (each word mapped to a postings list of document IDs) in sorted SSTable-like files, merging them in the background as they pile up.",
        "Two refinements matter in practice. A lookup for a key that does not exist is costly because it falls through the memtable and every segment before giving up, possibly with a disk read per segment. A **Bloom filter**, a compact probabilistic set summary, can say that a key is definitely absent and skip those reads. Compaction scheduling also varies. Size-tiered compaction repeatedly folds small, recent SSTables into big, old ones. Leveled compaction partitions keys into many small SSTables and demotes older data through a hierarchy of levels, so each merge touches a small slice and needs less scratch disk space. LevelDB and RocksDB use leveled (hence the name), HBase size-tiered, while Cassandra lets you pick either. The overall payoff: the design keeps working when data far exceeds RAM, sorted data makes range scans cheap, and sequential writes deliver very high write throughput."
      ],
      keyPoints: [
        "SSTable = segment sorted by key with unique keys; merging is a streaming mergesort over inputs.",
        "A sparse in-memory index (one key per few KB) replaces the all-keys hash map.",
        "Writes go to a memtable (balanced tree) that is flushed to a new SSTable at a size threshold.",
        "A separate unsorted on-disk log protects the memtable from crashes and is discarded after each flush.",
        "Reads check memtable, then segments newest to oldest; Bloom filters short-circuit lookups for absent keys.",
        "Size-tiered (HBase) vs leveled (LevelDB, RocksDB) compaction; Cassandra supports both."
      ],
      table: {
        caption: "Hash-indexed log versus SSTable/LSM-tree",
        columns: ["Property", "Hash-indexed log (Bitcask)", "SSTable / LSM-tree"],
        rows: [
          ["In-memory index", "Every key with its offset", "Sparse: a few keys per block"],
          ["Key set larger than RAM", "Not supported", "Works; only the sparse index is in memory"],
          ["Range queries", "Impractical (probe each key)", "Efficient sequential scan"],
          ["Merging segments", "Hash-based rewrite", "Streaming mergesort, memory-independent"],
          ["Block compression", "Awkward (random point reads)", "Natural (blocks are scanned anyway)"],
          ["Crash protection", "Checksums plus map snapshots", "Unsorted write log for the memtable"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "A missing key is the worst case for an LSM-tree: every level must be consulted before the engine can answer not found. Without Bloom filters, a workload with many lookups for absent keys can saturate the disk."
      },
      systems: ["LevelDB", "RocksDB", "Cassandra", "HBase", "Bigtable", "Lucene", "Elasticsearch", "Solr"]
    },
    {
      id: "b-trees",
      title: "B-Trees",
      body: [
        "B-trees date from 1970, were called ubiquitous within a decade, and remain the standard index in nearly every relational database and many non-relational ones. Like SSTables they keep keys sorted, so point lookups and range scans are both efficient, but the design philosophy is the opposite. Instead of multi-megabyte segments written sequentially, a B-tree divides storage into fixed-size **pages**, traditionally 4 KB, and reads or writes one page at a time. That matches how disks themselves are organized into blocks. Each page has an on-disk address, so pages can reference one another, and those references form a tree.",
        "A lookup starts at the root page, which holds a few keys acting as range boundaries plus references to child pages. You follow the child whose range contains your key and repeat until you reach a leaf page, which either stores the value inline or points to where it lives. The number of child references per page is the **branching factor**, usually several hundred. Updating an existing key means locating its leaf, modifying the value, and writing that page back; the page keeps its address, so nothing else changes. Inserting into a full page splits it into two pages, each roughly half full, and adds a boundary to the parent. This keeps the tree balanced with depth O(log n); four levels of 4 KB pages, each fanning out to 500 children, can address roughly 256 TB, so most lookups follow only three or four references.",
        "The core write primitive is overwriting a page in place. On a magnetic disk that is a head seek and a sector rewrite; on an SSD it means erasing and rewriting a much larger block. Some operations touch several pages, for example a split writes two children and then the parent. If the database crashes between those writes, the tree is corrupt, perhaps with an orphan page that no parent references. The standard defense is a **write-ahead log (WAL)**, which some systems call a redo log: an append-only file that receives a record of every intended modification before the page itself is touched, so recovery after a crash can bring the tree back to a consistent state. In-place updates also require careful concurrency control; threads coordinate through **latches** (lightweight locks) so that nobody observes a half-updated tree. Log-structured engines avoid most of this because merging happens in the background and new segments replace old ones atomically.",
        "Decades of refinement have produced many variants. LMDB avoids a WAL with copy-on-write: instead of overwriting a page, the engine writes the changed version at a fresh address and creates new copies of its ancestors that point there, leaving the old tree intact until the switch, which also helps concurrency (see snapshot isolation in Chapter 7). Interior pages can store abbreviated keys, because they only need to separate ranges; shorter keys raise the branching factor and shrink the depth (the common B+ tree variant). Engines try to place leaf pages in key order on disk so range scans become sequential, but that order is hard to preserve as the tree grows, whereas LSM-trees get it nearly free by rewriting large runs during merges. Leaf pages often carry sibling pointers so a scan can move sideways without climbing to the parent. Fractal trees borrow log-structured buffering to cut disk seeks and, despite the name, involve no fractals."
      ],
      keyPoints: [
        "Fixed-size pages (commonly 4 KB) linked by on-disk references form a balanced tree of depth O(log n).",
        "Branching factor of a few hundred means three or four levels cover hundreds of terabytes.",
        "Update: overwrite the leaf page in place. Insert into a full page: split it and update the parent.",
        "A write-ahead log makes multi-page operations crash-safe; latches make them safe under concurrency.",
        "Optimizations: copy-on-write (LMDB), abbreviated keys, sequential leaf layout, sibling pointers, fractal trees."
      ],
      callout: {
        kind: "pitfall",
        text: "A page split is not atomic on disk. If power fails after the two child pages are written but before the parent is updated, the index is corrupt. That is exactly the failure the write-ahead log exists to repair."
      },
      systems: ["LMDB"]
    },
    {
      id: "comparing-b-trees-and-lsm-trees",
      title: "Comparing B-Trees and LSM-Trees",
      body: [
        "The rule of thumb says LSM-trees write faster and B-trees read faster; an LSM read may consult the memtable plus several SSTables in various compaction states, while a B-tree read is a single descent. But benchmarks swing with workload details, so the honest answer is to measure with your own data and access pattern. What you can do in advance is understand the mechanisms behind each side's advantages.",
        "**Write amplification** is the ratio of bytes physically written to disk over the database's lifetime to bytes logically written by the application. A B-tree commits every change to disk twice at minimum, first into the WAL and then into the page, and it rewrites an entire page even when the change is a handful of bytes. Some engines (InnoDB's doublewrite buffer, PostgreSQL's full-page writes) write the page yet again to survive a torn write during a power failure. LSM-trees also rewrite data during repeated compaction, but they often achieve lower total amplification and always write sequentially in large chunks, which is why they sustain higher write throughput, especially on magnetic disks. Lower amplification also matters on SSDs, which tolerate only a limited number of block overwrites before wearing out. LSM-trees compress better too: B-tree pages carry wasted space from splits and from rows that did not fit, whereas periodic SSTable rewrites remove fragmentation, particularly under leveled compaction. SSD firmware already converts random writes to sequential ones internally, but smaller, denser files still mean more useful work per unit of I/O bandwidth.",
        "On the other side of the ledger, compaction competes with live requests for disk resources. Average latency barely moves, but at high percentiles a request can stall behind an expensive merge, so B-trees are more predictable. Under sustained heavy writes, compaction may fall behind the incoming rate. Unmerged segments then pile up, the disk fills, and reads slow down because each must check more files. Most SSTable engines do not throttle writers when this happens, so you need explicit monitoring. Finally, a B-tree stores each key in exactly one place, while an LSM-tree may hold several versions across segments. That single location makes it natural to attach range locks directly to the tree, which is how many relational databases implement transaction isolation (Chapter 7).",
        "B-trees are woven deeply into database architecture and deliver consistently good performance across many workloads, so they are not going away. Log-structured engines keep gaining ground in newer datastores. There is no shortcut for choosing between them; test empirically."
      ],
      keyPoints: [
        "Rule of thumb: LSM writes faster, B-tree reads faster; confirm with your own workload.",
        "Write amplification: B-trees pay WAL plus full page (plus doublewrite); LSM-trees pay repeated compaction.",
        "LSM advantages: sequential writes, higher write throughput, better compression, less fragmentation, less SSD wear.",
        "LSM downsides: compaction inflates tail latency, can fall behind under load, and nothing throttles writers.",
        "B-tree advantage: one copy per key, which simplifies range locking for transactional isolation."
      ],
      table: {
        caption: "B-trees versus LSM-trees",
        columns: ["Dimension", "B-tree", "LSM-tree"],
        rows: [
          ["Write pattern", "Random in-place page overwrites", "Sequential appends and bulk merges"],
          ["Write amplification", "WAL plus whole page per change, sometimes doublewrite", "Repeated rewrites during compaction; often lower overall"],
          ["Read path", "One root-to-leaf descent", "Memtable plus several SSTables; Bloom filters help misses"],
          ["Space usage", "Fragmentation from half-empty pages", "Compact, compressed files; best with leveled compaction"],
          ["Latency profile", "Predictable", "Occasional tail spikes during compaction"],
          ["Copies of a key", "Exactly one", "Possibly several across segments"],
          ["Crash safety", "Write-ahead log", "Immutable segments plus memtable log"],
          ["Transaction locking", "Range locks attach directly to the tree", "Harder; versions spread across files"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Write amplification is a budget problem. If a disk absorbs 500 MB/s and the engine amplifies writes 10x, the application gets at most 50 MB/s of real inserts; the rest goes to logs, page rewrites, or compaction."
      },
      systems: ["InnoDB", "PostgreSQL", "RocksDB"]
    },
    {
      id: "other-indexing-structures",
      title: "Other Indexing Structures",
      body: [
        "Everything so far was a primary key index: one unique key leads to one row, document, or vertex, and other records refer to it by that key. Secondary indexes are just as common and often essential for joins; think of indexing a `user_id` column so you can gather all rows belonging to one user. A secondary index differs only in that keys repeat. Either let the value hold every matching row identifier (the way a full-text postings list holds document IDs) or make each entry unique by appending the row identifier to the key. B-trees and LSM-trees both work as secondary indexes.",
        "What should the index value hold? One option is a reference into a **heap file**, an unordered area where rows live. This stores each row once no matter how many indexes point at it, and an update that does not change the key can overwrite the row in place if the new version is no larger. A larger new version has to move, which means either updating every index or leaving a forwarding pointer at the old spot. The alternative is a **clustered index** that stores the complete row inside the index: InnoDB does this for every table's primary key, and its secondary indexes point to the primary key value rather than to a heap position; SQL Server allows one clustered index per table. Between the two sits the **covering index** (index with included columns), which copies a subset of columns into the index so that some queries never touch the main table at all. All such duplication speeds reads but costs storage, slows writes, and forces the database to keep the copies transactionally consistent.",
        "Querying several columns at once needs multi-column indexes. The common **concatenated index** joins fields into one key in a declared order, like a phone book sorted by last name then first name: it serves lookups by last name or by the pair, but is useless for first name alone. A two-dimensional range query, such as every restaurant inside a map rectangle bounded by latitude and longitude, defeats any single-key B-tree or LSM-tree, which can bound one dimension and must filter the rest. Options are to flatten the two coordinates into one number with a space-filling curve and index that with an ordinary B-tree, or to use a spatial structure such as an R-tree; PostGIS builds R-trees on PostgreSQL's GiST facility. Multi-dimensional indexes help beyond geography: an index on (red, green, blue) finds products in a color range, and one on (date, temperature) finds 2013 observations between 25 and 30 degrees C without scanning the whole year, an approach HyperDex uses.",
        "All of these indexes need exact keys. Tolerating a misspelling requires different machinery. Full-text engines expand synonyms, ignore grammatical variants, and find words near each other in a document. Lucene can match terms whose edit distance from the query is at most some bound (each insertion, deletion, or substitution counts one). Its term dictionary is SSTable-like, but where LevelDB keeps a sparse list of keys in memory, Lucene keeps a trie-like finite state automaton built from the characters of the terms. That automaton can be converted into a Levenshtein automaton, which enumerates all terms within the edit distance efficiently. Further along this path lie document classification and machine learning, covered in information retrieval textbooks."
      ],
      keyPoints: [
        "Secondary indexes allow duplicate keys: value holds a list of row IDs, or the key is made unique with a row ID suffix.",
        "Heap file: rows stored once and referenced by pointer; a row that grows may leave a forwarding pointer.",
        "Clustered index stores the row inside the index (InnoDB primary key); covering index stores selected columns.",
        "Concatenated index order matters: (last_name, first_name) cannot serve first-name-only lookups.",
        "2D range queries need a space-filling curve over a B-tree or a spatial index such as an R-tree.",
        "Fuzzy search: Lucene's automaton-based term index becomes a Levenshtein automaton for edit-distance queries."
      ],
      table: {
        caption: "Where the row lives relative to the index",
        columns: ["Approach", "Index entry holds", "Read cost", "Write and storage cost"],
        rows: [
          ["Nonclustered index + heap file", "Pointer to heap location", "Extra hop to the heap for row data", "Row stored once; a row that grows needs a move or forwarding pointer"],
          ["Clustered index", "The entire row", "One lookup for primary-key access", "Secondary indexes must go through the primary key, adding a hop"],
          ["Covering index", "Pointer plus selected columns", "Covered queries never touch the table", "Copied columns must be updated on every write"]
        ]
      },
      callout: {
        kind: "example",
        text: "A restaurant map query bounds latitude and longitude together. A B-tree on latitude returns a band of restaurants around the whole planet; one on longitude returns a strip from pole to pole. Only a spatial index narrows both at once."
      },
      systems: ["InnoDB", "SQL Server", "PostGIS", "PostgreSQL", "HyperDex", "Lucene", "LevelDB"]
    },
    {
      id: "keeping-everything-in-memory",
      title: "Keeping Everything in Memory",
      body: [
        "Every structure above exists because disks are awkward: both spinning disks and SSDs demand a careful layout before they perform well. We tolerate that because disks are durable and cheaper per gigabyte than RAM. As memory prices fall, many datasets fit entirely in RAM, possibly spread across several machines, which is the premise of in-memory databases. Memcached is a pure cache that may lose its contents on restart. Durable in-memory stores survive restarts by battery-backed RAM, by appending a change log to disk, by writing periodic snapshots, or by replicating state to other nodes; on restart they reload from disk or from a replica. They still count as in-memory because reads never touch the disk, which serves only as a durability log, with the side benefit that on-disk files can be backed up and inspected with ordinary tools.",
        "VoltDB, MemSQL, and Oracle TimesTen offer relational models in memory; RAMCloud is a durable in-memory key-value store that uses a log-structured layout both in RAM and on disk; Redis and Couchbase provide weaker durability by writing to disk asynchronously. The source of the speedup is often misunderstood. It is not mainly about avoiding disk reads, because a disk-based engine with enough RAM serves hot reads from the operating system's page cache anyway. The gain comes from skipping the work of encoding in-memory structures into a disk-safe format. Memory residency also makes richer data models practical, such as the priority queues and sets Redis exposes.",
        "Research on **anti-caching** stretches the architecture to datasets larger than RAM: the database evicts least recently used records to disk and reloads them on access, like OS swapping but at record granularity rather than page granularity, which the database can manage more efficiently than the OS. Indexes must still fit in memory, as with Bitcask. Non-volatile memory (NVM) may require yet another rethink of storage engine design."
      ],
      keyPoints: [
        "Disks win on durability and cost per GB; RAM wins when the whole dataset simply fits.",
        "Durability options: battery-backed RAM, an on-disk change log, periodic snapshots, replication.",
        "The speed advantage comes from avoiding on-disk encoding overhead, not from avoiding disk reads.",
        "Memcached is cache-only; Redis and Couchbase write to disk asynchronously; VoltDB, MemSQL, TimesTen are relational; RAMCloud is a durable log-structured KV store.",
        "Anti-caching evicts cold records to disk at record granularity while indexes stay in RAM."
      ],
      callout: {
        kind: "pitfall",
        text: "In-memory is faster because it skips disk reads is the wrong explanation. A well-provisioned B-tree database also serves hot reads from the page cache. The real saving is the encoding and bookkeeping needed to keep structures disk-safe."
      },
      systems: ["Memcached", "VoltDB", "MemSQL", "Oracle TimesTen", "RAMCloud", "Redis", "Couchbase"]
    },
    {
      id: "transaction-processing-or-analytics",
      title: "Transaction Processing or Analytics?",
      body: [
        "The word transaction comes from early business data processing, where each database write recorded a sale, a purchase order, or a salary payment. The term survived as databases took on blog comments, game moves, and address books, and it now means a logical unit of reads and writes. Transaction processing does not require ACID guarantees; it means serving low-latency reads and writes interactively, as opposed to batch jobs that run on a schedule. The typical pattern, **online transaction processing (OLTP)**, fetches a handful of records through an index on some key and inserts or updates records in response to user actions.",
        "Analytics has the opposite shape. A query scans an enormous number of records, reads only a few columns from each, and returns aggregates such as counts, sums, or averages instead of raw rows: revenue per store in January, how many extra bananas a promotion sold, which baby food is bought together with a certain diaper brand. Business analysts write these queries to build reports that guide decisions (business intelligence), and the pattern is called **online analytic processing (OLAP)**. The boundary is blurry, but the two differ in read pattern, write pattern, who uses the system, what the data represents, and dataset size.",
        "At first one database served both, and SQL proved flexible enough for either query style. From the late 1980s, however, large companies began moving analytics off their OLTP systems onto a separate database built for the purpose: the data warehouse."
      ],
      keyPoints: [
        "Transaction processing means interactive, low-latency reads and writes; it does not imply ACID.",
        "OLTP: each query touches a few records located through a key; writes are random-access and driven by user input.",
        "OLAP: aggregate over millions of records reading a few columns each; data arrives by bulk ETL or event streams.",
        "OLTP serves end users and holds current state; OLAP serves analysts and holds event history.",
        "OLTP datasets run gigabytes to terabytes; warehouses run terabytes to petabytes."
      ],
      table: {
        caption: "OLTP versus OLAP at a glance",
        columns: ["Characteristic", "OLTP", "OLAP"],
        rows: [
          ["Typical read", "Handful of records located by key", "Scan and aggregate millions of rows"],
          ["Typical write", "Small random writes from user actions", "Bulk loads (ETL) or continuous event streams"],
          ["Primary user", "Customers through an application", "Internal analysts for decision support"],
          ["Data represents", "Current state of the world", "Historical record of events"],
          ["Size", "Gigabytes to terabytes", "Terabytes to petabytes"],
          ["Bottleneck", "Disk seek time", "Disk bandwidth"]
        ]
      },
      callout: {
        kind: "insight",
        text: "The online in OLAP has nothing to do with the internet; it signals that analysts query interactively and exploratively rather than waiting for predefined batch reports."
      }
    },
    {
      id: "data-warehousing",
      title: "Data Warehousing",
      body: [
        "A large enterprise runs dozens of independent OLTP systems: the web storefront, point-of-sale terminals, inventory tracking, vehicle routing, supplier and employee management. Each is complex, business-critical, and guarded by administrators who will not let analysts run scanning queries that could slow live transactions. The **data warehouse** is the answer: a separate, read-only copy of data from all those systems that analysts can query as hard as they like. Data is pulled out of the OLTP sources, either as a periodic dump or as a continuous feed of changes, reshaped into a schema that suits analysis, scrubbed of inconsistencies, and loaded into the warehouse. This pipeline is **Extract-Transform-Load (ETL)**.",
        "Nearly every large company has a warehouse; small companies rarely do, because they have few OLTP systems and little enough data to analyze in an ordinary SQL database or even a spreadsheet. The warehouse's real advantage is that its internals can be tuned for the scan-heavy queries analysts run. The indexing structures from the first half of the chapter are good at OLTP and poor at analytic queries.",
        "Warehouses almost always use a relational model, because SQL suits analytic queries and many graphical tools generate SQL for drill-down and slice-and-dice exploration. Although an OLTP database and a warehouse both speak SQL, their internals have diverged sharply, and most vendors now specialize in one or the other. Microsoft SQL Server and SAP HANA support both in one product, but increasingly as two distinct engines for storage and querying behind one SQL interface. Commercial warehouses include Teradata, ParAccel, Vertica, and SAP HANA (Amazon Redshift is a hosted ParAccel). A newer wave of open source SQL-on-Hadoop engines competes with them: Hive, Presto, Impala, Spark SQL, Drill, and Tajo, several of which borrow ideas from Google's Dremel."
      ],
      keyPoints: [
        "OLTP databases are shielded from ad hoc analytics because large scans hurt live transaction latency.",
        "The warehouse holds a read-only copy of many OLTP systems, built through ETL.",
        "Extraction can be periodic dumps or a continuous stream; transformation reshapes and cleans the data.",
        "Warehouses are standard in big enterprises and rare in small ones.",
        "Same SQL interface, different internals; vendors specialize, and hybrid products split into two engines."
      ],
      callout: {
        kind: "example",
        text: "A retailer's checkout database must answer the price of an item in milliseconds. An analyst's comparison of banana sales across all stores for five years belongs in the warehouse, where a ten-minute scan hurts nobody."
      },
      systems: ["Microsoft SQL Server", "SAP HANA", "Teradata", "Vertica", "ParAccel", "Amazon Redshift", "Apache Hive", "Spark SQL", "Cloudera Impala", "Presto", "Apache Tajo", "Apache Drill", "Dremel"]
    },
    {
      id: "stars-and-snowflakes",
      title: "Stars and Snowflakes: Schemas for Analytics",
      body: [
        "Transaction processing uses many data models; analytics converges on one, the **star schema**, also called dimensional modeling. At the center is a **fact table** in which each row is an event at a point in time, for example one product bought by one customer in one transaction (a basket of several items becomes several rows). Facts are kept at individual-event granularity to preserve analytical flexibility, which is why fact tables at companies like Apple, Walmart, or eBay reach tens of petabytes. Some fact columns are measures, such as the sale price and the supplier cost from which margin is computed. The rest are foreign keys into **dimension tables** that supply the context of the event, meaning the actors, objects, places, times, and circumstances involved: product (SKU, brand, category, package size), store, customer, promotion, and even date, which gets its own table so that attributes such as public holidays can be attached to it.",
        "Drawn as a diagram, the fact table sits in the middle with dimension tables radiating outward like rays, hence the name. A **snowflake schema** normalizes further: brand and category become their own tables that `dim_product` references by key instead of storing strings. Snowflakes are more normalized, but star schemas are usually preferred because analysts find them simpler. Either way the tables are wide: fact tables often exceed 100 columns, sometimes several hundred, and dimension tables accumulate every attribute that might someday be useful, from a store's square footage to the date of its last remodel."
      ],
      keyPoints: [
        "Fact table: one row per event, holding measures plus foreign keys to dimensions.",
        "Dimension tables hold the context of each event (product, store, customer, promotion); even dates become a dimension.",
        "Event-level facts preserve flexibility but make fact tables enormous (petabytes).",
        "Snowflake = star with dimensions normalized into sub-dimensions; star is simpler for analysts.",
        "Fact tables commonly have 100+ columns, yet a typical query touches only 4 or 5 of them."
      ],
      callout: {
        kind: "insight",
        text: "Modeling the date as a dimension table looks odd until you need sales on public holidays versus ordinary days. A date dimension row can carry holiday flags, fiscal quarter, and weekday name, so no query has to compute them."
      }
    },
    {
      id: "column-oriented-storage",
      title: "Column-Oriented Storage and Column Compression",
      body: [
        "With trillions of fact rows, physical layout becomes the problem. A typical warehouse query touches only 4 or 5 of a fact table's 100+ columns. OLTP engines and document stores lay data out row by row: all values of a record sit together, just as a whole document is one contiguous byte sequence. Even with an index on date or product, a row store must load every matching row in full, parse it, and throw away the unused columns. **Column-oriented storage** flips the layout: store all values of one column together, typically one file per column, so a query reads only the columns it names. The scheme depends on every column file listing rows in one shared sequence, so the 23rd value in each file reassembles row 23. The idea is not limited to relational data; Parquet, derived from Dremel, is a columnar format for nested document-like data.",
        "Column files compress well because the values within one column are repetitive. **Bitmap encoding** is especially effective: a column holding n distinct values becomes n bitmaps, one per value, with one bit per row set where the row has that value. A retailer may record billions of sales yet carry only 100,000 distinct products, so n is small relative to the row count. If n is tiny (about 200 countries), a bit per row is fine; if n is larger, most bitmaps are sparse and run-length encoding shrinks them dramatically. Bitmaps map straight onto warehouse predicates: a filter such as `product_sk IN (12, 45, 77)` becomes the bitwise OR of three bitmaps, and a conjunction such as `product_sk = 9 AND store_sk = 2` becomes a bitwise AND of one bitmap from each column, which is valid because both columns list rows in the same sequence.",
        "Beware a naming trap: Cassandra and HBase have column families inherited from Bigtable, but within a family they keep all of a row's columns together with its row key and do not compress per column, so that model is essentially row-oriented. Column stores also target the CPU, not just the disk. A query engine can load a compressed column chunk that fits in L1 cache and iterate over it in a tight loop with no function calls, avoiding branch mispredictions and pipeline bubbles and exploiting SIMD instructions. Operators such as bitwise AND and OR can run directly on compressed chunks. This is **vectorized processing**."
      ],
      keyPoints: [
        "Row stores read whole rows even when a query wants 3 of 100 columns; column stores read only the needed files.",
        "Column files must share one row order so rows can be reassembled by position.",
        "Bitmap encoding: one bitmap per distinct value; run-length encode the sparse ones.",
        "Bitwise OR implements IN lists; bitwise AND combines predicates across columns.",
        "Bigtable-style column families (Cassandra, HBase) are not column-oriented storage.",
        "Vectorized processing runs tight loops over L1-cache-sized compressed chunks using SIMD."
      ],
      table: {
        caption: "Row-oriented versus column-oriented layout",
        columns: ["Aspect", "Row-oriented", "Column-oriented"],
        rows: [
          ["Physical layout", "All fields of a record contiguous", "All values of a column contiguous, one file per column"],
          ["Fetch one record by key", "One read", "One read per column, then reassemble by position"],
          ["Scan 3 of 100 columns", "Reads and parses all 100", "Reads 3 files only"],
          ["Compression", "Mixed types per row, modest ratios", "Homogeneous values; bitmaps and run-length encoding excel"],
          ["Writes", "Overwrite a row or append it", "Must touch every column file; batched through an LSM-style buffer"],
          ["Typical home", "OLTP databases, document stores", "Data warehouses, analytics engines"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Do not confuse Cassandra or HBase column families with columnar storage. A column family groups a row's columns together on disk; a column store separates them. The names collide but the layouts are opposite."
      },
      systems: ["Parquet", "Dremel", "Cassandra", "HBase", "Bigtable"]
    },
    {
      id: "sort-order-and-writes-in-column-stores",
      title: "Sort Order and Writes in Column Stores",
      body: [
        "Rows in a column store can simply sit in insertion order, so a new row appends to each column file. But imposing a sort order, as with SSTables, turns the layout into an index. You cannot sort each column separately, because position is the only thing tying a row's values together; the whole row set must be sorted by the chosen keys even though storage is columnar. An administrator picks sort columns from knowledge of common queries. If most queries filter on a date range, putting `date_key` first in the sort order lets the optimizer scan only last month's rows. A second key such as `product_sk` orders rows that share a date, so all sales of one product on one day sit together.",
        "Sorting also helps compression. When the first sort key has few distinct values, the column becomes long runs of identical values, and run-length encoding can shrink it to a few kilobytes even across billions of rows. The effect fades down the sort priority: the second and third keys are more mixed, and lower-priority columns look random. C-Store, and later the commercial Vertica, pushed the idea further. Data is replicated across machines anyway for fault tolerance, so each replica can be sorted differently and the optimizer picks the copy that best fits a query. This resembles having several secondary indexes on a row store, except that a column store contains no pointers at all, just columns of values, so each sort order is a complete copy of the data.",
        "These read optimizations make writes awkward. Compressed, sorted columns cannot be updated in place like B-tree pages; inserting a row in the middle would mean rewriting every column file, and all columns must change together because position identifies the row. The LSM-tree already solved this. Writes accumulate in an in-memory sorted structure (row- or column-oriented, it does not matter) and are periodically merged with the on-disk column files into new bulk-written files, which is how Vertica works. Queries combine recent in-memory writes with on-disk data, and the optimizer hides the seam, so inserts, updates, and deletes show up immediately in results."
      ],
      keyPoints: [
        "Sorting applies to whole rows across all column files; per-column sorting would destroy row identity.",
        "Pick the first sort key from the most common filter (often date), the second to group within it.",
        "The first sort key compresses extremely well with run-length encoding; later keys progressively less.",
        "C-Store and Vertica store replicas in different sort orders and choose one per query.",
        "Writes go through an in-memory sorted buffer and bulk merges: the LSM pattern again."
      ],
      callout: {
        kind: "insight",
        text: "The same trick appears twice in this chapter: SSTables and column stores both make writes affordable by buffering in memory and rewriting sorted files in bulk. Sorted, immutable, merged files are the recurring answer whenever in-place updates are too expensive."
      },
      systems: ["C-Store", "Vertica"]
    },
    {
      id: "aggregation-data-cubes-and-materialized-views",
      title: "Aggregation: Data Cubes and Materialized Views",
      body: [
        "Not every warehouse is a column store; row-oriented and other designs are also used, though columnar storage is gaining ground for ad hoc analytics. A separate optimization is caching aggregates. Analytic queries lean on `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX`, and recomputing the same sums from raw data for every query is wasteful. A **materialized view** stores the actual results of a query on disk, unlike a virtual view, which is just a saved query that the engine expands at read time. Since it duplicates data in denormalized form, a materialized view must be refreshed whenever the underlying data changes. That makes writes more expensive, so it is rare in OLTP databases but reasonable in read-heavy warehouses, where whether it actually helps depends on the case.",
        "A **data cube** (OLAP cube) is a materialized view shaped as a grid of aggregates across dimensions. With two dimensions, date and product, each cell holds, say, the sum of net price for that date-product pair; summing along a row or column collapses one dimension, yielding totals per product or per date. With five dimensions (customer, store, promotion, product, date) the cube is a hypercube, but the principle is unchanged. The win is speed: yesterday's total sales per store becomes a lookup instead of a scan over millions of rows. The loss is flexibility: you cannot ask what share of revenue came from items over $100, because price is not a dimension of the cube. Warehouses therefore keep the raw events as the source of truth and treat cubes as accelerators for specific, predictable queries."
      ],
      keyPoints: [
        "Virtual view = saved query expanded on demand; materialized view = stored results on disk.",
        "Materialized views cost write performance, so they suit warehouses more than OLTP.",
        "A data cube precomputes aggregates for every combination of dimension values.",
        "Summing along a cube axis reduces dimensionality: totals per product, per date, per store.",
        "Cubes answer only questions phrased in their dimensions; keep raw events for everything else."
      ],
      callout: {
        kind: "example",
        text: "A cube over (date, store) answers total sales per store yesterday instantly. Ask how much came from items priced above $100 and the cube is useless, because price was never a dimension; only the raw fact table can answer."
      }
    },
    {
      id: "summary",
      title: "Summary",
      body: [
        "Storage engines split along a workload line. OLTP engines face many small requests from end users, each touching a few records located by key through an index, so seek time is the limiting factor. Analytic systems face far fewer but far heavier queries that scan millions of rows, so disk bandwidth is the limit, and compact encoding, especially columnar, is the remedy.",
        "Within OLTP, two philosophies compete. Log-structured engines only append to files and delete obsolete ones, never editing in place, and thereby convert random writes into sequential ones; Bitcask's hash-indexed log, the SSTable-based LSM-trees in LevelDB, RocksDB, Cassandra, and HBase, and Lucene's segment files all belong here. Update-in-place engines treat the disk as fixed-size overwritable pages, with the B-tree as the dominant example across relational and many non-relational databases. The chapter rounded out the OLTP side with secondary, clustered, covering, multi-dimensional, and fuzzy indexes and with in-memory databases. On the analytics side it explained why warehouses exist, how star schemas organize facts and dimensions, and how column storage, compression, sorting, and materialized aggregates minimize the bytes a query reads.",
        "The practical payoff is vocabulary and intuition: enough to pick an engine suited to a workload, to predict what a tuning knob will do, and to read a database's documentation critically."
      ],
      keyPoints: [
        "OLTP bottleneck is seek time; OLAP bottleneck is bandwidth.",
        "Log-structured: append-only files, sequential writes, background merges.",
        "Update-in-place: fixed pages, B-trees, write-ahead log for crash safety.",
        "Analytics: separate warehouse, star schema, column storage, compression, precomputed aggregates.",
        "Goal: choose and tune engines with an informed mental model rather than by folklore."
      ]
    }
  ],
  terms: [
    { term: "Log", definition: "A file on disk that grows only by appending records and is never edited in place. Not necessarily human-readable; the term covers binary data files as well as text application logs." },
    { term: "Compaction", definition: "Rewriting one or more log segments so that only the newest value of each key survives, reclaiming space and reducing the number of files a read must check." },
    { term: "Tombstone", definition: "A marker appended to a log to record that a key was deleted; merges use it to discard all earlier values for that key." },
    { term: "SSTable (Sorted String Table)", definition: "A segment file whose key-value pairs are sorted by key with each key appearing once, enabling mergesort-style merging, a sparse in-memory index, and block compression." },
    { term: "Memtable", definition: "The in-memory balanced tree (for example red-black or AVL) that absorbs incoming writes in an LSM-tree and is flushed to disk as an SSTable once it reaches a size threshold." },
    { term: "LSM-tree (Log-Structured Merge-Tree)", definition: "A storage structure that maintains a cascade of sorted on-disk files produced from in-memory buffers and merged in the background; used by LevelDB, RocksDB, Cassandra, and HBase." },
    { term: "Bloom filter", definition: "A compact probabilistic structure that answers whether a key is possibly present; it may give false positives but never false negatives, so a negative answer safely skips disk reads." },
    { term: "Write-ahead log (WAL)", definition: "An append-only file in which a B-tree engine records every intended page modification before applying it, so a crash mid-operation can be repaired on restart. Also called a redo log." },
    { term: "Write amplification", definition: "The ratio of bytes physically written to disk over a database's lifetime to bytes logically written by the application, caused by logging, full-page writes, or repeated compaction." },
    { term: "Heap file", definition: "An unordered area where table rows are stored; nonclustered indexes hold pointers into it, so a row exists only once no matter how many indexes reference it." },
    { term: "Clustered index", definition: "An index whose entries contain the complete row rather than a pointer, so a lookup needs no second hop; InnoDB's primary key index is one. A covering index is the middle ground, storing only selected columns." },
    { term: "ETL (Extract-Transform-Load)", definition: "The pipeline that pulls data out of OLTP systems, reshapes and cleans it into an analysis-friendly schema, and loads it into a data warehouse." },
    { term: "Star schema", definition: "The dominant warehouse layout: a central fact table of events with measures and foreign keys, surrounded by dimension tables that describe the product, store, customer, date, and other context of each event. A snowflake schema further normalizes the dimensions." },
    { term: "Bitmap encoding", definition: "A column compression scheme that creates one bitmap per distinct value with one bit per row, often run-length encoded; predicates become bitwise AND and OR over bitmaps." },
    { term: "Data cube", definition: "A materialized view holding precomputed aggregates for every combination of dimension values, so queries along those dimensions become lookups instead of scans." }
  ],
  pitfalls: [
    "Thinking indexes are free speedups. Every index must be updated on every write, so each one slows the write path; choose indexes from observed query patterns, not from habit.",
    "Assuming LSM-trees are always faster. Reads may check a memtable and many SSTables, compaction can spike tail latency, and compaction can fall behind under heavy writes with no automatic throttling. Benchmark your own workload.",
    "Believing in-memory databases win because they skip disk reads. A disk-based engine with enough RAM serves hot reads from the page cache too; the real saving is avoiding the overhead of encoding data for disk.",
    "Calling Cassandra or HBase column stores. Their column families keep a row's columns together and do not compress per column, which is essentially a row-oriented layout.",
    "Counting a B-tree update as one disk write. It is at least a WAL write plus a full-page write, possibly a page split, and in some engines a doublewrite, all of which add up to write amplification.",
    "Treating transaction as a synonym for ACID. In the OLTP versus OLAP discussion, transaction processing only means interactive, low-latency reads and writes; ACID is a separate set of guarantees covered in Chapter 7."
  ],
  connections: [
    { chapter: 1, note: "Chapter 1's percentile view of latency explains why LSM compaction matters: it barely moves the mean but inflates p99 and p999, which is what users experience." },
    { chapter: 2, note: "Chapter 2 covered what you ask the database; this chapter covers how the engine answers. Document databases store each document contiguously, which is why they behave like row stores for analytics, and Lucene links full-text querying to SSTable-style storage." },
    { chapter: 4, note: "Encoding is the hidden cost that in-memory databases avoid, and the on-disk formats of log records, SSTable blocks, and Parquet files are all encoding decisions that Chapter 4 examines." },
    { chapter: 7, note: "B-trees keep each key in one place, so range locks for isolation can attach directly to the tree, and copy-on-write B-trees (LMDB) support snapshot isolation. Chapter 7 also defines the ACID guarantees that transaction processing here does not assume." },
    { chapter: 10, note: "ETL into a warehouse is a batch job, and SQL-on-Hadoop engines (Hive, Spark SQL, Presto, Impala) plus columnar formats like Parquet connect warehouse ideas to MapReduce-style batch processing." },
    { chapter: 11, note: "Continuous ETL as an event stream, the log as a universal abstraction, and incrementally maintaining materialized views are stream-processing themes that grow out of this chapter's log and materialized-view concepts." }
  ],
  flashcards: [
    { front: "What is the fundamental trade-off every index introduces?", back: "Faster reads on the indexed access path in exchange for slower writes, because each write must also update the index. That is why databases make you choose indexes by hand instead of indexing everything." },
    { front: "How does a Bitcask-style hash index work, and what is its main constraint?", back: "An in-memory hash map maps each key to the byte offset of its latest value in an append-only file; a read does one seek. All keys must fit in RAM, though values can exceed memory." },
    { front: "What do segments and compaction accomplish in a log-structured hash store?", back: "The log is split into closed, immutable segments. Background compaction rewrites them keeping only the latest value per key, merging several at once, then swaps reads to the new file and deletes the old ones to reclaim space." },
    { front: "What is a tombstone and why is it needed?", back: "A special deletion record appended to the log. Because segments are immutable you cannot erase a key in place; the tombstone tells later merges to drop every earlier value for that key." },
    { front: "How does Bitcask make crash recovery fast and safe?", back: "It persists each segment's key-to-offset map to disk, so a restart reloads those maps instead of rescanning whole segments. Checksums on records let it detect and skip a record that was only half-written when the crash occurred." },
    { front: "Name the two hard limitations of hash indexes.", back: "The complete key set must fit in memory, because on-disk hash maps need heavy random I/O and are costly to grow. Range queries are inefficient because keys are unordered; each key would need its own probe." },
    { front: "What is an SSTable and which three advantages does sorting bring?", back: "A segment file sorted by key with each key appearing once. Merging becomes a streaming mergesort that works beyond memory size; the in-memory index can be sparse; blocks between index entries can be compressed." },
    { front: "How do writes end up sorted in an LSM-tree when clients send them in any order?", back: "They first enter a memtable, an in-memory balanced tree such as a red-black or AVL tree. When it exceeds a threshold (a few MB) it is flushed in key order as a new SSTable while a fresh memtable takes new writes." },
    { front: "How does an LSM-tree avoid losing memtable contents in a crash?", back: "Every write is also appended to an unsorted on-disk log. After a crash that log rebuilds the memtable. After the memtable has been flushed as an SSTable, its log can be deleted." },
    { front: "Describe the read path of an LSM-tree and the role of Bloom filters.", back: "Check the memtable, then on-disk SSTables from newest to oldest, stopping at the first hit. A Bloom filter per segment can say a key is definitely absent, so lookups for missing keys skip most disk reads." },
    { front: "Contrast size-tiered and leveled compaction.", back: "Size-tiered folds newer, smaller SSTables into older, larger ones (HBase). Leveled partitions keys into small SSTables organized in levels so merges are incremental and use less scratch disk (LevelDB, RocksDB). Cassandra supports both." },
    { front: "How does a B-tree keep lookups to only a few disk reads?", back: "Each page (typically 4 KB) holds hundreds of child references, so depth is O(log n) with a large base. Four levels with branching factor 500 address about 256 TB, so most lookups follow three or four pages." },
    { front: "What happens when you insert a key into a B-tree leaf page that is already full?", back: "The engine divides the page into two pages, each about half occupied, and inserts a new boundary key plus child reference into the parent. This keeps the tree balanced; if the parent is also full, the split cascades upward." },
    { front: "Why do B-trees need a write-ahead log and latches?", back: "In-place page overwrites and multi-page operations like splits can be interrupted by a crash, corrupting the tree; logging each change first allows recovery. Latches (lightweight locks) stop concurrent threads from seeing a half-updated tree." },
    { front: "How does LMDB avoid a write-ahead log?", back: "Copy-on-write: the changed page goes to a fresh address, and fresh copies of its ancestor pages are created that point there, so the old tree stays intact until the root is switched. This also helps concurrency and snapshot isolation." },
    { front: "Define write amplification and give its sources in each engine family.", back: "Ratio of disk bytes written to application bytes written. B-trees: WAL plus whole-page writes, sometimes doublewrite. LSM-trees: repeated compaction rewrites. It consumes disk bandwidth and wears out SSDs." },
    { front: "Name three advantages of LSM-trees over B-trees.", back: "Higher sustained write throughput thanks to sequential writes and often lower amplification; better compression with less fragmentation, especially under leveled compaction; denser files that get more work per unit of I/O bandwidth." },
    { front: "Name three downsides of LSM-trees relative to B-trees.", back: "Compaction can stall requests and inflate high-percentile latency; under heavy writes compaction can fall behind, piling up segments until disk fills, with no throttling; multiple copies of a key make range locking for transactions harder." },
    { front: "How can a key-value index be adapted to serve as a secondary index with duplicate keys?", back: "Either store under each key the full set of row identifiers that match it (as a postings list does for documents), or append the row identifier to the key so every entry is unique. Both B-trees and LSM-trees support either approach." },
    { front: "Distinguish heap file, clustered index, and covering index.", back: "Heap file: index points to rows stored unordered elsewhere, so each row exists once. Clustered: the full row lives inside the index (InnoDB primary key). Covering: the index stores selected columns so some queries skip the table." },
    { front: "Why can a concatenated (last_name, first_name) index not find people by first name alone?", back: "Entries are sorted by last name first, so a given first name is scattered across the whole index. Only a prefix of the concatenated key can be used as a range." },
    { front: "How can a database answer a two-dimensional geospatial range query efficiently?", back: "Either encode latitude and longitude into one value with a space-filling curve and index it with a normal B-tree, or use a multi-dimensional index such as an R-tree (PostGIS builds these on PostgreSQL's GiST)." },
    { front: "How does Lucene support typo-tolerant (edit distance) search?", back: "Instead of a sparse key list, Lucene's in-memory term index is a trie-like finite state automaton built from term characters. Converting it into a Levenshtein automaton lets the engine walk directly to every term within the allowed number of edits." },
    { front: "What is the real reason in-memory databases are faster than disk-based ones?", back: "Not because they avoid disk reads; a disk engine with enough RAM serves hot reads from the OS page cache. They avoid the overhead of encoding in-memory structures into a disk-safe format." },
    { front: "List four ways an in-memory database can achieve durability.", back: "Battery-backed RAM; appending a change log to disk; writing periodic snapshots to disk; replicating the memory contents to other nodes. On restart it reloads from disk or from a replica." },
    { front: "Contrast OLTP and OLAP access patterns.", back: "OLTP: few records per query, located via key; random low-latency writes; end users; current state; GB to TB; seek time is the bottleneck. OLAP: aggregate over huge scans of few columns; bulk loads; analysts; event history; TB to PB; bandwidth is the bottleneck." },
    { front: "What is ETL and why do large companies bother with a separate warehouse?", back: "Extract data from OLTP systems (dumps or streams), transform it into a clean analysis-friendly schema, load it into the warehouse. This keeps expensive scans off latency-critical OLTP databases and lets storage be optimized for analytics." },
    { front: "In a star schema, what goes into the fact table versus dimension tables, and what makes a snowflake?", back: "Fact table: one row per event with measures (price, cost) and foreign keys. Dimensions: descriptive attributes of product, store, customer, date, and so on. A snowflake schema normalizes dimensions into sub-dimension tables; stars stay flat and simpler." },
    { front: "Why does column-oriented storage speed up analytic queries, and how does bitmap encoding help?", back: "Queries read 4 or 5 of 100+ columns, so one-file-per-column reads far fewer bytes. Bitmap encoding makes one bitmap per distinct value (run-length encoded when sparse), and predicates become fast bitwise AND and OR operations." },
    { front: "Why can you not sort each column independently in a column store, and how do column stores handle writes?", back: "Rows are reconstructed by position, so columns must be sorted together as whole rows. Writes use the LSM pattern: accumulate in an in-memory sorted buffer, then merge in bulk with on-disk column files into new files (Vertica)." }
  ],
  quiz: [
    {
      question: "Why does a Bitcask-style storage engine require all keys to fit in memory?",
      choices: [
        "Because the values are also held in RAM and only flushed to disk during compaction",
        "Because hash maps cannot be persisted to disk at all",
        "Because the index is an in-memory hash map from every key to a file offset, while values are read from disk",
        "Because compaction needs the whole dataset in memory to detect duplicate keys"
      ],
      answer: 2,
      explanation: "The hash index itself lives entirely in RAM and maps each key to the byte offset of its latest value; values stay on disk and are read with one seek. Values are not kept in RAM (choice 0), hash maps can be snapshotted to disk (choice 1), and compaction streams through segments rather than loading everything (choice 3)."
    },
    {
      question: "Which of the following is a direct benefit of requiring segment files to be sorted by key (SSTables)?",
      choices: [
        "Segments can be merged with a streaming mergesort even when they are larger than available memory",
        "Writes no longer need to pass through an in-memory buffer",
        "Deleted keys no longer require tombstones",
        "The in-memory index must contain every key for fast lookups"
      ],
      answer: 0,
      explanation: "Sorted inputs allow a mergesort-style merge that reads files side by side and never needs them in memory. Sorting is what forces the use of a memtable (choice 1), tombstones are still needed because files are immutable (choice 2), and sorting lets the index be sparse rather than complete (choice 3)."
    },
    {
      question: "An LSM-tree receives many lookups for keys that do not exist. Why is this expensive, and what mitigates it?",
      choices: [
        "The memtable must be rebuilt from the log on each miss; a larger memtable mitigates it",
        "Each miss triggers a compaction; leveled compaction mitigates it",
        "Hash collisions slow the lookup; a bigger hash table mitigates it",
        "The engine must check the memtable and every SSTable before concluding the key is absent; a Bloom filter can declare absence and skip the disk reads"
      ],
      answer: 3,
      explanation: "A miss falls through every level, potentially costing one disk read per segment. A Bloom filter is a compact set summary that never gives false negatives, so a negative answer safely skips segments. Misses do not rebuild memtables or trigger compaction, and LSM-trees do not use hash tables for lookup."
    },
    {
      question: "A B-tree engine crashes after writing the two halves of a split leaf page but before updating the parent page. What prevents permanent index corruption?",
      choices: [
        "A Bloom filter detects the orphan page on the next read",
        "The write-ahead log recorded the modification first, so recovery replays or completes it on restart",
        "A tombstone marks the orphan page as deleted",
        "Latches prevent the crash from happening during a split"
      ],
      answer: 1,
      explanation: "Every B-tree modification is appended to the WAL (redo log) before pages are overwritten, so recovery can restore a consistent tree. Bloom filters and tombstones belong to log-structured engines, and latches handle concurrent threads, not crashes."
    },
    {
      question: "Which statement about write amplification is correct?",
      choices: [
        "It affects only LSM-trees, because B-trees write each change exactly once",
        "It affects only B-trees, because LSM-trees never rewrite data",
        "It affects both: B-trees write the WAL plus whole pages (sometimes twice), and LSM-trees rewrite data during compaction; it matters especially on SSDs with limited erase cycles",
        "It disappears entirely if the dataset fits in memory"
      ],
      answer: 2,
      explanation: "Both families write more bytes than the application does, for different reasons, and the extra writes consume bandwidth and wear out SSDs. Choices 0 and 1 each ignore one family's overhead, and keeping data in memory does not remove the durability writes that cause amplification."
    },
    {
      question: "Which is a documented downside of LSM-trees compared with B-trees?",
      choices: [
        "Under sustained heavy writes, compaction can fall behind, segments accumulate, disk fills, and reads slow, usually without any automatic throttling of writers",
        "Range queries are impossible because keys are not stored in order",
        "SSTables cannot be compressed, so they use more disk than B-tree pages",
        "All keys must be held in memory at all times"
      ],
      answer: 0,
      explanation: "Compaction shares disk bandwidth with foreground writes and can lose the race, which must be caught by monitoring. SSTables are sorted so range queries work well, they compress better than B-trees, and only a sparse index needs to be in memory."
    },
    {
      question: "In MySQL's InnoDB, secondary indexes store the primary key value rather than a position in a heap file. Why?",
      choices: [
        "Because MySQL does not support heap files in any storage engine",
        "Because storing primary keys reduces write amplification to zero",
        "Because secondary indexes in InnoDB are always covering indexes",
        "Because the primary key index is clustered and contains the row itself, so the row's location is found through the primary key"
      ],
      answer: 3,
      explanation: "InnoDB's primary key is a clustered index that holds the full row, so a secondary index lookup first finds the primary key and then the row inside the clustered index. There is no heap location to point at. The other choices misstate how InnoDB works."
    },
    {
      question: "A restaurant finder must return all restaurants inside a map rectangle defined by latitude and longitude ranges. Which index serves this query best?",
      choices: [
        "A concatenated B-tree index on (latitude, longitude)",
        "A spatial index such as an R-tree, or a space-filling curve mapping both coordinates onto one B-tree key",
        "Two separate hash indexes, one on latitude and one on longitude",
        "A bitmap index on latitude alone"
      ],
      answer: 1,
      explanation: "Only a multi-dimensional structure narrows both dimensions at once. A concatenated index bounds latitude but must then scan every longitude within that band, hash indexes cannot do ranges at all, and a single-column bitmap ignores longitude."
    },
    {
      question: "What is the main reason a true in-memory database outperforms a disk-based database with the same amount of RAM?",
      choices: [
        "It never has to read from disk, whereas the disk-based database reads every record from disk",
        "It runs on faster CPUs that are only available for in-memory workloads",
        "It skips the work of serializing in-memory data structures into a disk-friendly on-disk layout",
        "It does not need any indexes because scanning memory is instantaneous"
      ],
      answer: 2,
      explanation: "With enough RAM a disk-based engine also serves reads from the OS page cache, so avoiding disk reads is not the differentiator. The saving comes from skipping disk-oriented encoding and bookkeeping. In-memory databases still use indexes and ordinary CPUs."
    },
    {
      question: "Which description best characterizes an OLAP workload?",
      choices: [
        "Queries scan millions of rows but read only a few columns each and return aggregates, mostly issued by internal analysts",
        "Queries retrieve a handful of rows by primary key with millisecond latency",
        "Writes are random-access updates triggered by end-user actions in a web application",
        "The dataset represents only the latest state of each entity, not its history"
      ],
      answer: 0,
      explanation: "Analytic systems aggregate over large scans of a few columns for decision support. Key lookups, user-driven random writes, and current-state data all describe OLTP systems."
    },
    {
      question: "How does the column family concept in Cassandra and HBase relate to column-oriented storage?",
      choices: [
        "They are identical; a column family is simply another name for a column store",
        "Column families compress each column separately with bitmap encoding",
        "Column families guarantee that rows are sorted by every column value",
        "Within a column family all columns of a row are stored together with the row key, so the layout is essentially row-oriented"
      ],
      answer: 3,
      explanation: "The Bigtable model groups a row's columns together inside a family and applies no per-column compression, which is the opposite of columnar storage. The other choices attribute properties of column stores to column families incorrectly."
    },
    {
      question: "How does a column store with bitmap-encoded columns evaluate the predicate product_sk IN (12, 45, 77)?",
      choices: [
        "It scans every row of the product_sk column and compares each value against the three constants",
        "It loads the three bitmaps for values 12, 45, and 77 and computes their bitwise OR",
        "It loads the three bitmaps and computes their bitwise AND",
        "It rebuilds a B-tree over product_sk and performs three range lookups"
      ],
      answer: 1,
      explanation: "Each distinct value has a bitmap with one bit per row; OR-ing the three bitmaps marks every row matching any of the values. AND would return rows that equal all three at once (none), a row-by-row scan ignores the encoding, and no B-tree is involved."
    }
  ],
  reviewQuestions: [
    "A service records view counts for about one million video URLs, receives roughly 100 million increments per day, and occasionally exports all counters whose URL shares a prefix. Compare a Bitcask-style hash index, an LSM-tree, and a B-tree for this workload. Which would you choose, how would you size memory and configure compaction, and what breaks if the key set grows a hundredfold?",
    "Explain write amplification for B-trees and LSM-trees in terms of the concrete writes each performs. Then argue how your engine choice would change between a magnetic disk array and consumer SSDs, and again under a service-level objective on 99.9th percentile write latency.",
    "You inherit an InnoDB table with six secondary indexes and heavy update traffic on a wide text column. Using the heap file, clustered index, and covering index concepts, walk through what each update costs on disk and propose two schema or index changes, explaining the read-side consequences of each.",
    "A startup runs analyst queries directly on its production PostgreSQL database and is now seeing checkout latency spikes. Design a migration to a data warehouse: describe the ETL path, draft a star schema for a ride-hailing business, choose sort keys for a column store, and identify two aggregates worth materializing and one question a data cube could not answer.",
    "SSTables and column stores both write data as sorted, immutable, compressed files produced from an in-memory buffer. Compare the two designs: what problem is each solving, what is shared, what differs in how reads reconstruct results, and why does a column store not simply use B-tree pages for its column files?"
  ]
});
