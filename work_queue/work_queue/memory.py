"""Thread-safe in-memory work queue implementation."""

from __future__ import annotations

from heapq import heappop, heappush
import threading
from typing import Any
import uuid

from .base import Clock, WorkQueue
from .exceptions import DuplicateJobError, JobNotFoundError, QueueFullError
from .models import Job, JobStatus, QueueConfig, QueueStats


class InMemoryWorkQueue(WorkQueue):
    """Thread-safe in-memory work queue using min-heaps for scheduling and expiry."""

    def __init__(
        self,
        config: QueueConfig | None = None,
        *,
        retry_limit: int = 3,
        reservation_timeout: float = 30.0,
        max_capacity: int | None = None,
        clock: Clock | None = None,
    ) -> None:
        super().__init__(
            config,
            retry_limit=retry_limit,
            reservation_timeout=reservation_timeout,
            max_capacity=max_capacity,
            clock=clock,
        )
        self._lock = threading.RLock()
        self._jobs: dict[str, Job] = {}
        self._pending_heap: list[tuple[float, int, str]] = []
        self._expiry_heap: list[tuple[float, int, str]] = []
        self._counts: dict[JobStatus, int] = {status: 0 for status in JobStatus}
        self._sequence: int = 0
        self._lease_counter: int = 0

    def _next_sequence(self) -> int:
        self._sequence += 1
        return self._sequence

    def _next_lease_token(self) -> int:
        self._lease_counter += 1
        return self._lease_counter

    def _store_job_locked(self, job: Job) -> None:
        previous = self._jobs.get(job.job_id)
        if previous is not None:
            self._counts[previous.status] -= 1
        self._counts[job.status] += 1
        self._jobs[job.job_id] = job

        if job.status == JobStatus.PENDING:
            heappush(self._pending_heap, (job.available_at, job.sequence, job.job_id))
        elif (
            job.status == JobStatus.RESERVED
            and job.expires_at is not None
            and job.lease_token is not None
        ):
            heappush(self._expiry_heap, (job.expires_at, job.lease_token, job.job_id))

    def _reap_expired_locked(self, now: float) -> list[Job]:
        transitioned: list[Job] = []
        while self._expiry_heap and self._expiry_heap[0][0] <= now:
            _, lease_token, job_id = heappop(self._expiry_heap)
            job = self._jobs.get(job_id)
            if (
                job is None
                or job.status != JobStatus.RESERVED
                or job.lease_token != lease_token
            ):
                continue
            expired_job = job.expire(now=now, next_sequence=self._next_sequence())
            self._store_job_locked(expired_job)
            transitioned.append(expired_job)
        return transitioned

    def _active_count_locked(self) -> int:
        return self._counts[JobStatus.PENDING] + self._counts[JobStatus.RESERVED]

    def _require_job_locked(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(f"Job '{job_id}' does not exist.")
        return job

    def enqueue(
        self,
        payload: Any,
        *,
        job_id: str | None = None,
        retry_limit: int | None = None,
        reservation_timeout: float | None = None,
    ) -> Job:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)

            resolved_id = job_id if job_id is not None else uuid.uuid4().hex
            if resolved_id in self._jobs:
                raise DuplicateJobError(f"Job '{resolved_id}' already exists.")

            max_cap = self._config.max_capacity
            if max_cap is not None and self._active_count_locked() >= max_cap:
                raise QueueFullError(
                    f"Queue capacity of {max_cap} active jobs has been reached."
                )

            job = Job(
                job_id=resolved_id,
                payload=payload,
                status=JobStatus.PENDING,
                attempts=0,
                retry_limit=(
                    retry_limit
                    if retry_limit is not None
                    else self._config.retry_limit
                ),
                reservation_timeout=(
                    reservation_timeout
                    if reservation_timeout is not None
                    else self._config.reservation_timeout
                ),
                created_at=now,
                available_at=now,
                sequence=self._next_sequence(),
            )
            self._store_job_locked(job)
            return job

    def reserve(self, worker_id: str | None = None) -> Job | None:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)

            while self._pending_heap:
                _, sequence, job_id = heappop(self._pending_heap)
                job = self._jobs.get(job_id)
                if (
                    job is None
                    or job.status != JobStatus.PENDING
                    or job.sequence != sequence
                ):
                    continue
                reserved_job = job.reserve(
                    now=now,
                    lease_token=self._next_lease_token(),
                    worker_id=worker_id,
                )
                self._store_job_locked(reserved_job)
                return reserved_job
            return None

    def complete(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        worker_id: str | None = None,
    ) -> Job:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)
            job = self._require_job_locked(job_id)
            completed_job = job.complete(
                now=now,
                lease_token=lease_token,
                worker_id=worker_id,
            )
            self._store_job_locked(completed_job)
            return completed_job

    def fail(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        error: str | None = None,
        worker_id: str | None = None,
    ) -> Job:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)
            job = self._require_job_locked(job_id)
            failed_job = job.fail(
                now=now,
                next_sequence=self._next_sequence(),
                error=error,
                lease_token=lease_token,
                worker_id=worker_id,
            )
            self._store_job_locked(failed_job)
            return failed_job

    def get_job(self, job_id: str) -> Job:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)
            return self._require_job_locked(job_id)

    def dead_letter_queue(self) -> list[Job]:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)
            dlq_jobs = [
                job
                for job in self._jobs.values()
                if job.status == JobStatus.DEAD_LETTER
            ]
            dlq_jobs.sort(key=lambda j: (j.dead_lettered_at or 0.0, j.sequence))
            return dlq_jobs

    def stats(self) -> QueueStats:
        with self._lock:
            now = self._clock()
            self._reap_expired_locked(now)
            return QueueStats(
                pending=self._counts[JobStatus.PENDING],
                reserved=self._counts[JobStatus.RESERVED],
                completed=self._counts[JobStatus.COMPLETED],
                dead_letter=self._counts[JobStatus.DEAD_LETTER],
            )

    def reap_expired(self) -> list[Job]:
        with self._lock:
            now = self._clock()
            return self._reap_expired_locked(now)
