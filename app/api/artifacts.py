"""Artifacts catalog API endpoints."""

from fastapi import APIRouter, HTTPException, status

from app.fixtures.catalog import (
    FixtureEntry,
    add_or_update_artifact,
    delete_artifact,
    list_all_artifacts,
)

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("", response_model=list[FixtureEntry])
def list_artifacts() -> list[FixtureEntry]:
    """Return all active artifacts across knowledge, similar cases, and service status."""

    return list_all_artifacts()


@router.post("", response_model=FixtureEntry, status_code=status.HTTP_201_CREATED)
def save_artifact(payload: FixtureEntry) -> FixtureEntry:
    """Create or update an artifact entry in the knowledge catalog."""

    return add_or_update_artifact(payload)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_artifact(source_id: str) -> None:
    """Delete one artifact from the mutable demo catalogue."""

    if not delete_artifact(source_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact not found")
