import { Navigate,useParams } from 'react-router-dom'
/** Seller management is available exclusively in the seller dashboard. */
export function ProviderManagePage(){const {id}=useParams();return <Navigate to={`/marketplace${id?`?seller=${encodeURIComponent(id)}`:''}`} replace/>}
