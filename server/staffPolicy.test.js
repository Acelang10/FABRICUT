import test from 'node:test'
import assert from 'node:assert/strict'
import { isApprovedStaff, readBearerToken } from './staffPolicy.js'
// Synthetic claims: these tests do NOT validate JWT cryptographic signatures.
const now = 2000000000
const staff = ['approved@example.invalid']
const valid = { aud: 'fabricut-248b4', iss: 'https://securetoken.google.com/fabricut-248b4', sub: 'synthetic-staff', exp: now + 60, iat: now - 60, email: staff[0], email_verified: true, firebase: { sign_in_provider: 'google.com' } }
const permits = (claims, list = staff) => isApprovedStaff(claims, list, 'fabricut-248b4', now)
test('missing and malformed bearer rejected', () => { for (const value of [undefined, '', 'Bearer bad', 'Basic abc', 'Bearer a.b.c extra']) assert.equal(readBearerToken(value), null) })
test('well formed bearer extracted, not trusted', () => assert.equal(readBearerToken('Bearer a.b.c'), 'a.b.c'))
test('empty approval list fails closed', () => assert.equal(permits(valid, []), false))
test('missing claims rejected', () => assert.equal(permits(null), false))
test('wrong audience rejected', () => assert.equal(permits({ ...valid, aud: 'another-project' }), false))
test('wrong issuer rejected', () => assert.equal(permits({ ...valid, iss: 'https://attacker.invalid' }), false))
test('unapproved identity rejected', () => assert.equal(permits({ ...valid, email: 'other@example.invalid' }), false))
test('unverified email rejected', () => assert.equal(permits({ ...valid, email_verified: false }), false))
test('anonymous provider rejected', () => assert.equal(permits({ ...valid, firebase: { sign_in_provider: 'anonymous' } }), false))
test('expired claims rejected', () => assert.equal(permits({ ...valid, exp: now }), false))
test('future issued claims rejected', () => assert.equal(permits({ ...valid, iat: now + 10 }), false))
test('synthetic approved verified Google identity passes policy', () => assert.equal(permits(valid), true))
