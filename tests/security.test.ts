import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPair,SignJWT} from 'jose'
import {createHandler} from '../lib/server/api'
import {verifyJwt,type Identity} from '../lib/server/identity'
import {createMemoryStore} from '../lib/server/store'
import type {Product} from '../lib/types'

process.env.SESSION_SECRET ||= 'test-session-secret-value!!'
process.env.ADMIN_USERNAME ||= 'admin'
process.env.ADMIN_PASSWORD ||= 'admin123'
process.env.SHOP_STORE ||= 'json'

const secret = 'test-session-secret-value!!'
const now = Math.floor(Date.now() / 1000)
const customerClaims: Identity = {
  aud: 'fabricut-248b4',
  iss: 'https://securetoken.google.com/fabricut-248b4',
  sub: 'customer-uid',
  email: 'customer@example.invalid',
  email_verified: true,
  firebase: {sign_in_provider: 'password'},
  exp: now + 600,
  iat: now - 1,
  auth_time: now - 10,
}

function setup(claims: Identity = customerClaims) {
  const store = createMemoryStore()
  const handle = createHandler({
    store,
    sessionSecret: () => secret,
    adminUsername: () => 'admin',
    adminPassword: () => 'admin123',
    project: () => 'fabricut-248b4',
    verify: async (token) => {
      if (token === 'bad.sig.token') throw new Error('invalid')
      return claims
    },
  })
  return {handle, store}
}

function request(url: string, method = 'GET', body?: unknown, options?: {token?: string | null; cookie?: string | null}) {
  const headers: Record<string, string> = {}
  const token = options && 'token' in options ? options.token : undefined
  if (token) headers.Authorization = `Bearer ${token}`
  if (options?.cookie) headers.Cookie = `fabricut_session=${options.cookie}`
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  return new Request('http://localhost' + url, {
    method,
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
}


// Customers buy sellable products (shop-products). Wrap an inventory item in a product that uses 1 unit of it.
async function sellable(store: ReturnType<typeof createMemoryStore>, item: Product) {
  return store.createShopProduct({
    name: item.name, description: '', price: item.price, imageUrl: '', status: 'active', stock: item.stock,
    fabrics: [{inventoryItemId: item.id, name: item.name, unit: item.unit, quantity: 1}],
  })
}

function cookieFrom(response: Response) {
  const header = response.headers.get('set-cookie') || ''
  return /fabricut_session=([^;]+)/.exec(header)?.[1] || ''
}

async function adminCookie(handle: ReturnType<typeof createHandler>, username = 'admin', password = 'admin123') {
  const response = await handle(request('/api/auth/admin', 'POST', {username, password}))
  assert.equal(response.status, 200)
  const cookie = cookieFrom(response)
  assert.ok(cookie)
  return cookie
}

async function customerCookie(handle: ReturnType<typeof createHandler>) {
  const response = await handle(request('/api/auth/session', 'GET', undefined, {token: 'valid.mock.signature'}))
  assert.equal(response.status, 200)
  const body = await response.json() as {user: {role: string}}
  assert.equal(body.user.role, 'customer')
  const cookie = cookieFrom(response)
  assert.ok(cookie)
  return cookie
}

const sampleProduct = {
  name: 'Piña Barong fabric',
  category: 'Fabrics' as const,
  price: 2850,
  stock: 18,
  unit: 'yd',
  description: 'Handwoven piña',
  imageColor: 'pina',
  active: true,
}

test('admin login succeeds with a signed httpOnly session cookie and fails on bad credentials', async () => {
  const {handle} = setup()
  const ok = await handle(request('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'}))
  assert.equal(ok.status, 200)
  const body = await ok.json() as {user: {role: string; uid: string}}
  assert.equal(body.user.role, 'admin')
  assert.equal(body.user.uid, 'admin')
  const header = ok.headers.get('set-cookie') || ''
  assert.match(header, /HttpOnly/i)
  assert.match(header, /SameSite=Lax/i)
  const cookie = cookieFrom(ok)
  assert.equal((await handle(request('/api/auth/me', 'GET', undefined, {cookie}))).status, 200)
  const denied = await handle(request('/api/auth/admin', 'POST', {username: 'admin', password: 'wrong'}))
  assert.equal(denied.status, 401)
  assert.equal(cookieFrom(denied), '')
  assert.equal((await handle(request('/api/auth/admin', 'POST', {username: 'nope', password: 'admin123'}))).status, 401)
})

test('customer session is created from verified Firebase sign-in without an approval gate', async () => {
  const {handle} = setup()
  const session = await handle(request('/api/auth/session', 'GET', undefined, {token: 'valid.mock.signature'}))
  assert.equal(session.status, 200)
  assert.equal((await session.json()).user.role, 'customer')
})

test('unverified or disallowed Firebase identities cannot open a customer session', async () => {
  for (const claims of [
    {...customerClaims, email_verified: false},
    {...customerClaims, firebase: {sign_in_provider: 'anonymous'}},
    {...customerClaims, firebase: {sign_in_provider: 'facebook.com'}},
    {...customerClaims, email: undefined},
  ]) {
    assert.equal((await setup(claims).handle(request('/api/auth/session', 'GET', undefined, {token: 'valid.mock.signature'}))).status, 403)
  }
  const missing = setup()
  assert.equal((await missing.handle(request('/api/auth/session'))).status, 401)
  assert.equal((await missing.handle(request('/api/products'))).status, 401)
})

test('role guards: a customer cannot use admin product, order, report, or pattern APIs', async () => {
  const {handle, store} = setup()
  const cookie = await customerCookie(handle)
  const created = await store.createProduct(sampleProduct)
  assert.equal((await handle(request('/api/products', 'POST', sampleProduct, {cookie}))).status, 403)
  assert.equal((await handle(request(`/api/products/${created.id}`, 'PUT', {price: 1}, {cookie}))).status, 403)
  assert.equal((await handle(request(`/api/products/${created.id}`, 'DELETE', undefined, {cookie}))).status, 403)
  assert.equal((await handle(request('/api/reports', 'GET', undefined, {cookie}))).status, 403)
  assert.equal((await handle(request(`/api/orders/${created.id}`, 'PATCH', {status: 'Paid'}, {cookie}))).status, 404)
  const forSale = await sellable(store, created)
  const placed = await handle(request('/api/orders', 'POST', {items: [{productId: forSale.id, qty: 1}]}, {cookie}))
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: created.id, qty: 1, kind: 'inventory'}]}, {cookie}))).status, 403)
  assert.equal(placed.status, 201)
  const order = await placed.json() as {id: string}
  assert.equal((await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Paid'}, {cookie}))).status, 403)
  const form = new FormData()
  form.append('pattern', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'pattern.png', {type: 'image/png'}))
  assert.equal((await handle(request('/api/patterns', 'POST', form, {cookie}))).status, 403)
  // Inventory is admin-only now.
  assert.equal((await handle(request('/api/products', 'GET', undefined, {cookie}))).status, 403)
  assert.equal((await handle(request(`/api/products/${created.id}`, 'GET', undefined, {cookie}))).status, 403)
  assert.equal((await handle(request('/api/shop-products', 'GET', undefined, {cookie}))).status, 200)
})

