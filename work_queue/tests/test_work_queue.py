"""Comprehensive test suite for InMemoryWorkQueue and SQLiteWorkQueue."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import unittest

from work_queue import (
    DuplicateJobError,
    InMemoryWorkQueue,
    InvalidStateTransitionError,
    JobNotFoundError,
    JobStatus,
    ManualClock,
    QueueConfig,
    QueueFullError,
    ReservationExpiredError,
    SQLiteWorkQueue,
    StaleLeaseError,
    WorkQueue,
)


class WorkQueueContractMixin:
    """Shared contract tests executed against every WorkQueue implementation."""

    clock: ManualClock

    def make_queue(
        self,
        *,
        retry_limit: int = 3,
        reservation_timeout: float = 30.0,
        max_capacity: int | None = None,
    ) -> WorkQueue:
        raise NotImplementedError

    def test_enqueue_reserve_complete_lifecycle(self) -> None:
        queue = self.make_queue(retry_limit=3, reservation_timeout=10.0)
        submitted = queue.enqueue({"task": "index-doc"}, job_id="job-1")
        self.assertEqual(submitted.job_id, "job-1")
        self.assertEqual(submitted.id, "job-1")
        self.assertEqual(submitted.status, JobStatus.PENDING)
        self.assertEqual(submitted.attempts, 0)

        reserved = queue.reserve(worker_id="worker-a")
        self.assertIsNotNone(reserved)
        assert reserved is not None
        self.assertEqual(reserved.job_id, "job-1")
        self.assertEqual(reserved.status, JobStatus.RESERVED)
        self.assertEqual(reserved.attempts, 1)
        self.assertEqual(reserved.worker_id, "worker-a")
        self.assertIsNotNone(reserved.lease_token)
        self.assertEqual(reserved.expires_at, self.clock.now() + 10.0)

        # Constraint 1: A reserved job must not be available to other workers simultaneously.
        self.assertIsNone(queue.reserve(worker_id="worker-b"))

        completed = queue.complete("job-1", reserved.lease_token)
        self.assertEqual(completed.status, JobStatus.COMPLETED)
        self.assertEqual(completed.attempts, 1)
        self.assertEqual(completed.completed_at, self.clock.now())

        # Constraint 2: A completed job must never be returned by reserve(), even after timeout.
        self.clock.advance(100.0)
        self.assertIsNone(queue.reserve(worker_id="worker-b"))
        self.assertEqual(queue.get_job("job-1").status, JobStatus.COMPLETED)

    def test_fail_retries_and_moves_to_dlq_when_exhausted(self) -> None:
        queue = self.make_queue(retry_limit=3, reservation_timeout=15.0)
        queue.enqueue("payload-data", job_id="job-retry")

        # Attempt 1 fails -> back to PENDING
        r1 = queue.reserve()
        assert r1 is not None
        self.assertEqual(r1.attempts, 1)
        f1 = queue.fail("job-retry", r1.lease_token, error="transient timeout 1")
        self.assertEqual(f1.status, JobStatus.PENDING)
        self.assertEqual(f1.remaining_attempts, 2)
        self.assertEqual(queue.dead_letter_queue(), [])

        # Attempt 2 fails -> back to PENDING
        r2 = queue.reserve()
        assert r2 is not None
        self.assertEqual(r2.attempts, 2)
        self.assertGreater(r2.lease_token or 0, r1.lease_token or 0)
        f2 = queue.fail("job-retry", r2.lease_token, error="transient timeout 2")
        self.assertEqual(f2.status, JobStatus.PENDING)
        self.assertEqual(f2.remaining_attempts, 1)
        self.assertEqual(queue.dead_letter_queue(), [])

        # Attempt 3 fails -> retry limit (3) exhausted -> moved to DEAD_LETTER
        r3 = queue.reserve()
        assert r3 is not None
        self.assertEqual(r3.attempts, 3)
        f3 = queue.fail("job-retry", r3.lease_token, error="permanent failure")
        self.assertEqual(f3.status, JobStatus.DEAD_LETTER)
        self.assertEqual(f3.remaining_attempts, 0)
        self.assertEqual(f3.last_error, "permanent failure")

        # Job in DLQ cannot be reserved again
        self.assertIsNone(queue.reserve())
        dlq = queue.dead_letter_queue()
        self.assertEqual(len(dlq), 1)
        self.assertEqual(dlq[0].job_id, "job-retry")
        self.assertEqual(dlq[0].attempts, 3)

    def test_reservation_timeout_makes_job_eligible_for_retry_then_dlq(self) -> None:
        queue = self.make_queue(retry_limit=2, reservation_timeout=20.0)
        queue.enqueue({"op": "resize"}, job_id="job-timeout")

        # Attempt 1 reserved at t=1000, expires at t=1020
        r1 = queue.reserve(worker_id="w1")
        assert r1 is not None
        self.assertEqual(r1.attempts, 1)

        # Just before timeout: still reserved, unavailable
        self.clock.advance(19.9)
        self.assertIsNone(queue.reserve(worker_id="w2"))

        # At exact timeout (t=1020): eligible for retry (Attempt 2)
        self.clock.advance(0.1)
        r2 = queue.reserve(worker_id="w2")
        assert r2 is not None
        self.assertEqual(r2.job_id, "job-timeout")
        self.assertEqual(r2.attempts, 2)
        self.assertEqual(r2.worker_id, "w2")

        # Let Attempt 2 also expire at t=1040 -> retry limit (2) is now exhausted!
        self.clock.advance(20.0)
        self.assertIsNone(queue.reserve(worker_id="w3"))

        # Verify job moved automatically to DLQ upon final timeout
        job = queue.get_job("job-timeout")
        self.assertEqual(job.status, JobStatus.DEAD_LETTER)
        self.assertEqual(job.attempts, 2)
        dlq = queue.dead_letter_queue()
        self.assertEqual([j.job_id for j in dlq], ["job-timeout"])

    def test_stale_worker_fencing_token_rejected_after_timeout(self) -> None:
        queue = self.make_queue(retry_limit=3, reservation_timeout=10.0)
        queue.enqueue("work", job_id="job-fence")

        # Worker 1 reserves job
        r1 = queue.reserve(worker_id="worker-1")
        assert r1 is not None

        # Reservation expires and Worker 2 reserves the job
        self.clock.advance(10.0)
        r2 = queue.reserve(worker_id="worker-2")
        assert r2 is not None
        self.assertNotEqual(r1.lease_token, r2.lease_token)

        # Slow Worker 1 tries to complete or fail using stale lease_token or worker_id
        with self.assertRaises(StaleLeaseError):
            queue.complete("job-fence", r1.lease_token)
        with self.assertRaises(StaleLeaseError):
            queue.fail("job-fence", r1.lease_token, error="late fail")
        with self.assertRaises(StaleLeaseError):
            queue.complete("job-fence", worker_id="worker-1")

        # Worker 2's reservation is still intact and can complete cleanly
        completed = queue.complete("job-fence", r2.lease_token, worker_id="worker-2")
        self.assertEqual(completed.status, JobStatus.COMPLETED)
        self.assertEqual(completed.attempts, 2)

    def test_complete_or_fail_after_timeout_without_re_reserve_raises_expired(self) -> None:
        queue = self.make_queue(retry_limit=2, reservation_timeout=10.0)
        queue.enqueue("work", job_id="job-exp")

        r1 = queue.reserve()
        assert r1 is not None

        self.clock.advance(15.0)
        with self.assertRaises(ReservationExpiredError):
            queue.complete("job-exp", r1.lease_token)

        # Job should now be PENDING (since 1 < retry_limit 2) and reservable
        self.assertEqual(queue.get_job("job-exp").status, JobStatus.PENDING)
        r2 = queue.reserve()
        assert r2 is not None
        self.assertEqual(r2.attempts, 2)

        # Let final attempt expire, then call fail() -> raises ReservationExpiredError and job is in DLQ
        self.clock.advance(15.0)
        with self.assertRaises(ReservationExpiredError):
            queue.fail("job-exp", r2.lease_token)
        self.assertEqual(queue.get_job("job-exp").status, JobStatus.DEAD_LETTER)

    def test_invalid_state_transitions_and_missing_jobs(self) -> None:
        queue = self.make_queue(retry_limit=1, reservation_timeout=10.0)
        queue.enqueue("item", job_id="j1")

        with self.assertRaises(DuplicateJobError):
            queue.enqueue("duplicate", job_id="j1")

        with self.assertRaises(JobNotFoundError):
            queue.get_job("non-existent")
        with self.assertRaises(JobNotFoundError):
            queue.complete("non-existent")
        with self.assertRaises(JobNotFoundError):
            queue.fail("non-existent")

        # Cannot complete or fail a PENDING job that was never reserved
        with self.assertRaises(InvalidStateTransitionError):
            queue.complete("j1")
        with self.assertRaises(InvalidStateTransitionError):
            queue.fail("j1")

        # Reserve and complete j1
        r1 = queue.reserve()
        assert r1 is not None
        queue.complete("j1", r1.lease_token)

        # Cannot complete or fail an already COMPLETED job
        with self.assertRaises(InvalidStateTransitionError):
            queue.complete("j1", r1.lease_token)
        with self.assertRaises(InvalidStateTransitionError):
            queue.fail("j1", r1.lease_token)

        # Enqueue j2, fail it into DLQ (retry_limit=1), verify cannot complete/fail afterwards
        queue.enqueue("item-2", job_id="j2")
        r2 = queue.reserve()
        assert r2 is not None
        queue.fail("j2", r2.lease_token)
        self.assertEqual(queue.get_job("j2").status, JobStatus.DEAD_LETTER)

        with self.assertRaises(InvalidStateTransitionError):
            queue.complete("j2")
        with self.assertRaises(InvalidStateTransitionError):
            queue.fail("j2")

    def test_queue_capacity_enforcement_and_release_on_terminal_states(self) -> None:
        queue = self.make_queue(retry_limit=2, reservation_timeout=10.0, max_capacity=2)
        queue.enqueue("a", job_id="j1")
        queue.enqueue("b", job_id="j2")

        with self.assertRaises(QueueFullError):
            queue.enqueue("c", job_id="j3")

        # Reserving and failing j1 (retry) keeps it active (PENDING), capacity still full
        r1 = queue.reserve()
        assert r1 is not None
        with self.assertRaises(QueueFullError):
            queue.enqueue("c", job_id="j3")
        queue.fail(r1.job_id, r1.lease_token)
        with self.assertRaises(QueueFullError):
            queue.enqueue("c", job_id="j3")

        # Completing j2 frees one active slot
        r2 = queue.reserve()
        assert r2 is not None
        queue.complete(r2.job_id, r2.lease_token)

        queue.enqueue("c", job_id="j3")
        self.assertEqual(queue.stats().active, 2)

        # Letting j1 expire on its 2nd (final) attempt moves j1 to DLQ and frees capacity
        r1_retry = queue.reserve()
        assert r1_retry is not None
        self.assertEqual(r1_retry.job_id, "j1")
        self.clock.advance(10.0)

        # Enqueue should reap expired j1 -> DEAD_LETTER and admit j4
        queue.enqueue("d", job_id="j4")
        stats = queue.stats()
        self.assertEqual(stats.active, 2)
        self.assertEqual(stats.completed, 1)
        self.assertEqual(stats.dead_letter, 1)

    def test_fifo_ordering(self) -> None:
        queue = self.make_queue(retry_limit=3, reservation_timeout=10.0)
        for i in range(5):
            queue.enqueue(i, job_id=f"job-{i}")

        reserved_ids = []
        while (job := queue.reserve()) is not None:
            reserved_ids.append(job.job_id)
            queue.complete(job.job_id, job.lease_token)

        self.assertEqual(reserved_ids, ["job-0", "job-1", "job-2", "job-3", "job-4"])

    def test_concurrent_workers_invariants(self) -> None:
        queue = self.make_queue(retry_limit=3, reservation_timeout=60.0)
        num_jobs = 60
        for i in range(num_jobs):
            # Poison jobs: multiples of 5 always fail; others succeed on 2nd attempt
            queue.enqueue({"index": i}, job_id=f"job-{i}")

        active_leases_lock = threading.Lock()
        currently_processing: set[str] = set()
        overlap_violations: list[str] = []
        completed_executions: list[str] = []

        def worker_fn(worker_idx: int) -> None:
            worker_name = f"worker-{worker_idx}"
            while True:
                job = queue.reserve(worker_id=worker_name)
                if job is None:
                    stats = queue.stats()
                    if stats.active == 0:
                        break
                    continue

                with active_leases_lock:
                    if job.job_id in currently_processing:
                        overlap_violations.append(job.job_id)
                    currently_processing.add(job.job_id)

                try:
                    idx = job.payload["index"]
                    if idx % 5 == 0:
                        queue.fail(job.job_id, job.lease_token, error="poison job")
                    elif job.attempts == 1:
                        queue.fail(job.job_id, job.lease_token, error="flaky first try")
                    else:
                        queue.complete(job.job_id, job.lease_token)
                        with active_leases_lock:
                            completed_executions.append(job.job_id)
                finally:
                    with active_leases_lock:
                        currently_processing.discard(job.job_id)

        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(worker_fn, i) for i in range(8)]
            for f in futures:
                f.result()

        self.assertEqual(overlap_violations, [])
        stats = queue.stats()
        expected_dlq = num_jobs // 5  # 12 poison jobs
        expected_completed = num_jobs - expected_dlq  # 48 jobs
        self.assertEqual(stats.pending, 0)
        self.assertEqual(stats.reserved, 0)
        self.assertEqual(stats.completed, expected_completed)
        self.assertEqual(stats.dead_letter, expected_dlq)
        # Ensure no job was completed more than once
        self.assertEqual(len(completed_executions), len(set(completed_executions)))


class TestInMemoryWorkQueue(WorkQueueContractMixin, unittest.TestCase):
    """Run all contract tests against InMemoryWorkQueue."""

    def setUp(self) -> None:
        self.clock = ManualClock(1000.0)

    def make_queue(
        self,
        *,
        retry_limit: int = 3,
        reservation_timeout: float = 30.0,
        max_capacity: int | None = None,
    ) -> WorkQueue:
        return InMemoryWorkQueue(
            retry_limit=retry_limit,
            reservation_timeout=reservation_timeout,
            max_capacity=max_capacity,
            clock=self.clock,
        )


class TestSQLiteWorkQueue(WorkQueueContractMixin, unittest.TestCase):
    """Run all contract tests against SQLiteWorkQueue."""

    def setUp(self) -> None:
        self.clock = ManualClock(1000.0)
        self._queues: list[SQLiteWorkQueue] = []

    def tearDown(self) -> None:
        for q in self._queues:
            q.close()

    def make_queue(
        self,
        *,
        retry_limit: int = 3,
        reservation_timeout: float = 30.0,
        max_capacity: int | None = None,
    ) -> WorkQueue:
        queue = SQLiteWorkQueue(
            db_path=":memory:",
            retry_limit=retry_limit,
            reservation_timeout=reservation_timeout,
            max_capacity=max_capacity,
            clock=self.clock,
        )
        self._queues.append(queue)
        return queue

    def test_file_backed_persistence_and_multi_instance_concurrency(self) -> None:
        clock = ManualClock(2000.0)
        with tempfile.TemporaryDirectory() as tmpdir:
            db_file = Path(tmpdir) / "work_queue.db"
            producer = SQLiteWorkQueue(
                db_path=db_file,
                retry_limit=2,
                reservation_timeout=15.0,
                clock=clock,
            )
            try:
                for i in range(20):
                    producer.enqueue({"item": i}, job_id=f"p-{i}")
            finally:
                producer.close()

            # Spawn 4 separate SQLiteWorkQueue instances on the same db_file
            def run_consumer(worker_id: int) -> int:
                consumer = SQLiteWorkQueue(
                    db_path=db_file,
                    retry_limit=2,
                    reservation_timeout=15.0,
                    clock=clock,
                )
                processed = 0
                try:
                    while (job := consumer.reserve(worker_id=f"c-{worker_id}")) is not None:
                        if job.payload["item"] % 4 == 0:
                            consumer.fail(job.job_id, job.lease_token, error="fail")
                        else:
                            consumer.complete(job.job_id, job.lease_token)
                            processed += 1
                    return processed
                finally:
                    consumer.close()

            with ThreadPoolExecutor(max_workers=4) as pool:
                counts = list(pool.map(run_consumer, range(4)))

            inspector = SQLiteWorkQueue(db_path=db_file, clock=clock)
            try:
                stats = inspector.stats()
                self.assertEqual(sum(counts), 15)
                self.assertEqual(stats.completed, 15)
                self.assertEqual(stats.dead_letter, 5)
                self.assertEqual(stats.active, 0)
            finally:
                inspector.close()


class TestQueueConfigValidation(unittest.TestCase):
    """Test configuration validation rules."""

    def test_invalid_config_values_raise_value_error(self) -> None:
        with self.assertRaises(ValueError):
            QueueConfig(retry_limit=0)
        with self.assertRaises(ValueError):
            QueueConfig(reservation_timeout=0)
        with self.assertRaises(ValueError):
            QueueConfig(reservation_timeout=-5.0)
        with self.assertRaises(ValueError):
            QueueConfig(max_capacity=0)


if __name__ == "__main__":
    unittest.main()
