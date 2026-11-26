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
const REGION_III = philippineAddresses.regions.find((r) => r.name.startsWith("Region III"))
const NCR = philippineAddresses.regions.find((r) => r.name.includes("National Capital Region"))
const PROVINCE = philippineAddresses.provinces.find((p) => p.region === REGION_I.code)
const ZAMBALES = philippineAddresses.provinces.find((p) => p.code === "0307100000")
const CITY = philippineAddresses.cities.find((c) => c.province === PROVINCE.code)
const OLONGAPO = philippineAddresses.cities.find((c) => c.code === "0331400000")
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

test("generated PSGC dataset preserves official codes and parent relationships", () => {
  assert.equal(philippineAddresses.meta.version, "2026-Q3")
  assert.equal(philippineAddresses.cities.length, philippineAddresses.meta.counts.citiesAndMunicipalities)
  assert.equal(philippineAddresses.municipalities.length, 1493)
  assert.equal(philippineAddresses.subMunicipalities.length, 14)

  const provinceCodes = new Set(philippineAddresses.provinces.map((p) => p.code))
  const regionCodes = new Set(philippineAddresses.regions.map((r) => r.code))
  const cityCodes = new Set(philippineAddresses.cities.map((c) => c.code))

  for (const entry of [
    ...philippineAddresses.regions,
    ...philippineAddresses.provinces,
    ...philippineAddresses.cities,
    ...philippineAddresses.subMunicipalities,
    ...philippineAddresses.barangays,
  ]) {
    assert.match(entry.code, /^\d{10}$/)
    if (entry.correspondenceCode) assert.match(entry.correspondenceCode, /^\d{9}$/)
  }

  for (const entry of philippineAddresses.cities) {
    assert.ok(regionCodes.has(entry.region))
    assert.ok(!entry.province || provinceCodes.has(entry.province))
    if (entry.type === "City") assert.ok(["HUC", "ICC", "CC"].includes(entry.cityClass))
    if (entry.type === "Mun") assert.equal(entry.cityClass, undefined)
  }
  for (const entry of philippineAddresses.barangays) {
    assert.ok(cityCodes.has(entry.city))
  }
})

