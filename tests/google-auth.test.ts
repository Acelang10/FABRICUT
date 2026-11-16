import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {shouldFallbackToRedirect} from '../lib/client/firebase'
import config from '../next.config'

test('Google sign-in falls back to redirect only when the popup cannot open', () => {
  assert.equal(shouldFallbackToRedirect({code: 'auth/popup-blocked'}), true)
  assert.equal(shouldFallbackToRedirect({code: 'auth/operation-not-supported-in-this-environment'}), true)
  assert.equal(shouldFallbackToRedirect(new Error('The popup was blocked by the browser')), true)
  assert.equal(shouldFallbackToRedirect({code: 'auth/popup-closed-by-user'}), false)
  assert.equal(shouldFallbackToRedirect(new Error('Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared.')), false)
})

test('does not override Firebase authDomain to the page host', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client/firebase.ts'), 'utf8')
  assert.doesNotMatch(source, /authDomain\s*[:=]\s*window\.location\.host/)
  assert.match(source, /signInWithPopup/)
  assert.match(source, /signInWithRedirect/)
})

test('Next rewrites proxy Firebase auth handler paths to the project authDomain', async () => {
  assert.equal(typeof config.rewrites, 'function')
  const rules = await config.rewrites!()
  const list = Array.isArray(rules) ? rules : [...(rules.beforeFiles || []), ...(rules.afterFiles || []), ...(rules.fallback || [])]
  const dest = Object.fromEntries(list.map((rule: {source: string; destination: string}) => [rule.source, rule.destination]))
  assert.equal(dest['/__/auth/:path*'], 'https://fabricut-248b4.firebaseapp.com/__/auth/:path*')
  assert.equal(dest['/__/firebase/:path*'], 'https://fabricut-248b4.firebaseapp.com/__/firebase/:path*')
})
