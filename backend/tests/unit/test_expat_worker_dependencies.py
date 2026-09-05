"""Le worker Expadation doit embarquer les dépendances de son scraper."""

import tomllib
from pathlib import Path


def test_expat_scraper_dependencies_are_in_packaged_runtime() -> None:
    pyproject = Path(__file__).parents[2] / "pyproject.toml"
    dependencies = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"][
        "dependencies"
    ]

    assert any(dependency.startswith("markdownify") for dependency in dependencies)
    assert any(dependency.startswith("selectolax") for dependency in dependencies)
