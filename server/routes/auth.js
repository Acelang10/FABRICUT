import express from 'express'
import { firebaseConfig } from '../firebaseConfig.js'
import { requireAuth } from '../authMiddleware.js'
export { requireAuth }
const router=express.Router()
router.get('/config',(_req,res)=>{try {res.set('Cache-Control','no-store').json(firebaseConfig())} catch {res.status(503).json({error:'Firebase configuration unavailable'})}})
router.post('/login',(_req,res)=>res.status(410).json({error:'Password login removed. Use Google Firebase sign-in.'}))
router.get('/me',requireAuth,(req,res)=>res.json({user:req.user}))
export default router
