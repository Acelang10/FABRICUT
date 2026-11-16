import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler,type Dependencies} from '../lib/server/api'
import {createMemoryStore} from '../lib/server/store'
import {esp32BaseUrl,isLoopbackHost,localControllerEnabled,type FetchLike} from '../lib/server/localController'
import {validateXCommand,isMotionCommand} from '../lib/controller/xcommands'
import {adminTabs} from '../lib/adminNav'
import {canMoveStage,garmentError,withGarmentDefaults,nextStage,previousStage} from '../lib/clothing'
import {addToCart,lineKey} from '../lib/client/cart'
import {avatarInitial,displayName,safePhotoUrl} from '../lib/avatar'
import type {Identity} from '../lib/server/identity'
import type {ShopNotification,ShopOrder,ShopProduct} from '../lib/types'

process.env.EMAIL_NOTIFICATIONS = 'off'

const secret = 'test-session-secret-value!!'
const now = Math.floor(Date.now() / 1000)
const customerClaims: Identity = {
  aud: 'fabricut-248b4', iss: 'https://securetoken.google.com/fabricut-248b4', sub: 'customer-uid',
  email: 'customer@example.invalid', email_verified: true, firebase: {sign_in_provider: 'password'},
  exp: now + 600, iat: now - 1, auth_time: now - 10,
}
const telemetry = {v: 3, mode: 'STEPPER_LASER', state: 'idle', armed: false, x: 0, y: 0, laser: 'off', reason: 'ok', x_steps: 0}

function setup(extra: Partial<Dependencies> = {}) {
  const store = createMemoryStore()
  const handle = createHandler({
    store, sessionSecret: () => secret, adminUsername: () => 'admin', adminPassword: () => 'admin123',
    project: () => 'fabricut-248b4', verify: async () => customerClaims, ...extra,
  })
  return {handle, store}
}
function request(url: string, method = 'GET', body?: unknown, cookie?: string, host = 'localhost') {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = `fabricut_session=${cookie}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request(`http://${host}${url}`, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined})
}
const cookieFrom = (r: Response) => /fabricut_session=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1] || ''
const adminCookie = async (h: ReturnType<typeof createHandler>) => cookieFrom(await h(request('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'})))
const customerCookie = async (h: ReturnType<typeof createHandler>) => cookieFrom(await h(new Request('http://localhost/api/auth/session', {headers: {Authorization: 'Bearer valid.mock.signature'}})))

// ---------- Local-only gating ----------
test('local controller is enabled only on this computer, never on Vercel', () => {
  assert.equal(isLoopbackHost('localhost:3000'), true)
  assert.equal(isLoopbackHost('127.0.0.1:3000'), true)
  assert.equal(isLoopbackHost('[::1]:3000'), true)
  assert.equal(isLoopbackHost('fabricut-one.vercel.app'), false)
  assert.equal(isLoopbackHost('localhost.evil.example'), false)
  assert.equal(localControllerEnabled({NODE_ENV: 'development'}, '127.0.0.1:3000'), true)
  assert.equal(localControllerEnabled({NODE_ENV: 'development', VERCEL: '1'}, 'localhost:3000'), false)
  assert.equal(localControllerEnabled({NODE_ENV: 'production'}, 'localhost:3000'), false)
  assert.equal(localControllerEnabled({NODE_ENV: 'production', LOCAL_CONTROLLER: 'on'}, 'localhost:3000'), true)
  assert.equal(localControllerEnabled({NODE_ENV: 'production', LOCAL_CONTROLLER: 'on', VERCEL_ENV: 'production'}, 'localhost'), false)
  assert.equal(localControllerEnabled({NODE_ENV: 'development', LOCAL_CONTROLLER: 'off'}, 'localhost:3000'), false)
  assert.equal(localControllerEnabled({NODE_ENV: 'development'}, 'fabricut-one.vercel.app'), false)
  assert.deepEqual(adminTabs(false).map(t => t[1]).includes('Local Controller'), false)
  assert.deepEqual(adminTabs(true).at(-1), ['/admin/local-controller', 'Local Controller'])
  assert.equal(adminTabs(false).some(t => t[1] === 'Production'), true)
})

test('local controller API returns 404 when disabled, even for admins, and is admin-only when enabled', async () => {
  const off = setup({localController: () => false})
  const admin = await adminCookie(off.handle)
  assert.equal((await off.handle(request('/api/local-controller/config', 'GET', undefined, admin))).status, 404)
  assert.equal((await off.handle(request('/api/local-controller/wifi/stop', 'POST', undefined, admin))).status, 404)
  // Default check: a deployed host name is never local.
  const deployed = setup()
  assert.equal((await deployed.handle(request('/api/local-controller/config', 'GET', undefined, await adminCookie(deployed.handle), 'fabricut-one.vercel.app'))).status, 404)

  const on = setup({localController: () => true})
  assert.equal((await on.handle(request('/api/local-controller/config'))).status, 401)
  assert.equal((await on.handle(request('/api/local-controller/config', 'GET', undefined, await customerCookie(on.handle)))).status, 403)
  assert.equal((await on.handle(request('/api/local-controller/config', 'GET', undefined, await adminCookie(on.handle)))).status, 200)
})

