import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createHandler} from '../lib/server/api'
import {createMemoryStore} from '../lib/server/store'
import {cloudinaryCredentials,deliveryUrl,signUpload,type CloudinaryClient,type UploadedResource} from '../lib/server/cloudinary'
import {canToggleMedia,defaultMediaView,imageFileError,MAX_UPLOAD_BYTES,resolveMediaView} from '../lib/media'
import {pickAvatarPhoto} from '../lib/avatar'
import {productUpdateSchema,profileUpdateSchema} from '../lib/server/shop-schema'
import type {Identity} from '../lib/server/identity'
import type {Product,UserProfile} from '../lib/types'

process.env.EMAIL_NOTIFICATIONS = 'off'
const secret = 'test-session-secret-value!!'
// Fake, test-only credentials (not a real account).
const creds = {cloudName: 'demo-cloud', apiKey: '111111111111111', apiSecret: 'test-api-secret-not-real'}
const now = Math.floor(Date.now() / 1000)
const claims = (sub: string): Identity => ({
  aud: 'fabricut-248b4', iss: 'https://securetoken.google.com/fabricut-248b4', sub, email: `${sub}@example.invalid`,
  email_verified: true, firebase: {sign_in_provider: 'password'}, exp: now + 600, iat: now - 1, auth_time: now - 10,
})