test('product CRUD validates input and supports admin updates', async () => {
  const {handle} = setup()
  const cookie = await adminCookie(handle)
  assert.equal((await handle(request('/api/products', 'POST', {...sampleProduct, name: ''}, {cookie}))).status, 400)
  assert.equal((await handle(request('/api/products', 'POST', {...sampleProduct, price: -5}, {cookie}))).status, 400)
  assert.equal((await handle(request('/api/products', 'POST', {...sampleProduct, stock: -1}, {cookie}))).status, 400)
  assert.equal((await handle(request('/api/products', 'POST', {...sampleProduct, category: 'Hats'}, {cookie}))).status, 400)
  const created = await handle(request('/api/products', 'POST', sampleProduct, {cookie}))
  assert.equal(created.status, 201)
  const product = await created.json() as Product
  assert.equal(product.price, 2850)
  const updated = await handle(request(`/api/products/${product.id}`, 'PUT', {stock: 20, active: false}, {cookie}))
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).active, false)
  const customer = await customerCookie(handle)
  assert.equal((await handle(request('/api/products', 'GET', undefined, {cookie: customer}))).status, 403)
  assert.equal((await handle(request(`/api/products/${product.id}`, 'DELETE', undefined, {cookie}))).status, 200)
})

test('placing an order uses server prices, decrements stock, and rejects insufficient stock', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(sampleProduct)
  const patch = await store.createProduct({
    name: 'Custom-cut patch',
    category: 'Custom-cut' as const,
    price: 180,
    stock: 2,
    unit: 'pcs',
    description: '',
    imageColor: 'patch',
    active: true,
  })
  const fabricItem = await sellable(store, fabric)
  const patchItem = await sellable(store, patch)
  const cookie = await customerCookie(handle)
  const placed = await handle(request('/api/orders', 'POST', {
    items: [{productId: fabricItem.id, qty: 2}, {productId: patchItem.id, qty: 1}],
    // Client-supplied price must be ignored if smuggled in the body later; schema strips unknown fields.
  }, {cookie}))
  assert.equal(placed.status, 201)
  const order = await placed.json() as {total: number; items: {price: number; qty: number}[]; status: string}
  assert.equal(order.total, 2850 * 2 + 180)
  assert.equal(order.items[0].price, 2850)
  assert.equal(order.status, 'Pending')
  assert.equal((await store.getProduct(fabric.id))?.stock, 16)
  assert.equal((await store.getProduct(patch.id))?.stock, 1)
  const exhausted = await handle(request('/api/orders', 'POST', {
    items: [{productId: patchItem.id, qty: 8}],
  }, {cookie}))
  assert.equal(exhausted.status, 409)
  assert.equal((await store.getProduct(patch.id))?.stock, 1)
})