test('Wi-Fi proxy only forwards whitelisted X commands within firmware limits', async () => {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => { calls.push(url); return {ok: true, status: 200, json: async () => telemetry} }
  const {handle} = setup({localController: () => true, esp32Fetch: fetchImpl, esp32BaseUrl: 'http://192.168.4.1'})
  const admin = await adminCookie(handle)
  const ok = await handle(request('/api/local-controller/wifi/cmd', 'POST', {c: 'xfwd 256 300'}, admin))
  assert.equal(ok.status, 200)
  assert.equal(calls.at(-1), 'http://192.168.4.1/cmd?c=XFWD%20256%20300')
  for (const c of ['M3', 'G1 X10', 'JOG Y 5', 'XFWD 99999', 'XTEST 512 50', 'XSPEED 5000', 'XARM', 'STATUS; M3']) {
    assert.equal((await handle(request('/api/local-controller/wifi/cmd', 'POST', {c}, admin))).status, 400, c)
  }
  assert.equal(calls.length, 1)
  assert.equal((await handle(request('/api/local-controller/wifi/stop', 'POST', undefined, admin))).status, 200)
  assert.equal(calls.at(-1), 'http://192.168.4.1/stop')
  assert.equal((await handle(request('/api/local-controller/wifi/status', 'GET', undefined, admin))).status, 200)

  const down = setup({localController: () => true, esp32Fetch: async () => { throw new Error('EHOSTUNREACH') }, esp32BaseUrl: 'http://192.168.4.1'})
  const res = await down.handle(request('/api/local-controller/wifi/status', 'GET', undefined, await adminCookie(down.handle)))
  assert.equal(res.status, 504)
  assert.match((await res.json() as {error: string}).error, /Fabricut-Controller/)
})

test('X command validation and ESP32 address safety', () => {
  assert.equal(validateXCommand('XTEST 512 2 300'), 'XTEST 512 2 300')
  assert.equal(validateXCommand('invx2 1'), 'INVX2 1')
  assert.equal(validateXCommand('XARM', 'serial'), 'XARM')
  assert.throws(() => validateXCommand('XARM', 'wifi'))
  assert.throws(() => validateXCommand('INVX 2'))
  assert.throws(() => validateXCommand('XFWD 0'))
  assert.equal(isMotionCommand('XBACK 64'), true)
  assert.equal(isMotionCommand('STOP'), false)
  assert.equal(esp32BaseUrl({}), 'http://192.168.4.1')
  assert.throws(() => esp32BaseUrl({ESP32_CONTROLLER_URL: 'http://example.com'}))
  assert.throws(() => esp32BaseUrl({ESP32_CONTROLLER_URL: 'https://192.168.4.1'}))
})

// ---------- Clothing type, pattern and size ----------
test('garment validation and defaults for older products', () => {
  assert.equal(garmentError('tshirt', ['crew', 'vneck'], ['S', 'M']), '')
  assert.match(garmentError('hat', ['crew'], ['S']), /clothing type/)
  assert.match(garmentError('tshirt', ['bomber'], ['S']), /not a T-Shirt pattern/)
  assert.match(garmentError('tshirt', [], ['S']), /pattern/)
  assert.match(garmentError('tshirt', ['crew'], []), /size/)
  assert.match(garmentError('tshirt', ['crew'], ['XXXXL']), /Unknown size/)
  const legacy = withGarmentDefaults({name: 'Old'} as {name: string; clothingType?: string})
  assert.equal(legacy.clothingType, 'tshirt')
  assert.deepEqual(legacy.patternStyles, ['crew', 'vneck', 'scoop'])
  assert.deepEqual(legacy.sizes, ['S', 'M', 'L', 'XL'])
})

test('admin product needs a valid type/pattern/size set; orders must use offered size and pattern', async () => {
  const {handle, store} = setup()
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const base = {name: 'Polo', price: 800, stock: 10, status: 'active', clothingType: 'polo', patternStyles: ['classic', 'pocket'], sizes: ['M', 'L']}
  assert.equal((await handle(request('/api/shop-products', 'POST', {...base, patternStyles: ['vneck']}, admin))).status, 400)
  assert.equal((await handle(request('/api/shop-products', 'POST', {...base, sizes: []}, admin))).status, 400)
  const product = await (await handle(request('/api/shop-products', 'POST', base, admin))).json() as ShopProduct
  assert.deepEqual(product.sizes, ['M', 'L'])
  // Changing type without new patterns is rejected.
  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'PUT', {clothingType: 'dress'}, admin))).status, 400)
  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'PUT', {sizes: ['S', 'M', 'L']}, admin))).status, 200)

  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 1, size: 'XXL', style: 'classic'}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 1, size: 'M', style: 'vneck'}]}, customer))).status, 400)
  const placed = await handle(request('/api/orders', 'POST', {items: [
    {productId: product.id, qty: 1, size: 'M', style: 'classic'},
    {productId: product.id, qty: 2, size: 'L', style: 'pocket'},
    {productId: product.id, qty: 1, size: 'M', style: 'classic'},
  ]}, customer))
  assert.equal(placed.status, 201)
  const order = await placed.json() as ShopOrder
  assert.equal(order.items.length, 2)
  assert.deepEqual(order.items.map(i => [i.size, i.style, i.qty, i.clothingType, i.progress]), [['M', 'classic', 2, 'polo', 'Queued'], ['L', 'pocket', 2, 'polo', 'Queued']])
  assert.equal((await store.getShopProduct(product.id))?.stock, 6)
})

