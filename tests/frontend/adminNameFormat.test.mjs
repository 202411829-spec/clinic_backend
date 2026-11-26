import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAdminFormalName,
  formatAdminMiddleInitial,
  isValidAdminMiddleInitial,
} from '../../src/lib/format.js'

const name = {
  last_name: 'Ramos',
  first_name: 'Joseph Daniel',
  middle_initial: 'B.',
  suffix: 'Jr.',
}

test('admin formal name includes middle initial and suffix in the required order', () => {
  assert.equal(formatAdminFormalName(name), 'Ramos, Joseph Daniel, B., Jr.')
  assert.ok(formatAdminFormalName(name).indexOf('Ramos') < formatAdminFormalName(name).indexOf('Joseph Daniel'))
})

test('admin formal name omits an empty suffix', () => {
  assert.equal(formatAdminFormalName({ ...name, suffix: '' }), 'Ramos, Joseph Daniel, B.')
})

test('admin middle initial normalizes optional periods and case consistently', () => {
  assert.equal(formatAdminMiddleInitial('B'), 'B.')
  assert.equal(formatAdminMiddleInitial('B.'), 'B.')
  assert.equal(formatAdminMiddleInitial('B......'), 'B.')
  assert.equal(formatAdminMiddleInitial('b'), 'B.')
  assert.equal(formatAdminMiddleInitial(''), '')

  assert.equal(isValidAdminMiddleInitial('B'), true)
  assert.equal(isValidAdminMiddleInitial('B......'), true)
  assert.equal(isValidAdminMiddleInitial(''), true)
  assert.equal(isValidAdminMiddleInitial('Daniel'), false)
  assert.equal(isValidAdminMiddleInitial('II'), false)

  assert.equal(formatAdminFormalName({ ...name, middle_initial: 'B......' }), 'Ramos, Joseph Daniel, B., Jr.')
  assert.equal(formatAdminFormalName({ ...name, middle_initial: 'b' }), 'Ramos, Joseph Daniel, B., Jr.')
})

test('admin formal name preserves common optional suffixes', () => {
  for (const suffix of ['Jr.', 'Sr.', 'II', 'III']) {
    assert.equal(
      formatAdminFormalName({ ...name, suffix }),
      `Ramos, Joseph Daniel, B., ${suffix}`
    )
  }
})

test('admin formal name keeps a suffix even when the middle initial is absent', () => {
  assert.equal(formatAdminFormalName({ ...name, middle_initial: '' }), 'Ramos, Joseph Daniel, Jr.')
})
