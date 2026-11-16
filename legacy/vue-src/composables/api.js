import { authorizationHeaders } from './firebase.js'
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const BASE_URL = configuredApiUrl
  ? configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`
  : '/api'
const ASSET_BASE_URL = BASE_URL.endsWith('/api')
  ? BASE_URL.slice(0, -4)
  : ''

function resolveAssetUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url
  return `${ASSET_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

async function errorMessage(res, fallback) {
  const response = await res.json().catch(() => null)
  return response?.error || response?.message || fallback
}

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: await authorizationHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `GET ${path} failed: ${res.statusText}`))
  return res.json()
}

export async function apiPost(path, data) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...(await authorizationHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(await errorMessage(res, `POST ${path} failed: ${res.statusText}`))
  return res.json()
}

export async function apiPut(path, data) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { ...(await authorizationHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(await errorMessage(res, `PUT ${path} failed: ${res.statusText}`))
  return res.json()
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: await authorizationHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `DELETE ${path} failed: ${res.statusText}`))
  return res.json()
}

export async function apiUploadPattern(file, role) {
  const formData = new FormData()
  formData.append('pattern', file)

  const res = await fetch(`${BASE_URL}/patterns`, {
    method: 'POST',
    headers: await authorizationHeaders(),
    body: formData
  })

  if (!res.ok) {
    const response = await res.json().catch(() => null)
    throw new Error(response?.message || `POST /patterns failed: ${res.statusText}`)
  }

  const response = await res.json()
  if (response.url) { response.privateUrl = resolveAssetUrl(response.url); response.url = await apiFetchAsset(response.privateUrl) }
  return response
}

// Fetch private images as blobs; never place ID tokens in URLs.
export async function apiFetchAsset(url) {
 const target=new URL(resolveAssetUrl(url),window.location.origin)
 const expected=new URL(ASSET_BASE_URL||window.location.origin,window.location.origin)
 if(target.origin!==expected.origin || !/^\/(uploads|api\/pattern-files)\//.test(target.pathname)) throw new Error('Untrusted asset URL')
 const res=await fetch(target.href,{headers:await authorizationHeaders()})
 if(!res.ok)throw new Error('Private asset access denied')
 return URL.createObjectURL(await res.blob()) // Caller must revoke on replacement/unmount.
}