test('admin can add a walk-in order and update status, including stock restore on cancel', async () => {
  const {handle, store} = setup()
  const product = await store.createProduct({...sampleProduct, stock: 5})
  const cookie = await adminCookie(handle)
  const created = await handle(request('/api/orders', 'POST', {
    source: 'admin',
    customerName: 'Maria Santos',
    customerEmail: 'maria@example.invalid',
    items: [{productId: product.id, qty: 2, kind: 'inventory'}],
  }, {cookie}))
  assert.equal(created.status, 201)
  const order = await created.json() as {id: string; status: string; total: number; source: string}
  assert.equal(order.status, 'Paid')
  assert.equal(order.source, 'admin')
  assert.equal(order.total, 5700)
  assert.equal((await store.getProduct(product.id))?.stock, 3)
  const cancelled = await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Cancelled'}, {cookie}))
  assert.equal(cancelled.status, 200)
  assert.equal((await store.getProduct(product.id))?.stock, 5)
})

test('customers only see their own orders', async () => {
  const {handle, store} = setup()
  const product = await sellable(store, await store.createProduct(sampleProduct))
  const mine = await customerCookie(handle)
  const placed = await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 1}]}, {cookie: mine}))
  const order = await placed.json() as {id: string}
  const other = createHandler({
    store,
    sessionSecret: () => secret,
    project: () => 'fabricut-248b4',
    verify: async () => ({...customerClaims, sub: 'other-uid', email: 'other@example.invalid'}),
  })
  const otherCookie = cookieFrom(await other(request('/api/auth/session', 'GET', undefined, {token: 'valid.mock.signature'})))
  const list = await (await other(request('/api/orders', 'GET', undefined, {cookie: otherCookie}))).json() as {id: string}[]
  assert.equal(list.length, 0)
  assert.equal((await other(request(`/api/orders/${order.id}`, 'GET', undefined, {cookie: otherCookie}))).status, 404)
})

test('legacy password login route remains removed', async () => {
  const {handle} = setup()
  assert.equal((await handle(request('/api/auth/login', 'POST', {email: 'x@example.invalid', password: 'secret'}))).status, 410)
  assert.equal((await handle(request('/api/auth/login'))).status, 410)
})

test('admin can upload and view a private pattern file', async () => {
  const {mkdtemp, rm, stat} = await import('node:fs/promises')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const directory = await mkdtemp(join(tmpdir(), 'fabricut-pattern-test-'))
  try {
    const {handle} = setup()
    const cookie = await adminCookie(handle)
    const bound = createHandler({
      store: createMemoryStore(),
      sessionSecret: () => secret,
      adminUsername: () => 'admin',
      adminPassword: () => 'admin123',
      uploadsDirectory: directory,
    })
    const login = await bound(request('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'}))
    const admin = cookieFrom(login) || cookie
    const form = new FormData()
    form.append('pattern', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'pattern.png', {type: 'image/png'}))
    const response = await bound(request('/api/patterns', 'POST', form, {cookie: admin}))
    assert.equal(response.status, 201)
    const uploaded = await response.json() as {filename: string; url: string}
    assert.equal((await stat(join(directory, uploaded.filename))).mode & 0o777, 0o600)
    const image = await bound(request(uploaded.url, 'GET', undefined, {cookie: admin}))
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test('actual cryptography rejects forged signature, wrong project, expiry, bad format', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256')
  const bad = await generateKeyPair('RS256')
  const base: Identity = {
    aud: 'fabricut-248b4',
    iss: 'https://securetoken.google.com/fabricut-248b4',
    sub: 'owner-uid',
    email: 'owner@example.invalid',
    email_verified: true,
    firebase: {sign_in_provider: 'google.com'},
    exp: now + 600,
    iat: now - 1,
    auth_time: now - 10,
  }
  const sign = (claims: Identity, key = privateKey) => new SignJWT(claims).setProtectedHeader({alg: 'RS256', kid: 'synthetic'}).sign(key)
  assert.equal((await verifyJwt(await sign(base), publicKey, 'fabricut-248b4')).sub, base.sub)
  await assert.rejects(verifyJwt(await sign(base, bad.privateKey), publicKey, 'fabricut-248b4'))
  await assert.rejects(verifyJwt(await sign({...base, aud: 'wrong'}), publicKey, 'fabricut-248b4'))
  await assert.rejects(verifyJwt(await sign({...base, exp: now - 1}), publicKey, 'fabricut-248b4'))
  await assert.rejects(verifyJwt('invalid', publicKey, 'fabricut-248b4'))
})
