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
  // The tab opens the advanced laser cutter.
  return localController?[...baseTabs,['/admin/control','Local Controller']]:baseTabs
}
