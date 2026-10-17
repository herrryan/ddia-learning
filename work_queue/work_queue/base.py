"""Abstract contract and clock utilities for work queue implementations."""

from __future__ import annotations

from abc import ABC, abstractmethod
import threading
import time
from typing import Any, Callable

from .models import Job, QueueConfig, QueueStats

Clock = Callable[[], float]


class ManualClock:
    """Thread-safe controllable monotonic clock for deterministic testing."""

    def __init__(self, initial: float = 1000.0) -> None:
        self._lock = threading.Lock()
        self._now = float(initial)

    def __call__(self) -> float:
        with self._lock:
            return self._now

    def now(self) -> float:
        """Return current timestamp."""
        return self()

    def advance(self, seconds: float) -> float:
        """Advance the clock by a non-negative duration in seconds."""
        if seconds < 0:
            raise ValueError("Cannot advance ManualClock by a negative duration.")
        with self._lock:
            self._now += float(seconds)
            return self._now

    def set(self, timestamp: float) -> None:
        """Set the clock to an explicit timestamp."""
        with self._lock:
            self._now = float(timestamp)


class WorkQueue(ABC):
    """Abstract base class defining the work queue lifecycle contract."""

    def __init__(
        self,
        config: QueueConfig | None = None,
        *,
        retry_limit: int = 3,
        reservation_timeout: float = 30.0,
        max_capacity: int | None = None,
        clock: Clock | None = None,
    ) -> None:
        self._config = config or QueueConfig(
            retry_limit=retry_limit,
            reservation_timeout=reservation_timeout,
            max_capacity=max_capacity,
        )
        self._clock: Clock = clock or time.monotonic

    @property
    def config(self) -> QueueConfig:
        """Return the queue configuration."""
        return self._config

    @abstractmethod
    def enqueue(
        self,
        payload: Any,
        *,
        job_id: str | None = None,
        retry_limit: int | None = None,
        reservation_timeout: float | None = None,
    ) -> Job:
        """Submit a new job to the queue."""

    def submit(
        self,
        payload: Any,
        *,
        job_id: str | None = None,
        retry_limit: int | None = None,
        reservation_timeout: float | None = None,
    ) -> Job:
        """Alias for enqueue()."""
        return self.enqueue(
            payload,
            job_id=job_id,
            retry_limit=retry_limit,
            reservation_timeout=reservation_timeout,
        )

    @abstractmethod
    def reserve(self, worker_id: str | None = None) -> Job | None:
        """Claim the next eligible pending job for processing."""

    @abstractmethod
    def complete(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        worker_id: str | None = None,
    ) -> Job:
        """Mark a reserved job as completed."""

    @abstractmethod
    def fail(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        error: str | None = None,
        worker_id: str | None = None,
    ) -> Job:
        """Report a failed processing attempt for a reserved job."""

    @abstractmethod
    def get_job(self, job_id: str) -> Job:
        """Return the current state of a job by ID."""

    @abstractmethod
    def dead_letter_queue(self) -> list[Job]:
        """Return all jobs currently in the dead-letter queue."""

    def list_dlq(self) -> list[Job]:
        """Alias for dead_letter_queue()."""
        return self.dead_letter_queue()

    @abstractmethod
    def stats(self) -> QueueStats:
        """Return point-in-time counts of jobs by state."""

    @abstractmethod
    def reap_expired(self) -> list[Job]:
        """Reconcile all expired reservations and return the transitioned jobs."""
