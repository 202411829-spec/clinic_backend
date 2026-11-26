"""Shared parsing for multi-value (multi-select) filter query params.

The frontend serializes each selected filter value as a REPEATED query
key — ``?reason_id=1&reason_id=2`` (see src/lib/api.js: arrays are
appended as repeated keys, sorted/deduped; empty arrays are omitted so
an empty selection means "All"). Older clients and bookmarked URLs sent
a single scalar (``?reason_id=1``) or a legacy comma-separated list
(``?reason_id=1,2``). This module parses all three shapes into one plain
Python list so route handlers never care which wire format arrived.

Values are validated here — positive ints for id columns, trimmed and
length-bounded strings for string-like columns (year_level) — BEFORE
they reach any Supabase query builder. Nothing in this module ever
builds SQL: the postgrest client URL-encodes every value it sends.
"""

from flask import request

# Upper bound on how many values a single filter key may carry. The
# UI's multi-selects are small (a handful of departments / courses /
# reasons); a huge list would only bloat the PostgREST IN (...) param.
DEFAULT_MAX_ITEMS = 100

# Max length for a single string-mode value (e.g. year_level).
DEFAULT_MAX_STRING_LENGTH = 64


def _raw_values(key):
    """Yield the raw wire values for `key`.

    request.args.getlist() already returns one entry per repeated key;
    each entry is then split on commas so legacy CSV values keep
    working.
    """
    for raw in request.args.getlist(key):
        if raw is None:
            continue
        for piece in str(raw).split(","):
            yield piece


def get_filter_list(key, *, as_int=True, max_items=DEFAULT_MAX_ITEMS,
                    max_length=DEFAULT_MAX_STRING_LENGTH):
    """Parse a (possibly repeated) filter query param into a list.

    Args:
        key: query parameter name (e.g. "reason_id").
        as_int: True -> keep only positive integer ids (invalid,
            non-positive, or non-numeric pieces are skipped). False ->
            keep trimmed, length-bounded strings (year_level).
        max_items: cap on how many values are returned (first-seen
            order wins).
        max_length: cap on a single string value's length (string mode
            only; overlong pieces are skipped as invalid).

    Returns:
        A deduped list in first-seen order. An absent key, empty
        values, or all-invalid values yield [] — the frontend treats an
        empty selection as "All", so [] must mean "no filter".
    """
    values = []
    seen = set()

    for piece in _raw_values(key):
        piece = piece.strip()
        if not piece:
            continue

        if as_int:
            try:
                value = int(piece)
            except (TypeError, ValueError):
                continue  # skip invalid id (e.g. "abc", "1.5")
            if value <= 0:
                continue  # ids are positive (0 / negatives are junk)
        else:
            if len(piece) > max_length:
                continue  # bound string-mode values; skip overlong junk
            value = piece

        if value in seen:
            continue
        seen.add(value)
        values.append(value)

        if len(values) >= max_items:
            break

    return values
