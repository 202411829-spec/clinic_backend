"""Regenerate src/data/philippineAddresses.js from the vendored PSA PSGC workbook."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from psgc_source import group_by_level, read_psgc_rows

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "psgc" / "PSGC-3Q-2026-Publication-Datafile.xlsx"
OUTPUT = ROOT / "src" / "data" / "philippineAddresses.js"

SOURCE_PAGE = "https://psa.gov.ph/classification/psgc"
SOURCE_FILE = "https://psa.gov.ph/system/files/scd/PSGC-3Q-2026-Publication-Datafile.xlsx"
ATTRIBUTION = "Source: Philippine Statistics Authority (PSA), Philippine Standard Geographic Code (PSGC)."


def region_code(code: str) -> str:
    return f"{code[:2]}00000000"


def administrative_province_code(code: str, province_codes: set[str]) -> str | None:
    candidate = f"{code[:5]}00000"
    return candidate if candidate in province_codes else None


def geographic_province_code(row: dict[str, str], province_codes: set[str]) -> str | None:
    """Old 9-digit correspondence code encodes RR + PP + city + barangay.

    The 10-digit province code is RR + 0 + PP + 00000. This is how HUCs and
    ICCs that are administratively outside a province still retain their
    geographic province association.
    """
    correspondence = row.get("correspondenceCode", "")
    if len(correspondence) < 4 or not correspondence.isdigit():
        return None
    candidate = f"{correspondence[:2]}0{correspondence[2:4]}00000"
    return candidate if candidate in province_codes else None


def optional(value: str | None) -> str | None:
    return value or None


def build_dataset(source: Path = SOURCE) -> dict:
    rows = read_psgc_rows(source)
    grouped = group_by_level(rows)
    by_code = {row["code"]: row for row in rows}
    province_codes = {row["code"] for row in grouped["provinces"]}
    submunicipality_codes = {row["code"] for row in grouped["subMunicipalities"]}

    regions = [
        {
            "code": row["code"],
            "name": row["name"],
            "correspondenceCode": row["correspondenceCode"],
        }
        for row in grouped["regions"]
    ]

    provinces = [
        {
            "code": row["code"],
            "name": row["name"],
            "region": region_code(row["code"]),
            "correspondenceCode": row["correspondenceCode"],
        }
        for row in grouped["provinces"]
    ]

    cities: list[dict] = []
    municipalities: list[dict] = []
    for row in grouped["cities"] + grouped["municipalities"]:
        is_city = row["geographicLevel"] == "City"
        entry = {
            "code": row["code"],
            "name": row["name"],
            "type": row["geographicLevel"],
            "region": region_code(row["code"]),
            "province": administrative_province_code(row["code"], province_codes),
            "correspondenceCode": row["correspondenceCode"],
        }
        if is_city:
            entry["cityClass"] = row["cityClass"]
            entry["geographicProvince"] = geographic_province_code(row, province_codes)
        if row.get("incomeClass"):
            entry["incomeClass"] = row["incomeClass"]
        (cities if is_city else municipalities).append(entry)

    # Keep the historical combined array name for existing UI compatibility.
    cities_and_municipalities = sorted(
        cities + municipalities, key=lambda entry: entry["code"]
    )

    submunicipalities = [
        {
            "code": row["code"],
            "name": row["name"],
            "city": f"{row['code'][:5]}00000",
            "correspondenceCode": row["correspondenceCode"],
        }
        for row in grouped["subMunicipalities"]
    ]

    barangays = []
    for row in grouped["barangays"]:
        submunicipality = f"{row['code'][:7]}000"
        if submunicipality in submunicipality_codes:
            city = f"{row['code'][:5]}00000"
        else:
            city = submunicipality
        entry = {
            "code": row["code"],
            "name": row["name"],
            "city": city,
            "correspondenceCode": row["correspondenceCode"],
        }
        if submunicipality in submunicipality_codes:
            entry["subMunicipality"] = submunicipality
        barangays.append(entry)

    city_classes = Counter(row["cityClass"] for row in grouped["cities"] if row["cityClass"])
    sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
    return {
        "meta": {
            "version": "2026-Q3",
            "releaseDate": "2026-10-12",
            "asOf": "30 September 2026",
            "sourcePage": SOURCE_PAGE,
            "sourceFile": SOURCE_FILE,
            "sourceSha256": sha256,
            "attribution": ATTRIBUTION,
            "counts": {
                "regions": len(regions),
                "provinces": len(provinces),
                "cities": len(cities),
                "municipalities": len(municipalities),
                "citiesAndMunicipalities": len(cities_and_municipalities),
                "subMunicipalities": len(submunicipalities),
                "barangays": len(barangays),
                "highlyUrbanizedCities": city_classes.get("HUC", 0),
                "independentComponentCities": city_classes.get("ICC", 0),
                "componentCities": city_classes.get("CC", 0),
            },
        },
        "regions": regions,
        "provinces": provinces,
        "cities": cities_and_municipalities,
        "municipalities": municipalities,
        "subMunicipalities": submunicipalities,
        "barangays": barangays,
    }


def main() -> None:
    dataset = build_dataset()
    payload = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        "// Generated from the official Philippine Statistics Authority PSGC publication.\n"
        f"// Source: {SOURCE_PAGE}\n"
        f"// Source file: {SOURCE_FILE}\n"
        "// Local source: data/psgc/PSGC-3Q-2026-Publication-Datafile.xlsx\n"
        "// Do not hand-edit; regenerate with scripts/generate_psgc_dataset.py.\n"
        f"export const philippineAddresses = {payload}\n\n"
        "export default philippineAddresses\n",
        encoding="utf-8",
    )
    counts = dataset["meta"]["counts"]
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    print(json.dumps(counts, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
