const baseTabs:[string,string][]=[
  ['/admin','Dashboard'],
  ['/admin/products','Products'],
  ['/admin/inventory','Inventory'],
  ['/admin/production','Production'],
  ['/admin/orders','Orders'],
  ['/admin/reports','Reports'],
]

export function adminTabs(localController:boolean):[string,string][]{
  // The machine controller only appears when the site runs locally (never on Vercel).
  return localController?[...baseTabs,['/admin/local-controller','Local Controller']]:baseTabs
}
