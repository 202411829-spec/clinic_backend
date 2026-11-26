import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const read = (relativePath) => readFileSync(relativePath, "utf8")

function jsxFilesUnder(relativeDir) {
  const absoluteDir = path.resolve(relativeDir)
  const files = []

  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name)
    if (entry.isDirectory()) files.push(...jsxFilesUnder(path.relative(process.cwd(), absolutePath)))
    else if (entry.name.endsWith(".jsx")) files.push(absolutePath.replace(/\\/g, "/"))
  }

  return files
}

const globalCss = read("src/assets/styles/index.css")
const tailwindConfig = read("tailwind.config.js")
const main = read("src/main.jsx")
const packageJson = JSON.parse(read("package.json"))
const studentFiles = [...jsxFilesUnder("src/pages/student"), ...jsxFilesUnder("src/components/student")]

test("global Geist Variable setup is the only app font package", () => {
  assert.match(main, /@fontsource-variable\/geist\/wght\.css/)
  assert.match(globalCss, /font-family: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;/)
  assert.match(tailwindConfig, /sans: \['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'\]/)

  const fontPackages = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
    .filter((name) => name.includes("@fontsource") || /font/i.test(name))
  assert.deepEqual(fontPackages, ["@fontsource-variable/geist"])
})

test("student portal has no font-family overrides", () => {
  assert.ok(studentFiles.length > 0)

  for (const file of studentFiles) {
    const source = read(file)
    assert.doesNotMatch(source, /font-serif/, `${file} must inherit global Geist Variable`)
    assert.doesNotMatch(source, /font-mono/, `${file} must inherit global Geist Variable`)
    assert.doesNotMatch(source, /font-family/, `${file} must not declare a local font family`)
    assert.doesNotMatch(source, /fontFamily/, `${file} must not declare a local font family`)
  }
})
