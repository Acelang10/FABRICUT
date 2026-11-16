import './loadEnv.js'
import { readFile, writeFile } from 'node:fs/promises'
import { approvedStaff } from './firebaseConfig.js'
const emails=(process.env.FIREBASE_OWNER_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
if(!emails.length || emails.some(email=>! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Explicit valid approved staff emails required; no rules generated')
const source=new URL('../firestore.rules',import.meta.url)
const original=await readFile(source,'utf8')
const updated=original.replace(/^  function staffEmails\(\) \{ return .*; \} \/\/ STAFF_ALLOWLIST$/m,`  function staffEmails() { return ${JSON.stringify(emails)}; } // STAFF_ALLOWLIST`)
if(updated===original && !original.includes(JSON.stringify(emails))) throw new Error('Staff rules marker missing')
await writeFile(source,updated)
console.log('Explicit staff allowlist synchronized into local rules; nothing deployed.')
