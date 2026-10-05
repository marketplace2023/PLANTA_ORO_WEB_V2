import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { AdminCatalogPage } from '@/pages/admin-catalog-page'
import { ApuEditorPage } from '@/pages/apu-editor-page'
import { AssetFurPage } from '@/pages/asset-fur-page'
import { BudgetEditorPage } from '@/pages/budget-editor-page'
import { BudgetsPage } from '@/pages/budgets-page'
import { AssetsPage } from '@/pages/assets-page'
import { AuthPage } from '@/pages/auth-page'
import { CertificatePage } from '@/pages/certificate-page'
import { CourseEditPage } from '@/pages/course-edit-page'
import { CourseManagePage } from '@/pages/course-manage-page'
import { CoursePage } from '@/pages/course-page'
import { CoursesPage } from '@/pages/courses-page'
import { CatalogPage } from '@/pages/catalog-page'
import { DashboardsPage } from '@/pages/dashboards-page'
import { DocumentsPage } from '@/pages/documents-page'
import { HomePage } from '@/pages/home-page'
import { InventoryPage } from '@/pages/inventory-page'
import { ContractorManagePage } from '@/pages/contractor-manage-page'
import { MaintenancePage } from '@/pages/maintenance-page'
import { NetworkDashboardPage } from '@/pages/network-dashboard-page'
import { NetworksPage } from '@/pages/networks-page'
import { MarketplacePage } from '@/pages/marketplace-page'
import { MyLearningPage } from '@/pages/my-learning-page'
import { ProfessionalsPage } from '@/pages/professionals-page'
import { ProviderManagePage } from '@/pages/provider-manage-page'
import { ProvidersPage } from '@/pages/providers-page'
import { ModulePlaceholder } from '@/pages/module-placeholder'
import { PlantAdminPage } from '@/pages/plant-admin-page'
import { PlantDashboardPage } from '@/pages/plant-dashboard-page'
import { PlantRoute } from '@/pages/plant-route'
import { PlantsPage } from '@/pages/plants-page'
import { ProcessesPage } from '@/pages/processes-page'

// Rutas según docs/Ecosistema_FUR_Arquitectura_Tecnica.md §36
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="plants" element={<PlantsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="admin/catalog" element={<AdminCatalogPage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/mine" element={<MyLearningPage />} />
        <Route path="courses/manage" element={<CourseManagePage />} />
        <Route path="courses/:id" element={<CoursePage />} />
        <Route path="courses/:id/edit" element={<CourseEditPage />} />
        <Route path="certificates/:code" element={<CertificatePage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="providers/:id/manage" element={<ProviderManagePage />} />
        <Route path="professionals" element={<ProfessionalsPage />} />
        <Route path="contractors/:id/manage" element={<ContractorManagePage />} />

        <Route path="plants/:plantSlug" element={<PlantRoute />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PlantDashboardPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:assetId" element={<AssetFurPage />} />
          <Route path="admin" element={<PlantAdminPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="processes" element={<ProcessesPage />} />
          <Route path="networks" element={<NetworksPage />} />
          <Route path="networks/:code" element={<NetworkDashboardPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="budgets/apus/:apuId" element={<ApuEditorPage />} />
          <Route path="budgets/:budgetId" element={<BudgetEditorPage />} />
        </Route>

        <Route path="dashboards" element={<DashboardsPage />} />
        <Route path="*" element={<ModulePlaceholder title="Página no encontrada" />} />
      </Route>
    </Routes>
  )
}
