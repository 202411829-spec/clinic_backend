import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { philippineAddresses } from "../../src/data/philippineAddresses.js"
import {
  addressLabel,
  buildAddressPatch,
  formatStructuredAddress,
  getBarangayOptions,
  getCityOptions,
  getProvinceOptions,
  getRegionOptions,
  hasStructuredAddress,
  updateAddressField,
  validateAddressFields,
} from "../../src/lib/philippineAddress.js"
import { adaptStudent } from "../../src/lib/studentProfileAdapter.js"
import { adaptStudentProfile } from "../../src/lib/studentAdapter.js"

const REGION_I = philippineAddresses.regions.find((r) => r.name.startsWith("Region I"))
const NCR = philippineAddresses.regions.find((r) => r.name.includes("National Capital Region"))
const PROVINCE = philippineAddresses.provinces.find((p) => p.region === REGION_I.code)
const CITY = philippineAddresses.cities.find((c) => c.province === PROVINCE.code)
const BARANGAY = philippineAddresses.barangays.find((b) => b.city === CITY.code)

test("local PSGC dataset covers the official 2026 Q3 counts and cascades by parent", () => {
  assert.equal(philippineAddresses.meta.version, "2026-Q3")
  assert.equal(getRegionOptions().length, 18)
  assert.equal(philippineAddresses.provinces.length, 82)
  assert.equal(philippineAddresses.barangays.length, 42010)

  const provinces = getProvinceOptions(REGION_I.code)
  assert.ok(provinces.some((option) => option.value === PROVINCE.code))

  const cities = getCityOptions(REGION_I.code, PROVINCE.code)
  assert.ok(cities.some((option) => option.value === CITY.code))

  const barangays = getBarangayOptions(CITY.code)
  assert.ok(barangays.some((option) => option.value === BARANGAY.code))

  // NCR and independent cities have no province, but must still be reachable.
  const ncrProvinces = getProvinceOptions(NCR.code)
  const synthetic = ncrProvinces.find((option) => option.value.startsWith("NONE:"))
  assert.ok(synthetic)
  assert.ok(getCityOptions(NCR.code, synthetic.value).length > 0)
})

test("structured address changes clear dependent selections and compose legacy text", () => {
  let form = { legacyAddress: "Old free-text address", presentAddress: "Old free-text address" }
  form = updateAddressField(form, "addressRegion", REGION_I.code)
  form = updateAddressField(form, "addressProvince", PROVINCE.code)
  form = updateAddressField(form, "addressCity", CITY.code)
  form = updateAddressField(form, "addressBarangay", BARANGAY.code)
  form = updateAddressField(form, "addressStreet", "Rizal Street")
  form = updateAddressField(form, "addressHouseNumber", "Lot 2")

  assert.equal(form.addressRegion, REGION_I.code)
  assert.equal(form.addressProvince, PROVINCE.code)
  assert.equal(form.addressCity, CITY.code)
  assert.equal(form.addressBarangay, BARANGAY.code)
  assert.equal(
    form.presentAddress,
    [
      "Lot 2",
      "Rizal Street",
      addressLabel("barangay", BARANGAY.code),
      addressLabel("city", CITY.code),
      addressLabel("province", PROVINCE.code),
      addressLabel("region", REGION_I.code),
    ].join(", ")
  )

  const changedRegion = updateAddressField(form, "addressRegion", NCR.code)
  assert.equal(changedRegion.addressProvince, "")
  assert.equal(changedRegion.addressCity, "")
  assert.equal(changedRegion.addressBarangay, "")
  assert.equal(changedRegion.addressStreet, "Rizal Street")
  assert.equal(changedRegion.addressHouseNumber, "Lot 2")

  let cleared = changedRegion
  for (const key of [
    "addressRegion",
    "addressStreet",
    "addressHouseNumber",
  ]) {
    cleared = updateAddressField(cleared, key, "")
  }
  assert.equal(hasStructuredAddress(cleared), false)
  assert.equal(cleared.presentAddress, "Old free-text address")
})

