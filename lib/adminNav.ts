const baseTabs:[string,string][]=[
  ['/admin','Dashboard'],
  ['/admin/products','Products'],
  ['/admin/inventory','Inventory'],
  ['/admin/production','Production'],
  ['/admin/orders','Orders'],
  ['/admin/reports','Reports'],
]

export function adminTabs(localController:boolean):[string,string][]{
  // The machine controller appears on localhost, or on Vercel when LOCAL_CONTROLLER=on.
  return localController?[...baseTabs,['/admin/local-controller','Local Controller']]:baseTabs
}
