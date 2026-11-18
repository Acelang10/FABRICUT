import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from '../lib/server/api'
import {createMemoryStore} from '../lib/server/store'
import {availableFabricOptions,inventoryUsage,publicFabric,shopFabricOptions} from '../lib/fabrics'
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

test('customer fabric options hide out-of-stock and hidden inventory', () => {
  const list = [
    inv('a', 'Wool', 3),
    inv('b', 'Linen', 0),
    {...inv('c', 'Cotton', 2), active: false},
    inv('d', 'Silk', 1),
  ]
  assert.deepEqual(shopFabricOptions(list).map(i => i.id), ['d', 'a'])
  assert.deepEqual(publicFabric(list[0]), {id: 'a', name: 'Wool', stock: 3, unit: 'yd', imageUrl: ''})
})

test('inventory usage multiplies fabric per unit by quantity and counts legacy inventory lines', () => {
  const usage = inventoryUsage([
    {productId: 'p1', name: 'Barong', price: 1, qty: 2, kind: 'product', fabrics: [{inventoryItemId: 'f1', name: 'Piña', unit: 'yd', quantity: 1.5}]},
    {productId: 'f1', name: 'Piña', price: 1, qty: 1},
  ])
  assert.equal(usage.get('f1'), 4)
  // A customer-chosen fabric without a usage amount is not deducted.
  const chosen = inventoryUsage([
    {productId: 'p1', name: 'Barong', price: 1, qty: 2, kind: 'product', chosenFabric: {inventoryItemId: 'f1', name: 'Piña', unit: 'yd'}},
  ])
  assert.equal(chosen.size, 0)
})

test('product validation rejects bad input and partial updates keep other fields', () => {
  const ok = shopProductInputSchema.parse({name: 'Barong', price: 1200, stock: 3})
  assert.equal(ok.status, 'active')
  assert.deepEqual(ok.fabrics, [])
  assert.deepEqual(ok.colors, [])
  assert.equal(ok.description, '')
  for (const bad of [
    {name: '', price: 1, stock: 1},
    {name: 'X', price: 0, stock: 1},
    {name: 'X', price: 1, stock: 1.5},
    {name: 'X', price: 1, stock: 1, status: 'archived'},
    {name: 'X', price: 1, stock: 1, imageUrl: 'javascript:alert(1)'},
    {name: 'X', price: 1, stock: 1, imageUrl: '//evil.example/x.png'},
    {name: 'X', price: 1, stock: 1, fabrics: [{inventoryItemId: 'a', quantity: 0}]},
    {name: 'X', price: 1, stock: 1, colors: [{name: 'Navy', hex: 'blue'}]},
    {name: 'X', price: 1, stock: 1, colors: [{name: 'Navy'}, {name: 'navy'}]},
    {name: 'X', price: 1, stock: 1, unknown: true},
  ]) assert.equal(shopProductInputSchema.safeParse(bad).success, false, JSON.stringify(bad))
  assert.equal(shopProductInputSchema.safeParse({name: 'X', price: 1, stock: 1, imageUrl: 'https://example.com/a.jpg'}).success, true)
  assert.deepEqual(shopProductInputSchema.parse({name: 'X', price: 1, stock: 1, colors: [{name: 'Navy', hex: '#123abc'}]}).colors, [{name: 'Navy', hex: '#123abc'}])
  const patch = shopProductUpdateSchema.parse({price: 99})
  assert.deepEqual(patch, {price: 99})
  assert.equal(shopProductUpdateSchema.safeParse({}).success, false)
})

test('only admins can create, update, or delete products; customers see active products only', async () => {
  const {handle} = setup()
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const body = {name: 'Navy barong', description: 'A formal shirt', price: 3200, stock: 4, colors: [{name: 'Navy', hex: '#1f3a5f'}]}

  assert.equal((await handle(request('/api/shop-products', 'POST', body))).status, 401)
  assert.equal((await handle(request('/api/shop-products', 'POST', body, customer))).status, 403)
  const created = await handle(request('/api/shop-products', 'POST', body, admin))
  assert.equal(created.status, 201)
  const product = await created.json() as ShopProduct
  assert.equal(product.status, 'active')
  assert.deepEqual(product.fabrics, [])
  assert.deepEqual(product.colors, [{name: 'Navy', hex: '#1f3a5f'}])
  assert.equal(product.description, 'A formal shirt')

  const hidden = await (await handle(request('/api/shop-products', 'POST', {name: 'Hidden', price: 10, stock: 1, status: 'draft'}, admin))).json() as ShopProduct
  assert.equal(hidden.status, 'draft')

  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'PUT', {price: 1}, customer))).status, 403)
  assert.equal((await handle(request(`/api/shop-products/${product.id}`, 'DELETE', undefined, customer))).status, 403)

  const visible = await (await handle(request('/api/shop-products', 'GET', undefined, customer))).json() as ShopProduct[]
  assert.deepEqual(visible.map(p => p.id), [product.id])
  assert.equal((await handle(request(`/api/shop-products/${hidden.id}`, 'GET', undefined, customer))).status, 404)
  const all = await (await handle(request('/api/shop-products', 'GET', undefined, admin))).json() as ShopProduct[]
  assert.equal(all.length, 2)

  const updated = await (await handle(request(`/api/shop-products/${product.id}`, 'PUT', {price: 3000}, admin))).json() as ShopProduct
  assert.equal(updated.price, 3000)
  assert.equal(updated.status, 'active')
  assert.equal(updated.description, 'A formal shirt')
  assert.equal(updated.colors.length, 1)
  assert.equal((await handle(request(`/api/shop-products/${hidden.id}`, 'DELETE', undefined, admin))).status, 200)
})

