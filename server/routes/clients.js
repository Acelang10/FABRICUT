import express from 'express'
import { createDoc, deleteDocById, getDocById, listDocs, updateDocById } from '../db.js'
import { requireText, respondWithError } from '../validate.js'

const router = express.Router()

const MEASUREMENT_FIELDS = [
  'chest',
  'sleeves',
  'sleevesLength',
  'neck',
  'hips',
  'waist',
  'shoulder',
  'pantsSlope',
  'sizeSelection',
  'notes'
]

function clientMeasurements(input = {}) {
  return Object.fromEntries(MEASUREMENT_FIELDS.map(field => [
    field,
    input?.[field] == null ? '' : String(input[field])
  ]))
}

router.get('/', async (req, res) => {
  try {
    res.json(await listDocs('clients'))
  } catch (err) {
    respondWithError(res, err)
  }
})

router.get('/:id', async (req, res) => {
  try {
    const client = await getDocById('clients', req.params.id)
    if (!client) return res.status(404).json({ error: 'Client not found' })
    res.json(client)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.post('/', async (req, res) => {
  try {
    const saved = await createDoc('clients', {
      name: requireText(req.body.name, 'Name'),
      totalOrders: 0,
      status: 'New',
      measurements: clientMeasurements(req.body.measurements)
    })
    res.status(201).json(saved)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.put('/:id', async (req, res) => {
  try {
    const updates = {}
    if (req.body.name !== undefined) updates.name = requireText(req.body.name, 'Name')
    if (req.body.measurements !== undefined) updates.measurements = clientMeasurements(req.body.measurements)

    const updated = await updateDocById('clients', req.params.id, updates)
    if (!updated) return res.status(404).json({ error: 'Client not found' })
    res.json(updated)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteDocById('clients', req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Client not found' })
    res.json({ message: 'Client deleted' })
  } catch (err) {
    respondWithError(res, err)
  }
})

export default router
