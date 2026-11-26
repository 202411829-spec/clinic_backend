"""Shared parser for the official PSA PSGC publication datafile.

The workbook is read with the Python standard library only. No third-party
Excel dependency is required.
"""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
TAG_T = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"

# PSGC sheet columns as published by PSA:
# B=10-digit PSGC, C=Name, D=Correspondence Code, E=Geographic Level,
# F=Old names, G=City Class, H=Income Classification, I=Urban/Rural,
# J=2024 Population, L=Status.
COLUMN_FIELDS = {
    "B": "code",
    "C": "name",
    "D": "correspondenceCode",
    "E": "geographicLevel",
    "F": "oldNames",
    "G": "cityClass",
    "H": "incomeClass",
    "I": "urbanRural",
    "J": "population",
    "L": "status",
}

CODE_RE = re.compile(r"^\d{10}$")
FOOTNOTE_RE = re.compile(r"\s*[a-z]\s*/\s*$|\s+[a-z]\)\s*$|\s+\*+\s*$", re.IGNORECASE)

LEVEL_FIELDS = {
    "Reg": "regions",
    "Prov": "provinces",
    "City": "cities",
    "Mun": "municipalities",
    "SubMun": "subMunicipalities",
    "Bgy": "barangays",
}


def clean_name(value: str) -> str:
    return FOOTNOTE_RE.sub("", (value or "").strip()).strip()


def _column_letters(cell_ref: str) -> str:
    return re.match(r"[A-Z]+", cell_ref or "").group(0)


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_el = cell.find("m:v", NS)
    inline_el = cell.find("m:is", NS)
    if cell_type == "s" and value_el is not None:
        return shared[int(value_el.text or 0)]
    if cell_type == "inlineStr" and inline_el is not None:
        return "".join(node.text or "" for node in inline_el.iter(TAG_T))
    return value_el.text if value_el is not None and value_el.text is not None else ""


def _sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    for sheet in workbook.find("m:sheets", NS):
        if sheet.attrib.get("name") != sheet_name:
            continue
        target = targets[sheet.attrib[REL_NS]]
        return target.lstrip("/") if target.startswith("/") else f"xl/{target}"
    raise ValueError(f"Sheet not found in PSGC workbook: {sheet_name}")


def read_psgc_rows(xlsx_path: str | Path, sheet_name: str = "PSGC") -> list[dict[str, str]]:
    """Return normalized rows from the official PSGC sheet."""
    with zipfile.ZipFile(xlsx_path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.iter(TAG_T))
                for item in strings.findall("m:si", NS)
            ]

        root = ET.fromstring(archive.read(_sheet_path(archive, sheet_name)))
        rows = []
        for row in root.find("m:sheetData", NS).findall("m:row", NS):
            cells = {}
            for cell in row.findall("m:c", NS):
                letters = _column_letters(cell.attrib.get("r", ""))
                if letters in COLUMN_FIELDS:
                    cells[COLUMN_FIELDS[letters]] = _cell_text(cell, shared).strip()
            code = cells.get("code", "")
            if not CODE_RE.match(code):
                continue  # headers, notes, and PSA footnote rows
            cells["name"] = clean_name(cells.get("name", ""))
            rows.append(cells)
        return rows


def group_by_level(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    grouped = {key: [] for key in LEVEL_FIELDS.values()}
    for row in rows:
        key = LEVEL_FIELDS.get(row.get("geographicLevel", ""))
        if key:
            grouped[key].append(row)
    return grouped
