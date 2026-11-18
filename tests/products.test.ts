import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from '../lib/server/api'
import {createMemoryStore} from '../lib/server/store'
import {availableFabricOptions,inventoryUsage} from '../lib/fabrics'
import {productInputSchema,shopProductInputSchema,shopProductUpdateSchema} from '../lib/server/shop-schema'
import type {Identity} from '../lib/server/identity'
import type {Product,ShopNotification,ShopOrder,ShopProduct} from '../lib/types'

process.env.EMAIL_NOTIFICATIONS = 'off'
process.env.LOW_STOCK_THRESHOLD = '5'

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

function setup() {
  const store = createMemoryStore()
  const handle = createHandler({
    store,
    sessionSecret: () => secret,
    adminUsername: () => 'admin',
    adminPassword: () => 'admin123',
    project: () => 'fabricut-248b4',
    verify: async () => customerClaims,
  })
  return {handle, store}
}

function request(url: string, method = 'GET', body?: unknown, cookie?: string) {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = `fabricut_session=${cookie}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request('http://localhost' + url, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined})
}
const cookieFrom = (r: Response) => /fabricut_session=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1] || ''
async function adminCookie(handle: ReturnType<typeof createHandler>) {
  return cookieFrom(await handle(request('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'})))
}
async function customerCookie(handle: ReturnType<typeof createHandler>) {
  const headers = {Authorization: 'Bearer valid.mock.signature'}
  return cookieFrom(await handle(new Request('http://localhost/api/auth/session', {headers})))
}

const inventoryItem = (over: Partial<Product> = {}) => ({
  name: 'Cotton twill, navy', category: 'Fabrics' as const, price: 450, stock: 10, unit: 'yd',
  description: '', imageColor: 'twill', active: true, ...over,
})

function inv(id: string, name: string, stock: number): Product {
  return {id, name, stock, category: 'Fabrics', price: 1, unit: 'yd', description: '', imageColor: 'swatch', active: true}
}

test('inventory API accepts fabric name, stock, unit and photo, and rejects leftover sale fields', () => {
  const ok = productInputSchema.parse({name: 'Linen', stock: 4.25})
  assert.equal(ok.unit, 'yd')
  assert.equal(ok.active, true)
  assert.equal(ok.stock, 4.25)
  assert.equal(ok.imageUrl, '')
  for (const bad of [
    {name: '', stock: 1},
    {name: 'X', stock: -1},
    {name: 'X', stock: 1, category: 'Fabrics'},
    {name: 'X', stock: 1, price: 10},
    {name: 'X', stock: 1, description: 'nope'},
    {name: 'X', stock: 1, imageColor: 'pina'},
  ]) assert.equal(productInputSchema.safeParse(bad).success, false, JSON.stringify(bad))
})

test('fabric dropdown lists only inventory with stock left, sorted, keeping already-chosen fabrics', () => {
  const list = [inv('a', 'Wool', 3), inv('b', 'Linen', 0), inv('c', 'Cotton', 0.5), inv('d', 'Silk', 0)]
  assert.deepEqual(availableFabricOptions(list).map(i => i.id), ['c', 'a'])
  assert.deepEqual(availableFabricOptions(list, ['d']).map(i => i.id), ['c', 'd', 'a'])
})

test('inventory usage multiplies fabric per unit by quantity and counts legacy inventory lines', () => {
  const usage = inventoryUsage([
    {productId: 'p1', name: 'Barong', price: 1, qty: 2, kind: 'product', fabrics: [{inventoryItemId: 'f1', name: 'Piña', unit: 'yd', quantity: 1.5}]},
    {productId: 'f1', name: 'Piña', price: 1, qty: 1},
  ])
  assert.equal(usage.get('f1'), 4)
})

test('product validation rejects bad input and partial updates keep other fields', () => {
  const ok = shopProductInputSchema.parse({name: 'Barong', price: 1200, stock: 3})
  assert.equal(ok.status, 'draft')
  assert.deepEqual(ok.fabrics, [])
  for (const bad of [
    {name: '', price: 1, stock: 1},
    {name: 'X', price: 0, stock: 1},
    {name: 'X', price: 1, stock: 1.5},
    {name: 'X', price: 1, stock: 1, status: 'archived'},
    {name: 'X', price: 1, stock: 1, imageUrl: 'javascript:alert(1)'},
    {name: 'X', price: 1, stock: 1, imageUrl: '//evil.example/x.png'},
    {name: 'X', price: 1, stock: 1, fabrics: [{inventoryItemId: 'a', quantity: 0}]},
    {name: 'X', price: 1, stock: 1, unknown: true},
  ]) assert.equal(shopProductInputSchema.safeParse(bad).success, false, JSON.stringify(bad))
  assert.equal(shopProductInputSchema.safeParse({name: 'X', price: 1, stock: 1, imageUrl: 'https://example.com/a.jpg'}).success, true)
  const patch = shopProductUpdateSchema.parse({price: 99})
  assert.deepEqual(patch, {price: 99})
  assert.equal(shopProductUpdateSchema.safeParse({}).success, false)
})

test('only admins can create, update, or delete products; customers see active products only', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem())
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const body = {name: 'Navy barong', price: 3200, stock: 4, status: 'active', fabrics: [{inventoryItemId: fabric.id, quantity: 2.5}]}

  assert.equal((await handle(request('/api/shop-products', 'POST', body))).status, 401)
  assert.equal((await handle(request('/api/shop-products', 'POST', body, customer))).status, 403)
  const created = await handle(request('/api/shop-products', 'POST', body, admin))
  assert.equal(created.status, 201)
  const product = await created.json() as ShopProduct
  assert.deepEqual(product.fabrics, [{inventoryItemId: fabric.id, name: 'Cotton twill, navy', unit: 'yd', quantity: 2.5}])

  const draft = await (await handle(request('/api/shop-products', 'POST', {name: 'Draft', price: 10, stock: 1}, admin))).json() as ShopProduct
  assert.equal(draft.status, 'draft')

  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'PUT', {price: 1}, customer))).status, 403)
  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'DELETE', undefined, customer))).status, 403)

  const visible = await (await handle(request('/api/shop-products', 'GET', undefined, customer))).json() as ShopProduct[]
  assert.deepEqual(visible.map(p => p.id), [product.id])
  assert.equal(visible[0].fabrics[0].name, 'Cotton twill, navy')
  assert.equal((await handle(request(`/api/shop-products/${draft.id}`, 'GET', undefined, customer))).status, 404)
  const all = await (await handle(request('/api/shop-products', 'GET', undefined, admin))).json() as ShopProduct[]
  assert.equal(all.length, 2)

  const updated = await (await handle(request(`/api/shop-products/${product.id}`, 'PUT', {price: 3000}, admin))).json() as ShopProduct
  assert.equal(updated.price, 3000)
  assert.equal(updated.status, 'active')
  assert.equal(updated.fabrics.length, 1)
  assert.equal((await handle(request(`/api/shop-products/${draft.id}`, 'DELETE', undefined, admin))).status, 200)
})

test('fabric selections must be existing, in-stock inventory and not repeated', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem())
  const empty = await store.createProduct(inventoryItem({name: 'Silk', stock: 0}))
  const admin = await adminCookie(handle)
  const base = {name: 'Barong', price: 100, stock: 1}
  assert.equal((await handle(request('/api/shop-products', 'POST', {...base, fabrics: [{inventoryItemId: 'nope', quantity: 1}]}, admin))).status, 400)
  const out = await handle(request('/api/shop-products', 'POST', {...base, fabrics: [{inventoryItemId: empty.id, quantity: 1}]}, admin))
  assert.equal(out.status, 400)
  assert.match((await out.json() as {error: string}).error, /out of stock/)
  assert.equal((await handle(request('/api/shop-products', 'POST', {...base, fabrics: [{inventoryItemId: fabric.id, quantity: 1}, {inventoryItemId: fabric.id, quantity: 2}]}, admin))).status, 400)

  // A fabric already on a product may stay after it runs out.
  const product = await (await handle(request('/api/shop-products', 'POST', {...base, fabrics: [{inventoryItemId: fabric.id, quantity: 1}]}, admin))).json() as ShopProduct
  await store.updateProduct(fabric.id, {stock: 0})
  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'PUT', {fabrics: [{inventoryItemId: fabric.id, quantity: 2}]}, admin))).status, 200)
})

test('ordering a product deducts product stock and fabric inventory, alerts low stock, and cancel restores both', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem({stock: 10}))
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const product = await (await handle(request('/api/shop-products', 'POST', {
    name: 'Navy barong', price: 3200, stock: 5, status: 'active', fabrics: [{inventoryItemId: fabric.id, quantity: 2.5}],
  }, admin))).json() as ShopProduct

  const placed = await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2}]}, customer))
  assert.equal(placed.status, 201)
  const order = await placed.json() as ShopOrder
  assert.equal(order.total, 6400)
  assert.equal(order.items[0].kind, 'product')
  assert.equal(order.items[0].fabrics?.[0].quantity, 2.5)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 5)

  const feed = await (await handle(request('/api/notifications', 'GET', undefined, admin))).json() as {notifications: ShopNotification[]}
  assert.equal(feed.notifications.some(n => n.type === 'order_placed'), true)
  assert.equal(feed.notifications.some(n => n.type === 'low_stock' && n.title.includes('Cotton twill')), true)

  // Not enough fabric left for 3 more (needs 7.5 yd, 5 left) even though 3 products are "available".
  const short = await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 3}]}, customer))
  assert.equal(short.status, 409)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 5)

  assert.equal((await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Cancelled'}, customer))).status, 200)
  assert.equal((await store.getShopProduct(product.id))?.stock, 5)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)

  // Admin reopening re-reserves product and fabric.
  assert.equal((await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Paid'}, admin))).status, 200)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 5)
})

test('draft products cannot be ordered and customers cannot order raw inventory', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem())
  const draft = await store.createShopProduct({name: 'Draft', description: '', price: 10, imageUrl: '', status: 'draft', stock: 5, fabrics: []})
  const customer = await customerCookie(handle)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: draft.id, qty: 1}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: fabric.id, qty: 1}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: fabric.id, qty: 1, kind: 'inventory'}]}, customer))).status, 403)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)
})
