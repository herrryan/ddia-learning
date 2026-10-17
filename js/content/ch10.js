DDIA.registerChapter({
  number: 10,
  part: 3,
  title: "Batch Processing",
  tagline: "How do you turn huge, bounded datasets into derived outputs reliably, using immutable inputs and partitioned, fault-tolerant jobs?",
  studyMinutes: 100,
  overview: [
    "The first nine chapters mostly assumed request/response systems: a client asks, and the system answers as fast as it can. This chapter steps back to a different mode of computing. A batch job reads a large, fixed input, grinds through all of it, and writes an output, with nobody waiting at a terminal. Kleppmann separates three kinds of systems: online services (judged by response time and availability), offline batch systems (judged by throughput), and near-real-time stream processors (which sit in between and get their own treatment in Chapter 11). Batch work is older than digital computers: punch-card tabulators processed the 1890 US census, and MapReduce, the 2004 Google paper that spawned Hadoop, looks a lot like the electromechanical card sorters of the 1950s.",
    "The chapter builds the idea up in three layers. It opens with Unix tools: a six-command shell pipeline that finds the most popular pages in a web server log, and the design philosophy that makes such pipelines possible (do one thing well, a uniform byte-stream interface, logic separated from wiring, immutable inputs). It then scales the same pattern to a cluster with MapReduce on HDFS: how a job executes, how joins and grouping are built out of partitioning and sorting, what the outputs of batch workflows are actually for, and how Hadoop differs from MPP databases. Finally it looks past MapReduce at dataflow engines (Spark, Tez, Flink), the Pregel model for iterative graph algorithms, and high-level declarative APIs that make batch jobs both easier to write and faster to run.",
    "Why it matters: batch jobs build search indexes, recommendation tables, machine learning models, and ETL pipelines, and the principles they rely on (immutable inputs, derived outputs, deterministic and retryable tasks) are the backbone of Part III's theme of derived data. Chapter 11 reuses nearly everything here when it drops the one assumption that makes batch processing simple: that the input is bounded."
  ],
  bigIdeas: [
    "A batch job reads a bounded, immutable input and writes a brand-new output; because it has no other side effects, it can be rerun, retried, and rolled back safely.",
    "The Unix philosophy scales up: HDFS plays the role of the filesystem, a MapReduce job plays the role of a process, and directories play the role of pipes.",
    "Distributed batch processing comes down to two problems: partitioning (bring related records to the same place) and fault tolerance (recover from failed tasks without redoing everything).",
    "Joins are implemented by routing rather than lookups: sort-merge joins route both sides to one reducer, hash joins preload a small or co-partitioned side into memory.",
    "MapReduce materializes every intermediate result to HDFS; dataflow engines keep intermediates in memory or on local disk and recompute lost pieces from lineage, which only works if operators are deterministic.",
    "Declarative, optimizer-friendly APIs and arbitrary-code callbacks are converging: batch engines now resemble MPP databases in performance while keeping the freedom to run any code over any format."
  ],
  sections: [
    {
      id: "three-kinds-of-systems",
      title: "Services, Batch Jobs, and Streams",
      body: [
        "Most of the book so far assumed an online pattern: a client sends a request and waits for a reply, so response time and availability dominate the design. Kleppmann contrasts this with two other styles. An offline batch system consumes a large input dataset, runs a job that may take anywhere from minutes to days, and emits output. Nobody is waiting interactively; jobs are typically scheduled (nightly, for example), and the metric that matters is throughput, meaning how long it takes to chew through an input of a given size. A near-real-time stream processor sits between the two: like a batch job it turns inputs into outputs instead of answering requests, but it reacts to each event shortly after it occurs instead of waiting for a complete input set, which gives it lower latency.",
        "The chapter uses MapReduce as its teaching vehicle. Google published it in 2004, Hadoop reimplemented it as open source, and MapReduce-style querying also shows up in CouchDB and MongoDB. Compared with the parallel databases that preceded it by more than a decade, MapReduce is a low-level programming model, and its importance has already declined, but it exposes the mechanics of distributed batch processing with unusual clarity. Kleppmann also stresses the long lineage: Hollerith punch-card tabulators computed aggregate statistics for the 1890 US census, and the IBM card-sorting machines of the 1940s and 1950s did something strikingly similar to a MapReduce shuffle."
      ],
      keyPoints: [
        "Services optimize response time and availability; batch jobs optimize throughput over a fixed input; stream processors trade some of batch's simplicity for low latency.",
        "A batch job has a known, bounded input, so it can tell when it is finished and can be rerun to produce the same result.",
        "MapReduce (Google, 2004) made large-scale processing on commodity hardware practical; Hadoop is its best-known open source implementation.",
        "The chapter's progression: Unix tools on one machine, then MapReduce on a cluster, then engines that fix MapReduce's inefficiencies."
      ],
      callout: {
        kind: "insight",
        text: "The defining property of batch processing is not slowness but boundedness: the input has a fixed size, so the job knows when it has read everything and can finish. Chapter 11 asks what changes when that assumption is dropped."
      },
      systems: ["Hadoop", "CouchDB", "MongoDB"]
    },
    {
      id: "unix-log-analysis",
      title: "Batch Processing with Unix Tools: Log Analysis",
      body: [
        "The running example is an nginx access log: one line per HTTP request holding the client IP, the authenticated user (a hyphen if none), a timestamp, the request line (method, path, protocol), the status code, the response size in bytes, the referrer, and the user-agent string. To list the five most requested paths, a shell pipeline does the whole job. Read the file with `cat`, pull out the seventh whitespace-separated field, which happens to be the path, with `awk '{print $7}'`, sort the paths so that identical ones become adjacent with `sort`, collapse adjacent duplicates while counting them with `uniq -c`, sort again numerically in descending order with `sort -r -n`, and keep the first five lines with `head -n 5`. On gigabytes of logs this finishes in seconds, and small edits change the analysis: add a negated regex condition to the awk program to drop stylesheet requests, or print field 1 instead of field 7 to rank client IP addresses.",
        "The same analysis as a short Ruby or Python script would open the file, keep a hash table from URL to counter, increment the counter per line, then sort the entries by count and print the top five. Which version reads better is a matter of taste. The important difference is the execution strategy. The script's memory footprint is its working set: the number of distinct URLs times the size of a URL plus a counter. A million hits on one URL still cost a single hash entry. If all distinct keys fit in RAM, say under 1 GB, the hash table is the simplest and fastest choice, and a laptop is plenty.",
        "When the working set exceeds memory, sorting wins. GNU `sort` sorts chunks in memory, spills them to disk as sorted runs, and merges the runs, which is exactly the SSTable and LSM-tree technique from Chapter 3 and relies on the sequential I/O that disks handle well. It also parallelizes across CPU cores on its own. So the pipeline scales to datasets far larger than RAM with no change at all, and the limiting factor becomes disk read bandwidth for the input. Most programming languages' built-in sort functions neither spill to disk nor use multiple threads, which is why `sort` arguably outperforms the sort routine in your language's standard library, even though it is nearly useless on its own."
      ],
      keyPoints: [
        "The pipeline is: extract the key (awk), sort, count adjacent duplicates (uniq -c), re-sort by count, take the top five.",
        "In-memory aggregation is bounded by the number of distinct keys (the working set), not by the number of input records.",
        "Sorting handles larger-than-memory data through external mergesort with sequential disk access; GNU sort spills to disk and uses multiple cores automatically.",
        "Ranking by count requires a second sort, i.e. a second pass; this reappears later as 'a second MapReduce job'.",
        "Combinations of awk, sed, grep, sort, uniq, and xargs solve a surprising share of real analyses in minutes and perform far better than people expect."
      ],
      table: {
        caption: "In-memory hash aggregation vs. sort-based aggregation",
        columns: ["Aspect", "Hash table (custom script)", "Sort then uniq (pipeline)"],
        rows: [
          ["Memory needed", "Proportional to number of distinct keys", "Bounded buffers; sorted runs spill to disk"],
          ["Disk access pattern", "None, unless the OS starts swapping (random, slow)", "Sequential reads and writes (external mergesort)"],
          ["Best when", "Distinct keys fit comfortably in RAM", "Working set exceeds RAM or the key count is unknown"],
          ["Parallelism", "Single-threaded unless you write it yourself", "GNU sort uses multiple cores automatically"],
          ["Bottleneck at scale", "Running out of memory", "Rate of reading the input file from disk"]
        ]
      },
      callout: {
        kind: "example",
        text: "To exclude stylesheets from the report, change the awk program to `'$7 !~ /\\.css$/ {print $7}'`; to rank client IPs instead of pages, print `$1`. The rest of the pipeline is untouched, which is the point of small composable stages."
      },
      systems: ["nginx", "GNU Coreutils"]
    },
    {
      id: "unix-philosophy",
      title: "The Unix Philosophy",
      body: [
        "Doug McIlroy, who invented pipes, wrote in 1964 that programs should connect like segments of garden hose, with another segment screwed on whenever data needs further massaging. The design culture that grew from this was written down in 1978 as four tenets: each program does one thing well, and a new job gets a new tool rather than new features bolted onto an old one; assume your output will feed some program nobody has written yet, so keep it clean, avoid rigid columnar or binary formats, and never demand interactive input; build and try things early and throw away the clumsy parts; and prefer building tools over doing work by hand, even disposable tools. Kleppmann notes how closely this matches today's Agile and DevOps practice, four decades later.",
        "Composability rests on a **uniform interface**. In Unix that interface is the file descriptor: an ordered sequence of bytes. The same abstraction covers a disk file, stdin and stdout, a pipe to another process, a device such as `/dev/audio`, and a TCP socket, so very different things can be plugged together. By convention most tools interpret the bytes as ASCII text with newline-separated records (the dedicated ASCII record separator byte 0x1E would arguably have been a better choice, but the shared convention is what matters). Parsing within a record is far less standardized: whitespace, tabs, commas, and pipe characters all occur, which is why even `xargs` has half a dozen options describing how to split its input and why `{print $7}` is less self-explanatory than a hypothetical `{print $request_url}`. Even so, few modern systems compose this freely; you cannot pipe your email through a custom filter into a spreadsheet, and even databases that share a data model rarely make moving data between them easy, which fragments data into silos.",
        "The second ingredient is **separating logic from wiring**. A well-behaved tool reads stdin and writes stdout without knowing whether they are attached to a keyboard, a file, or another process; the shell user decides the wiring when invoking it, a form of loose coupling or inversion of control. That is why a program you write yourself, say one that maps IP addresses to country codes or user-agent strings to browser names, slots into a pipeline next to `sort` with no integration work. The limits are real, though: programs that need several inputs or outputs are awkward, you cannot pipe straight into a network connection without a helper such as `netcat` or `curl`, and any program that opens its own files, spawns subprocesses, or opens sockets takes the wiring decision away from the shell.",
        "Third, Unix tools make **experimentation cheap**. Inputs are treated as immutable, so you can rerun with different flags as often as you like. You can cut a pipeline at any stage and pipe into `less` to check that the intermediate data looks right. And you can write one stage's output to a file and restart later stages from it without recomputing the earlier ones. These properties, more than raw sophistication (a database query optimizer is far cleverer), explain why such blunt tools remain so useful. Their fundamental limit is that they run on a single machine, and that gap is what Hadoop fills."
      ],
      keyPoints: [
        "Four tenets: do one thing well; expect your output to be another program's input; prototype early and discard what does not work; build tools instead of doing manual work.",
        "The uniform interface is a byte stream behind a file descriptor; newline-delimited ASCII text is the de facto record format.",
        "Programs that use stdin and stdout let the shell decide where data comes from and goes to; this late binding is what makes composition possible.",
        "Immutable inputs, inspectable intermediates, and restartable stages make debugging and iteration safe.",
        "Weak spots: multi-input or multi-output programs, network I/O, and vague field parsing.",
        "Single-machine execution is the core limitation that MapReduce removes."
      ],
      callout: {
        kind: "insight",
        text: "URLs plus HTTP are another uniform interface: any page can link to any other regardless of who runs the server. Bulletin board systems lacked this, so a 'reference' was a phone number plus modem settings. Uniformity, not cleverness, is what lets independently built pieces interoperate."
      },
      systems: ["bash", "xargs", "Plan 9"]
    },
    {
      id: "hdfs-and-distributed-filesystems",
      title: "MapReduce and Distributed Filesystems",
      body: [
        "A MapReduce job resembles a Unix process: it reads one or more inputs, writes one or more outputs, leaves the inputs untouched, and has no side effects beyond its output files, which are written once, sequentially, and never modified in place. Instead of stdin and stdout, the job's interface is a distributed filesystem. In Hadoop that is HDFS, an open source take on the Google File System. GlusterFS and the Quantcast File System are alternatives, and object stores such as Amazon S3, Azure Blob Storage, and OpenStack Swift play a similar role, with one notable difference: they usually separate storage from compute, so a task cannot be scheduled on the machine that already holds its data.",
        "HDFS follows the shared-nothing principle: ordinary machines with ordinary disks, joined by an ordinary datacenter network, as opposed to the shared-disk NAS and SAN appliances that need custom hardware and Fibre Channel fabrics. A daemon on every machine serves the blocks stored on its local disks, and a central **NameNode** records which blocks of which file live on which machines, presenting the cluster's disks as one big filesystem. Fault tolerance comes from storing each block on several machines, either as plain copies or with an erasure code such as Reed-Solomon, which recovers lost data at lower storage overhead than full replication. Conceptually this is RAID spread across a network rather than across the disks of one box. Deployments reach tens of thousands of nodes and hundreds of petabytes, largely because commodity hardware plus open source software costs far less per byte than a dedicated storage appliance."
      ],
      keyPoints: [
        "A MapReduce job is a Unix process writ large: immutable inputs, append-only outputs, no other side effects.",
        "HDFS reimplements GFS; S3-style object stores are similar but decouple storage from compute.",
        "Shared-nothing design: per-machine daemons plus a NameNode that maps blocks to machines; no special hardware.",
        "Durability via replication or Reed-Solomon erasure coding; erasure coding saves space but gives up data locality because a block must be reassembled from several machines.",
        "Scale at the time of writing: tens of thousands of machines and hundreds of petabytes at commodity prices."
      ],
      callout: {
        kind: "pitfall",
        text: "Data locality (running the mapper on the machine that stores the block) only helps when network bandwidth is the bottleneck, and it disappears with erasure coding or with object stores, because the data has to be fetched from elsewhere anyway."
      },
      systems: ["HDFS", "Google File System", "GlusterFS", "Quantcast File System", "Amazon S3", "Azure Blob Storage", "OpenStack Swift"]
    },
    {
      id: "mapreduce-job-execution",
      title: "MapReduce Job Execution",
      body: [
        "A MapReduce job replays the log-analysis pipeline in four steps. First, an input format parser splits the input files into records, here one log line each. Second, the **mapper** is called once per record and emits zero or more key-value pairs; `awk '{print $7}'` was a mapper that emitted the URL as the key with an empty value. The mapper keeps no state from one record to the next. Third, the framework sorts all pairs by key, which is what the first `sort` did. Fourth, the **reducer** is called once per distinct key with an iterator over that key's values and emits output records; `uniq -c` was a reducer that counted adjacent equal keys. You write only the mapper and the reducer. Sorting is implicit and always happens. The pipeline's second sort (ranking by count) has no place inside a single job, so you run a second job whose input is the first job's output. The mental model: mappers reshape data so that it can be sorted, and reducers consume data that has been sorted.",
        "Parallelism comes from partitioning. The input is typically an HDFS directory, and each file or file block (often hundreds of megabytes) becomes one map task. The scheduler prefers to launch a map task on a machine that holds a replica of its block, provided that machine has spare CPU and RAM, which keeps the computation near the data instead of copying the data to the computation. Since the job's code is usually not on that machine yet, the framework ships it there first (a JAR for Java jobs; MongoDB and CouchDB use JavaScript functions, and plain Unix executables can also serve as mappers and reducers). The number of reduce tasks is chosen by the job author, independent of the input. Each mapper partitions its output by hashing the key, so all pairs with the same key are destined for the same reducer, and writes each partition as a sorted file on its own local disk, an SSTable-like structure. When a mapper finishes, the reducers are told they may fetch their partition from it. This partition-sort-copy phase is the **shuffle**, a misleading name because nothing about it is random.",
        "Each reducer merges the sorted files it fetched from every mapper, preserving order, so records that share a key but came from different mappers end up adjacent. It then calls the reducer function per key with an iterator that streams through the values (which need not all fit in memory) and writes output to HDFS, usually one replica on the local disk and others elsewhere. Because a single job does so little, real pipelines chain many jobs into **workflows**. Hadoop has no built-in notion of a workflow: job B simply reads the directory that job A wrote, and the framework treats them as unrelated. That makes a chain of jobs behave less like a Unix pipe and more like running commands one after another, each dumping its result into a temp file for the next to read. A job's output only counts once the whole job succeeds, and whatever a failed job managed to write is discarded, so B cannot start until A has completely finished. External schedulers such as Oozie, Azkaban, Luigi, Airflow, and Pinball manage these dependencies; recommendation systems routinely involve 50 to 100 chained jobs, and in large organizations many teams consume each other's outputs. Higher-level tools (Pig, Hive, Cascading, Crunch, FlumeJava) generate multi-stage workflows automatically."
      ],
      keyPoints: [
        "Four stages: parse records, map to key-value pairs, sort by key, reduce per key; you write map and reduce only.",
        "Map tasks correspond to input blocks; reduce tasks are a configured number; a hash of the key picks the reducer.",
        "Shuffle: mappers write per-reducer sorted spill files locally; reducers pull and merge them while keeping sort order.",
        "Computation is scheduled near the data; code is copied to the data, not data to the code.",
        "Workflows chain jobs by directory name; a downstream job waits for complete upstream success; schedulers (Airflow, Oozie, Luigi, Azkaban, Pinball) manage dependencies.",
        "Hadoop mappers and reducers are Java classes; MongoDB and CouchDB use JavaScript; Unix executables work via streaming."
      ],
      table: {
        caption: "The Unix log pipeline mapped onto one MapReduce job",
        columns: ["Stage", "Unix pipeline", "MapReduce equivalent"],
        rows: [
          ["Split input into records", "Newline-delimited lines", "Input format parser"],
          ["Extract key and value", "awk '{print $7}'", "Mapper callback, stateless, once per record"],
          ["Sort by key", "First sort", "Implicit shuffle: hash-partition, local sort, merge at reducer"],
          ["Combine per key", "uniq -c", "Reducer callback with an iterator over the key's values"],
          ["Rank by count", "sort -r -n, then head", "A second MapReduce job reading the first job's output"],
          ["Data transport between stages", "Small in-memory pipe buffer", "Local disk files (shuffle) and HDFS files (job output)"]
        ]
      },
      callout: {
        kind: "insight",
        text: "The reducer never has to hold a key's whole value set in memory and never makes a network call, because sorting lined everything up in advance. That is the entire reason MapReduce reaches high throughput with simple single-threaded user code."
      },
      systems: ["Hadoop MapReduce", "Oozie", "Azkaban", "Luigi", "Airflow", "Pinball", "Pig", "Hive", "Cascading", "Crunch", "FlumeJava"]
    },
    {
      id: "reduce-side-joins-and-grouping",
      title: "Reduce-Side Joins and Grouping",
      body: [
        "A join is needed whenever code must see both ends of an association: a foreign key, a document reference, a graph edge. Denormalization reduces the need but rarely eliminates it, and the chapter sticks to equi-joins, which match on equal values. An OLTP database joins a handful of rows through index lookups, but MapReduce has no indexes; it reads every byte of its input, what a database would call a full table scan. That is ruinous for a point query but perfectly reasonable for analytic work that aggregates over most of the data anyway, especially once the scan is spread across many machines. So a batch join means resolving every occurrence of the association across the whole dataset at once, never looking up one user.",
        "The worked example joins a clickstream of user activity events (the fact table of a star schema) with a user profile database (a dimension table), for instance to learn which pages appeal to which age groups. Events carry only a user ID, because embedding a full profile in every event would waste space. The naive approach, having the job query the remote user database for each event, fails on three counts: throughput is capped by network round-trip time, a flood of parallel lookups can overwhelm the production database, and the job becomes nondeterministic because the database may change while the job runs. The right move is to extract a snapshot of the user database into HDFS (an ETL step) so that both inputs are local, immutable files.",
        "The **sort-merge join** then works as follows. One set of mappers reads events and emits (user ID, event); another reads profiles and emits (user ID, date of birth). The shuffle delivers every record with a given user ID to the same reducer call, adjacent in sorted order. With a **secondary sort** the job can further arrange that within each key the profile record arrives first, followed by the events in timestamp order. The reducer keeps that birth date in a local variable, iterates over that user's events, and emits (URL, viewer age) pairs; later jobs aggregate the age distribution per URL. Memory use is one profile record at a time and there are zero network requests inside the reducer. The name reflects the mechanics: mapper output gets sorted on the key, after which reducers merge the two sorted streams.",
        "A useful way to see this: a mapper that emits a key-value pair is effectively **sending a message**, and the key is the destination address. All messages with the same address land in the same reducer invocation. The framework owns physical delivery, including retrying tasks when a node crashes, so application code never deals with partial failure. This is the opposite of typical application code, where a database fetch sits buried deep inside business logic. The same routing trick implements `GROUP BY`: emit the grouping key from the mapper and the reducer receives each group intact, ready to count records, sum a field, or pick the top k. **Sessionization**, collecting all events from one user session (keyed by session cookie or user ID) even though they were logged on different web servers, is a classic grouping use case that underpins A/B tests and marketing attribution."
      ],
      keyPoints: [
        "Batch joins resolve all associations in a dataset in one pass; MapReduce does full scans, not index lookups.",
        "Never query a live remote database per record: it is slow, dangerous to the database, and nondeterministic. Snapshot the data into HDFS instead.",
        "Sort-merge join: mappers key both inputs by the join key; the shuffle co-locates them; the reducer merges.",
        "A secondary sort orders values within a key (profile first, then events by time) so the reducer needs constant memory.",
        "The key acts as a destination address; the framework handles delivery, retries, and partial failures.",
        "Grouping (COUNT, SUM, top-k, sessionization) is the same mechanism as a join with a single input."
      ],
      callout: {
        kind: "example",
        text: "Sessionization: a user's clicks are scattered across many web servers' logs. Keying every event by session ID and reducing per key rebuilds the complete click sequence, which is exactly what you need to compare conversion rates between A/B test variants."
      }
    },
    {
      id: "handling-skew",
      title: "Handling Skew and Hot Keys",
      body: [
        "Routing by key assumes keys carry roughly equal load. Real data has **hot keys**, also called linchpin objects: a celebrity with millions of followers generates vastly more activity than a typical user. Sending all of that to a single reducer creates a straggler, and because a job finishes only when its slowest task does, every downstream job waits for it too.",
        "Several remedies exist. Pig's skewed join first runs a sampling job to discover which keys are hot. During the real join, records of a hot key from the large side are scattered across several reducers at random instead of being hashed to one, while the matching records from the other side are replicated to all of those reducers. Parallelism improves at the price of duplicating the small side. Crunch's sharded join does the same but requires you to list the hot keys explicitly rather than sampling for them. Hive's skewed join optimization takes a different route: hot keys are declared in the table metadata, their records are stored in separate files, and joins on them use a map-side join (next section) while ordinary keys take the usual reduce-side path. The randomization idea is the same one used to spread hot spots in a partitioned database (Chapter 6).",
        "For grouping with aggregation, a two-stage pattern works: the first job sends records of a hot key to random reducers, each of which emits a compact partial aggregate; the second job combines the partial aggregates into one value per key. This presupposes that the aggregation can be split and recombined, which holds for counts and sums but not for every operation."
      ],
      keyPoints: [
        "A single reducer swamped by a hot key delays the entire job and everything that depends on it.",
        "Pig: sample to detect hot keys, then randomize the hot side and replicate the other side to the chosen reducers.",
        "Crunch: the same technique with hot keys specified by hand.",
        "Hive: hot keys declared in metadata, stored separately, and joined map-side.",
        "Two-stage aggregation: random partial aggregates first, then a final combining job."
      ],
      table: {
        caption: "Techniques for joining or grouping on hot keys",
        columns: ["Technique", "How hot keys are identified", "What it does", "Cost"],
        rows: [
          ["Pig skewed join", "Sampling job before the join", "Spreads hot-key records randomly over several reducers; replicates the other side to them", "Extra sampling pass; duplicated records"],
          ["Crunch sharded join", "Listed explicitly by the author", "Same randomize-and-replicate strategy", "Manual upkeep of the hot-key list"],
          ["Hive skewed join", "Declared in table metadata", "Stores hot-key rows in separate files and joins them map-side", "Requires metadata and a special file layout"],
          ["Two-stage grouping", "Not needed", "Random partial aggregation, then a final merge job", "Only for decomposable aggregates; one extra job"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Hot-key handling is not free: randomizing the hot side forces the other side to be copied to every reducer involved, so apply it only to the keys that are actually hot rather than to the whole join."
      },
      systems: ["Pig", "Crunch", "Hive"]
    },
    {
      id: "map-side-joins",
      title: "Map-Side Joins",
      body: [
        "Reduce-side joins make no assumptions about their inputs, but they pay for that generality: partitioning, sorting, copying across the network, and merging may write the data to disk several times along the way. If you can guarantee certain properties of the inputs, a **map-side join** skips the reducers and the sort entirely. Each mapper reads one block of the large input and writes one output file, nothing more.",
        "The **broadcast hash join** applies when one side is small enough to fit in each mapper's memory. Every map task first loads the entire small input (the user database, say) from HDFS into a hash table, then streams through its block of the large input, probing the table once per record. 'Broadcast' because the small side goes to every partition of the large side; 'hash' for the lookup structure. Pig calls this a replicated join and Hive a MapJoin; Cascading, Crunch, and the Impala query engine use it as well. A variant stores the small side as a read-only index on the mapper's local disk; the hot portions of that index remain cached by the OS, so lookups are nearly as fast as from RAM without the dataset having to fit in RAM.",
        "The **partitioned hash join** (a bucketed map join in Hive) applies when both inputs are partitioned identically: same key, same hash function, same number of partitions. If users and events are each split into ten files by the last digit of the user ID, mapper 3 loads only the users whose ID ends in 3 into its hash table and scans only the corresponding event partition. Each hash table is a fraction of the size, and the precondition is realistic when earlier jobs in the workflow produced the inputs. The **map-side merge join** goes one step further: if both inputs are partitioned the same way and also sorted by the key, a mapper can merge them exactly as a reducer would, reading both files in ascending key order, regardless of their size. That layout normally exists because a previous job's reducers produced it, and in principle the join could have been done there; a separate map-only job still makes sense when the sorted, partitioned datasets are reused for other purposes.",
        "The choice shapes downstream data. A reduce-side join emits output organized (partitioned and ordered) by the join key; a map-side join emits output organized the way the large input was, because its map tasks were created one per block of that input. Exploiting map-side joins therefore requires knowing the physical layout of a dataset, not just its directory and encoding: how many partitions, by which key, in which order. In the Hadoop ecosystem that metadata lives in HCatalog and the Hive metastore."
      ],
      keyPoints: [
        "Map-side joins drop the shuffle and the sort; mappers read a block and write a file.",
        "Broadcast hash join: the small side is fully loaded in every mapper (or kept as a local disk index served from the page cache).",
        "Partitioned hash join: both sides co-partitioned by the same key, hash function, and partition count; each mapper handles one bucket.",
        "Map-side merge join: both sides co-partitioned and sorted; mappers merge streams of any size.",
        "Output layout differs: reduce-side output is organized by join key, map-side output by the large input's layout.",
        "Partitioning metadata (HCatalog, Hive metastore) is what makes map-side strategies safe to choose."
      ],
      table: {
        caption: "Join strategies in MapReduce compared",
        columns: ["Strategy", "Where the join runs", "Input assumptions", "Main cost", "Output layout"],
        rows: [
          ["Sort-merge (reduce-side)", "Reducer", "None", "Full shuffle: sort, network copy, merge, possibly several disk writes", "Partitioned and sorted by join key"],
          ["Broadcast hash", "Mapper", "One side fits in memory (or a local disk index)", "Each mapper loads the whole small side", "Same as the large input"],
          ["Partitioned hash", "Mapper", "Both sides partitioned by the same key, hash, and count", "Per-mapper hash table of one bucket", "Same as the large input"],
          ["Map-side merge", "Mapper", "Both sides co-partitioned and sorted by key", "Sequential merge, near-zero memory", "Same as the large input"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Every join strategy answers one question: how do matching records end up in the same process? Sort-merge moves both sides; broadcast moves the small side everywhere; partitioned and merge joins rely on an earlier job having already placed the data correctly."
      },
      systems: ["Pig", "Hive", "Cascading", "Crunch", "Impala", "HCatalog"]
    },
    {
      id: "output-of-batch-workflows",
      title: "The Output of Batch Workflows",
      body: [
        "What is all this processing for? Batch output is neither OLTP (fetching a few rows for a web page) nor the classic analytics report read by a manager. It scans like analytics but typically produces a data structure that other systems then serve. Google's original use was building its web search index with a chain of five to ten MapReduce jobs, and Hadoop remains a solid way to build Lucene and Solr indexes. A full-text index is, at heart, a term dictionary mapping each keyword to its postings list of document IDs. Mappers partition the document set, every reducer constructs the index for the documents it received, and the resulting per-partition index files land on HDFS. They are immutable: when documents change you either rerun the whole workflow and swap the index files wholesale (costly if little changed, but trivially easy to reason about) or build incrementally, as Lucene does by writing new segments and compacting them in the background.",
        "Another common output is a database: recommendation results (people you may know, related products) or classifier models (spam filtering, anomaly detection) that the web tier must query by key. Writing into that database from inside mappers or reducers through its client library is tempting and wrong. Each record costs a network round trip, far slower than batch throughput even with client-side batching; hundreds of parallel tasks can overwhelm the database and degrade production queries; and the writes escape MapReduce's all-or-nothing guarantee, so partially finished jobs, retried task attempts, and speculative duplicate executions become visible to the outside world.",
        "The better pattern is to build the database files inside the job and write them to the output directory, exactly like an index. Voldemort, Terrapin, ElephantDB, and HBase bulk loading all accept files produced this way. Since a mapper extracting a key followed by the implicit sort is already most of what index construction needs, this is a natural fit, and because the files are read-only the storage structures stay simple (no write-ahead log, for example). Voldemort keeps serving the old files while the new ones are copied to local disk, then atomically switches to the new set, and can switch back if anything looks wrong because the old files are still there, untouched.",
        "This is the Unix philosophy applied to outputs: inputs are left intact, the previous output is swapped out entirely for the new one, and nothing else in the world changes. The payoff is **human fault tolerance**: if buggy code produced bad output, roll back the code and rerun, or simply point consumers back at the previous run's directory. A read-write database offers no such escape, because rolling back the code does not undo the bad writes. Minimizing irreversibility lets teams move faster. Automatic task retry is safe precisely because inputs are immutable and the output of failed attempts is discarded. The same files can feed many jobs, including monitoring jobs that compare today's output to yesterday's. And like Unix tools, jobs separate logic from wiring, so one team can own a job while another decides when and where it runs. One difference from Unix: Hadoop jobs usually use structured, schema-aware formats such as Avro and Parquet instead of untyped text, which removes much of the low-value parsing (no more `$7`) and supports schema evolution over time."
      ],
      keyPoints: [
        "Typical outputs: search indexes, recommendation and ML lookup tables, ETL loads; not interactive reports.",
        "Index building parallelizes by document partition; immutable index files are swapped wholesale or built incrementally.",
        "Do not write to a live database per record from a job: too slow, risks overwhelming production, and leaks partial results.",
        "Build read-only database files in the job output and bulk-load them (Voldemort, Terrapin, ElephantDB, HBase bulk load); atomic switchover with easy rollback.",
        "Immutable inputs plus fully replaced outputs give human fault tolerance, safe retries, and reuse of outputs by many consumers.",
        "Avro and Parquet replace Unix's untyped text with schema-based, evolvable encodings."
      ],
      callout: {
        kind: "pitfall",
        text: "Speculative execution means Hadoop may run two attempts of the same task concurrently and keep whichever finishes first. If your task writes to an external database, both attempts' writes happen; only output written through the framework is deduplicated."
      },
      systems: ["Lucene", "Solr", "Voldemort", "Terrapin", "ElephantDB", "HBase", "Avro", "Parquet"]
    },
    {
      id: "hadoop-vs-distributed-databases",
      title: "Comparing Hadoop to Distributed Databases",
      body: [
        "Hadoop is effectively a distributed Unix, with HDFS as its filesystem and MapReduce as an odd kind of process that always runs `sort` between its map and reduce halves. Nothing in the MapReduce paper was algorithmically new; massively parallel processing (MPP) databases such as Teradata, Tandem NonStop SQL, and the Gamma database machine had implemented parallel joins and grouping a decade earlier. The real difference is scope: an MPP database parallelizes analytic SQL over a cluster, whereas HDFS plus MapReduce behaves more like a general-purpose OS on which any program can run.",
        "**Storage diversity.** A database forces data into its model and its proprietary on-disk format before import; HDFS files are arbitrary bytes, so text, images, video, sensor readings, feature vectors, genome sequences, and database dumps all coexist. Hadoop made it feasible to dump raw data first and decide how to process it later. Purists object that careful up-front modeling yields cleaner data, but experience shows that making data available quickly, even in awkward raw form, is usually worth more than agreeing on an ideal schema first. This is the data warehouse insight taken further: centralizing data enables joins across formerly separate datasets, and skipping schema design up front removes the main bottleneck to collecting it (the data lake or enterprise data hub). Interpretation shifts to the consumer (schema-on-read), which suits organizations where the team producing a dataset is not the team consuming it and the two have different priorities; there may also be several useful views of the same raw data, a stance nicknamed the sushi principle. Hence Hadoop's heavy use for ETL: dump raw transactional data, clean and reshape it with MapReduce, load the result into an MPP warehouse. Modeling still happens, just later and decoupled from collection.",
        "**Processing-model diversity.** An MPP database is a tightly integrated monolith (storage layout, planner, scheduler, executor) tuned as a whole, which makes it fast at its intended queries and lets analysts work through graphical tools such as Tableau. But machine learning feature engineering, relevance ranking, image analysis, and fraud risk models are not SQL; they need code. MapReduce let engineers run arbitrary code at scale; Hive showed that a SQL engine can be built on top; and when MapReduce proved too slow or too limiting for some workloads, yet more models were built on the same open platform. All of them share one cluster and one copy of the files, so data never has to be exported into separate specialized systems, which makes experimenting with new processing models cheap. HBase (random-access OLTP) and Impala (MPP-style SQL) both live on HDFS without using MapReduce at all.",
        "**Designing for frequent faults.** An MPP database usually aborts a whole query when a node dies and reruns it, which is acceptable when queries take seconds to minutes; it also keeps as much as possible in memory, hash joins included. MapReduce retries individual tasks and writes to disk eagerly, both for recovery and because the data is assumed not to fit in RAM. That suits very large, long jobs where at least one task failure is likely. Yet hardware failures are rare enough that this looks like over-engineering, until you consider the environment MapReduce was built for: Google's mixed-use datacenters, where batch tasks run at low priority in containers and get preempted whenever a higher-priority production service needs the resources. Overcommitting low-priority capacity raises utilization. An hour-long task at Google has roughly a 5% chance of being preempted, more than ten times the rate of hardware failures, so a job of 100 ten-minute tasks has better than even odds of losing at least one. MapReduce tolerates termination not because machines are flaky but because killing tasks freely is what makes the cluster efficient. Open source schedulers rarely do this: YARN's CapacityScheduler preempts to rebalance queues, but general priority preemption was missing from YARN, Mesos, and Kubernetes at the time of writing, so on such clusters MapReduce's conservatism buys less than it did at Google."
      ],
      keyPoints: [
        "MPP databases (Gamma, Teradata, Tandem NonStop SQL) had parallel joins long before MapReduce; Hadoop's novelty is generality, not algorithms.",
        "Raw files in HDFS support any data type; schema-on-read moves interpretation to the consumer and speeds up collection (data lake, sushi principle).",
        "Many processing models share one cluster and one copy of the data: SQL (Hive, Impala), MapReduce, OLTP (HBase), and later dataflow engines.",
        "MPP: abort and rerun whole queries, memory-heavy. MapReduce: task-level retry, disk-heavy.",
        "The design targets preemption in multi-tenant clusters (about 5% per task-hour at Google), not unreliable hardware.",
        "Where preemption is rare, MapReduce's overheads are harder to justify, which motivates the dataflow engines of the next section."
      ],
      table: {
        caption: "MPP databases vs. Hadoop (HDFS + MapReduce)",
        columns: ["Dimension", "MPP database", "Hadoop ecosystem"],
        rows: [
          ["Data format", "Proprietary, modeled on import (schema-on-write)", "Arbitrary bytes; interpreted on read"],
          ["Processing model", "SQL queries only", "Arbitrary code; SQL (Hive, Impala), MapReduce, dataflow, graph, ML on one cluster"],
          ["Failure handling", "Abort and rerun the entire query", "Retry individual failed tasks"],
          ["Memory vs. disk", "Keep data in memory where possible", "Write intermediate data to disk eagerly"],
          ["Typical job length", "Seconds to minutes", "Minutes to days"],
          ["Target environment", "Dedicated cluster", "Shared, multi-tenant, preemptible cluster"]
        ]
      },
      callout: {
        kind: "insight",
        text: "Do the arithmetic on preemption: at a 5%-per-hour kill rate, 100 tasks of 10 minutes each face a better-than-even chance that one of them dies. Restarting the whole job on each such event would make finishing nearly impossible, which is why task-granular recovery earned its cost at Google."
      },
      systems: ["Teradata", "Tandem NonStop SQL", "Gamma", "Hive", "HBase", "Impala", "Tableau", "YARN", "Mesos", "Kubernetes"]
    },
    {
      id: "materialization-and-dataflow-engines",
      title: "Beyond MapReduce: Materialization and Dataflow Engines",
      body: [
        "MapReduce is easy to reason about but tedious to program against: with the raw API you implement every join yourself. Pig, Hive, Cascading, and Crunch added abstractions, but some problems live in the execution model and no layer on top can fix them. MapReduce is extremely robust, chewing through arbitrarily large inputs on an unreliable multi-tenant cluster, yet other engines are sometimes orders of magnitude faster. The culprit is **materialization**: every job writes its complete output to HDFS, and when that output exists only to feed the next job owned by the same team, it is intermediate state being eagerly written out rather than streamed, the opposite of a Unix pipe's small in-memory buffer. Publishing a dataset by name is valuable when many teams will reuse it, but workflows of 50 to 100 jobs materialize a great deal that nobody else ever reads.",
        "Full materialization has three costs. A job cannot begin until every task of its predecessors has finished, so stragglers caused by skew or uneven load stall the whole workflow, whereas pipe-connected processes run concurrently. Many mappers are pure overhead: they reread what a reducer just wrote and re-prepare it for the next shuffle, work that could have been folded into the preceding reducer if its output were already partitioned and sorted the right way. And intermediate files receive HDFS's full replication, which is excessive for scratch data.",
        "**Dataflow engines** (Spark, Tez, Flink, descended from the research systems Dryad and Nephele) treat an entire workflow as one job and model it as a directed acyclic graph of **operators**: user functions that still handle records one by one on a single thread but are not forced into alternating map and reduce roles. Operator outputs can be connected in several ways: repartition and sort by key (the classic shuffle, enabling sort-merge joins and grouping), repartition without sorting (sufficient for partitioned hash joins, where building the hash table destroys order anyway), or broadcast one operator's output to all partitions of another (broadcast hash joins). The benefits follow directly. Sorting happens only where needed. Redundant map stages disappear because a map does not change partitioning and can be fused into the previous operator. The scheduler sees all dependencies and can co-locate producer and consumer so data passes through shared memory. Intermediate data stays in memory or on local disk rather than replicated HDFS (MapReduce already did this for mapper output; dataflow engines do it everywhere). Operators start as soon as input is available. And JVMs are reused instead of launched afresh for each task. Because operators generalize map and reduce, Pig, Hive, and Cascading jobs can switch from MapReduce to Tez or Spark through configuration alone. Tez is a thin library that leans on YARN's shuffle service; Spark and Flink are full frameworks with their own networking, scheduling, and APIs.",
        "Skipping HDFS for intermediates changes fault tolerance. MapReduce's materialized state is durable, so a failed task simply restarts and rereads its input. Dataflow engines instead **recompute** lost data from whatever still exists: an earlier intermediate stage if possible, otherwise the original input on HDFS. That requires tracking how each piece of data was derived. Spark's resilient distributed datasets (RDDs) record the lineage of each dataset, meaning which input partitions and operators produced it; Flink checkpoints operator state so that an operator can resume from the middle of its execution. Recomputation is only safe if operators are **deterministic**. If a lost partition had already been consumed downstream and the recomputed version differs, downstream results become inconsistent, and the usual remedy is to kill and rerun the downstream operators too. Nondeterminism sneaks in through hash-table iteration order, random number generators, the system clock, and external data sources; use fixed seeds and avoid external reads. Recomputation is also not always the cheapest option: when intermediate data is much smaller than its input or very expensive to compute, materializing it to files is the better trade.",
        "The net effect: MapReduce behaves like writing every command's output to a temporary file, while dataflow engines behave like pipes. Flink in particular is built around pipelined execution, pushing records downstream incrementally. Sorting is the exception that must buffer its entire input, since the very last record might carry the smallest key, so sort-based operators accumulate state; most of a workflow, however, can stream. Job inputs and final outputs still live on HDFS, immutable going in and replaced wholesale coming out. The saving is all the intermediate writes in between."
      ],
      keyPoints: [
        "Materialization means eagerly writing intermediate state to the distributed filesystem; MapReduce does it after every job.",
        "Costs: waiting for stragglers before the next job starts, redundant mapper stages, and needless replication of temporary data.",
        "Dataflow engines run a whole workflow as one DAG of operators with flexible connections: shuffle-and-sort, partition-only, or broadcast.",
        "Optimizations: sort only when required, operator fusion, locality-aware scheduling, in-memory or local-disk intermediates, early start, JVM reuse.",
        "Fault tolerance via lineage-based recomputation (Spark RDDs) or operator checkpoints (Flink); both require deterministic operators.",
        "Materialize anyway when intermediate data is small or costly to regenerate; final outputs still go to HDFS."
      ],
      table: {
        caption: "MapReduce vs. dataflow engines (Spark, Tez, Flink)",
        columns: ["Aspect", "MapReduce", "Dataflow engine"],
        rows: [
          ["Unit of execution", "Independent job per map-reduce pair", "Whole workflow as one DAG job"],
          ["Intermediate state", "Replicated files on HDFS", "Memory or local disk; streamed when possible"],
          ["Sorting", "Always, between map and reduce", "Only where an operator needs it"],
          ["Start of next stage", "After all upstream tasks finish", "As soon as input is available (pipelined)"],
          ["Fault recovery", "Restart the task and reread durable input", "Recompute lost partitions from lineage or checkpoints"],
          ["Determinism", "Helpful", "Essential, otherwise recomputation cascades downstream"],
          ["Process startup", "New JVM per task", "JVMs reused across operators"]
        ]
      },
      callout: {
        kind: "pitfall",
        text: "Iterating over a hash map and emitting records in that order is nondeterministic in many languages. In Spark or Flink a recomputed partition could then differ from the one that was lost, corrupting downstream operators that already consumed the original."
      },
      systems: ["Spark", "Tez", "Flink", "Dryad", "Nephele", "YARN", "Pig", "Hive", "Cascading"]
    },
    {
      id: "graphs-and-iterative-processing",
      title: "Graphs and Iterative Processing",
      body: [
        "Chapter 2 treated graphs for OLTP-style queries that touch a few vertices. Batch graph processing instead analyzes an entire graph offline, as recommendation engines and ranking systems do; PageRank, which estimates a page's importance from the pages linking to it, is the canonical example. Watch the vocabulary: dataflow engines arrange their operators as a DAG, but the records flowing through them are ordinary tuples; in graph processing, by contrast, the dataset is a graph.",
        "Many graph algorithms repeat a step until a condition holds: follow one edge, pass some information to the neighbor, and repeat until nothing changes or a metric converges. A transitive closure such as 'every location contained in North America' works this way. Plain MapReduce has no loop, so you run one job per iteration under an external scheduler that checks the stopping condition and launches the next round. It works but wastes effort: each round rereads the whole graph and rewrites a complete new output even if only a sliver of it changed.",
        "The **Pregel** model, named after Google's paper and based on the bulk synchronous parallel (BSP) idea, fixes this; Apache Giraph, Spark's GraphX, and Flink's Gelly implement it. The analogy to MapReduce is message passing: a vertex sends messages to other vertices, usually along its edges, and in each iteration (a superstep) a function runs for every vertex with all the messages addressed to it, much like a reducer call. The difference is that a vertex keeps its state in memory across iterations, so it only has to process new messages, and idle regions of the graph cost nothing. It resembles the actor model with vertices as actors, except that vertex state and messages are durable and fault-tolerant, and delivery happens in lockstep rounds: everything sent in one iteration is delivered in the next.",
        "Because vertices communicate only through messages, never by querying each other directly, the framework can batch messages, and the only real waiting happens at the barrier between iterations, where all messages must be transmitted before the next round begins. Even over a network that drops, duplicates, or delays packets, implementations guarantee that each message is processed exactly once at its target in the following iteration. Fault tolerance comes from checkpointing all vertex state at iteration boundaries; the simplest recovery rolls the whole computation back to the last checkpoint, and when the algorithm is deterministic and the messages have been logged, recovery can be limited to the partition that was lost. Vertices address each other by vertex ID and the framework decides placement. Ideally vertices that talk a lot would share a machine, but good graph partitioning is hard, so in practice vertices are spread by arbitrary ID, cross-machine traffic is heavy, and the volume of messages can exceed the size of the graph. The practical advice: a graph that fits in one machine's memory is often processed faster by a single-threaded program than by a cluster; a graph that fits on one machine's disks can use GraphChi; only truly huge graphs justify distributed Pregel-style systems, and parallelizing graph algorithms efficiently remains an open research problem."
      ],
      keyPoints: [
        "Iterative algorithms (PageRank, transitive closure) do not fit single-pass MapReduce; looping through an external scheduler rereads and rewrites everything each round.",
        "Pregel and BSP: a per-vertex function receives its messages each superstep; vertex state persists in memory, so only active parts of the graph do work.",
        "Messages sent in one iteration arrive in the next, exactly once, despite an unreliable network; the barrier between iterations is the main waiting point.",
        "Recovery: periodic checkpoints of all vertex state; roll back globally, or with determinism and message logs recover a single partition.",
        "Partitioning by arbitrary vertex ID causes heavy network traffic; single-machine processing frequently wins for graphs that fit in RAM or on local disk (GraphChi)."
      ],
      callout: {
        kind: "insight",
        text: "Pregel is MapReduce's 'key as address' idea plus memory: a reducer forgets everything between jobs, whereas a Pregel vertex remembers its state, so an iteration costs only as much as the messages actually sent."
      },
      systems: ["Pregel", "Apache Giraph", "Spark GraphX", "Flink Gelly", "GraphChi"]
    },
    {
      id: "high-level-apis-and-languages",
      title: "High-Level APIs and Languages",
      body: [
        "With clusters of more than 10,000 machines holding many petabytes now routine, the problem of physically operating batch systems is considered largely solved, and attention has shifted to making them easier to program, more efficient, and useful for more problems. Hive, Pig, Cascading, and Crunch arose because hand-written MapReduce is laborious, and they gained a second advantage when Tez appeared: the same job code moved to a faster engine with no rewrite. Spark and Flink ship their own high-level dataflow APIs, influenced by Google's FlumeJava. These APIs are relational in flavor: join on a field, group by key, filter on a condition, aggregate by counting or summing. Underneath they use the join and grouping algorithms covered earlier. They also enable interactive, shell-driven exploration, running small pieces of analysis repeatedly to see what the data looks like, which echoes the Unix style of experimentation.",
        "The move toward **declarative** specification pays off at execution time, not just in lines of code. If you declare a join instead of coding it, the engine can inspect the inputs and pick the best algorithm; the cost-based optimizers in Hive, Spark, and Flink do exactly this and also reorder joins to shrink intermediate state. Yet these systems remain unlike SQL in one crucial respect: they are built around callbacks (mappers, reducers, operators) that may run arbitrary code, which opens up whole library ecosystems for parsing, natural language processing, image analysis, and numerics. Databases do offer user-defined functions, but they are clunky and disconnected from package managers like Maven, npm, or Rubygems. Still, calling a function per record is expensive when the function merely filters rows or projects a few fields. Expressing such operations declaratively lets the optimizer read only the needed columns from column-oriented storage and use vectorized execution in cache-friendly inner loops; Spark compiles these to JVM bytecode, and Impala generates native code via LLVM. The result is batch frameworks that approach MPP database performance while keeping the ability to run any code over data in any format.",
        "The other trend is **specialization for different domains**: reusable implementations of recurring patterns beyond the business reporting that MPP databases traditionally served. Mahout provides machine learning algorithms on MapReduce, Spark, and Flink; MADlib does the same inside the Apache HAWQ MPP database. Spatial methods like k-nearest neighbors (similarity search in a multidimensional space) and approximate string matching for genome analysis are further examples. As batch engines absorb declarative operators and built-in libraries while MPP databases grow more programmable, the two camps converge: in the end both are systems for storing and processing data."
      ],
      keyPoints: [
        "High-level APIs (Hive, Pig, Cascading, Crunch; Spark and Flink APIs modeled on FlumeJava) offer relational building blocks and interactive use.",
        "Declarative joins let cost-based optimizers choose join algorithms and reorder joins to minimize intermediate state.",
        "Arbitrary-code callbacks remain the key advantage over MPP databases' awkward user-defined functions.",
        "Declarative filter and projection operations unlock column pruning, vectorized execution, and code generation (Spark bytecode, Impala LLVM).",
        "Specialized libraries: Mahout (ML), MADlib (ML inside HAWQ), k-nearest-neighbor spatial search, genome analysis.",
        "Batch engines and MPP databases are converging in both capabilities and performance."
      ],
      callout: {
        kind: "example",
        text: "A filter that keeps rows where the status code equals 200 is trivial code, but as a callback it costs a function call per record. Declared as a predicate, Spark DataFrames or Hive can push it into a columnar scan and evaluate it in a tight vectorized loop."
      },
      systems: ["Hive", "Pig", "Cascading", "Crunch", "FlumeJava", "Spark", "Flink", "Impala", "Mahout", "MADlib", "Apache HAWQ"]
    },
    {
      id: "summary-partitioning-fault-tolerance-bounded-input",
      title: "Summary: Partitioning, Fault Tolerance, and Bounded Input",
      body: [
        "The chapter's thread runs from awk and sort to Spark and Pregel, carrying the same principles throughout: inputs are immutable, outputs are meant to be consumed by programs not yet written, and complex work is composed from small pieces that each do one thing. Unix connects the pieces with files and pipes; MapReduce connects them with a distributed filesystem; dataflow engines introduce pipe-style transport of their own for intermediate data but still start and end on HDFS.",
        "Two problems define distributed batch processing. **Partitioning**: map tasks follow input blocks, and mapper output is then hashed to a chosen number of reducers, sorted, and merged so that related records meet in one place; later engines avoid the sort unless it is needed but partition in broadly the same way. **Fault tolerance**: MapReduce writes to disk constantly, which makes recovering a single failed task cheap but slows down failure-free runs; dataflow engines keep more in memory and recompute on failure, with determinism limiting how much has to be redone. Three join algorithms, sort-merge, broadcast hash, and partitioned hash, recur across MapReduce, dataflow engines, and MPP databases alike.",
        "The programming model is deliberately restrictive: callbacks are stateless and have no externally visible effects other than their declared output. That restriction is what lets the framework retry tasks, discard failed attempts, and expose exactly one successful attempt's output per partition, so the final result looks as if no fault had occurred, a stronger guarantee than most online services provide, since they typically mutate databases while handling each request. The defining assumption underneath all of it is that the input is **bounded**: a snapshot or a set of log files of known size, so a job knows when it is done. Chapter 11 drops that assumption and asks what processing looks like when the input never ends."
      ],
      keyPoints: [
        "Unix pipes, HDFS directories, and dataflow transports are all uniform interfaces between composable stages.",
        "Partitioning brings related data together; fault tolerance is a choice between durable intermediates and recomputation.",
        "Statelessness and absence of side effects make retries safe and let the framework guarantee output equivalent to a fault-free run.",
        "Bounded input is what makes 'done' meaningful; streams remove that property and are the subject of Chapter 11."
      ]
    }
  ],
  terms: [
    { term: "Batch processing", definition: "Running a job over a large, bounded, immutable input to produce derived output, with no user waiting; the primary performance measure is throughput rather than response time." },
    { term: "HDFS", definition: "Hadoop's shared-nothing distributed filesystem: a daemon on each machine serves local blocks, a NameNode maps blocks to machines, and replication or Reed-Solomon erasure coding provides durability." },
    { term: "Mapper and reducer", definition: "The two callbacks of a MapReduce job. The mapper runs once per input record, stateless, emitting key-value pairs; the reducer runs once per key with an iterator over all values for that key after the shuffle." },
    { term: "Shuffle", definition: "The step between map and reduce in which each mapper partitions its output by key hash, writes sorted files locally, and reducers fetch and merge their partitions. It is fully deterministic despite the name." },
    { term: "Secondary sort", definition: "Arranging the order of values within one key in the reducer input, for example the user record first and then activity events by timestamp, so the reducer can process a key in a single pass with constant memory." },
    { term: "Sort-merge join", definition: "A reduce-side join in which mappers key both inputs by the join key and the reducer merges the sorted, co-located records. It needs no assumptions about the inputs but pays for a full shuffle." },
    { term: "Broadcast hash join", definition: "A map-side join that loads a small input entirely into a hash table in every mapper and probes it while scanning blocks of the large input; called a replicated join in Pig and MapJoin in Hive." },
    { term: "Partitioned hash join", definition: "A map-side join usable when both inputs share the same key, hash function, and partition count, so each mapper joins one bucket in memory; Hive calls it a bucketed map join." },
    { term: "Hot key (skew)", definition: "A key with disproportionately many records, such as a celebrity's interactions, that overloads a single reducer and delays the entire job and its successors." },
    { term: "Materialization", definition: "Eagerly writing an intermediate result to storage instead of streaming it to its consumer. MapReduce materializes every job's output on HDFS; Unix pipes and dataflow engines mostly avoid it." },
    { term: "Dataflow engine", definition: "A batch engine such as Spark, Tez, or Flink that runs a whole workflow as one DAG of operators, sorts only where needed, keeps intermediates in memory or on local disk, and recovers by recomputation." },
    { term: "Lineage (RDD)", definition: "Spark's record, via resilient distributed datasets, of which input partitions and operators produced each dataset, which lets lost partitions be recomputed after a failure." },
    { term: "Pregel (BSP) model", definition: "Iterative graph processing in which each vertex keeps state across synchronized supersteps and processes messages sent to it in the previous step; exactly-once delivery and checkpointing give fault tolerance." },
    { term: "Data lake (schema-on-read)", definition: "Storing raw data in any format in a distributed filesystem and interpreting it when it is processed rather than modeling it before import; the attitude is nicknamed the sushi principle, meaning raw beats processed." },
    { term: "Human fault tolerance", definition: "The ability to recover from buggy code by rerunning a job over its immutable inputs or switching consumers back to a previous output, a property read-write databases lack." }
  ],
  pitfalls: [
    "Thinking 'shuffle' implies randomness. It is the fully deterministic partition-by-hash, sort, and copy step; the only randomness appears when skew handling deliberately scatters hot keys across reducers.",
    "Assuming an in-memory hash table always beats sorting. It wins only while the distinct keys fit in RAM; beyond that, external mergesort's sequential I/O (and GNU sort's multi-core, disk-spilling implementation) scales where the hash table simply runs out of memory.",
    "Writing batch results straight into a production database from mappers or reducers. It is slow per record, can overload the database, and leaks partial or duplicated results from retried and speculative tasks. Build immutable files and bulk-load them instead.",
    "Believing MapReduce was designed for unreliable hardware. Its eager disk writes and task-level retry target preemption in shared clusters (about 5% per task-hour at Google), which dwarfs hardware failure rates; on clusters without preemption the overhead is harder to justify.",
    "Treating dataflow engines as 'MapReduce without disk' and nothing more. Their recomputation-based recovery only works with deterministic operators; random seeds, clock reads, hash-map iteration order, and external lookups can all break it.",
    "Reaching for a distributed graph framework by default. Message traffic between arbitrarily partitioned vertices often exceeds the size of the graph; a single machine (or GraphChi on local disks) frequently finishes first when the graph fits."
  ],
  connections: [
    { chapter: 2, note: "MapReduce querying was first shown with MongoDB and CouchDB; joins, graph data models, and the declarative-versus-imperative query debate all return here in batch form, with Pregel handling the graph traversals Chapter 2 did with query languages." },
    { chapter: 3, note: "External mergesort in sort and the shuffle's sorted spill files are the SSTable and LSM-tree idea; column-oriented storage is what vectorized, declarative batch APIs exploit; and read-only batch-built stores can skip the write-ahead log described there." },
    { chapter: 6, note: "The shuffle is hash partitioning; hot-key handling in Pig, Crunch, and Hive mirrors the hot-spot techniques there; batch-built search indexes are document-partitioned secondary indexes." },
    { chapter: 8, note: "MapReduce and Pregel hide partial failures, unreliable networks, and preemption behind task retry and exactly-once-per-iteration delivery; deterministic operators are what make those retries safe." },
    { chapter: 11, note: "Stream processing drops the bounded-input assumption; immutable logs, partitioned joins, deterministic recomputation, and Flink's pipelined execution all carry straight over to unbounded inputs." },
    { chapter: 12, note: "Search indexes, recommendation stores, and ML models built by batch jobs are the derived data systems Chapter 12 generalizes, and human fault tolerance through rerunnable jobs is central to that chapter's argument." }
  ],
  flashcards: [
    { front: "Walk through what each stage of `awk '{print $7}' | sort | uniq -c | sort -r -n | head -n 5` contributes to finding the five most requested URLs.", back: "awk extracts the path field as the key; sort makes identical paths adjacent; uniq -c collapses adjacent duplicates into a count; the second sort orders numerically in descending order by count; head keeps the five largest." },
    { front: "When does the sort-based Unix pipeline beat a script with an in-memory hash table for counting occurrences?", back: "When the working set (distinct keys plus counters) exceeds RAM. GNU sort spills sorted runs to disk and merges them sequentially using multiple cores, so it scales past memory; the hash table just runs out of memory." },
    { front: "What is Unix's uniform interface and why does it matter?", back: "A file descriptor over an ordered byte stream. Files, pipes, stdin/stdout, devices, and sockets all present it, so independently written programs can be connected. By convention tools treat the bytes as newline-separated ASCII records." },
    { front: "What does 'separation of logic and wiring' mean for a Unix tool?", back: "The tool reads stdin and writes stdout without knowing what they connect to; the shell user decides the wiring at run time. This loose coupling lets a program you wrote sit in a pipeline next to sort or uniq." },
    { front: "Name three properties of Unix tools that make experimentation cheap.", back: "Inputs are treated as immutable, so you can rerun safely; you can stop a pipeline at any stage and inspect the output with less; you can save a stage's output to a file and restart later stages from it." },
    { front: "How does HDFS present one large filesystem built from commodity machines?", back: "Every machine runs a daemon serving the blocks on its local disks; a central NameNode tracks which blocks live where. Blocks are replicated or erasure-coded (Reed-Solomon) across machines for durability. No special hardware, unlike NAS or SAN." },
    { front: "Describe the mapper and reducer contracts in MapReduce.", back: "Mapper: called once per input record, stateless, emits any number of key-value pairs. Reducer: called once per distinct key after the framework has partitioned and sorted, receives an iterator over the values, emits output records." },
    { front: "What exactly happens during the MapReduce shuffle?", back: "Each mapper partitions its output by a hash of the key (one partition per reducer), writes each partition as a sorted file on local disk, and reducers fetch their partitions from every mapper and merge them while preserving sort order. It is deterministic." },
    { front: "Why is 'put the computation near the data' possible in Hadoop, and when does it stop helping?", back: "The scheduler runs a map task on a machine that holds a replica of its input block, avoiding a network copy. It stops helping when the network is not the bottleneck, when storage is separate (object stores), or with erasure coding, which needs fragments from several machines." },
    { front: "How are MapReduce jobs chained into workflows, and what does that imply about timing?", back: "By directory name: job B's input directory is job A's output directory. The framework sees independent jobs, so an external scheduler (Airflow, Oozie, Luigi, Azkaban, Pinball) starts B only after A fully succeeds; partial output of failed jobs is discarded." },
    { front: "Why shouldn't a batch job look up a remote database for every record it needs to join?", back: "Throughput collapses to the network round-trip rate, massive parallel queries can overwhelm the database, and the job becomes nondeterministic because the database may change mid-run. Snapshot the database into the distributed filesystem instead." },
    { front: "Explain the reduce-side sort-merge join of activity events with user profiles on user ID.", back: "Mappers over events emit (userID, event); mappers over profiles emit (userID, birthdate). The shuffle brings all records of one user to one reducer call, with a secondary sort placing the profile first. The reducer holds one profile and streams through the events." },
    { front: "What is a secondary sort used for?", back: "Ordering the values within one key in the reducer input, e.g. the user record first and then activity events by timestamp, so the reducer can process the key in a single pass while holding only a constant amount of state." },
    { front: "In what sense do mappers 'send messages' to reducers?", back: "The emitted key acts as a destination address: every pair with that key is delivered to the same reducer invocation. The framework handles network transfer, retries, and partial failures, keeping that complexity out of application code." },
    { front: "What is a hot key and why is it a problem in MapReduce?", back: "A key with far more records than others, such as a celebrity's interactions. All its records go to one reducer, which becomes a straggler; because a job finishes only when every task finishes, downstream jobs wait too." },
    { front: "Compare how Pig, Crunch, and Hive handle skewed joins.", back: "Pig samples to find hot keys, then scatters hot-key records across random reducers and replicates the other side to them. Crunch does the same with hot keys listed by hand. Hive declares hot keys in metadata, stores them separately, and joins them map-side." },
    { front: "What preconditions does a broadcast hash join require, and how does it work?", back: "One input must fit in memory (or in a local read-only index). Each mapper over a block of the large input loads the whole small input into a hash table and probes it per record. No reducers, no sort. Pig calls it a replicated join, Hive a MapJoin." },
    { front: "When can a partitioned hash join replace a broadcast hash join?", back: "When both inputs are partitioned by the same key, with the same hash function and the same number of partitions. Each mapper then loads only its bucket of the smaller side, shrinking the hash table. Hive calls it a bucketed map join." },
    { front: "What additional property enables a map-side merge join, and why would you still run it as a separate job?", back: "Both inputs must be co-partitioned and sorted on the join key; a mapper can then merge them regardless of size. A separate map-only job is worthwhile when the sorted, partitioned datasets have other consumers too." },
    { front: "How does the choice between map-side and reduce-side join affect the output's layout?", back: "Reduce-side output comes out organized by the join key (partitioned and sorted on it). Map-side output keeps the partitioning and order of the large input, because map tasks were created per block of that input. Tools track this metadata in HCatalog and the Hive metastore." },
    { front: "What is the recommended way to get batch-computed results into a serving database?", back: "Build the database files inside the job and write them to the output directory, then bulk-load them into read-only stores (Voldemort, Terrapin, ElephantDB, HBase bulk load). Voldemort swaps atomically to the new files and can roll back because the old files remain." },
    { front: "Define human fault tolerance and explain why batch jobs have it while read-write databases do not.", back: "The ability to recover from buggy code by rerunning with fixed code or switching back to a previous output. Batch jobs keep inputs immutable and replace outputs wholesale; a database already mutated by bad writes is not fixed by rolling back the code." },
    { front: "Why did MapReduce's designers accept heavy disk writes and task-level retries?", back: "Google's mixed-use clusters preempt low-priority batch tasks (about 5% per task-hour, more than ten times the hardware failure rate) to raise utilization. With 100 ten-minute tasks a job has over a 50% chance of losing one, so rerunning whole jobs was impractical." },
    { front: "Contrast MPP databases and Hadoop along storage, processing model, and fault handling.", back: "MPP: data modeled on import, SQL only, abort-and-rerun queries, memory-centric. Hadoop: raw bytes in any format (schema-on-read, data lake), arbitrary code plus SQL, graph, and ML engines on one cluster, retry of failed tasks, disk-centric." },
    { front: "List three costs of fully materializing intermediate state between MapReduce jobs.", back: "A job cannot start until all upstream tasks, including stragglers, finish; mapper stages are often redundant rereads of reducer output; temporary data receives full HDFS replication it does not need." },
    { front: "What do dataflow engines (Spark, Tez, Flink) do differently from MapReduce?", back: "They run a whole workflow as one DAG of operators, sort only where required, fuse map work into upstream operators, keep intermediates in memory or on local disk, start operators as input arrives, schedule for locality, and reuse JVMs." },
    { front: "How do Spark and Flink recover lost intermediate data, and what property must operators have?", back: "They recompute it from data that still exists, using lineage (Spark RDDs) or operator checkpoints (Flink). Operators must be deterministic; otherwise the recomputed output may conflict with data downstream consumers already saw, forcing them to rerun too." },
    { front: "How does the Pregel model improve on running one MapReduce job per iteration of a graph algorithm?", back: "Vertices keep their state in memory between supersteps and process only the messages sent to them, so unchanged regions cost nothing. MapReduce would reread the whole graph and rewrite a complete output every iteration." },
    { front: "What guarantees does a Pregel implementation make about messages, and how is fault tolerance achieved?", back: "Messages sent in one superstep are delivered exactly once in the next despite network faults. Vertex state is checkpointed at iteration boundaries; recovery rolls back to the last checkpoint, or restores just the lost partition when the algorithm is deterministic and messages were logged." },
    { front: "Why do high-level declarative APIs make batch jobs faster, not merely shorter to write?", back: "Declared joins let cost-based optimizers choose join algorithms and reorder joins; declared filters and projections allow column pruning, vectorized inner loops, and code generation (Spark bytecode, Impala LLVM) instead of a function call per record." }
  ],
  quiz: [
    {
      question: "In the Unix pipeline for counting URL hits, what does the first `sort` provide that `uniq -c` depends on?",
      choices: [
        "It removes duplicate lines so that uniq only has to count",
        "It orders URLs by popularity so that head can truncate the list",
        "It makes identical URLs adjacent, because uniq only compares neighboring lines",
        "It splits each line into fields so that the URL can be extracted"
      ],
      answer: 2,
      explanation: "uniq detects repeats only among adjacent lines, so sorting must first group equal keys together. Ranking by popularity is the job of the second sort, field extraction is done by awk, and sort removes nothing."
    },
    {
      question: "A counting job has 50 million distinct keys and runs on a machine with 2 GB of RAM. Which approach is most likely to complete, and why?",
      choices: [
        "The sort-based pipeline, because GNU sort spills sorted runs to disk and merges them sequentially",
        "The in-memory hash table, because it needs only one entry per distinct key",
        "Either one; both have the same memory requirements",
        "Neither; a single machine cannot process this many keys"
      ],
      answer: 0,
      explanation: "50 million keys with their strings and counters exceed 2 GB, so the hash table thrashes or crashes, while external mergesort works within bounded memory using sequential I/O. A single machine can handle this volume; the two approaches differ precisely in how they use memory."
    },
    {
      question: "Which statement about the MapReduce shuffle is correct?",
      choices: [
        "Reducers push their input to mappers once mapping finishes",
        "Records are assigned to reducers at random to balance load",
        "Mapper output is written unsorted to HDFS and sorted by a central node",
        "Each mapper writes per-reducer sorted files locally; reducers pull them and merge while preserving order"
      ],
      answer: 3,
      explanation: "Mappers hash-partition and locally sort their output; reducers fetch their partition from every mapper and merge. Reducer assignment is deterministic by key hash, not random; mapper output goes to local disk, not HDFS; and there is no central sorting node."
    },
    {
      question: "Why does Hadoop MapReduce chain jobs through output and input directory names instead of streaming data directly between jobs?",
      choices: [
        "HDFS cannot store intermediate data",
        "Each job is independent to the framework, and its output is only valid once the whole job succeeds, so the next job must wait for a complete, durable dataset",
        "Pipes would be faster but cannot cross machine boundaries",
        "The reducer count of the next job must equal the mapper count of the previous one"
      ],
      answer: 1,
      explanation: "A job's output is all-or-nothing and only becomes valid on success; the framework knows nothing about workflows, so an external scheduler starts the next job afterward. HDFS stores intermediates fine, networked streaming is possible (dataflow engines do it), and there is no constraint tying reducer and mapper counts."
    },
    {
      question: "You need to join a 10 TB clickstream with a 50 MB table of country codes. Which join is most appropriate?",
      choices: [
        "Reduce-side sort-merge join, because it makes no assumptions about the inputs",
        "Partitioned hash join, because both inputs can be hashed by country",
        "Broadcast hash join, loading the country table into every mapper's memory",
        "Map-side merge join, after sorting both inputs by country code"
      ],
      answer: 2,
      explanation: "The small side fits easily in memory, so every mapper can load it and the shuffle is avoided entirely. A sort-merge join would shuffle 10 TB needlessly, a partitioned hash join requires both sides to be pre-partitioned identically, and a merge join would require a full sort of the large input first."
    },
    {
      question: "Two datasets were written by earlier jobs with 64 partitions each, hashed on order ID with the same hash function, but neither is sorted. What is the cheapest correct join?",
      choices: [
        "Partitioned hash join: each mapper loads its bucket of the smaller side and scans the matching bucket of the other",
        "Map-side merge join, reading both files in key order",
        "Broadcast hash join of the larger dataset",
        "Reduce-side join with a secondary sort"
      ],
      answer: 0,
      explanation: "Identical key, hash function, and partition count are exactly the preconditions for a bucketed hash join, with no sorting required. A merge join needs sorted inputs, broadcasting the large side is backwards, and a reduce-side join works but pays for a full shuffle."
    },
    {
      question: "A reducer handling a celebrity's follower events runs twenty times longer than the others. Which option would NOT help?",
      choices: [
        "Sampling to detect hot keys, then scattering their records across several reducers while replicating the other join side",
        "Declaring the hot keys in Hive table metadata so they are joined map-side",
        "A two-stage aggregation with random partial aggregates followed by a combining job",
        "Increasing the HDFS replication factor of the input files"
      ],
      answer: 3,
      explanation: "Replication factor affects durability and read locality, not how records are distributed among reducers. The other three are the chapter's skew remedies: Pig's skewed join, Hive's skewed join optimization, and two-stage grouping."
    },
    {
      question: "Why is writing to a production database directly from reducers considered bad practice, even when it works?",
      choices: [
        "HDFS does not allow outbound network connections",
        "It is slow per record, can overwhelm the database with parallel writes, and exposes partial or duplicated results from failed, retried, or speculative tasks",
        "Reducers cannot use client libraries because they are stateless",
        "The database would need to be partitioned identically to the reducers"
      ],
      answer: 1,
      explanation: "Per-record network calls throttle throughput, hundreds of concurrent tasks can degrade the production database, and external side effects escape MapReduce's all-or-nothing output guarantee. Nothing stops a reducer from opening connections or using libraries, and no partition alignment is required."
    },
    {
      question: "What was the main reason MapReduce was designed to tolerate frequent task termination?",
      choices: [
        "Commodity disks failed several times per hour",
        "HDFS replication was unreliable in early versions",
        "Low-priority batch tasks in Google's shared clusters were routinely preempted by production services to improve utilization",
        "Java processes crashed often under memory pressure"
      ],
      answer: 2,
      explanation: "Preemption hit roughly 5% of task-hours at Google, more than an order of magnitude above hardware failure rates, so task-level recovery was essential. Disks, HDFS replication, and JVM crashes were not the driving concern."
    },
    {
      question: "A Spark operator emits records by iterating over a hash map whose iteration order is unspecified. Why could this cause trouble after a node failure?",
      choices: [
        "Recomputed output may differ from the lost original, conflicting with data downstream operators already consumed and forcing them to rerun as well",
        "Spark cannot recompute operators that use hash maps",
        "The RDD lineage graph would become cyclic",
        "Hash maps cannot be serialized across the shuffle"
      ],
      answer: 0,
      explanation: "Recomputation from lineage assumes deterministic operators; nondeterministic ordering produces a different result than the one downstream operators saw, so they must be killed and rerun too. Spark can recompute any operator, lineage stays acyclic, and serialization is unrelated."
    },
    {
      question: "Which capability distinguishes the Pregel model from running one MapReduce job per iteration of a graph algorithm?",
      choices: [
        "Pregel reads the graph from HDFS more efficiently",
        "Pregel sorts vertices by ID between iterations",
        "Pregel allows vertices to query each other's state directly",
        "Vertices retain in-memory state across supersteps and only process newly received messages, so inactive parts of the graph cost nothing"
      ],
      answer: 3,
      explanation: "Persistent vertex state plus message-driven activation is what avoids rereading and rewriting the entire graph every round. Vertices communicate only by messages, never direct queries; there is no sorting step; and HDFS read efficiency is not the point."
    },
    {
      question: "How do dataflow engines approach MPP database performance while staying more flexible?",
      choices: [
        "By requiring all data to be loaded into a proprietary columnar format first",
        "By adding declarative operators that optimizers can exploit (join selection, column pruning, vectorized execution, code generation) while still allowing arbitrary code and formats",
        "By replacing all user code with SQL",
        "By materializing every intermediate result to HDFS for reuse"
      ],
      answer: 1,
      explanation: "Declarative pieces let cost-based optimizers and vectorized, code-generated inner loops do the heavy lifting, while callbacks keep the ability to run any library over any format. Proprietary formats and SQL-only interfaces would sacrifice the flexibility, and materializing everything is the slowdown they removed."
    }
  ],
  reviewQuestions: [
    "You maintain a nightly workflow of 40 MapReduce jobs that builds product recommendations, and straggler tasks keep making it miss its deadline. Diagnose which properties of the MapReduce execution model cause this, then explain what would change, and what new risks would appear, if you ported the same logic unchanged to Spark or Tez.",
    "Design the join strategy for a daily report that correlates 5 TB of ad-impression logs with a 20 GB advertiser table and a 300 MB campaign table. For each join, state which algorithm you would choose, which size or layout assumptions you rely on, how you would handle a handful of advertisers that account for 30% of all impressions, and how the output would be partitioned for the next job in the workflow.",
    "A team proposes having their batch job update the user-facing recommendations table row by row as results are computed, arguing that this avoids a separate bulk-load step. Argue against this using the chapter's philosophy of batch outputs, and describe the alternative pipeline end to end, including how you would roll back a bad run.",
    "Compare a Unix pipeline, a MapReduce workflow, and a dataflow engine along four dimensions: the uniform interface between stages, how intermediate state is handled, how faults are tolerated, and how easy it is to experiment. For each design choice, explain where it helps and where it hurts.",
    "Your company runs Hadoop on a dedicated cluster with no preemption. A colleague argues that MapReduce's disk-heavy design is therefore pointless and everything should move to in-memory Spark. Evaluate this claim: when does recomputation beat materialization, when is the reverse true, and what role does operator determinism play in the decision?"
  ]
});