test("province-independent cities are reachable from geographic and synthetic province paths", () => {
  assert.ok(REGION_III)
  assert.ok(ZAMBALES)
  assert.ok(OLONGAPO)

  assert.equal(OLONGAPO.cityClass, "HUC")
  assert.equal(OLONGAPO.province, null)
  assert.equal(OLONGAPO.geographicProvince, ZAMBALES.code)

  const provinceOptions = getProvinceOptions(REGION_III.code)
  assert.ok(provinceOptions.some((option) => option.value === ZAMBALES.code))
  assert.ok(
    getCityOptions(REGION_III.code, ZAMBALES.code).some(
      (option) => option.value === OLONGAPO.code
    )
  )

  const synthetic = provinceOptions.find((option) => option.value.startsWith("NONE:"))
  assert.ok(synthetic)
  assert.ok(
    getCityOptions(REGION_III.code, synthetic.value).some(
      (option) => option.value === OLONGAPO.code
    )
  )
  assert.ok(getBarangayOptions(OLONGAPO.code).length > 0)
  assert.equal(addressLabel("city", OLONGAPO.code), OLONGAPO.name)
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

  assert.match(modal, /legacyAddress: studentAddress\.legacyAddress/)
  assert.match(modal, />Student Address</)
  assert.doesNotMatch(modal, /Field label="Present Address"/)
  assert.doesNotMatch(modal, /placeholder="House No\., Street, Barangay, City \/ Municipality"/)
  assert.match(modal, /function derivedAddressText\(/)
  assert.match(modal, /function withDerivedPresentAddress\(/)
  assert.match(modal, /\.\.\.\(studentPresentAddress \? \{ present_address: studentPresentAddress \} : \{\}\)/)
  assert.match(
    modal,
    /\.\.\.\(emergencyPresentAddress \? \{ present_address: emergencyPresentAddress \} : \{\}\)/
  )
  assert.match(modal, /function StructuredAddressFields\(/)
  assert.match(modal, /field\("addressRegion"\)/)
  assert.match(modal, /field\("addressProvince"\)/)
  assert.match(modal, /field\("addressCity"\)/)
  assert.match(modal, /field\("addressBarangay"\)/)
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

test("emergency contact uses the same structured address fields and preserves legacy text", () => {
  const modal = readFileSync("src/components/student/EditStudentInfoModal.jsx", "utf8")
  const validation = readFileSync("src/lib/studentProfileFormValidation.js", "utf8")
  const backend = readFileSync("routers/student_record.py", "utf8")

  assert.match(modal, /function StructuredAddressFields\(/)
  assert.match(modal, /form=\{form\.emergency\}/)
  assert.match(modal, /onChange=\{onEmergencyAddressChange\}/)
  assert.match(modal, /structured_address_edited: true/)
  assert.match(backend, /structured_address_edited/)
  assert.match(backend, /Invalid emergency address field/)
  assert.match(backend, /same_as_student_address/)

  assert.match(modal, /title="Emergency Contact Information"/)
  assert.match(modal, /Emergency Contact Address/)
  assert.match(modal, /<StructuredAddressFields\s+wide\s+form=\{form\.emergency\}/)
  assert.match(modal, /Same as Student Address/)
  assert.match(modal, /onToggleSameAddress=\{handleToggleSameAddress\}/)
  assert.match(modal, /same_as_student_address: ec\.sameAsStudentAddress === true/)
  assert.match(
    modal,
    /const selectorGrid = wide\s+\? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 min-w-0"/
  )
  assert.match(modal, /<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-w-0">/)
  assert.match(
    validation,
    /!hasStructuredAddress\(emergency\) && !filled\(emergency\.presentAddress\)/
  )
  assert.match(validation, /emergency\.sameAsStudentAddress !== true/)
  assert.match(validation, /validateStructuredAddress\(emergency, \{ required: true \}\)/)
  assert.doesNotMatch(
    modal,
    /Field label="Address" required error=\{errEmergency\("presentAddress"\)\}/
  )
  assert.doesNotMatch(modal, /value=\{form\.emergency\.presentAddress\}/)

  const normalizedModal = modal.replace(/\r\n/g, "\n")
  const sharedColumnEnd = normalizedModal.indexOf(
    "          </SectionBlock>\n        </div>\n      </div>"
  )
  const emergencySectionIndex = normalizedModal.indexOf('title="Emergency Contact Information"')
  assert.ok(
    sharedColumnEnd !== -1 && emergencySectionIndex > sharedColumnEnd,
    "Emergency Contact must span the full form below the shared columns"
  )

  assert.doesNotMatch(modal, /Full Name \(auto-built\)/)
  assert.doesNotMatch(modal, /Optional: enter structured name parts/)
  assert.doesNotMatch(modal, /Optional: choose PSA PSGC address parts/)
  assert.doesNotMatch(modal, /Derived from your school email/)

  const emergency = {
    contact_name: "Maria Santos",
    relationship: "Mother",
    contact_number: "09180000000",
    present_address: "Old free-text address",
    address_region_code: REGION_I.code,
    address_province_code: PROVINCE.code,
    address_city_code: CITY.code,
    address_barangay_code: BARANGAY.code,
    address_street: "Rizal Street",
    address_house_number: "Lot 2",
  }
  const student = adaptStudent({}, { emergency_contact: emergency })
  assert.equal(student.emergencyContact.presentAddress, "Old free-text address")
  assert.equal(student.emergencyContact.legacyAddress, "Old free-text address")
  assert.equal(student.emergencyContact.addressRegion, REGION_I.code)
  assert.equal(student.emergencyContact.addressHouseNumber, "Lot 2")
  assert.equal(student.emergencyContact.sameAsStudentAddress, false)
  assert.equal(
    adaptStudent({}, { emergency_contact: { ...emergency, same_as_student_address: true } })
      .emergencyContact.sameAsStudentAddress,
    true
  )

  const admin = adaptStudentProfile({}, { emergency_contact: emergency })
  assert.equal(admin.emergencyContact.addressCity, CITY.code)
  assert.equal(admin.emergencyContact.legacyAddress, "Old free-text address")

  const patched = updateAddressField(student.emergencyContact, "addressStreet", "New Street")
  assert.equal(hasStructuredAddress(patched), true)
  assert.match(patched.presentAddress, /^Lot 2, New Street, /)
  assert.deepEqual(buildAddressPatch(patched).address_street, "New Street")
})
