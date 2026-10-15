#!/usr/bin/env bash
# Publica Ecosistema FUR en AWS (cuenta/región fijas abajo). Requiere AWS CLI con el perfil `fur` y Docker.
#   scripts/aws-deploy.sh api    # construye la imagen, la sube a ECR y redespliega App Runner
#   scripts/aws-deploy.sh spa    # construye web, admin y panel, los sube a S3 e invalida CloudFront
#   scripts/aws-deploy.sh all
# Arquitectura y nombres: docs/despliegue-aws.md
set -euo pipefail
export MSYS_NO_PATHCONV=1 AWS_PAGER=""   # evita que Git Bash reescriba /api/v1 como una ruta de Windows

PROFILE="${AWS_PROFILE:-fur}"
REGION=us-east-2
ACCOUNT=850695279479
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(cd "$ROOT/.." && pwd)"
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

deploy_api() {
  local registry="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com" tag
  tag="$(date +%Y%m%d-%H%M)"
  docker build -f "$ROOT/Dockerfile.api" -t fur-api:latest "$ROOT"
  aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
  docker tag fur-api:latest "$registry/fur-api:$tag"
  docker tag fur-api:latest "$registry/fur-api:latest"
  docker push "$registry/fur-api:$tag"
  docker push "$registry/fur-api:latest"
  local arn
  arn="$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='fur-api'].ServiceArn | [0]" --output text)"
  aws apprunner start-deployment --service-arn "$arn" --query OperationId --output text
  echo "API desplegándose (imagen $tag). Estado: aws apprunner describe-service --service-arn $arn --query Service.Status"
}

publish() { # carpeta bucket
  local dir="$1" bucket="$2"
  aws s3 sync "$dir" "s3://$bucket" --delete --exclude index.html --exclude "assets/*" --cache-control "public,max-age=86400" --only-show-errors
  aws s3 sync "$dir/assets" "s3://$bucket/assets" --delete --cache-control "public,max-age=31536000,immutable" --only-show-errors
  aws s3 cp "$dir/index.html" "s3://$bucket/index.html" --cache-control no-cache --content-type "text/html; charset=utf-8" --only-show-errors
}

invalidate() { # nombre
  local id
  id="$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='FUR $1'].Id | [0]" --output text)"
  aws cloudfront create-invalidation --distribution-id "$id" --paths "/" "/index.html" --query Invalidation.Status --output text
}

deploy_spa() {
  # Mismo origen: CloudFront reenvía /api/* a la API, así que el build usa la ruta relativa.
  export VITE_API_URL=/api/v1
  (cd "$ROOT" && npm run build -w @fur/web)
  (cd "$PARENT/planta_beneficio_oro_admin" && npm run build)
  (cd "$PARENT/planta_beneficio_oro_panel" && npm run build)
  if grep -lE "localhost:3000|Program Files" "$ROOT"/apps/web/dist/assets/*.js "$PARENT"/planta_beneficio_oro_admin/dist/assets/*.js "$PARENT"/planta_beneficio_oro_panel/dist/assets/*.js; then
    echo "ERROR: el build trae una URL de API incorrecta" >&2; exit 1
  fi
  publish "$ROOT/apps/web/dist" "fur-web-$ACCOUNT"
  publish "$PARENT/planta_beneficio_oro_admin/dist" "fur-admin-$ACCOUNT"
  publish "$PARENT/planta_beneficio_oro_panel/dist" "fur-panel-$ACCOUNT"
  invalidate web; invalidate admin; invalidate panel
}

case "${1:-}" in
  api) deploy_api ;;
  spa) deploy_spa ;;
  all) deploy_api; deploy_spa ;;
  *) echo "Uso: $0 api|spa|all" >&2; exit 1 ;;
esac
