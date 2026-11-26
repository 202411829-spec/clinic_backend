import json
import re
from pathlib import Path


MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_BYTES = 72
# Backwards-compatible alias; the Supabase limit is measured in UTF-8 bytes.
MAX_PASSWORD_LENGTH = MAX_PASSWORD_BYTES
REQUIRED_CHARACTER_GROUPS = 3
SEQUENCE_RUN_LENGTH = 6

_DENYLIST_PATH = Path(__file__).resolve().parents[1] / "shared" / "common-passwords.json"
_DENYLIST = frozenset(entry.casefold() for entry in json.loads(_DENYLIST_PATH.read_text(encoding="utf-8")))

_SEQUENCES = (
    "0123456789",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
)

_MESSAGES = {
    "required": "Please enter a password.",
    "too_short": "Password must be at least 12 characters.",
    "too_long": (
        "Password must be 72 UTF-8 bytes or fewer. "
        "Accented characters and emoji may use more than one byte."
    ),
    "common": "Choose a password that is not commonly used.",
    "personal": "Password must not contain your email address or username.",
    "repeated": "Password must not use one repeated character.",
    "sequential": "Password must not use an obvious sequence.",
    "groups": "Password must include at least 3 of 4 character groups.",
    "valid": "Password meets the requirements.",
}

PASSWORD_REQUIREMENTS_MESSAGE = (
    "Use at least 12 characters and 3 of 4 groups: uppercase, lowercase, numbers, or special characters. "
    "Maximum 72 UTF-8 bytes; accented characters and emoji may use more than one byte. "
    "Spaces and passphrases are allowed."
)

SUPABASE_WEAK_PASSWORD_MESSAGE = (
    "That password does not meet the account security requirements. "
    "Please choose a different one."
)

_WEAK_PASSWORD_ERROR_MARKERS = (
    "weak_password",
    "weak password",
    "password cannot be longer",
    "password should be at least",
    "should contain at least one character",
    "password is too weak",
    "validation_failed",
    "data breach",
    "pwned",
    "leaked password",
)


def _personal_identifiers(email, username):
    identifiers = []
    for value in (email, username):
        if not value:
            continue
        text = str(value).casefold()
        identifiers.append(text)
        if "@" in text:
            local_part = text.split("@", 1)[0]
            if local_part:
                identifiers.append(local_part)
    return tuple(identifier for identifier in identifiers if identifier)


def _contains_personal_information(password, email, username):
    folded = password.casefold()
    return any(identifier in folded for identifier in _personal_identifiers(email, username))


def _character_groups(password):
    return (
        bool(re.search(r"[A-Z]", password)),
        bool(re.search(r"[a-z]", password)),
        bool(re.search(r"[0-9]", password)),
        bool(re.search(r"[^A-Za-z0-9]", password)),
    )


def _has_obvious_sequence(password):
    folded = password.casefold()
    for sequence in _SEQUENCES:
        for direction in (sequence, sequence[::-1]):
            for index in range(len(direction) - SEQUENCE_RUN_LENGTH + 1):
                if direction[index:index + SEQUENCE_RUN_LENGTH] in folded:
                    return True
    return False


def is_supabase_password_validation_error(error):
    """Recognize Supabase Auth password rejections by code or message."""
    parts = []
    for attribute in ("code", "message", "msg", "details"):
        value = getattr(error, attribute, None)
        if value:
            parts.append(str(value))
    parts.append(str(error))
    text = " ".join(parts).casefold()
    return any(marker in text for marker in _WEAK_PASSWORD_ERROR_MARKERS)


def redact_password_from_error(error, password=None):
    """Return provider error details with the submitted password removed."""
    text = str(error)
    if password:
        text = re.sub(re.escape(str(password)), "[REDACTED]", text, flags=re.IGNORECASE)
    return text


def password_strength(password, email=None, username=None):
    result = validate_password(password, email=email, username=username)
    return result["strength"]


def validate_password(password, email=None, username=None):
    value = password if isinstance(password, str) else ""
    length = len(value)
    byte_length = len(value.encode("utf-8"))
    groups = _character_groups(value)
    personal = _contains_personal_information(value, email, username)
    denylisted = value.casefold() in _DENYLIST
    repeated = len(set(value.casefold())) == 1 if value else False
    sequential = _has_obvious_sequence(value)
    enough_groups = sum(groups) >= REQUIRED_CHARACTER_GROUPS

    requirements = {
        "length": length >= MIN_PASSWORD_LENGTH and byte_length <= MAX_PASSWORD_BYTES,
        "groups": enough_groups,
        "notCommon": not denylisted,
        "notPersonal": not personal,
        "notRepeated": not repeated,
        "notSequential": not sequential,
    }

    if not value:
        code = "required"
    elif denylisted:
        code = "common"
    elif personal:
        code = "personal"
    elif length < MIN_PASSWORD_LENGTH:
        code = "too_short"
    elif byte_length > MAX_PASSWORD_BYTES:
        code = "too_long"
    elif repeated:
        code = "repeated"
    elif sequential:
        code = "sequential"
    elif not enough_groups:
        code = "groups"
    else:
        code = "valid"

    valid = code == "valid"
    if not valid:
        strength = "weak"
    elif length >= 20 or (length >= 16 and sum(groups) == 4):
        strength = "strong"
    else:
        strength = "fair"

    return {
        "valid": valid,
        "code": code,
        "message": _MESSAGES[code],
        "strength": strength,
        "requirements": requirements,
    }
