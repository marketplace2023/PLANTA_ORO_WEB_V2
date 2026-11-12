import { Navigate,useLocation } from 'react-router-dom'
/** Legacy directory URLs now open the unified, read-only marketplace. */
export function ProvidersPage(){const {search}=useLocation();const params=new URLSearchParams(search);params.set('view','sellers');const seller=params.get('provider');if(seller){params.set('seller',seller);params.delete('provider')}const verified=params.get('verified');if(verified==='1'||verified==='0'){params.set('sellerType',verified==='1'?'VERIFIED_STORE':'INDIVIDUAL');params.delete('verified')}return <Navigate to={`/marketplace?${params}`} replace/>}
