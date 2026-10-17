"""Domain exceptions for the work queue."""

from __future__ import annotations


class WorkQueueError(Exception):
    """Base exception for all work queue errors."""


class QueueFullError(WorkQueueError):
    """Raised when enqueue() is called while the queue is at maximum capacity."""


class DuplicateJobError(WorkQueueError, ValueError):
    """Raised when enqueue() is called with a job_id that already exists."""


class JobNotFoundError(WorkQueueError, KeyError):
    """Raised when an operation references an unknown job ID."""


class InvalidStateTransitionError(WorkQueueError):
    """Raised when an operation is not valid for the current state of a job."""


class ReservationExpiredError(InvalidStateTransitionError):
    """Raised when complete() or fail() is called on an expired reservation."""


class StaleLeaseError(InvalidStateTransitionError):
    """Raised when a lease token or worker ID does not match the active reservation."""
