import {z} from 'zod'
import {ORDER_STATUSES,SHOP_PRODUCT_STATUSES} from '../types'
import {PRODUCTION_STAGES} from '../clothing'

const text = z.string().trim().min(1).max(200)
const imageUrl = z.string().trim().max(500).refine(
  value => value === '' || /^https:\/\/[^\s"'<>]+$/i.test(value) || /^\/(?!\/)[^\s"'<>]*$/.test(value),
  {message: 'Image must be an https:// link or a /path on this site'},
)
const inventoryShape = {
  name: text,
  // Inventory can be fractional (e.g. 16.5 yd left after a product used 1.5 yd).
  stock: z.number().finite().min(0).max(1_000_000).transform(v => Math.round(v * 100) / 100),
  unit: z.string().trim().min(1).max(40),
  imageUrl,
  active: z.boolean(),
}
// Inventory items are fabrics: name, stock, unit and photo. Category, price, swatch and description are no longer accepted.
export const productInputSchema = z.object({
  ...inventoryShape,
  unit: inventoryShape.unit.default('yd'),
  imageUrl: imageUrl.default(''),
  active: inventoryShape.active.default(true),
}).strict()
// No defaults on update, so hiding a fabric never wipes its photo or leftover legacy fields.
export const productUpdateSchema = z.object(inventoryShape).partial().strict()

export const orderItemRequestSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(100000),
  // 'product' = sellable product (customers); 'inventory' = raw inventory item (admin walk-in only).
  kind: z.enum(['product','inventory']).default('product'),
  // Garment choices for products; checked against the product's offered sizes/patterns/colors on the server.
  size: z.string().trim().min(1).max(10).optional(),
  style: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().min(1).max(40).optional(),
  fabricId: z.string().trim().min(1).max(80).optional(),
}).strict()

export const lineProgressSchema = z.object({progress: z.enum(PRODUCTION_STAGES)}).strict()

export const fabricUseRequestSchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(80),
  quantity: z.number().finite().gt(0).max(100_000),
}).strict()
const productColorSchema = z.object({
  name: z.string().trim().min(1).max(40),
  hex: z.string().trim().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color must be a #hex value').optional().or(z.literal('')),
}).strict().transform(({name, hex}) => hex ? {name, hex} : {name})
const productColorsSchema = z.array(productColorSchema).max(20).superRefine((colors, ctx) => {
  const seen = new Set<string>()
  for (const [index, color] of colors.entries()) {
    const key = color.name.toLowerCase()
    if (seen.has(key)) ctx.addIssue({code: 'custom', message: 'Each color can only be listed once', path: [index, 'name']})
    seen.add(key)
  }
})

const shopProductShape = {
  name: text,
  description: z.string().trim().max(2000),
  price: z.number().finite().gt(0).max(10_000_000),
  imageUrl,
  status: z.enum(SHOP_PRODUCT_STATUSES),
  stock: z.number().int().min(0).max(1_000_000),
  fabrics: z.array(fabricUseRequestSchema).max(20),
  colors: productColorsSchema,
  clothingType: z.string().trim().min(1).max(40),
  patternStyles: z.array(z.string().trim().min(1).max(40)).max(10),
  sizes: z.array(z.string().trim().min(1).max(10)).max(10),
}
export const shopProductInputSchema = z.object({
  ...shopProductShape,
  description: shopProductShape.description.default(''),
  imageUrl: imageUrl.default(''),
  status: shopProductShape.status.default('active'),
  fabrics: shopProductShape.fabrics.default([]),
  colors: shopProductShape.colors.default([]),
  clothingType: shopProductShape.clothingType.optional(),
  patternStyles: shopProductShape.patternStyles.optional(),
  sizes: shopProductShape.sizes.optional(),
}).strict()
// No defaults on update, so a partial PUT never resets status/fabrics/colors.
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

const optionalText = (max: number) => z.string().trim().max(max)
/** Own-profile edit. strict(): no id/uid/role fields can be smuggled in. */
export const profileUpdateSchema = z.object({
  displayName: optionalText(80),
  phone: optionalText(30).refine(v => v === '' || /^[0-9+()\-.\s]{5,30}$/.test(v), {message: 'Phone can only use digits, spaces, + - ( ) .'}),
  address: optionalText(300),
  birthday: z.string().trim().refine(v => {
    if (v === '') return true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
    const d = new Date(`${v}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false
    return d.getTime() <= Date.now() && d.getUTCFullYear() >= 1900
  }, {message: 'Birthday must be a real past date (YYYY-MM-DD)'}),
  photoUrl: z.string().trim().max(500).refine(v => v === '' || /^https:\/\/[^\s"'<>]+$/i.test(v), {message: 'Photo must be an https:// link'}),
}).partial().strict().refine(data => Object.keys(data).length > 0, {message: 'No fields to update'})

export const uploadSignSchema = z.object({kind: z.enum(['inventory','products','avatars','test'])}).strict()
export const uploadConfirmSchema = z.object({
  kind: z.enum(['inventory','products','avatars','test']),
  publicId: z.string().trim().min(1).max(300).regex(/^[A-Za-z0-9_\/-]+$/),
}).strict()