test('customers can list in-stock visible fabrics, but not manage inventory', async () => {
  const {handle, store} = setup()
  const visible = await store.createProduct(inventoryItem({name: 'Cotton twill, navy', stock: 10}))
  await store.createProduct(inventoryItem({name: 'Silk', stock: 0}))
  const hidden = await store.createProduct(inventoryItem({name: 'Hidden linen', stock: 8, active: false}))
  const customer = await customerCookie(handle)
  assert.equal((await handle(request('/api/fabrics'))).status, 401)
  const list = await (await handle(request('/api/fabrics', 'GET', undefined, customer))).json() as {id:string;name:string;stock:number;price?:number}[]
  assert.deepEqual(list.map(i => i.id), [visible.id])
  assert.equal(list[0].name, 'Cotton twill, navy')
  assert.equal('price' in list[0], false)
  assert.equal((await handle(request('/api/products', 'GET', undefined, customer))).status, 403)
  assert.equal((await handle(request(`/api/products/${hidden.id}`, 'GET', undefined, customer))).status, 403)
})

test('ordering a product requires an in-stock fabric and allowed color and size, and does not deduct fabric inventory', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem({stock: 10}))
  const empty = await store.createProduct(inventoryItem({name: 'Silk', stock: 0}))
  const hidden = await store.createProduct(inventoryItem({name: 'Hidden linen', stock: 8, active: false}))
  const admin = await adminCookie(handle)
  const customer = await customerCookie(handle)
  const product = await (await handle(request('/api/shop-products', 'POST', {
    name: 'Navy barong', description: 'Handwoven', price: 3200, stock: 5, colors: [{name: 'Navy'}, {name: 'White'}], sizes: ['M', 'L'], patternStyles: ['crew'], clothingType: 'tshirt',
  }, admin))).json() as ShopProduct

  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'M', style: 'crew', color: 'Navy'}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'M', style: 'crew', color: 'Navy', fabricId: 'nope'}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'M', style: 'crew', color: 'Navy', fabricId: empty.id}]}, customer))).status, 409)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'M', style: 'crew', color: 'Navy', fabricId: hidden.id}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'M', style: 'crew', color: 'Red', fabricId: fabric.id}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'XXL', style: 'crew', color: 'Navy', fabricId: fabric.id}]}, customer))).status, 400)

  const placed = await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 2, size: 'L', style: 'crew', color: 'White', fabricId: fabric.id}]}, customer))
  assert.equal(placed.status, 201)
  const order = await placed.json() as ShopOrder
  assert.equal(order.total, 6400)
  assert.equal(order.items[0].kind, 'product')
  assert.equal(order.items[0].size, 'L')
  assert.equal(order.items[0].style, 'crew')
  assert.equal(order.items[0].color, 'White')
  assert.equal(order.items[0].qty, 2)
  assert.deepEqual(order.items[0].chosenFabric, {inventoryItemId: fabric.id, name: 'Cotton twill, navy', unit: 'yd'})
  assert.equal(order.items[0].fabrics, undefined)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)

  const feed = await (await handle(request('/api/notifications', 'GET', undefined, admin))).json() as {notifications: ShopNotification[]}
  assert.equal(feed.notifications.some(n => n.type === 'order_placed'), true)
  assert.equal(feed.notifications.some(n => n.type === 'low_stock'), false)

  const short = await handle(request('/api/orders', 'POST', {items: [{productId: product.id, qty: 4, size: 'M', style: 'crew', color: 'Navy', fabricId: fabric.id}]}, customer))
  assert.equal(short.status, 409)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)

  assert.equal((await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Cancelled'}, customer))).status, 200)
  assert.equal((await store.getShopProduct(product.id))?.stock, 5)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)

  assert.equal((await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Paid'}, admin))).status, 200)
  assert.equal((await store.getShopProduct(product.id))?.stock, 3)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)
})

test('draft products cannot be ordered and customers cannot order raw inventory', async () => {
  const {handle, store} = setup()
  const fabric = await store.createProduct(inventoryItem())
  const draft = await store.createShopProduct({name: 'Draft', description: '', price: 10, imageUrl: '', status: 'draft', stock: 5, fabrics: []})
  const customer = await customerCookie(handle)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: draft.id, qty: 1, fabricId: fabric.id}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: fabric.id, qty: 1}]}, customer))).status, 400)
  assert.equal((await handle(request('/api/orders', 'POST', {items: [{productId: fabric.id, qty: 1, kind: 'inventory'}]}, customer))).status, 403)
  assert.equal((await store.getProduct(fabric.id))?.stock, 10)
})