test('cart keeps different sizes/patterns of one product as separate lines', () => {
  const line = {productId: 'p1', kind: 'product' as const, name: 'Tee', price: 300, imageUrl: '', clothingType: 'tshirt'}
  let lines = addToCart([], {...line, size: 'M', style: 'crew'})
  lines = addToCart(lines, {...line, size: 'M', style: 'crew'})
  lines = addToCart(lines, {...line, size: 'L', style: 'crew'})
  lines = addToCart(lines, {...line, size: 'M', style: 'vneck'})
  assert.equal(lines.length, 3)
  assert.equal(lines.find(l => lineKey(l) === 'p1|M|crew')?.qty, 2)
})

// ---------- Production progress ----------
test('production stages move one step at a time', () => {
  assert.equal(canMoveStage('Queued', 'Cutting'), true)
  assert.equal(canMoveStage('Cutting', 'Queued'), true)
  assert.equal(canMoveStage('Queued', 'Sewing'), false)
  assert.equal(canMoveStage('Ready', 'Ready'), false)
  assert.equal(nextStage('Delivered'), null)
  assert.equal(previousStage('Queued'), null)
})

test('admin advances an order line, customer is notified, and invalid moves are refused', async () => {
  const {handle} = setup()
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const product = await (await handle(request('/api/shop-products', 'POST', {name: 'Tee', price: 300, stock: 5, status: 'active', clothingType: 'tshirt', patternStyles: ['crew'], sizes: ['M']}, admin))).json() as ShopProduct
  const order = await (await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 1, size: 'M', style: 'crew'}]}, customer))).json() as ShopOrder
  const url = `/api/orders/${order.id}/lines/0`
  assert.equal((await handle(request(url, 'PATCH', {progress: 'Cutting'}, customer))).status, 403)
  assert.equal((await handle(request(url, 'PATCH', {progress: 'Sewing'}, admin))).status, 409)
  assert.equal((await handle(request(url, 'PATCH', {progress: 'Painting'}, admin))).status, 400)
  assert.equal((await handle(request(`/api/orders/${order.id}/lines/5`, 'PATCH', {progress: 'Cutting'}, admin))).status, 404)
  const moved = await handle(request(url, 'PATCH', {progress: 'Cutting'}, admin))
  assert.equal(moved.status, 200)
  assert.equal((await moved.json() as ShopOrder).items[0].progress, 'Cutting')
  const feed = await (await handle(request('/api/notifications', 'GET', undefined, customer))).json() as {notifications: ShopNotification[]}
  assert.equal(feed.notifications.some(n => n.title === 'Tee: Cutting' && n.link === '/shop/orders'), true)
  // Customer sees progress read-only on their order.
  const mine = await (await handle(request(`/api/orders/${order.id}`, 'GET', undefined, customer))).json() as ShopOrder
  assert.equal(mine.items[0].progress, 'Cutting')
  // Cancelled orders cannot move.
  await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Cancelled'}, admin))
  assert.equal((await handle(request(url, 'PATCH', {progress: 'Sewing'}, admin))).status, 409)
})

// ---------- Avatar ----------
test('avatar initial, menu name, and photo URL safety', () => {
  assert.equal(avatarInitial({role: 'admin', name: 'admin'}), 'A')
  assert.equal(avatarInitial({role: 'customer', name: 'maria Santos'}), 'M')
  assert.equal(avatarInitial({role: 'customer', email: 'juan@example.com'}), 'J')
  assert.equal(avatarInitial({role: 'customer', email: '  '}), '?')
  assert.equal(displayName({role: 'customer', email: 'juan@example.com'}), 'juan')
  assert.equal(displayName({role: 'customer', name: 'Maria'}), 'Maria')
  assert.equal(displayName({role: 'admin', name: 'admin'}), 'Admin')
  assert.equal(safePhotoUrl('https://lh3.googleusercontent.com/a/x'), 'https://lh3.googleusercontent.com/a/x')
  assert.equal(safePhotoUrl('javascript:alert(1)'), '')
  assert.equal(safePhotoUrl('http://example.com/a.png'), '')
})
