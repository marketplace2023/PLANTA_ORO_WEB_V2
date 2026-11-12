import { screen,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe,it,expect,vi,afterEach } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { ShopCartPage } from './shop-cart-page'
import { writeCart } from '@/lib/shop-cart'
vi.mock('@/features/auth/auth-context',()=>({useAuth:()=>({user:{id:'buyer'}})}))
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear()})
describe('Marketplace checkout',()=>{
 it('previews volume discounts and sends the chosen delivery zone and matching total',async()=>{
  writeCart('buyer',[{productId:'product',variantId:'variant',quantity:10}])
  const product={id:'product',title:'Bomba mayorista',currency:'USD',provider:{id:'shop',name:'Tienda'},commercial:{saleMode:'DIRECT'},variants:[{id:'variant',sku:'SKU-1',name:'Estándar',price:10,available:100,active:true,salesRules:{minQuantity:5,tiers:[{quantity:10,price:8}]}}],terms:{currency:'USD',shippingFee:5,coverage:'Venezuela',shippingZones:[{id:'capital',name:'Capital',country:'Venezuela',cities:['Caracas'],fee:12,days:2,carrier:'Local'}]}}
  const m=mockApi({'GET /marketplace/products/product':{body:product},'POST /marketplace/orders':{status:201,body:{id:'order'}}})
  renderWithProviders(<ShopCartPage />)
  await screen.findByText('Bomba mayorista')
  expect(screen.getByRole('button',{name:'Confirmar pedido'})).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Zona de envío'),'capital')
  for(const [label,value] of [['Nombre de quien recibe','Ana'],['Teléfono','123456'],['País','Venezuela'],['Ciudad','Caracas'],['Dirección completa','Dirección de prueba']])await userEvent.type(screen.getByLabelText(label),value)
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button',{name:'Confirmar pedido'}))
  await waitFor(()=>expect(m.count('POST /marketplace/orders')).toBe(1))
  expect(JSON.parse(m.calls.find(c=>c.method==='POST')!.init.body as string)).toMatchObject({shippingZoneId:'capital',expectedTotal:92})
 })
 it('uses live prices, separates the bank transfer from payment confirmation, and links to the created order',async()=>{
  writeCart('buyer',[{productId:'product',variantId:'variant',quantity:2}])
  const product={id:'product',title:'Bomba propia',currency:'USD',provider:{id:'shop',name:'Tienda'},commercial:{saleMode:'DIRECT'},variants:[{id:'variant',sku:'SKU-1',name:'Estándar',price:25,available:4,active:true}],terms:{currency:'USD',shippingFee:5,coverage:'Ciudad de prueba'}}
  const m=mockApi({'GET /marketplace/products/product':{body:product},'POST /marketplace/orders':{status:201,body:{id:'order'}}})
  renderWithProviders(<ShopCartPage />)
  await screen.findByText('Bomba propia')
  for(const [label,value] of [['Nombre de quien recibe','Ana'],['Teléfono','123456'],['País','Venezuela'],['Ciudad','Ciudad de prueba'],['Dirección completa','Dirección de prueba']])await userEvent.type(screen.getByLabelText(label),value)
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button',{name:'Confirmar pedido'}))
  await waitFor(()=>expect(m.count('POST /marketplace/orders')).toBe(1))
  const body=JSON.parse(m.calls.find(c=>c.method==='POST')!.init.body as string)
  expect(body).toMatchObject({providerId:'shop',mode:'DIRECT',expectedTotal:55,lines:[{variantId:'variant',quantity:2}]})
  expect(body).not.toHaveProperty('status')
  expect(await screen.findByRole('link',{name:'Ver mis pedidos e instrucciones de pago'})).toHaveAttribute('href','/marketplace/orders')
 })
})
