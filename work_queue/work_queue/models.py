"""Domain models and state machine rules for the work queue."""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from typing import Any

from .exceptions import (
    InvalidStateTransitionError,
    ReservationExpiredError,
    StaleLeaseError,
)


class JobStatus(str, Enum):
    """Lifecycle states of a job in the work queue."""

    PENDING = "PENDING"
    RESERVED = "RESERVED"
    COMPLETED = "COMPLETED"
    DEAD_LETTER = "DEAD_LETTER"


@dataclass(frozen=True, slots=True)
class QueueConfig:
    """Configuration parameters for a work queue."""

    retry_limit: int = 3
    reservation_timeout: float = 30.0
    max_capacity: int | None = None

    def __post_init__(self) -> None:
        if self.retry_limit < 1:
            raise ValueError("retry_limit must be at least 1.")
        if self.reservation_timeout <= 0:
            raise ValueError("reservation_timeout must be greater than 0.")
        if self.max_capacity is not None and self.max_capacity < 1:
            raise ValueError("max_capacity must be at least 1 when specified.")


@dataclass(frozen=True, slots=True)
class QueueStats:
    """Point-in-time counts of jobs by lifecycle state."""

    pending: int
    reserved: int
    completed: int
    dead_letter: int

    @property
    def active(self) -> int:
        """Number of jobs occupying active queue capacity (PENDING + RESERVED)."""
        return self.pending + self.reserved

    @property
    def total(self) -> int:
        """Total number of tracked jobs across all states."""
        return self.pending + self.reserved + self.completed + self.dead_letter


