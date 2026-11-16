import express from 'express'
import { createDoc, deleteDocById, getDocById, listDocs, updateDocById } from '../db.js'
import { requireEnum, requireText, respondWithError } from '../validate.js'

const router = express.Router()

const APPOINTMENT_STATUSES = ['Confirmed', 'Cancelled', 'Pending']

function appointmentFields(body, { defaults = false } = {}) {
  const fields = {}
  if (body.time !== undefined || defaults) fields.time = requireText(body.time, 'Time')
  if (body.client !== undefined || defaults) fields.client = requireText(body.client, 'Client')
  if (body.service !== undefined || defaults) fields.service = requireText(body.service, 'Service')
  if (body.date !== undefined || defaults) fields.date = requireText(body.date, 'Date')
  if (body.status !== undefined || defaults) {
    fields.status = requireEnum(body.status || 'Confirmed', APPOINTMENT_STATUSES, 'Status')
  }
  return fields
}

router.get('/', async (req, res) => {
  try {
    res.json(await listDocs('appointments'))
  } catch (err) {
    respondWithError(res, err)
  }
})

router.get('/:id', async (req, res) => {
  try {
    const appointment = await getDocById('appointments', req.params.id)
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' })
    res.json(appointment)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.post('/', async (req, res) => {
  try {
    const saved = await createDoc('appointments', {
      ...appointmentFields(req.body, { defaults: true }),
      status: 'Confirmed'
    })
    res.status(201).json(saved)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.put('/:id', async (req, res) => {
  try {
    const updated = await updateDocById('appointments', req.params.id, appointmentFields(req.body))
    if (!updated) return res.status(404).json({ error: 'Appointment not found' })
    res.json(updated)
  } catch (err) {
    respondWithError(res, err)
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteDocById('appointments', req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Appointment not found' })
    res.json({ message: 'Appointment deleted' })
  } catch (err) {
    respondWithError(res, err)
  }
})

export default router
