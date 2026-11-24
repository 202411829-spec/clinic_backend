import { isStudentProfileComplete } from "./profileCompleteness.js"

async function defaultUpdateProfile(studentId, payload) {
  const { recordsApi } = await import("./api.js")
  return recordsApi.updateProfile(studentId, payload)
}

export async function submitStudentProfilePatch(
  studentId,
  payload,
  applyProfile,
  updateProfile = defaultUpdateProfile
) {
  const response = await updateProfile(studentId, payload)
  const data = response?.data
  if (!data) {
    throw new Error("Save failed. Please try again.")
  }

  applyProfile(data)
  return { data, complete: isStudentProfileComplete(data) }
}
