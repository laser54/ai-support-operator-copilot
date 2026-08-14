"""Repository-wide guard for English-only maintained text files."""

import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRECTORIES = {
    ".agent",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "dist",
    "node_modules",
}
TEXT_SUFFIXES = {".example", ".ini", ".json", ".lock", ".md", ".py", ".toml", ".yaml", ".yml"}
TEXT_FILENAMES = {".aiignore", ".dockerignore", ".gitignore", "Dockerfile"}
NON_ENGLISH_SCRIPT = re.compile(
    r"[\u0370-\u03ff\u0400-\u052f\u0590-\u08ff\u3040-\u30ff\u4e00-\u9fff]"
)
BROKEN_ENCODING_MARKERS = (
    "\ufffd",
    "\u00c3",
    "\u00c2",
    "\u00e2\u20ac",
    "\u00ef\u00bb\u00bf",
)


def test_maintained_repository_text_is_english_and_valid_unicode() -> None:
    violations: list[str] = []

    for path in REPOSITORY_ROOT.rglob("*"):
        if not path.is_file() or any(part in IGNORED_DIRECTORIES for part in path.parts):
            continue
        if path.suffix not in TEXT_SUFFIXES and path.name not in TEXT_FILENAMES:
            continue

        content = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(content.splitlines(), start=1):
            if NON_ENGLISH_SCRIPT.search(line) or any(
                marker in line for marker in BROKEN_ENCODING_MARKERS
            ):
                relative_path = path.relative_to(REPOSITORY_ROOT)
                violations.append(f"{relative_path}:{line_number}")

    assert not violations, "Non-English or broken text found in: " + ", ".join(violations)
