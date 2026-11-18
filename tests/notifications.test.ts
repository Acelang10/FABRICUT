import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from '../lib/server/api'
import {createMemoryStore} from '../lib/server/store'
import {sendNotificationEmail,setMailTransportForTests,type MailPayload} from '../lib/server/email'
import type {Identity} from '../lib/server/identity'
import type {Product,ShopNotification,ShopOrder} from '../lib/types'

process.env.SESSION_SECRET ||= 'test-session-secret-value!!'
process.env.ADMIN_USERNAME ||= 'admin'
process.env.ADMIN_PASSWORD ||= 'admin123'
process.env.SHOP_STORE ||= 'json'
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
  if (options?.token) headers.Authorization = `Bearer ${options.token}`
  if (options?.cookie) headers.Cookie = `fabricut_session=${options.cookie}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request('http://localhost' + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}


// Customers buy sellable products (shop-products). Wrap an inventory item in a product that uses 1 unit of it.
async function sellable(store: ReturnType<typeof createMemoryStore>, item: Product) {
  return store.createShopProduct({
    name: item.name, description: '', price: item.price ?? 1, imageUrl: '', status: 'active', stock: item.stock,
    fabrics: [{inventoryItemId: item.id, name: item.name, unit: item.unit, quantity: 1}],
  })
}

function cookieFrom(response: Response) {
  const header = response.headers.get('set-cookie') || ''
  return /fabricut_session=([^;]+)/.exec(header)?.[1] || ''
}

async function adminCookie(handle: ReturnType<typeof createHandler>) {
  const response = await handle(request('/api/auth/admin', 'POST', {username: 'admin', password: 'admin123'}))
  assert.equal(response.status, 200)
  return cookieFrom(response)
}

async function customerCookie(handle: ReturnType<typeof createHandler>, token = 'valid.mock.signature') {
  const response = await handle(request('/api/auth/session', 'GET', undefined, {token}))
  assert.equal(response.status, 200)
  return cookieFrom(response)
}

const sampleProduct = {
  name: 'Piña Barong fabric',
  category: 'Fabrics' as const,
  price: 2850,
  stock: 6,
  unit: 'yd',
  description: 'Handwoven piña',
  imageColor: 'pina',
  active: true,
}

test('GET /api/notifications requires a session', async () => {
  const {handle} = setup()
  assert.equal((await handle(request('/api/notifications'))).status, 401)
  assert.equal((await handle(request('/api/notifications/read', 'POST', {all: true}))).status, 401)
})

test('placing an order notifies the admin and the customer, and emails are skipped when disabled', async () => {
  const sent: MailPayload[] = []
  setMailTransportForTests({async sendMail(payload){ sent.push(payload) }})
  try {
    const {handle, store} = setup()
    const product = await store.createProduct(sampleProduct)
    const item = await sellable(store, product)
    const cookie = await customerCookie(handle)
    const placed = await handle(request('/api/orders', 'POST', {items: [{productId: item.id, qty: 2, fabricId: product.id}]}, {cookie}))
    assert.equal(placed.status, 201)
    const order = await placed.json() as ShopOrder
    assert.equal(order.status, 'Pending')

    const admin = await adminCookie(handle)
    const adminFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
    assert.equal(adminFeed.unread >= 1, true)
    assert.equal(adminFeed.notifications.some(item => item.type === 'order_placed' && item.recipient === 'admin' && item.link === '/admin/orders'), true)
    assert.equal(adminFeed.notifications.some(item => item.recipient === 'customer-uid'), false)

    const customerFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
    assert.equal(customerFeed.notifications.length, 1)
    assert.equal(customerFeed.notifications[0].type, 'order_placed')
    assert.equal(customerFeed.notifications[0].recipient, 'customer-uid')
    assert.equal(customerFeed.notifications[0].link, '/shop/orders')
    assert.equal(customerFeed.unread, 1)
    assert.equal(customerFeed.unreadCount, 1)
    assert.equal(customerFeed.unreadCount, customerFeed.unread)
    assert.equal(sent.length, 0)
  } finally {
    setMailTransportForTests(undefined)
  }
})

test('lowering inventory to the threshold creates a low-stock notification for admin only', async () => {
  const {handle, store} = setup()
  const product = await store.createProduct({...sampleProduct, stock: 6})
  const admin = await adminCookie(handle)
  const cookie = await customerCookie(handle)
  const updated = await handle(request(`/api/products/${product.id}`, 'PUT', {stock: 5}, {cookie: admin}))
  assert.equal(updated.status, 200)
  assert.equal((await store.getProduct(product.id))?.stock, 5)

  const adminFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]}
  const low = adminFeed.notifications.filter(item => item.type === 'low_stock')
  assert.equal(low.length, 1)
  assert.equal(low[0].link, '/admin/inventory')
  assert.match(low[0].title, /Piña/)

  const customerFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie}))).json() as {notifications: ShopNotification[]}
  assert.equal(customerFeed.notifications.some(item => item.type === 'low_stock'), false)

  const again = await handle(request(`/api/products/${product.id}`, 'PUT', {stock: 4}, {cookie: admin}))
  assert.equal(again.status, 200)
  const after = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]}
  assert.equal(after.notifications.filter(item => item.type === 'low_stock').length, 1)
})

test('admin status changes notify the customer, and a customer cancel notifies the admin', async () => {
  const {handle, store} = setup()
  const product = await store.createProduct({...sampleProduct, stock: 18})
  const item = await sellable(store, product)
  const cookie = await customerCookie(handle)
  const placed = await handle(request('/api/orders', 'POST', {items: [{productId: item.id, qty: 1, fabricId: product.id}]}, {cookie}))
  const order = await placed.json() as ShopOrder
  const admin = await adminCookie(handle)

  const updated = await handle(request(`/api/orders/${order.id}`, 'PATCH', {status: 'Ready'}, {cookie: admin}))
  assert.equal(updated.status, 200)
  const customerFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie}))).json() as {notifications: ShopNotification[]}
  assert.equal(customerFeed.notifications.some(item => item.type === 'order_status' && item.title.includes('Ready')), true)

  const second = await handle(request('/api/orders', 'POST', {items: [{productId: item.id, qty: 1, fabricId: product.id}]}, {cookie}))
  const pending = await second.json() as ShopOrder
  assert.equal((await handle(request(`/api/orders/${pending.id}`, 'PATCH', {status: 'Paid'}, {cookie}))).status, 403)
  const cancelled = await handle(request(`/api/orders/${pending.id}`, 'PATCH', {status: 'Cancelled'}, {cookie}))
  assert.equal(cancelled.status, 200)
  const adminFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]}
  assert.equal(adminFeed.notifications.some(item => item.type === 'order_cancelled' && item.recipient === 'admin'), true)
  const afterCancel = await (await handle(request('/api/notifications', 'GET', undefined, {cookie}))).json() as {notifications: ShopNotification[]}
  assert.equal(afterCancel.notifications.some(item => item.type === 'order_cancelled'), false)
})

test('customers cannot read or mark another recipient\'s notifications', async () => {
  const {handle, store} = setup()
  const product = await store.createProduct({...sampleProduct, stock: 18})
  const item = await sellable(store, product)
  const mine = await customerCookie(handle)
  await handle(request('/api/orders', 'POST', {items: [{productId: item.id, qty: 1, fabricId: product.id}]}, {cookie: mine}))
  const other = createHandler({
    store,
    sessionSecret: () => secret,
    project: () => 'fabricut-248b4',
    verify: async () => ({...customerClaims, sub: 'other-uid', email: 'other@example.invalid'}),
  })
  const otherCookie = cookieFrom(await other(request('/api/auth/session', 'GET', undefined, {token: 'valid.mock.signature'})))
  const list = await (await other(request('/api/notifications', 'GET', undefined, {cookie: otherCookie}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
  assert.equal(list.notifications.length, 0)
  assert.equal(list.unread, 0)

  const admin = await adminCookie(handle)
  const adminFeed = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
  const adminId = adminFeed.notifications[0].id
  const marked = await other(request('/api/notifications/read', 'POST', {ids: [adminId]}, {cookie: otherCookie}))
  assert.equal(marked.status, 200)
  const still = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
  assert.equal(still.notifications.find(item => item.id === adminId)?.read, false)
  assert.equal(still.unread, adminFeed.unread)

  const own = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: mine}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
  assert.equal(own.unread > 0, true)
  const all = await handle(request('/api/notifications/read', 'POST', {all: true}, {cookie: mine}))
  assert.equal(all.status, 200)
  const after = await (await handle(request('/api/notifications', 'GET', undefined, {cookie: mine}))).json() as {unread: number; unreadCount: number; notifications: ShopNotification[]}
  assert.equal(after.unread, 0)
  assert.equal(after.unreadCount, 0)
  assert.equal(after.notifications.every(item => item.read), true)
})


test('GET /api/notifications unreadCount is the full server count, not just the loaded list', async () => {
  const {handle, store} = setup()
  const admin = await adminCookie(handle)
  for (let i = 0; i < 25; i++) {
    await store.createNotification({
      recipient: 'admin',
      type: 'order_placed',
      title: `Order ${i + 1}`,
      message: 'A new order arrived',
      link: '/admin/orders',
    })
  }
  const feed = await (await handle(request('/api/notifications?limit=20', 'GET', undefined, {cookie: admin}))).json() as {notifications: ShopNotification[]; unread: number; unreadCount: number}
  assert.equal(feed.notifications.length, 20)
  assert.equal(feed.unread, 25)
  assert.equal(feed.unreadCount, 25)
  const marked = await handle(request('/api/notifications/read', 'POST', {all: true}, {cookie: admin}))
  assert.equal(marked.status, 200)
  const body = await marked.json() as {ok: boolean; count: number; unread: number; unreadCount: number}
  assert.equal(body.count, 25)
  assert.equal(body.unread, 0)
  assert.equal(body.unreadCount, 0)
})

test('sendNotificationEmail skips the transport when EMAIL_NOTIFICATIONS is off', async () => {
  const previous = process.env.EMAIL_NOTIFICATIONS
  process.env.EMAIL_NOTIFICATIONS = 'off'
  let called = 0
  setMailTransportForTests({async sendMail(){ called += 1 }})
  try {
    const result = await sendNotificationEmail({
      to: 'admin@example.invalid',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    })
    assert.deepEqual(result, {skipped: true})
    assert.equal(called, 0)
  } finally {
    setMailTransportForTests(undefined)
    process.env.EMAIL_NOTIFICATIONS = previous
  }
})

test('sendNotificationEmail uses the mock transport when enabled', async () => {
  const previous = process.env.EMAIL_NOTIFICATIONS
  const previousFrom = process.env.EMAIL_FROM
  process.env.EMAIL_NOTIFICATIONS = 'on'
  process.env.EMAIL_FROM = 'atelier@example.invalid'
  const sent: Array<MailPayload & {from: string}> = []
  setMailTransportForTests({async sendMail(payload){ sent.push(payload) }})
  try {
    const result = await sendNotificationEmail({
      to: 'customer@example.invalid',
      subject: 'Order received',
      text: 'Thanks',
      html: '<p>Thanks</p>',
    })
    assert.deepEqual(result, {sent: true})
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'customer@example.invalid')
    assert.equal(sent[0].from, 'atelier@example.invalid')
    assert.equal(sent[0].subject, 'Order received')
  } finally {
    setMailTransportForTests(undefined)
    process.env.EMAIL_NOTIFICATIONS = previous
    if (previousFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = previousFrom
  }
})
