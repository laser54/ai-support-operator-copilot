"""Create exactly-once mock incident records.

Revision ID: 20260812_04
Revises: 20260812_03
Create Date: 2026-08-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260812_04"
down_revision = "20260812_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the action-idempotent mock incident store."""

    op.create_table(
        "mock_incidents",
        sa.Column("action_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("approval_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_reference", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("action_id"),
        sa.UniqueConstraint("external_reference"),
    )


def downgrade() -> None:
    """Remove mock execution records."""

    op.drop_table("mock_incidents")
