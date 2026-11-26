import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import verify_psgc_dataset  # noqa: E402


def test_psgc_dataset_matches_official_workbook(capsys):
    assert verify_psgc_dataset.main() == 0
    output = capsys.readouterr().out
    print(output)
    assert "RESULT: PASS" in output
