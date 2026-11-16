import {z} from 'zod'
import {PRODUCT_CATEGORIES,ORDER_STATUSES,SHOP_PRODUCT_STATUSES} from '../types'
import {PRODUCTION_STAGES} from '../clothing'

const text = z.string().trim().min(1).max(200)
export const productInputSchema = z.object({
  name: text,
  category: z.enum(PRODUCT_CATEGORIES),
  price: z.number().finite().gt(0).max(10_000_000),
  // Inventory can be fractional (e.g. 16.5 yd left after a product used 1.5 yd).
  stock: z.number().finite().min(0).max(1_000_000).transform(v => Math.round(v * 100) / 100),
  unit: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2000).default(''),
  imageColor: z.string().trim().min(1).max(40).default('swatch'),
  active: z.boolean().default(true),
}).strict()
export const productUpdateSchema = productInputSchema.partial()

export const orderItemRequestSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(100000),
  // 'product' = sellable product (customers); 'inventory' = raw inventory item (admin walk-in only).
  kind: z.enum(['product','inventory']).default('product'),
  // Garment choices for products; checked against the product's offered sizes/patterns on the server.
  size: z.string().trim().min(1).max(10).optional(),
  style: z.string().trim().min(1).max(40).optional(),
}).strict()

export const lineProgressSchema = z.object({progress: z.enum(PRODUCTION_STAGES)}).strict()

const imageUrl = z.string().trim().max(500).refine(
  value => value === '' || /^https:\/\/[^\s"'<>]+$/i.test(value) || /^\/(?!\/)[^\s"'<>]*$/.test(value),
  {message: 'Image must be an https:// link or a /path on this site'},
)
export const fabricUseRequestSchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(80),
  quantity: z.number().finite().gt(0).max(100_000),
}).strict()
const shopProductShape = {
  name: text,
  description: z.string().trim().max(2000),
  price: z.number().finite().gt(0).max(10_000_000),
  imageUrl,
  status: z.enum(SHOP_PRODUCT_STATUSES),
  stock: z.number().int().min(0).max(1_000_000),
  fabrics: z.array(fabricUseRequestSchema).max(20),
  clothingType: z.string().trim().min(1).max(40),
  patternStyles: z.array(z.string().trim().min(1).max(40)).max(10),
  sizes: z.array(z.string().trim().min(1).max(10)).max(10),
}
export const shopProductInputSchema = z.object({
  ...shopProductShape,
  description: shopProductShape.description.default(''),
  imageUrl: imageUrl.default(''),
  status: shopProductShape.status.default('draft'),
  fabrics: shopProductShape.fabrics.default([]),
  clothingType: shopProductShape.clothingType.optional(),
  patternStyles: shopProductShape.patternStyles.optional(),
  sizes: shopProductShape.sizes.optional(),
}).strict()
// No defaults on update, so a partial PUT never resets status/fabrics.
export const shopProductUpdateSchema = z.object(shopProductShape).partial().strict()
  .refine(data => Object.keys(data).length > 0, {message: 'No fields to update'})

export const placeOrderSchema = z.object({
  items: z.array(orderItemRequestSchema).min(1).max(50),
  note: z.string().trim().max(2000).default(''),
  customerEmail: z.string().trim().email().max(200).optional(),
  customerName: z.string().trim().max(120).optional(),
  source: z.enum(['customer','admin']).optional(),
}).strict()

export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  note: z.string().trim().max(2000).optional(),
}).strict().refine(data => data.status !== undefined || data.note !== undefined, {message: 'No fields to update'})

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  all: z.boolean().optional(),
}).strict().refine(data => data.all === true || (data.ids !== undefined && data.ids.length > 0), {message: 'Provide ids or all'})
