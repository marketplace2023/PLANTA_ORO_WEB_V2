import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { ShopOrders } from './shop-orders'
afterEach(()=>vi.unstubAllGlobals())
describe('Order portal roles',()=>{
 it('keeps a buyer in the purchase flow even when the account also has administrative rights',async()=>{
  const order={id:'order',status:'PENDING_PAYMENT',total:55,shippingFee:5,currency:'USD',createdAt:'2026-11-09',canManage:true,lines:[{id:'line',listingId:'product',title:'Product',sku:'SKU',variantName:'Standard',quantity:2,unitPrice:25}],address:{name:'Buyer',phone:'123',address:'Address',city:'City',country:'VE'},paymentInstructions:{bank:'Bank',account:'123',beneficiary:'Shop',instructions:'Pay by transfer'},events:[]}
  mockApi({'GET /marketplace/orders':{body:[order]},'GET /marketplace/orders/order':{body:order}})
  renderWithProviders(<ShopOrders />)
  await userEvent.click(await screen.findByRole('button',{name:/#ORDER/}))
  expect(await screen.findByLabelText('Referencia de transferencia / reembolso')).toBeInTheDocument()
  expect(screen.getByLabelText(/Adjuntar comprobante/)).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Confirmar pago recibido'})).not.toBeInTheDocument()
 })
})
