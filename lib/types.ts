export const measurementKeys=['chest','waist','hips','shoulder','neck','sleeves','sleevesLength','pantsSlope','sizeSelection','notes'] as const
export const globalMeasurementKeys=['chest','sleeves','sleevesLength','neck','hips','notes'] as const
export const milestones=['Pattern selection','Fabric identification','Cutting','Quality check','Ready for pickup'] as const
export const fabrics=['Cotton','Linen','Wool','Silk','Denim','Polyester','Solar Fabric','Mixed Fabric'] as const
export type Measurements=Record<string,string>
export interface Meta {id:string;createdAt?:string;updatedAt?:string}
export interface Client extends Meta {name:string;totalOrders:number;status:'New'|'Active';measurements:Measurements}
export interface Order extends Meta {orderId:string;client:string;item:string;date:string;amount:string;status:'Pending'|'In Progress'|'Completed';fabricType:string;fabricRisk:string;cutQuantity:number;patternSample:string;milestone:string;progress:number;motorSpeed:number}
export interface Appointment extends Meta {client:string;service:string;time:string;date:string;status:'Confirmed'|'Cancelled'|'Pending'}
export interface Snapshot {clients:Client[];orders:Order[];appointments:Appointment[];measurements:Measurements}
export interface StaffUser {uid:string;email:string;role:'owner'|'staff'|'pending'|'admin'|'customer';name?:string}
export type Collection='clients'|'orders'|'appointments'|'measurements'|'accessRequests'|'staffApprovals'
export type Document=Record<string,unknown>&{id:string}

export type Role = 'admin' | 'customer'
export interface AppUser {uid:string;email:string;role:Role;name?:string}
export const PRODUCT_CATEGORIES = ['Fabrics','Laser-cut','Custom-cut','Tailoring'] as const
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]
export const ORDER_STATUSES = ['Pending','Paid','To cut','Cutting','Ready','Completed','Cancelled'] as const
export type OrderStatus = typeof ORDER_STATUSES[number]
export const DEFAULT_LOW_STOCK_THRESHOLD = 5
export const LOW_STOCK_THRESHOLD = DEFAULT_LOW_STOCK_THRESHOLD
export interface Product extends Meta {
  name:string
  category:ProductCategory
  price:number
  stock:number
  unit:string
  description:string
  imageColor:string
  active:boolean
}
export const SHOP_PRODUCT_STATUSES = ['draft','active'] as const
export type ShopProductStatus = typeof SHOP_PRODUCT_STATUSES[number]
/** One fabric (inventory item) used to make a sellable product, per unit sold. */
export interface FabricUse {inventoryItemId:string;name:string;unit:string;quantity:number}
/** A finished product customers can buy. Inventory (Product) stays admin-only raw material. */
export interface ShopProduct extends Meta {
  name:string
  description:string
  price:number
  imageUrl:string
  status:ShopProductStatus
  stock:number
  fabrics:FabricUse[]
  /** Clothing type id from lib/clothing.ts (e.g. 'tshirt'). */
  clothingType:string
  /** Pattern/style ids the customer may choose from. */
  patternStyles:string[]
  /** Sizes the customer may choose from (XS…XXXL). */
  sizes:string[]
}
export type OrderLineKind = 'product' | 'inventory'
/** kind is absent on legacy orders, which always referenced inventory items directly. */
export interface OrderItem {
  productId:string;name:string;price:number;qty:number;kind?:OrderLineKind;fabrics?:FabricUse[]
  /** Garment choices for product lines. */
  clothingType?:string;style?:string;size?:string
  /** Production stage for this line (Queued…Delivered); absent = Queued. */
  progress?:import('./clothing').ProductionStage;progressUpdatedAt?:string
}
export interface ShopOrder extends Meta {
  customerUid:string
  customerEmail:string
  customerName:string
  items:OrderItem[]
  total:number
  status:OrderStatus
  note:string
  source:'customer'|'admin'
}

export const NOTIFICATION_TYPES = ['order_placed','low_stock','order_cancelled','order_status'] as const
export type NotificationType = typeof NOTIFICATION_TYPES[number]
export interface ShopNotification {
  id:string
  recipient:string
  customerEmail:string
  type:NotificationType
  title:string
  message:string
  link:string
  read:boolean
  createdAt:string
}
