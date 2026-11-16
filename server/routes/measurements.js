import express from 'express'
import { getMeasurements, saveMeasurements } from '../db.js'
import { respondWithError } from '../validate.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    res.json(await getMeasurements())
  } catch (err) {
    respondWithError(res, err)
  }
})

router.put('/', async (req, res) => {
  try {
    res.json(await saveMeasurements(req.body))
  } catch (err) {
    respondWithError(res, err)
  }
})

export default router
