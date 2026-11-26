import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldPrefixApi } from '../../src/lib/api.js'

const apiSource = readFileSync('src/lib/api.js', 'utf8')

test('separate production backend URLs are not given the Vercel /api prefix', () => {
  assert.equal(
    shouldPrefixApi(
      'https://gc-rfb-backend-production.up.railway.app',
      'https://gc-rfb-frontend.vercel.app'
    ),
    false
  )
})

test('same-origin Vercel Flask mount still receives the /api prefix', () => {
  assert.equal(
    shouldPrefixApi('/', 'https://gc-rfb-frontend.vercel.app'),
    true
  )
  assert.equal(
    shouldPrefixApi(
      'https://gc-rfb-frontend.vercel.app',
      'https://gc-rfb-frontend.vercel.app'
    ),
    true
  )
})

test('local dev backend keeps root-relative paths', () => {
  assert.equal(
    shouldPrefixApi('http://127.0.0.1:5000', 'http://localhost:5173'),
    false
  )
})

test('toApiUrl applies the helper and never double-prefixes /api paths', () => {
  assert.match(
    apiSource,
    /if \(!alreadyPrefixed && shouldPrefixApi\(API_BASE_URL, origin\)\)/
  )
  assert.match(apiSource, /url\.pathname = `\/api\$\{url\.pathname\}`/)
})
