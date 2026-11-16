import { requestDb } from './requestContext.js'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore'

const MEASUREMENT_FIELDS = ['chest', 'sleeves', 'sleevesLength', 'neck', 'hips', 'notes']
const MEASUREMENT_DOC_ID = 'current'

function getDb() { return requestDb() }

function withoutMeta(data) {
  const payload = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && key !== 'id' && key !== 'createdAt') payload[key] = value
  }
  return payload
}

function withId(id, data) {
  return { id, ...data }
}

export async function listDocs(collectionName) {
  const snapshot = await getDocs(collection(getDb(), collectionName))
  return snapshot.docs
    .map(item => withId(item.id, item.data()))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

export async function getDocById(collectionName, id) {
  const snapshot = await getDoc(doc(getDb(), collectionName, id))
  if (!snapshot.exists()) return null
  return withId(snapshot.id, snapshot.data())
}

export async function createDoc(collectionName, data) {
  const now = new Date().toISOString()
  const payload = { ...withoutMeta(data), createdAt: now, updatedAt: now }
  const ref = await addDoc(collection(getDb(), collectionName), payload)
  return withId(ref.id, payload)
}

export async function updateDocById(collectionName, id, data) {
  const ref = doc(getDb(), collectionName, id)
  const existing = await getDoc(ref)
  if (!existing.exists()) return null

  const updates = { ...withoutMeta(data), updatedAt: new Date().toISOString() }
  await updateDoc(ref, updates)
  return withId(id, { ...existing.data(), ...updates })
}

export async function deleteDocById(collectionName, id) {
  const ref = doc(getDb(), collectionName, id)
  const existing = await getDoc(ref)
  if (!existing.exists()) return null
  await deleteDoc(ref)
  return withId(id, existing.data())
}

export async function findDocsByField(collectionName, field, value) {
  const snapshot = await getDocs(query(collection(getDb(), collectionName), where(field, '==', value)))
  return snapshot.docs.map(item => withId(item.id, item.data()))
}

function blankMeasurements() {
  return Object.fromEntries(MEASUREMENT_FIELDS.map(field => [field, '']))
}

function measurementFields(body = {}) {
  const fields = {}
  for (const field of MEASUREMENT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null) fields[field] = String(body[field])
  }
  return fields
}

export async function getMeasurements() {
  const ref = doc(getDb(), 'measurements', MEASUREMENT_DOC_ID)
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) return withId(snapshot.id, snapshot.data())

  const now = new Date().toISOString()
  const payload = { ...blankMeasurements(), createdAt: now, updatedAt: now }
  await setDoc(ref, payload)
  return withId(MEASUREMENT_DOC_ID, payload)
}

export async function saveMeasurements(body) {
  const ref = doc(getDb(), 'measurements', MEASUREMENT_DOC_ID)
  const snapshot = await getDoc(ref)
  const now = new Date().toISOString()
  const fields = measurementFields(body)

  if (!snapshot.exists()) {
    const payload = { ...blankMeasurements(), ...fields, createdAt: now, updatedAt: now }
    await setDoc(ref, payload)
    return withId(MEASUREMENT_DOC_ID, payload)
  }

  const updates = { ...fields, updatedAt: now }
  await updateDoc(ref, updates)
  return withId(MEASUREMENT_DOC_ID, { ...snapshot.data(), ...updates })
}
