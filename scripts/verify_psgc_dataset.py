"""Verify the bundled PSGC dataset against the vendored official workbook."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from psgc_source import group_by_level, read_psgc_rows

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "psgc" / "PSGC-3Q-2026-Publication-Datafile.xlsx"
DATASET = ROOT / "src" / "data" / "philippineAddresses.js"


def load_dataset() -> dict:
    text = DATASET.read_text(encoding="utf-8")
    match = re.search(
        r"export const philippineAddresses = (\{.*\})\n\nexport default philippineAddresses",
        text,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError("Could not parse philippineAddresses.js")
    return json.loads(match.group(1))


def codes(items: list[dict]) -> set[str]:
    return {item["code"] for item in items}


def duplicates(items: list[dict]) -> set[str]:
    seen: set[str] = set()
    repeated: set[str] = set()
    for item in items:
        code = item["code"]
        if code in seen:
            repeated.add(code)
        seen.add(code)
    return repeated


def sample(values: set[str], limit: int = 10) -> str:
    ordered = sorted(values)
    shown = ", ".join(ordered[:limit])
    if len(ordered) > limit:
        shown += f", ... (+{len(ordered) - limit})"
    return shown or "-"


class Audit:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.notes: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def check_codes(
        self,
        label: str,
        bundled: list[dict],
        expected: list[dict],
    ) -> set[str]:
        bundled_codes = codes(bundled)
        expected_codes = {row["code"] for row in expected}
        missing = expected_codes - bundled_codes
        extra = bundled_codes - expected_codes
        repeated = duplicates(bundled)
        if missing:
            self.error(f"{label}: missing {len(missing)} codes: {sample(missing)}")
        if extra:
            self.error(f"{label}: unexpected {len(extra)} codes: {sample(extra)}")
        if repeated:
            self.error(f"{label}: duplicate bundled codes: {sample(repeated)}")
        by_code = {item["code"]: item for item in bundled}
        for row in expected:
            item = by_code.get(row["code"])
            if not item:
                continue
            if item.get("name") != row["name"]:
                self.error(
                    f"{label} {row['code']}: name {item.get('name')!r} != {row['name']!r}"
                )
            if item.get("correspondenceCode") != row["correspondenceCode"]:
                self.error(
                    f"{label} {row['code']}: correspondenceCode "
                    f"{item.get('correspondenceCode')!r} != {row['correspondenceCode']!r}"
                )
        return expected_codes


def region_code(code: str) -> str:
    return f"{code[:2]}00000000"


def admin_province(code: str, province_codes: set[str]) -> str | None:
    candidate = f"{code[:5]}00000"
    return candidate if candidate in province_codes else None


def geo_province(row: dict[str, str], province_codes: set[str]) -> str | None:
    correspondence = row["correspondenceCode"]
    if len(correspondence) < 4 or not correspondence.isdigit():
        return None
    candidate = f"{correspondence[:2]}0{correspondence[2:4]}00000"
    return candidate if candidate in province_codes else None


def barangay_parent(code: str, submunicipality_codes: set[str]) -> tuple[str, str | None]:
    submunicipality = f"{code[:7]}000"
    if submunicipality in submunicipality_codes:
        return f"{code[:5]}00000", submunicipality
    return submunicipality, None


def main() -> int:
    audit = Audit()
    rows = read_psgc_rows(SOURCE)
    grouped = group_by_level(rows)
    dataset = load_dataset()

    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if dataset["meta"].get("sourceSha256") != source_sha:
        audit.error("meta.sourceSha256 does not match the vendored workbook")

    expected_counts = {
        "regions": len(grouped["regions"]),
        "provinces": len(grouped["provinces"]),
        "cities": len(grouped["cities"]),
        "municipalities": len(grouped["municipalities"]),
        "citiesAndMunicipalities": len(grouped["cities"]) + len(grouped["municipalities"]),
        "subMunicipalities": len(grouped["subMunicipalities"]),
        "barangays": len(grouped["barangays"]),
    }
    for key, expected in expected_counts.items():
        actual = dataset["meta"]["counts"].get(key)
        if actual != expected:
            audit.error(f"meta.counts.{key}: {actual!r} != {expected!r}")
    if len(dataset["cities"]) != expected_counts["citiesAndMunicipalities"]:
        audit.error(
            "legacy cities array length does not include every city and municipality"
        )

    province_codes = {row["code"] for row in grouped["provinces"]}
    submunicipality_codes = {row["code"] for row in grouped["subMunicipalities"]}

    region_codes = audit.check_codes(
        "regions", dataset.get("regions", []), grouped["regions"]
    )
    bundled_province_codes = audit.check_codes(
        "provinces", dataset.get("provinces", []), grouped["provinces"]
    )
    for item in dataset.get("provinces", []):
        if item.get("region") not in region_codes:
            audit.error(f"provinces {item['code']}: invalid region {item.get('region')!r}")

    lgu_rows = grouped["cities"] + grouped["municipalities"]
    lgu_by_code = {row["code"]: row for row in lgu_rows}
    bundled_lgus = dataset.get("cities", [])
    lgu_codes = audit.check_codes("cities + municipalities", bundled_lgus, lgu_rows)

    bundled_lgu_by_code = {item["code"]: item for item in bundled_lgus}
    for row in lgu_rows:
        item = bundled_lgu_by_code.get(row["code"])
        if not item:
            continue
        expected_type = row["geographicLevel"]
        if item.get("type") != expected_type:
            audit.error(
                f"{row['code']}: type {item.get('type')!r} != {expected_type!r}"
            )
        expected_region = region_code(row["code"])
        if item.get("region") != expected_region:
            audit.error(
                f"{row['code']}: region {item.get('region')!r} != {expected_region!r}"
            )
        expected_province = admin_province(row["code"], province_codes)
        if item.get("province") != expected_province:
            audit.error(
                f"{row['code']}: province {item.get('province')!r} != {expected_province!r}"
            )
        if expected_type == "City":
            if item.get("cityClass") != row["cityClass"]:
                audit.error(
                    f"{row['code']}: cityClass {item.get('cityClass')!r} != {row['cityClass']!r}"
                )
            expected_geo = geo_province(row, province_codes)
            if item.get("geographicProvince") != expected_geo:
                audit.error(
                    f"{row['code']}: geographicProvince "
                    f"{item.get('geographicProvince')!r} != {expected_geo!r}"
                )
        elif "cityClass" in item:
            audit.error(f"{row['code']}: municipality must not have cityClass")

    bundled_municipalities = dataset.get("municipalities", [])
    audit.check_codes(
        "municipalities", bundled_municipalities, grouped["municipalities"]
    )
    for item in bundled_municipalities:
        if item.get("type") != "Mun":
            audit.error(f"municipalities {item['code']}: type must be 'Mun'")

    submunicipalities = dataset.get("subMunicipalities", [])
    audit.check_codes(
        "subMunicipalities", submunicipalities, grouped["subMunicipalities"]
    )
    for item in submunicipalities:
        expected_city = f"{item['code'][:5]}00000"
        if item.get("city") != expected_city:
            audit.error(
                f"subMunicipalities {item['code']}: city {item.get('city')!r} != {expected_city!r}"
            )
        if item.get("city") not in lgu_codes:
            audit.error(
                f"subMunicipalities {item['code']}: invalid city {item.get('city')!r}"
            )

    bundled_barangays = dataset.get("barangays", [])
    barangay_codes = audit.check_codes(
        "barangays", bundled_barangays, grouped["barangays"]
    )
    for item in bundled_barangays:
        code = item["code"]
        expected_city, expected_submunicipality = barangay_parent(
            code, submunicipality_codes
        )
        if item.get("city") != expected_city:
            audit.error(
                f"barangays {code}: city {item.get('city')!r} != {expected_city!r}"
            )
        if item.get("city") not in lgu_codes:
            audit.error(f"barangays {code}: invalid city {item.get('city')!r}")
        if item.get("subMunicipality") != expected_submunicipality:
            audit.error(
                f"barangays {code}: subMunicipality {item.get('subMunicipality')!r} "
                f"!= {expected_submunicipality!r}"
            )

    for item in bundled_lgus:
        if item.get("region") not in region_codes:
            audit.error(f"{item['code']}: invalid region {item.get('region')!r}")
        if item.get("province") and item["province"] not in bundled_province_codes:
            audit.error(
                f"{item['code']}: invalid province {item['province']!r}"
            )

    audit.notes.append(f"Source: {SOURCE.relative_to(ROOT)}")
    audit.notes.append(f"Source SHA256: {source_sha}")
    audit.notes.append(f"Dataset: {DATASET.relative_to(ROOT)}")
    audit.notes.append("Official totals: " + json.dumps(expected_counts, sort_keys=True))
    audit.notes.append(
        "Bundled totals: "
        + json.dumps(
            {
                "regions": len(dataset.get("regions", [])),
                "provinces": len(dataset.get("provinces", [])),
                "citiesAndMunicipalities": len(bundled_lgus),
                "municipalities": len(bundled_municipalities),
                "subMunicipalities": len(submunicipalities),
                "barangays": len(bundled_barangays),
            },
            sort_keys=True,
        )
    )
    city_classes: dict[str, int] = {}
    for row in grouped["cities"]:
        if row["cityClass"]:
            city_classes[row["cityClass"]] = city_classes.get(row["cityClass"], 0) + 1
    audit.notes.append("Official city classes: " + json.dumps(city_classes, sort_keys=True))

    for note in audit.notes:
        print(note)
    if audit.errors:
        print(f"RESULT: FAIL ({len(audit.errors)} problems)")
        for error in audit.errors[:100]:
            print(f"- {error}")
        if len(audit.errors) > 100:
            print(f"- ... (+{len(audit.errors) - 100} more)")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
