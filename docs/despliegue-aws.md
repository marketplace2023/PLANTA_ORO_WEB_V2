# Despliegue en AWS

Cuenta `850695279479` (Oralis), región `us-east-2`. Todo lo del Ecosistema FUR lleva el prefijo `fur-` y la etiqueta `proyecto=fur`; la app de Amplify `instituto-merida` de la misma cuenta no se toca.

## Arquitectura

```
Navegador ──► CloudFront (uno por sitio) ──► S3 privado (SPA)        /*
                       │
                       └─────────────────► App Runner fur-api       /api/*   (sin caché, con cookies)
                                                  │ VPC connector
                                                  ├──► RDS PostgreSQL 17 (fur-db)
                                                  └──► S3 fur-archivos (documentos e imágenes)
```

Cada sitio reenvía `/api/*` a la API, así que web, admin y panel hablan con ella **en su mismo origen**: la cookie de sesión es de primera parte (`SameSite=lax`) y no hay CORS entre dominios. Por eso las SPA se construyen con `VITE_API_URL=/api/v1`.

| Pieza | Recurso | URL / nombre |
|---|---|---|
| Web pública | CloudFront `EEZFS6AA7Y5M0` → `fur-web-850695279479` | https://dcmu5tootf56d.cloudfront.net |
| Administración | CloudFront `E2YJM8PPO8AHVH` → `fur-admin-850695279479` | https://d1uyuh79sqlc19.cloudfront.net |
| Panel de planta | CloudFront `E3V4HN74FQ1T75` → `fur-panel-850695279479` | https://d1g9io4ibjtx7a.cloudfront.net |
| API | App Runner `fur-api` (0,25 vCPU / 1 GB, 1–2 instancias) | https://2pjspmbt5i.us-east-2.awsapprunner.com |
| Base de datos | RDS `fur-db` (`db.t4g.micro`, 20 GB, una zona, protegida contra borrado, backups 7 días) | base `fur_prod`, usuario `furadmin` |
| Archivos | S3 `fur-archivos-850695279479` (privado; la API los sirve) | — |
| Imágenes de la API | ECR `fur-api` | — |
| Secretos | Secrets Manager `fur/jwt-access-secret`, `fur/database-url`, `fur/db-password` | — |

La base **no es pública para nadie más**: su grupo de seguridad `fur-rds` solo acepta el tráfico de la API (`fur-apprunner`).

## Variables de la API en App Runner

`NODE_ENV=production`, `PORT=3000`, `ACCESS_MODE=members` (valor por defecto: sin sesión solo Página principal y Catálogo), `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `COOKIE_SAMESITE=lax`, `TRUST_PROXY_HOPS=2` (CloudFront + App Runner), `CORS_ORIGINS`, y desde Secrets Manager `JWT_ACCESS_SECRET` y `DATABASE_URL` (con `sslmode=no-verify`). Al arrancar, el contenedor aplica las migraciones pendientes (`dist/database/migrate.js`).

## Publicar cambios

```bash
scripts/aws-deploy.sh api    # imagen -> ECR -> redespliega App Runner
scripts/aws-deploy.sh spa    # build de web/admin/panel -> S3 -> invalida CloudFront
```

Windows con Git Bash: el script ya define `MSYS_NO_PATHCONV=1`; sin eso `/api/v1` se convierte en una ruta de disco y el sitio queda sin datos.

## Cosas a saber

- **Sin dominio propio todavía**: al tenerlo se agrega como alias en cada distribución (con certificado ACM en `us-east-1`) y no hay que tocar la API.
- **Costo estimado**: 15–30 USD/mes (App Runner y RDS son lo principal). Para pausar el gasto de la API: `aws apprunner pause-service`; la base se puede detener hasta 7 días.
- **El `package-lock.json` se generó en Windows**: el `Dockerfile.api` instala aparte el binario Linux de `@node-rs/argon2`.
- **Claves**: el usuario IAM `fur-deploy` tiene `AdministratorAccess`; conviene rotar su clave de acceso y, cuando todo esté estable, acotarle los permisos.
