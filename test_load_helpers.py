"""Tests unitaires pour les helpers load_test.py."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def test_save_report_creates_json_and_md(monkeypatch, tmp_path):
    import load_test as lt

    monkeypatch.setattr(lt, "REPORTS_DIR", str(tmp_path))
    lt.RESULTS.clear()
    lt.ERRORS.clear()
    lt.RESULTS["upload"] = [1.0, 1.2, 0.9, 2.0, 1.5]
    lt.RESULTS["poll"] = [20.0, 25.0, 30.0, 22.0, 28.0]
    lt.ERRORS["poll_timeout"] = 1

    lt.save_report("cv_sequential", "burst", n_users=5, duration=45.0)

    files = list(tmp_path.iterdir())
    json_files = [f for f in files if f.suffix == ".json"]
    md_files = [f for f in files if f.suffix == ".md"]

    assert len(json_files) == 1, "Doit créer exactement 1 fichier JSON"
    assert len(md_files) == 1, "Doit créer exactement 1 fichier MD"

    data = json.loads(json_files[0].read_text())
    assert data["meta"]["scenario"] == "cv_sequential"
    assert data["meta"]["mode"] == "burst"
    assert data["meta"]["users"] == 5
    assert "upload" in data["steps"]
    assert "p50" in data["steps"]["upload"]
    assert "p95" in data["steps"]["upload"]


def test_save_report_detects_breakdown_level():
    import load_test as lt

    lt.RESULTS.clear()
    lt.ERRORS.clear()
    # 8 succès + 3 erreurs = 11 total → 3/11 ≈ 27% > 20% → breakdown_level non-None
    lt.RESULTS["upload"] = [1.0, 1.1, 0.9, 1.2, 0.8, 1.0, 1.3, 0.95]
    lt.ERRORS["upload_error"] = 3

    report = lt._build_report("cv_sequential", "burst", n_users=11, duration=10.0)
    assert report["breakdown_level"] is not None


def test_crash_detection_threshold():
    import load_test as lt

    lt.RESULTS.clear()
    lt.ERRORS.clear()
    lt.RESULTS["coach"] = [1.0] * 80
    lt.ERRORS["coach_timeout"] = 20  # 20/100 = 20%

    rate = lt._compute_error_rate()
    assert abs(rate - 0.20) < 0.01
