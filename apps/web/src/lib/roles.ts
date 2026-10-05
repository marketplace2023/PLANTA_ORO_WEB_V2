/** Etiquetas de los roles (arquitectura §5.1). Los códigos vienen del backend (iam.roles.code). */
export const ROLE_LABELS: Record<string, string> = {
  ECOSYSTEM_ADMIN: 'Administrador del ecosistema',
  PLANT_ADMIN: 'Administrador de planta',
  PLANT_MANAGER: 'Gerente de planta',
  MAINTENANCE_LEAD: 'Jefe de mantenimiento',
  WAREHOUSE: 'Almacén / logística',
  PROCUREMENT: 'Compras',
  BUDGET: 'Presupuesto / costos',
  LAB_QUALITY: 'Laboratorio / calidad',
  OPERATOR: 'Operador de planta',
  TECHNICIAN: 'Técnico / instrumentista',
  INSTRUCTOR: 'Instructor',
  PROVIDER: 'Proveedor',
  CONTRACTOR: 'Servicio profesional',
  CONSUMER: 'Usuario común',
}

export const VISIBILITY_LABELS = {
  PUBLIC: 'Pública',
  AUTHENTICATED: 'Solo con sesión',
  PRIVATE: 'Privada',
} as const
