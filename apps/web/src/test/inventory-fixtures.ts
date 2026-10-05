import type { InventoryDashboard, InventoryItem, InventoryItemDetail, Movement, StorageLocation, Warehouse } from '@/features/inventory/use-inventory'

export const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1',
  sku: 'ROD-22218',
  name: 'Rodamiento esférico 22218 E',
  description: null,
  itemType: 'SPARE',
  uom: 'UND',
  minStock: 4,
  maxStock: 12,
  isCritical: true,
  unitCost: 185.5,
  status: 'ACTIVE',
  assetModelId: null,
  onHand: 6,
  belowMin: false,
  value: 1113,
  ...over,
})

export const movement = (over: Partial<Movement> = {}): Movement => ({
  id: 'mv1',
  item: { id: 'i1', sku: 'ROD-22218', name: 'Rodamiento esférico 22218 E', uom: 'UND' },
  type: 'RECEIPT',
  quantity: 6,
  unitCost: 185.5,
  referenceType: 'MANUAL',
  referenceId: null,
  note: 'Saldo inicial',
  performedAt: '2026-09-20T15:00:00.000Z',
  from: null,
  to: 'R-A1',
  performedBy: 'Alberto Almacén',
  ...over,
})

export const itemDetail = (over: Partial<InventoryItemDetail> = {}): InventoryItemDetail => ({
  ...item(),
  model: null,
  stock: [
    { locationId: 'l1', locationCode: 'R-A1', locationName: 'Rack A1', warehouseCode: 'ALM-CEN', warehouseName: 'Almacén central', quantity: 4 },
    { locationId: 'l2', locationCode: 'R-B1', locationName: 'Rack B1', warehouseCode: 'ALM-CEN', warehouseName: 'Almacén central', quantity: 2 },
  ],
  recentMovements: [movement()],
  ...over,
})

export const WAREHOUSES: Warehouse[] = [{ id: 'w1', code: 'ALM-CEN', name: 'Almacén central', status: 'ACTIVE' }]

export const LOCATIONS: StorageLocation[] = [
  { id: 'l1', warehouseId: 'w1', warehouseCode: 'ALM-CEN', warehouseName: 'Almacén central', parentId: null, code: 'R-A1', name: 'Rack A1', locationType: 'RACK', status: 'ACTIVE' },
  { id: 'l2', warehouseId: 'w1', warehouseCode: 'ALM-CEN', warehouseName: 'Almacén central', parentId: null, code: 'R-B1', name: 'Rack B1', locationType: 'RACK', status: 'ACTIVE' },
  { id: 'l3', warehouseId: 'w1', warehouseCode: 'ALM-CEN', warehouseName: 'Almacén central', parentId: null, code: 'E-01', name: 'Estante 1', locationType: 'SHELF', status: 'INACTIVE' },
]

export const dashboard = (over: Partial<InventoryDashboard> = {}): InventoryDashboard => ({
  currency: 'USD',
  itemCount: 9,
  stockValue: 125430.5,
  lowStockCount: 2,
  criticalLowCount: 1,
  movementsLast30Days: 7,
  receiptsLast30Days: 3,
  issuesLast30Days: 4,
  assetsInStock: 2,
  assetsInRepair: 1,
  reservations: null,
  lowStock: [
    { id: 'i3', sku: 'SELLO-MEC-60', name: 'Sello mecánico 60 mm', uom: 'UND', onHand: 1, minStock: 3, isCritical: true, deficit: 2 },
    { id: 'i5', sku: 'CORREA-B85', name: 'Correa en V B85', uom: 'UND', onHand: 3, minStock: 4, isCritical: false, deficit: 1 },
  ],
  recentMovements: [movement()],
  ...over,
})