test("adapters expose structured address codes without parsing legacy text", () => {
  const raw = {
    student_id: "202311330",
    first_name: "Juan",
    last_name: "Doe",
    present_address: "Old free-text address",
    address_region_code: REGION_I.code,
    address_province_code: PROVINCE.code,
    address_city_code: CITY.code,
    address_barangay_code: BARANGAY.code,
    address_street: "Rizal Street",
    address_house_number: "Lot 2",
  }

  const student = adaptStudent(raw, {})
  assert.equal(student.presentAddress, "Old free-text address")
  assert.equal(student.legacyAddress, "Old free-text address")
  assert.equal(student.addressRegion, REGION_I.code)
  assert.equal(student.addressProvince, PROVINCE.code)
  assert.equal(student.addressCity, CITY.code)
  assert.equal(student.addressBarangay, BARANGAY.code)
  assert.equal(student.addressStreet, "Rizal Street")
  assert.equal(student.addressHouseNumber, "Lot 2")

  const admin = adaptStudentProfile(raw, {})
  assert.equal(admin.presentAddress, "Old free-text address")
  assert.equal(admin.addressRegion, REGION_I.code)
  assert.equal(admin.addressHouseNumber, "Lot 2")
})

test("address helpers keep free text bounded and format readable labels", () => {
  const formatted = formatStructuredAddress({
    addressRegion: REGION_I.code,
    addressProvince: PROVINCE.code,
    addressCity: CITY.code,
    addressBarangay: BARANGAY.code,
    addressStreet: "Rizal Street",
    addressHouseNumber: "Lot 2",
  })
  assert.match(formatted, /^Lot 2, Rizal Street, /)
  assert.match(formatted, new RegExp(REGION_I.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

  assert.deepEqual(validateAddressFields({ addressStreet: "x".repeat(201) }), {
    addressStreet: true,
  })
  assert.deepEqual(validateAddressFields({ addressHouseNumber: "x".repeat(200) }), {})
})

test("legacy-only payload omits address columns and cannot wipe stored structured data", () => {
  const legacyOnly = buildAddressPatch({
    legacyAddress: "Old free-text address",
    presentAddress: "Old free-text address",
    addressRegion: "",
    addressStreet: "",
    addressHouseNumber: "",
  })
  assert.deepEqual(legacyOnly, {})

  const touched = buildAddressPatch({
    structuredAddressEdited: true,
    addressRegion: REGION_I.code,
    addressStreet: "  Rizal Street  ",
    addressHouseNumber: "",
  })
  assert.deepEqual(touched, {
    address_region_code: REGION_I.code,
    address_province_code: null,
    address_city_code: null,
    address_barangay_code: null,
    address_street: "Rizal Street",
    address_house_number: null,
  })
})

test("edit form wires cascading dropdowns and payload without parsing legacy address", () => {
  const modal = readFileSync("src/components/student/EditStudentInfoModal.jsx", "utf8")
  const completeness = readFileSync("src/lib/profileCompleteness.js", "utf8")
  const backend = readFileSync("routers/student_record.py", "utf8")

  assert.match(modal, /legacyAddress: student\.presentAddress \|\| ""/)
  assert.match(modal, /onChange=\{\(v\) => onAddressChange\("addressRegion", v\)\}/)
  assert.match(modal, /onChange=\{\(v\) => onAddressChange\("addressProvince", v\)\}/)
  assert.match(modal, /onChange=\{\(v\) => onAddressChange\("addressCity", v\)\}/)
  assert.match(modal, /onChange=\{\(v\) => onAddressChange\("addressBarangay", v\)\}/)
  assert.match(modal, /\.\.\.buildAddressPatch\(form\)/)
  assert.doesNotMatch(modal, /address_region_code: form\./)
  assert.doesNotMatch(modal, /splitAddress\(/)

  const helper = readFileSync("src/lib/philippineAddress.js", "utf8")
  assert.match(helper, /if \(form\.structuredAddressEdited !== true\) return \{\}/)

  assert.match(backend, /_ADDRESS_FIELD_LIMITS/)
  assert.match(backend, /_clean_address_value\(value\)/)

  const requiredBlock = completeness.slice(
    completeness.indexOf("REQUIRED_PROFILE_FIELDS"),
    completeness.indexOf("];", completeness.indexOf("REQUIRED_PROFILE_FIELDS"))
  )
  assert.doesNotMatch(requiredBlock, /address_/)
})
