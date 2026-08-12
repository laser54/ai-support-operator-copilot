"""Add persisted workflow state and checkpoints.

Revision ID: 20260812_03
Revises: 20260812_02
Create Date: 2026-08-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260812_03"
down_revision = "20260812_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Persist serialized workflow state and its latest checkpoint."""

    op.add_column("cases", sa.Column("workflow_state", sa.JSON(), nullable=True))
    op.create_table(
        "workflow_checkpoints",
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("case_id"),
    )


def downgrade() -> None:
    """Remove persisted graph state."""

    op.drop_table("workflow_checkpoints")
    op.drop_column("cases", "workflow_state")