@dataclass(frozen=True, slots=True)
class Job:
    """Immutable snapshot of a job and its lifecycle state machine."""

    job_id: str
    payload: Any
    status: JobStatus = JobStatus.PENDING
    attempts: int = 0
    retry_limit: int = 3
    reservation_timeout: float = 30.0
    created_at: float = 0.0
    available_at: float = 0.0
    sequence: int = 0
    lease_token: int | None = None
    worker_id: str | None = None
    reserved_at: float | None = None
    expires_at: float | None = None
    completed_at: float | None = None
    dead_lettered_at: float | None = None
    last_error: str | None = None
    last_expired_token: int | None = None

    def __post_init__(self) -> None:
        if not self.job_id:
            raise ValueError("job_id must be a non-empty string.")
        if self.retry_limit < 1:
            raise ValueError("retry_limit must be at least 1.")
        if self.reservation_timeout <= 0:
            raise ValueError("reservation_timeout must be greater than 0.")

    @property
    def id(self) -> str:
        """Alias for job_id."""
        return self.job_id

    @property
    def remaining_attempts(self) -> int:
        """Number of remaining attempts before the job is moved to the DLQ."""
        return max(0, self.retry_limit - self.attempts)

    @property
    def is_terminal(self) -> bool:
        """True if the job is COMPLETED or in DEAD_LETTER."""
        return self.status in (JobStatus.COMPLETED, JobStatus.DEAD_LETTER)

    def is_expired(self, now: float) -> bool:
        """Return True if the job holds a reservation that has expired at `now`."""
        return (
            self.status == JobStatus.RESERVED
            and self.expires_at is not None
            and now >= self.expires_at
        )

    def expire(self, now: float, next_sequence: int) -> Job:
        """Transition an expired RESERVED job to PENDING or DEAD_LETTER."""
        if not self.is_expired(now):
            raise InvalidStateTransitionError(
                f"Job '{self.job_id}' does not have an expired reservation."
            )
        expired_at = self.expires_at if self.expires_at is not None else now
        timeout_error = self.last_error or "Reservation timed out."
        if self.attempts < self.retry_limit:
            return replace(
                self,
                status=JobStatus.PENDING,
                available_at=expired_at,
                sequence=next_sequence,
                lease_token=None,
                worker_id=None,
                reserved_at=None,
                expires_at=None,
                last_error=timeout_error,
                last_expired_token=self.lease_token,
            )
        return replace(
            self,
            status=JobStatus.DEAD_LETTER,
            dead_lettered_at=expired_at,
            lease_token=None,
            worker_id=None,
            reserved_at=None,
            expires_at=None,
            last_error=timeout_error,
            last_expired_token=self.lease_token,
        )

    def reserve(
        self,
        now: float,
        lease_token: int,
        worker_id: str | None = None,
    ) -> Job:
        """Claim a PENDING job for processing by a worker."""
        if self.status != JobStatus.PENDING:
            raise InvalidStateTransitionError(
                f"Cannot reserve job '{self.job_id}' in state {self.status.value}."
            )
        return replace(
            self,
            status=JobStatus.RESERVED,
            attempts=self.attempts + 1,
            lease_token=lease_token,
            worker_id=worker_id,
            reserved_at=now,
            expires_at=now + self.reservation_timeout,
        )

    def _validate_active_lease(
        self,
        lease_token: int | None,
        worker_id: str | None,
    ) -> None:
        if self.status == JobStatus.COMPLETED:
            raise InvalidStateTransitionError(
                f"Job '{self.job_id}' is already COMPLETED."
            )
        if self.status == JobStatus.DEAD_LETTER:
            if self.last_expired_token is not None and (
                lease_token is None or lease_token == self.last_expired_token
            ):
                raise ReservationExpiredError(
                    f"Reservation for job '{self.job_id}' expired and exhausted retry limit."
                )
            if lease_token is not None:
                raise StaleLeaseError(
                    f"Lease token {lease_token} is no longer active for dead-lettered job '{self.job_id}'."
                )
            raise InvalidStateTransitionError(
                f"Job '{self.job_id}' is in DEAD_LETTER."
            )
        if self.status == JobStatus.PENDING:
            if self.last_expired_token is not None and (
                lease_token is None or lease_token == self.last_expired_token
            ):
                raise ReservationExpiredError(
                    f"Reservation for job '{self.job_id}' has expired."
                )
            if lease_token is not None:
                raise StaleLeaseError(
                    f"Lease token {lease_token} is stale for pending job '{self.job_id}'."
                )
            raise InvalidStateTransitionError(
                f"Job '{self.job_id}' is PENDING and not currently reserved."
            )

        if lease_token is not None and lease_token != self.lease_token:
            raise StaleLeaseError(
                f"Stale lease token {lease_token} for job '{self.job_id}' "
                f"(active token: {self.lease_token})."
            )
        if (
            worker_id is not None
            and self.worker_id is not None
            and worker_id != self.worker_id
        ):
            raise StaleLeaseError(
                f"Worker '{worker_id}' does not own reservation for job '{self.job_id}' "
                f"(owner: '{self.worker_id}')."
            )

    def complete(
        self,
        now: float,
        lease_token: int | None = None,
        worker_id: str | None = None,
    ) -> Job:
        """Mark an actively RESERVED job as COMPLETED."""
        self._validate_active_lease(lease_token=lease_token, worker_id=worker_id)
        return replace(
            self,
            status=JobStatus.COMPLETED,
            completed_at=now,
            lease_token=None,
            worker_id=None,
            reserved_at=None,
            expires_at=None,
            last_expired_token=None,
        )

    def fail(
        self,
        now: float,
        next_sequence: int,
        error: str | None = None,
        lease_token: int | None = None,
        worker_id: str | None = None,
    ) -> Job:
        """Record a failed attempt and transition to PENDING or DEAD_LETTER."""
        self._validate_active_lease(lease_token=lease_token, worker_id=worker_id)
        failure_reason = error if error is not None else self.last_error
        if self.attempts < self.retry_limit:
            return replace(
                self,
                status=JobStatus.PENDING,
                available_at=now,
                sequence=next_sequence,
                lease_token=None,
                worker_id=None,
                reserved_at=None,
                expires_at=None,
                last_error=failure_reason,
                last_expired_token=None,
            )
        return replace(
            self,
            status=JobStatus.DEAD_LETTER,
            dead_lettered_at=now,
            lease_token=None,
            worker_id=None,
            reserved_at=None,
            expires_at=None,
            last_error=failure_reason,
            last_expired_token=None,
        )
