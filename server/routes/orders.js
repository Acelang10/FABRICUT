import express from 'express'
import { createDoc, deleteDocById, findDocsByField, getDocById, listDocs, updateDocById } from '../db.js'
import { boundedNumber, requireEnum, requireText, respondWithError } from '../validate.js'

const router = express.Router()

const ORDER_STATUSES = ['Pending', 'In Progress', 'Completed']
const MILESTONES = ['Pattern selection', 'Fabric identification', 'Cutting', 'Quality check', 'Ready for pickup']

function nextOrderId(orders) {
  const max = orders.reduce((highest, order) => {
    const match = /^ORD-(\d+)$/.exec(order.orderId || '')
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `ORD-${String(max + 1).padStart(3, '0')}`
}

function orderFields(body, { defaults = false } = {}) {
  const fields = {}
  if (body.client !== undefined || defaults) fields.client = requireText(body.client, 'Client')
  if (body.item !== undefined || defaults) fields.item = requireText(body.item, 'Item')
  if (body.date !== undefined || defaults) fields.date = requireText(body.date, 'Date')
  if (body.amount !== undefined || defaults) fields.amount = requireText(body.amount, 'Amount')
  if (body.status !== undefined || defaults) {
    fields.status = requireEnum(body.status || 'Pending', ORDER_STATUSES, 'Status')
  }
  if (body.fabricType !== undefined || defaults) fields.fabricType = body.fabricType == null ? '' : String(body.fabricType)
  if (body.fabricRisk !== undefined || defaults) fields.fabricRisk = body.fabricRisk == null ? '' : String(body.fabricRisk)
  if (body.cutQuantity !== undefined || defaults) fields.cutQuantity = boundedNumber(body.cutQuantity || 0, 'Cut quantity', 0, Infinity)
  if (body.patternSample !== undefined || defaults) fields.patternSample = body.patternSample == null ? '' : String(body.patternSample)
  if (body.milestone !== undefined || defaults) {
    fields.milestone = requireEnum(body.milestone || 'Pattern selection', MILESTONES, 'Milestone')
  }
  if (body.progress !== undefined || defaults) fields.progress = boundedNumber(body.progress || 0, 'Progress', 0, 100)
  if (body.motorSpeed !== undefined || defaults) fields.motorSpeed = boundedNumber(body.motorSpeed || 0, 'Motor speed', 0, Infinity)
  return fields
}

async function adjustClientOrders(clientName, delta) {
  const [client] = await findDocsByField('clients', 'name', clientName)
  if (!client) return

  const previousTotal = client.totalOrders || 0
  const totalOrders = Math.max(0, previousTotal + delta)
  const updates = { totalOrders }
  if (delta > 0) updates.status = 'Active'
  else if (previousTotal > 0 && totalOrders === 0) updates.status = 'New'
  await updateDocById('clients', client.id, updates)
}

router.get('/', async (req, res) => {
  try {
    res.json(await listDocs('orders'))
  } catch (err) {
    respondWithError(res, err)
  }
})

router.get('/:id', async (req, res) => {
  try {
    const order = await getDocById('orders', req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json(order)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.post('/', async (req, res) => {
  try {
    const orders = await listDocs('orders')
    const saved = await createDoc('orders', {
      orderId: nextOrderId(orders),
      ...orderFields(req.body, { defaults: true })
    })
    await adjustClientOrders(saved.client, 1)
    res.status(201).json(saved)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.put('/:id', async (req, res) => {
  try {
    const updated = await updateDocById('orders', req.params.id, orderFields(req.body))
    if (!updated) return res.status(404).json({ error: 'Order not found' })
    res.json(updated)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const order = await getDocById('orders', req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    await deleteDocById('orders', req.params.id)
    await adjustClientOrders(order.client, -1)
    res.json({ message: 'Order deleted' })
  } catch (err) {
    respondWithError(res, err)
  }
})

export default router
