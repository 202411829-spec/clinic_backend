import COMMON_PASSWORDS from "../../shared/common-passwords.json" with { type: "json" };

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;
// Backwards-compatible alias; the Supabase limit is measured in UTF-8 bytes.
export const MAX_PASSWORD_LENGTH = MAX_PASSWORD_BYTES;
export const REQUIRED_CHARACTER_GROUPS = 3;
export const SEQUENCE_RUN_LENGTH = 6;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Use at least 12 characters and 3 of 4 groups: uppercase, lowercase, numbers, or special characters. Maximum 72 UTF-8 bytes; accented characters and emoji may use more than one byte. Spaces and passphrases are allowed.";

const DENYLIST = new Set(COMMON_PASSWORDS.map((entry) => entry.toLowerCase()));
const SEQUENCES = [
  "0123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
];

const MESSAGES = {
  required: "Please enter a password.",
  too_short: "Password must be at least 12 characters.",
  too_long:
    "Password must be 72 UTF-8 bytes or fewer. Accented characters and emoji may use more than one byte.",
  common: "Choose a password that is not commonly used.",
  personal: "Password must not contain your email address or username.",
  repeated: "Password must not use one repeated character.",
  sequential: "Password must not use an obvious sequence.",
  groups: "Password must include at least 3 of 4 character groups.",
  valid: "Password meets the requirements.",
};

function personalIdentifiers(email, username) {
  const identifiers = [];
  for (const value of [email, username]) {
    if (!value) continue;
    const text = String(value).toLowerCase();
    identifiers.push(text);
    if (text.includes("@")) {
      const localPart = text.split("@", 1)[0];
      if (localPart) identifiers.push(localPart);
    }
  }
  return identifiers.filter(Boolean);
}

function containsPersonalInformation(password, email, username) {
  const folded = password.toLowerCase();
  return personalIdentifiers(email, username).some((identifier) => folded.includes(identifier));
}

function characterGroups(password) {
  return [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
}

function hasObviousSequence(password) {
  const folded = password.toLowerCase();
  for (const sequence of SEQUENCES) {
    for (const direction of [sequence, sequence.split("").reverse().join("")]) {
      for (let index = 0; index <= direction.length - SEQUENCE_RUN_LENGTH; index += 1) {
        if (folded.includes(direction.slice(index, index + SEQUENCE_RUN_LENGTH))) {
          return true;
        }
      }
    }
  }
  return false;
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

export function validatePassword(password, context = {}) {
  const value = typeof password === "string" ? password : "";
  const length = [...value].length;
  const byteLength = utf8ByteLength(value);
  const folded = value.toLowerCase();
  const groups = characterGroups(value);
  const groupCount = groups.filter(Boolean).length;
  const denylisted = DENYLIST.has(folded);
  const personal = containsPersonalInformation(value, context.email, context.username);
  const repeated = length > 0 && new Set([...folded]).size === 1;
  const sequential = hasObviousSequence(value);

  const requirements = {
    length: length >= MIN_PASSWORD_LENGTH && byteLength <= MAX_PASSWORD_BYTES,
    groups: groupCount >= REQUIRED_CHARACTER_GROUPS,
    notCommon: !denylisted,
    notPersonal: !personal,
    notRepeated: !repeated,
    notSequential: !sequential,
  };

  let code = "valid";
  if (!value) code = "required";
  else if (denylisted) code = "common";
  else if (personal) code = "personal";
  else if (length < MIN_PASSWORD_LENGTH) code = "too_short";
  else if (byteLength > MAX_PASSWORD_BYTES) code = "too_long";
  else if (repeated) code = "repeated";
  else if (sequential) code = "sequential";
  else if (groupCount < REQUIRED_CHARACTER_GROUPS) code = "groups";

  const valid = code === "valid";
  let strength = "weak";
  if (valid) {
    if (length >= 20 || (length >= 16 && groupCount === 4)) strength = "strong";
    else strength = "fair";
  }

  return {
    valid,
    code,
    message: MESSAGES[code],
    strength,
    requirements,
  };
}

export function passwordStrength(password, context = {}) {
  return validatePassword(password, context).strength;
}
