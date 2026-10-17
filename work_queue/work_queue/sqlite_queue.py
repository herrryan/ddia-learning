"""Persistent transactional SQLite work queue implementation."""

from __future__ import annotations

from contextlib import contextmanager
import json
from pathlib import Path
import pickle
import sqlite3
import threading
from typing import Any, Iterator
import uuid

from .base import Clock, WorkQueue
from .exceptions import (
    DuplicateJobError,
    JobNotFoundError,
    QueueFullError,
    WorkQueueError,
)
from .models import Job, JobStatus, QueueConfig, QueueStats


class SQLiteWorkQueue(WorkQueue):
    """Persistent work queue backed by SQLite with BEGIN IMMEDIATE transactions."""

    def __init__(
        self,
        db_path: str | Path = ":memory:",
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
        self._db_path = str(db_path)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            self._db_path,
            timeout=30.0,
            isolation_level=None,
            check_same_thread=False,
        )
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute("PRAGMA busy_timeout = 30000")
            if self._db_path != ":memory:":
                self._conn.execute("PRAGMA journal_mode = WAL")
            self._conn.execute("PRAGMA synchronous = NORMAL")
            with self._transaction():
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS queue_meta (
                        key TEXT PRIMARY KEY,
                        value INTEGER NOT NULL
                    )
                    """
                )
                self._conn.execute(
                    """
                    INSERT OR IGNORE INTO queue_meta (key, value)
                    VALUES ('sequence', 0), ('lease_counter', 0)
                    """
                )
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                        job_id TEXT PRIMARY KEY,
                        payload_data TEXT NOT NULL,
                        payload_encoding TEXT NOT NULL,
                        status TEXT NOT NULL,
                        attempts INTEGER NOT NULL,
                        retry_limit INTEGER NOT NULL,
                        reservation_timeout REAL NOT NULL,
                        created_at REAL NOT NULL,
                        available_at REAL NOT NULL,
                        sequence INTEGER NOT NULL,
                        lease_token INTEGER,
                        worker_id TEXT,
                        reserved_at REAL,
                        expires_at REAL,
                        completed_at REAL,
                        dead_lettered_at REAL,
                        last_error TEXT,
                        last_expired_token INTEGER
                    )
                    """
                )
                self._conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_jobs_pending_schedule
                    ON jobs (status, available_at, sequence)
                    """
                )
                self._conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_jobs_reserved_expiry
                    ON jobs (status, expires_at)
                    """
                )

    @contextmanager
    def _transaction(self) -> Iterator[None]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield
            except WorkQueueError:
                self._conn.execute("COMMIT")
                raise
            except Exception:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def close(self) -> None:
        """Close the underlying SQLite connection."""
        with self._lock:
            self._conn.close()

    def _next_counter_in_tx(self, key: str) -> int:
        row = self._conn.execute(
            """
            UPDATE queue_meta
            SET value = value + 1
            WHERE key = ?
            RETURNING value
            """,
            (key,),
        ).fetchone()
        return int(row["value"])

    @staticmethod
    def _encode_payload(payload: Any) -> tuple[str, str]:
        try:
            return json.dumps(payload), "json"
        except (TypeError, OverflowError):
            return pickle.dumps(payload).hex(), "pickle"

    @staticmethod
    def _decode_payload(data: str, encoding: str) -> Any:
        if encoding == "json":
            return json.loads(data)
        return pickle.loads(bytes.fromhex(data))

    @classmethod
    def _row_to_job(cls, row: sqlite3.Row) -> Job:
        return Job(
            job_id=row["job_id"],
            payload=cls._decode_payload(row["payload_data"], row["payload_encoding"]),
            status=JobStatus(row["status"]),
            attempts=int(row["attempts"]),
            retry_limit=int(row["retry_limit"]),
            reservation_timeout=float(row["reservation_timeout"]),
            created_at=float(row["created_at"]),
            available_at=float(row["available_at"]),
            sequence=int(row["sequence"]),
            lease_token=(
                int(row["lease_token"]) if row["lease_token"] is not None else None
            ),
            worker_id=row["worker_id"],
            reserved_at=(
                float(row["reserved_at"]) if row["reserved_at"] is not None else None
            ),
            expires_at=(
                float(row["expires_at"]) if row["expires_at"] is not None else None
            ),
            completed_at=(
                float(row["completed_at"]) if row["completed_at"] is not None else None
            ),
            dead_lettered_at=(
                float(row["dead_lettered_at"])
                if row["dead_lettered_at"] is not None
                else None
            ),
            last_error=row["last_error"],
            last_expired_token=(
                int(row["last_expired_token"])
                if row["last_expired_token"] is not None
                else None
            ),
        )

    def _save_job_in_tx(self, job: Job) -> None:
        payload_data, payload_encoding = self._encode_payload(job.payload)
        self._conn.execute(
            """
            INSERT INTO jobs (
                job_id, payload_data, payload_encoding, status, attempts,
                retry_limit, reservation_timeout, created_at, available_at,
                sequence, lease_token, worker_id, reserved_at, expires_at,
                completed_at, dead_lettered_at, last_error, last_expired_token
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                status = excluded.status,
                attempts = excluded.attempts,
                available_at = excluded.available_at,
                sequence = excluded.sequence,
                lease_token = excluded.lease_token,
                worker_id = excluded.worker_id,
                reserved_at = excluded.reserved_at,
                expires_at = excluded.expires_at,
                completed_at = excluded.completed_at,
                dead_lettered_at = excluded.dead_lettered_at,
                last_error = excluded.last_error,
                last_expired_token = excluded.last_expired_token
            """,
            (
                job.job_id,
                payload_data,
                payload_encoding,
                job.status.value,
                job.attempts,
                job.retry_limit,
                job.reservation_timeout,
                job.created_at,
                job.available_at,
                job.sequence,
                job.lease_token,
                job.worker_id,
                job.reserved_at,
                job.expires_at,
                job.completed_at,
                job.dead_lettered_at,
                job.last_error,
                job.last_expired_token,
            ),
        )

    def _reap_expired_in_tx(self, now: float) -> list[Job]:
        rows = self._conn.execute(
            """
            SELECT * FROM jobs
            WHERE status = ? AND expires_at <= ?
            ORDER BY expires_at ASC, sequence ASC
            """,
            (JobStatus.RESERVED.value, now),
        ).fetchall()
        transitioned: list[Job] = []
        for row in rows:
            job = self._row_to_job(row)
            expired_job = job.expire(
                now=now,
                next_sequence=self._next_counter_in_tx("sequence"),
            )
            self._save_job_in_tx(expired_job)
            transitioned.append(expired_job)
        return transitioned

    def _require_job_in_tx(self, job_id: str) -> Job:
        row = self._conn.execute(
            "SELECT * FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if row is None:
            raise JobNotFoundError(f"Job '{job_id}' does not exist.")
        return self._row_to_job(row)

    def _active_count_in_tx(self) -> int:
        row = self._conn.execute(
            """
            SELECT COUNT(*) AS cnt FROM jobs
            WHERE status IN (?, ?)
            """,
            (JobStatus.PENDING.value, JobStatus.RESERVED.value),
        ).fetchone()
        return int(row["cnt"])

    def enqueue(
        self,
        payload: Any,
        *,
        job_id: str | None = None,
        retry_limit: int | None = None,
        reservation_timeout: float | None = None,
    ) -> Job:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)

            resolved_id = job_id if job_id is not None else uuid.uuid4().hex
            existing = self._conn.execute(
                "SELECT 1 FROM jobs WHERE job_id = ?",
                (resolved_id,),
            ).fetchone()
            if existing is not None:
                raise DuplicateJobError(f"Job '{resolved_id}' already exists.")

            max_cap = self._config.max_capacity
            if max_cap is not None and self._active_count_in_tx() >= max_cap:
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
                sequence=self._next_counter_in_tx("sequence"),
            )
            self._save_job_in_tx(job)
            return job

    def reserve(self, worker_id: str | None = None) -> Job | None:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)

            row = self._conn.execute(
                """
                SELECT * FROM jobs
                WHERE status = ?
                ORDER BY available_at ASC, sequence ASC
                LIMIT 1
                """,
                (JobStatus.PENDING.value,),
            ).fetchone()
            if row is None:
                return None

            job = self._row_to_job(row)
            reserved_job = job.reserve(
                now=now,
                lease_token=self._next_counter_in_tx("lease_counter"),
                worker_id=worker_id,
            )
            self._save_job_in_tx(reserved_job)
            return reserved_job

    def complete(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        worker_id: str | None = None,
    ) -> Job:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)
            job = self._require_job_in_tx(job_id)
            completed_job = job.complete(
                now=now,
                lease_token=lease_token,
                worker_id=worker_id,
            )
            self._save_job_in_tx(completed_job)
            return completed_job

    def fail(
        self,
        job_id: str,
        lease_token: int | None = None,
        *,
        error: str | None = None,
        worker_id: str | None = None,
    ) -> Job:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)
            job = self._require_job_in_tx(job_id)
            failed_job = job.fail(
                now=now,
                next_sequence=self._next_counter_in_tx("sequence"),
                error=error,
                lease_token=lease_token,
                worker_id=worker_id,
            )
            self._save_job_in_tx(failed_job)
            return failed_job

    def get_job(self, job_id: str) -> Job:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)
            return self._require_job_in_tx(job_id)

    def dead_letter_queue(self) -> list[Job]:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)
            rows = self._conn.execute(
                """
                SELECT * FROM jobs
                WHERE status = ?
                ORDER BY dead_lettered_at ASC, sequence ASC
                """,
                (JobStatus.DEAD_LETTER.value,),
            ).fetchall()
            return [self._row_to_job(row) for row in rows]

    def stats(self) -> QueueStats:
        with self._transaction():
            now = self._clock()
            self._reap_expired_in_tx(now)
            counts = {status: 0 for status in JobStatus}
            rows = self._conn.execute(
                "SELECT status, COUNT(*) AS cnt FROM jobs GROUP BY status"
            ).fetchall()
            for row in rows:
                counts[JobStatus(row["status"])] = int(row["cnt"])
            return QueueStats(
                pending=counts[JobStatus.PENDING],
                reserved=counts[JobStatus.RESERVED],
                completed=counts[JobStatus.COMPLETED],
                dead_letter=counts[JobStatus.DEAD_LETTER],
            )

    def reap_expired(self) -> list[Job]:
        with self._transaction():
            now = self._clock()
            return self._reap_expired_in_tx(now)
