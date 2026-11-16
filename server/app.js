import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import clientRoutes from './routes/clients.js'
import orderRoutes from './routes/orders.js'
import appointmentRoutes from './routes/appointments.js'
import measurementRoutes from './routes/measurements.js'
import patternRoutes from './routes/patterns.js'
import authRoutes from './routes/auth.js'
import { requireAuth } from './authMiddleware.js'
const currentDirectory=path.dirname(fileURLToPath(import.meta.url))
export function createApp({authorize=requireAuth}={}) {
 const app=express()
 const allowed=(process.env.ALLOWED_ORIGINS||'http://localhost:3000').split(',').map(s=>s.trim())
 app.use(cors({origin(origin,cb){cb(null,!origin||allowed.includes(origin))}}))
 app.use(express.json({limit:'256kb'}))
 app.get('/api/health',(_req,res)=>res.json({status:'ok'}))
 app.use('/api/auth',authRoutes)
 app.use(['/api','/uploads'],authorize)
 app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next()})
 app.use('/uploads',express.static(path.join(currentDirectory,'uploads'),{dotfiles:'deny'}))
 app.use('/api/pattern-files',express.static(path.join(currentDirectory,'uploads'),{dotfiles:'deny'}))
 app.use('/api/clients',clientRoutes)
 app.use('/api/orders',orderRoutes)
 app.use('/api/appointments',appointmentRoutes)
 app.use('/api/measurements',measurementRoutes)
 app.use('/api/patterns',patternRoutes)
 app.use((_req,res)=>res.status(404).json({error:'Not found'}))
 return app
}