function setup(opts: {configured?: boolean; resources?: Record<string, UploadedResource>} = {}) {
  const store = createMemoryStore()
  const destroyed: string[] = []
  const client: CloudinaryClient = {
    async resource(_c, id) { return opts.resources?.[id] || null },
    async destroy(_c, id) { destroyed.push(id) },
  }
  const base = {
    store, sessionSecret: () => secret, adminUsername: () => 'admin', adminPassword: () => 'admin123',
    project: () => 'fabricut-248b4', cloudinary: () => (opts.configured === false ? null : creds), cloudinaryClient: client,
  }
  const handlerFor = (sub: string) => createHandler({...base, verify: async () => claims(sub)})
  return {store, destroyed, handle: handlerFor('alice'), handleBob: handlerFor('bob')}
}
function req(url: string, method = 'GET', body?: unknown, cookie?: string) {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = `fabricut_session=${cookie}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request('http://localhost' + url, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined})
}
const cookieFrom = (r: Response) => /fabricut_session=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1] || ''
type H = ReturnType<typeof createHandler>
const adminCookie = async (h: H) => cookieFrom(await h(req('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'})))
const customerCookie = async (h: H) => cookieFrom(await h(new Request('http://localhost/api/auth/session', {headers: {Authorization: 'Bearer x.y.z'}})))

test('Cloudinary credentials come from CLOUDINARY_URL or the three variables; malformed = not configured', () => {
  assert.deepEqual(cloudinaryCredentials({CLOUDINARY_URL: 'cloudinary://key123:sec%2Fret@my-cloud'}), {cloudName: 'my-cloud', apiKey: 'key123', apiSecret: 'sec/ret'})
  assert.deepEqual(cloudinaryCredentials({CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's'}), {cloudName: 'c', apiKey: 'k', apiSecret: 's'})
  assert.equal(cloudinaryCredentials({}), null)
  assert.equal(cloudinaryCredentials({CLOUDINARY_URL: 'https://k:s@c'}), null)
  assert.equal(cloudinaryCredentials({CLOUDINARY_URL: 'cloudinary://onlykey@c'}), null)
})

test('upload signature matches Cloudinary SHA-1 signing, is folder-restricted and never exposes the secret', () => {
  const signed = signUpload(creds, 'products', 'admin', 1_700_000_000_000)
  const {signature, api_key, ...params} = signed.fields
  const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  assert.equal(signature, createHash('sha1').update(toSign + creds.apiSecret).digest('hex'))
  assert.equal(api_key, creds.apiKey)
  assert.equal(params.folder, 'fabricut/products')
  assert.equal(params.allowed_formats, 'jpg,jpeg,png,webp')
  assert.equal(params.timestamp, '1700000000')
  assert.match(params.public_id, /^img-[0-9a-f-]{36}$/)
  assert.equal(signed.uploadUrl, 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload')
  assert.equal(signed.maxBytes, 5 * 1024 * 1024)
  assert.ok(!JSON.stringify(signed).includes(creds.apiSecret))
  assert.match(signUpload(creds, 'avatars', 'alice').fields.public_id, /^alice-/)
})

test('signing requires sign-in; inventory/product uploads are admin-only; avatars allowed for customers', async () => {
  const {handle} = setup()
  const admin = await adminCookie(handle)
  const alice = await customerCookie(handle)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'products'}))).status, 401)
  assert.equal((await handle(req('/api/uploads/config'))).status, 401)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'products'}, alice))).status, 403)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'inventory'}, alice))).status, 403)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'test'}, alice))).status, 403)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'avatars'}, alice))).status, 200)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'inventory'}, admin))).status, 200)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'secret-folder'}, admin))).status, 400)
  assert.equal((await handle(req('/api/uploads/sign', 'POST', {kind: 'products', folder: 'other'}, admin))).status, 400)
  const body = await (await handle(req('/api/uploads/sign', 'POST', {kind: 'inventory'}, admin))).json() as {fields: Record<string, string>}
  assert.equal(body.fields.folder, 'fabricut/inventory')
  assert.ok(!JSON.stringify(body).includes(creds.apiSecret))
})

test('missing Cloudinary env reports not configured (503) without breaking anything else', async () => {
  const {handle} = setup({configured: false})
  const admin = await adminCookie(handle)
  assert.deepEqual(await (await handle(req('/api/uploads/config', 'GET', undefined, admin))).json(), {configured: false, maxBytes: MAX_UPLOAD_BYTES})
  const r = await handle(req('/api/uploads/sign', 'POST', {kind: 'products'}, admin))
  assert.equal(r.status, 503)
  assert.equal(((await r.json()) as {error: string}).error, 'Image upload not configured')
})

test('confirm checks owner/folder, type and the 5 MB limit, deleting rejected files', async () => {
  const mine = 'fabricut/avatars/alice-1111'
  const big = 'fabricut/products/img-big'
  const gif = 'fabricut/products/img-gif'
  const ok = 'fabricut/products/img-ok'
  const {handle, handleBob, destroyed} = setup({resources: {
    [mine]: {public_id: mine, bytes: 2000, format: 'jpg', resource_type: 'image', version: 7},
    [big]: {public_id: big, bytes: MAX_UPLOAD_BYTES + 1, format: 'png', resource_type: 'image'},
    [gif]: {public_id: gif, bytes: 10, format: 'gif', resource_type: 'image'},
    [ok]: {public_id: ok, bytes: 10, format: 'webp', resource_type: 'image', version: 9},
  }})
  const admin = await adminCookie(handle)
  const alice = await customerCookie(handle)
  const bob = await customerCookie(handleBob)
  const a = await (await handle(req('/api/uploads/confirm', 'POST', {kind: 'avatars', publicId: mine}, alice))).json() as {url: string}
  assert.equal(a.url, 'https://res.cloudinary.com/demo-cloud/image/upload/c_fill,g_face,h_256,w_256/f_auto,q_auto/v7/fabricut/avatars/alice-1111')
  // Bob cannot claim Alice's avatar; customers cannot confirm product images.
  assert.equal((await handleBob(req('/api/uploads/confirm', 'POST', {kind: 'avatars', publicId: mine}, bob))).status, 403)
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: ok}, alice))).status, 403)
  // Wrong folder for the kind.
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'inventory', publicId: ok}, admin))).status, 403)
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: big}, admin))).status, 413)
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: gif}, admin))).status, 415)
  assert.deepEqual(destroyed, [big, gif])
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: 'fabricut/products/img-missing'}, admin))).status, 404)
  assert.equal((await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: 'fabricut/products/img-../x'}, admin))).status, 400)
  const p = await (await handle(req('/api/uploads/confirm', 'POST', {kind: 'products', publicId: ok}, admin))).json() as {url: string}
  assert.equal(p.url, 'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto/v9/fabricut/products/img-ok')
})

test('browser-side file check: image types only, max 5 MB', () => {
  assert.equal(imageFileError({type: 'image/png', size: 100}), '')
  assert.equal(imageFileError({type: 'image/webp', size: MAX_UPLOAD_BYTES}), '')
  assert.match(imageFileError({type: 'image/png', size: MAX_UPLOAD_BYTES + 1}), /5 MB/)
  assert.match(imageFileError({type: 'image/svg+xml', size: 10}), /JPEG, PNG or WebP/)
  assert.match(imageFileError({type: 'application/pdf', size: 10}), /JPEG, PNG or WebP/)
  assert.equal(deliveryUrl('c', 'inventory', 'fabricut/inventory/img-a'), 'https://res.cloudinary.com/c/image/upload/f_auto,q_auto/fabricut/inventory/img-a')
})

test('Photo/Pattern toggle: photo by default; no photo = pattern only, no toggle', () => {
  assert.equal(defaultMediaView('https://res.cloudinary.com/x.jpg'), 'photo')
  assert.equal(defaultMediaView(''), 'pattern')
  assert.equal(defaultMediaView('   '), 'pattern')
  assert.equal(canToggleMedia('https://x/y.jpg'), true)
  assert.equal(canToggleMedia(''), false)
  assert.equal(resolveMediaView('https://x/y.jpg'), 'photo')
  assert.equal(resolveMediaView('https://x/y.jpg', 'pattern'), 'pattern')
  assert.equal(resolveMediaView('', 'photo'), 'pattern')
})

test('avatar uses profile photo first, then Google photo, then initial', () => {
  assert.equal(pickAvatarPhoto('https://res.cloudinary.com/a.jpg', 'https://lh3.googleusercontent.com/g'), 'https://res.cloudinary.com/a.jpg')
  assert.equal(pickAvatarPhoto('', 'https://lh3.googleusercontent.com/g'), 'https://lh3.googleusercontent.com/g')
  assert.equal(pickAvatarPhoto('javascript:alert(1)', null), '')
  assert.equal(pickAvatarPhoto(null, 'http://insecure/g'), '')
})

test('profile validation: strict fields, phone, birthday, https photo', () => {
  assert.equal(profileUpdateSchema.safeParse({displayName: 'Ace', phone: '+63 917 123 4567', birthday: '1999-12-31', address: 'Manila', photoUrl: 'https://res.cloudinary.com/x'}).success, true)
  assert.equal(profileUpdateSchema.safeParse({birthday: ''}).success, true)
  assert.equal(profileUpdateSchema.safeParse({}).success, false)
  assert.equal(profileUpdateSchema.safeParse({uid: 'someone-else'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({id: 'admin', displayName: 'x'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({phone: 'call me'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({birthday: '2001-02-30'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({birthday: '3000-01-01'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({photoUrl: 'http://x/y.jpg'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({photoUrl: 'javascript:alert(1)'}).success, false)
  assert.equal(profileUpdateSchema.safeParse({displayName: 'x'.repeat(81)}).success, false)
})

test('profiles: sign-in required, each user only reads and edits their own, admin uses profiles/admin', async () => {
  const {handle, handleBob, store} = setup()
  assert.equal((await handle(req('/api/profile'))).status, 401)
  assert.equal((await handle(req('/api/profile', 'PUT', {displayName: 'x'}))).status, 401)
  const alice = await customerCookie(handle)
  const bob = await customerCookie(handleBob)
  const admin = await adminCookie(handle)
  const empty = await (await handle(req('/api/profile', 'GET', undefined, alice))).json() as UserProfile
  assert.deepEqual(empty, {id: 'alice', displayName: '', phone: '', address: '', birthday: '', photoUrl: ''})
  const saved = await (await handle(req('/api/profile', 'PUT', {displayName: 'Alice', phone: '0917 000 0000'}, alice))).json() as UserProfile
  assert.equal(saved.id, 'alice')
  assert.equal(saved.displayName, 'Alice')
  // Partial update keeps other fields.
  const again = await (await handle(req('/api/profile', 'PUT', {address: 'Cebu'}, alice))).json() as UserProfile
  assert.equal(again.displayName, 'Alice')
  assert.equal(again.address, 'Cebu')
  // Bob sees only his own (empty) profile and cannot target Alice's.
  assert.equal(((await (await handleBob(req('/api/profile', 'GET', undefined, bob))).json()) as UserProfile).displayName, '')
  assert.equal((await handleBob(req('/api/profile', 'PUT', {id: 'alice', displayName: 'Hacked'}, bob))).status, 400)
  assert.equal((await handleBob(req('/api/profile/alice', 'PUT', {displayName: 'Hacked'}, bob))).status, 404)
  assert.equal((await store.getProfile('alice')).displayName, 'Alice')
  // Admin profile lives at profiles/admin.
  const adminSaved = await (await handle(req('/api/profile', 'PUT', {displayName: 'Shop Owner'}, admin))).json() as UserProfile
  assert.equal(adminSaved.id, 'admin')
  assert.equal((await store.getProfile('admin')).displayName, 'Shop Owner')
  assert.equal((await store.getProfile('alice')).displayName, 'Alice')
  assert.equal((await handle(req('/api/profile', 'PUT', {birthday: 'not-a-date'}, alice))).status, 400)
})

test('inventory photo is saved, and hiding an item no longer wipes description, swatch or photo', async () => {
  const {handle} = setup()
  const admin = await adminCookie(handle)
  const created = await (await handle(req('/api/products', 'POST', {
    name: 'Linen', category: 'Fabrics', price: 300, stock: 5, unit: 'yd', description: 'Soft', imageColor: 'pina',
    imageUrl: 'https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto/fabricut/inventory/img-a',
  }, admin))).json() as Product
  assert.match(created.imageUrl || '', /fabricut\/inventory/)
  const hidden = await (await handle(req(`/api/products/${created.id}`, 'PUT', {active: false}, admin))).json() as Product
  assert.equal(hidden.active, false)
  assert.equal(hidden.description, 'Soft')
  assert.equal(hidden.imageColor, 'pina')
  assert.equal(hidden.imageUrl, created.imageUrl)
  assert.deepEqual(productUpdateSchema.parse({active: true}), {active: true})
  assert.equal((await handle(req('/api/products', 'POST', {name: 'X', category: 'Fabrics', price: 1, stock: 1, unit: 'yd', imageUrl: 'javascript:alert(1)'}, admin))).status, 400)
})
