import {z} from 'zod'
import {measurementKeys,globalMeasurementKeys,milestones} from '../types'
const text=z.string().trim().min(1).max(200),optional=z.string().max(2000).default('')
export const clientSchema=z.object({name:text,measurements:z.object(Object.fromEntries(measurementKeys.map(k=>[k,optional]))).default(()=>Object.fromEntries(measurementKeys.map(k=>[k,''])))}).strict()
export const orderSchema=z.object({client:text,item:text,date:text,amount:text,status:z.enum(['Pending','In Progress','Completed']).default('Pending'),fabricType:optional,fabricRisk:optional,cutQuantity:z.number().min(0).max(1000000).default(0),patternSample:optional,milestone:z.enum(milestones).default('Pattern selection'),progress:z.number().min(0).max(100).default(0),motorSpeed:z.number().min(0).max(1000000).default(0)}).strict()
export const appointmentSchema=z.object({client:text,service:text,time:text,date:text,status:z.enum(['Confirmed','Cancelled','Pending']).default('Confirmed')}).strict()
export const measurementsSchema=z.object(Object.fromEntries(globalMeasurementKeys.map(k=>[k,optional]))).strict()
