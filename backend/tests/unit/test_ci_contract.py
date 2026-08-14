"""Contrat statique de la CI canonique du dépôt."""

from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"


def test_ci_uses_the_real_projects_and_never_masks_failures() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    root_package = (REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8")

    assert not (REPOSITORY_ROOT / ".github" / "workflows" / "tests.yml").exists()
    assert "continue-on-error" not in workflow
    assert "|| echo" not in workflow
    assert "working-directory: backend" in workflow
    assert "python -m pip install -e \".[dev]\"" in workflow
    assert "python -m pytest tests/unit tests/integration" in workflow
    assert "ruff check src tests ../scripts/deployment" in workflow
    assert "npm run test:run" in workflow
    assert "npx tsc --noEmit" in workflow
    assert "npm run build" in workflow
    assert "context: ./backend" in workflow
    assert "file: ./backend/Dockerfile" in workflow
    assert "playwright" not in workflow.lower()
    assert '"test:backend": "cd backend && python -m pytest tests/unit tests/integration' in root_package
    assert '"lint": "eslint . --max-warnings 102"' in (
        REPOSITORY_ROOT / "frontend-next" / "package.json"
    ).read_text(encoding="utf-8")
