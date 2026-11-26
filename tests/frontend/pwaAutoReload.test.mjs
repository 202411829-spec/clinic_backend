import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const viteConfig = await readFile(new URL('../../vite.config.js', import.meta.url), 'utf8')
const mainEntry = await readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8')

test('PWA auto-update reloads clients instead of keeping a cached bundle', () => {
  assert.match(viteConfig, /registerType:\s*'autoUpdate'/)
  assert.match(viteConfig, /injectRegister:\s*null/)

  assert.match(
    mainEntry,
    /import\s+\{\s*registerSW\s*\}\s+from\s+'virtual:pwa-register'/
  )
  assert.match(mainEntry, /registerSW\(\{\s*immediate:\s*true\s*\}\)/)
})
