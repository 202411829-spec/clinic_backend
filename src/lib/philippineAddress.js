// src/lib/philippineAddress.js
// Local PSGC-backed helpers for cascading Philippine address fields.
// The dataset is generated from the PSA PSGC 3Q 2026 publication and lives in
// src/data/philippineAddresses.js. Nothing here parses legacy free-text
// present_address values; structured fields stay independent and optional.

import { philippineAddresses } from "../data/philippineAddresses.js";

const NO_PROVINCE_PREFIX = "NONE:";

export const ADDRESS_FORM_KEYS = [
  "addressRegion",
  "addressProvince",
  "addressCity",
  "addressBarangay",
];

export const ADDRESS_BACKEND_FIELDS = {
  addressRegion: "address_region_code",
  addressProvince: "address_province_code",
  addressCity: "address_city_code",
  addressBarangay: "address_barangay_code",
  addressStreet: "address_street",
  addressHouseNumber: "address_house_number",
};

const option = (entry) => ({ value: entry.code, label: entry.name });

export function getRegionOptions() {
  return philippineAddresses.regions.map(option);
}

export function getProvinceOptions(regionCode) {
  if (!regionCode) return [];
  const provinces = philippineAddresses.provinces
    .filter((entry) => entry.region === regionCode)
    .map(option);

  // NCR and independent cities have no province in PSGC. Give them an
  // explicit synthetic option so City/Municipality can still cascade.
  const hasProvinceLessCity = philippineAddresses.cities.some(
    (entry) => entry.region === regionCode && !entry.province
  );
  if (hasProvinceLessCity) {
    provinces.push({
      value: `${NO_PROVINCE_PREFIX}${regionCode}`,
      label: "Not in a Province (HUC / ICC / NCR)",
    });
  }

  return provinces.sort((a, b) => a.label.localeCompare(b.label));
}

export function getCityOptions(regionCode, provinceCode) {
  if (!regionCode || !provinceCode) return [];
  const provinceLess = provinceCode.startsWith(NO_PROVINCE_PREFIX);
  return philippineAddresses.cities
    .filter((entry) => {
      if (entry.region !== regionCode) return false;
      if (provinceLess) return !entry.province;

      // HUCs/ICCs are administratively province-independent, but their
      // geographic province must still expose them in the normal cascade.
      return (
        entry.province === provinceCode ||
        (!entry.province && entry.geographicProvince === provinceCode)
      );
    })
    .map(option)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getBarangayOptions(cityCode) {
  if (!cityCode) return [];
  return philippineAddresses.barangays
    .filter((entry) => entry.city === cityCode)
    .map(option)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForCode(list, code) {
  if (!code || code.startsWith(NO_PROVINCE_PREFIX)) return "";
  return list.find((entry) => entry.code === code)?.name || "";
}

export function addressLabel(kind, code) {
  if (kind === "region") return labelForCode(philippineAddresses.regions, code);
  if (kind === "province") return labelForCode(philippineAddresses.provinces, code);
  if (kind === "city") return labelForCode(philippineAddresses.cities, code);
  if (kind === "barangay") return labelForCode(philippineAddresses.barangays, code);
  return "";
}

export function hasStructuredAddress(parts = {}) {
  return ADDRESS_FORM_KEYS.some(
    (key) => String(parts[key] ?? "").trim() !== ""
  ) || ["addressStreet", "addressHouseNumber"].some(
    (key) => String(parts[key] ?? "").trim() !== ""
  );
}

export function formatStructuredAddress(parts = {}) {
  const house = String(parts.addressHouseNumber || "").trim();
  const street = String(parts.addressStreet || "").trim();
  const barangay = addressLabel("barangay", parts.addressBarangay);
  const city = addressLabel("city", parts.addressCity);
  const province = addressLabel("province", parts.addressProvince);
  const region = addressLabel("region", parts.addressRegion);
  return [house, street, barangay, city, province, region].filter(Boolean).join(", ");
}

// Parent changes clear every dependent selection. The composed legacy
// present_address follows the structured fields only while structured
// values exist; clearing them restores the original free-text value.
export function updateAddressField(form = {}, key, value) {
  if (key === "legacyAddress") {
    return {
      ...form,
      legacyAddress: value,
      presentAddress: hasStructuredAddress(form) ? form.presentAddress : value,
    };
  }

  const next = { ...form, [key]: value, structuredAddressEdited: true };
  if (key === "addressRegion") {
    next.addressProvince = "";
    next.addressCity = "";
    next.addressBarangay = "";
  } else if (key === "addressProvince") {
    next.addressCity = "";
    next.addressBarangay = "";
  } else if (key === "addressCity") {
    next.addressBarangay = "";
  }

  next.presentAddress = hasStructuredAddress(next)
    ? formatStructuredAddress(next)
    : next.legacyAddress || "";
  return next;
}

// A legacy-only save must not send null address columns and wipe structured
// data that was previously stored. Fields are sent only after the structured
// block is touched, including when the user clears every structured value.
export function buildAddressPatch(form = {}) {
  if (form.structuredAddressEdited !== true) return {};
  return {
    address_region_code: form.addressRegion || null,
    address_province_code: form.addressProvince || null,
    address_city_code: form.addressCity || null,
    address_barangay_code: form.addressBarangay || null,
    address_street: String(form.addressStreet || "").trim() || null,
    address_house_number: String(form.addressHouseNumber || "").trim() || null,
  };
}

export function validateAddressFields(form = {}) {
  const errors = {};
  ["addressStreet", "addressHouseNumber"].forEach((key) => {
    if (String(form[key] || "").trim().length > 200) errors[key] = true;
  });
  return errors;
}
