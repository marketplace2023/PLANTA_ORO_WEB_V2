#!/usr/bin/env python3
"""
Carga en el CATÁLOGO (no en los activos de planta) la información preliminar de las fichas de los JSON del inventario
REVEMIN II (etapas 1 y 2), para que el modal de /catalog muestre la identificación del activo y sus parámetros técnicos:

  * descripción funcional  -> descripción del TIPO de activo
  * parámetros técnicos    -> VARIABLES del catálogo con alcance por tipo (valor «Por determinar» hasta que se registre uno)
  * identificación, componentes y fabricantes de referencia -> datos técnicos (technicalData) del MODELO

Cada activo del JSON se vincula con el activo ya cargado en la planta por su TAG_ACTIVO. Es idempotente.
Uso:
  python cargar-fichas-catalogo.py                       # simulacro: muestra qué haría
  python cargar-fichas-catalogo.py --aplicar             # aplica contra http://localhost:3000/api/v1
  python cargar-fichas-catalogo.py --aplicar --api https://<sitio>/api/v1 --password ...
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_FILES = [
    HERE / 'por-etapa' / 'REVEMIN_II_E01_10_ACTIVOS_PROCESOS_ETAPA_1.json',
    HERE / 'por-etapa' / 'REVEMIN_II_E02_09_ACTIVOS.json',
]
# Un TAG repetido en el JSON de la etapa 2 (SC-001) se corrigió en la planta; se respeta esa decisión.
TAG_OVERRIDE = {'REV2-E02-003': 'CAND-02-02'}
UNIT_SYMBOL = {'pct': '%', 'm3': 'm³', 'm2': 'm²', 'm3/h': 'm³/h', 'uds': 'uds'}
GROUP = 'Parámetros técnicos'
VALIDATION = {'PENDIENTE_VALIDACION': 'pendiente de validación en planta', 'VALIDADO': 'validado en planta'}

sys.stdout.reconfigure(encoding='utf-8')


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip('/')
        self.token = None

    def call(self, method: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {'content-type': 'application/json'}
        if self.token:
            headers['authorization'] = f'Bearer {self.token}'
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode(errors="replace")[:300]}')

    def login(self, email: str, password: str):
        self.token = self.call('POST', '/auth/login', {'email': email, 'password': password})['accessToken']


def rows(tables: dict, name: str) -> list:
    return tables.get(name, [])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--api', default='http://localhost:3000/api/v1')
    ap.add_argument('--email', default='admin@fur.local')
    ap.add_argument('--password', default=None)
    ap.add_argument('--plant', default='revemin-ii')
    ap.add_argument('--aplicar', action='store_true', help='sin esta bandera solo se muestra el plan')
    ap.add_argument('json', nargs='*', type=Path)
    args = ap.parse_args()
    files = args.json or DEFAULT_FILES

    api = Api(args.api)
    api.login(args.email, args.password or ('fur-local-2026' if 'localhost' in args.api else getpass.getpass('Contraseña: ')))

    plant_assets = api.call('GET', f'/plants/{args.plant}/assets?pageSize=100')['items']
    by_tag = {a['tag']: a for a in plant_assets}
    types = {t['code']: t for t in api.call('GET', '/catalog/types')}
    variables = {v['code']: v for v in api.call('GET', '/catalog/variables')}
    print(f'Planta {args.plant}: {len(plant_assets)} activos | catálogo: {len(types)} tipos, {len(variables)} variables')

    # variable (código JSON) -> definición agregada de ambos archivos
    wanted: dict[str, dict] = {}
    model_data: dict[str, dict] = {}
    type_desc: dict[str, str] = {}
    missing: list[str] = []
    order = 0

    for file in files:
        t = json.loads(Path(file).read_text(encoding='utf-8'))['tables']
        dataset = json.loads(Path(file).read_text(encoding='utf-8'))['metadata']['dataset']
        project_name = next((p['project_name'] for p in rows(t, 'projects')), None)
        stage_name = {s['stage_id']: f"{str(s['stage_number']).zfill(2)} — {s['stage_name']}" for s in rows(t, 'process_stages')}
        role = {r['role_code']: r['role_name'] for r in rows(t, 'asset_roles')}
        crit = {c['criticality_code']: c['criticality_name'] for c in rows(t, 'criticality_levels')}
        state = {s['state_code']: s['state_name'] for s in rows(t, 'record_states')}
        comp_name = {c['component_type_id']: c['component_name'] for c in rows(t, 'component_types')}
        mfr = {m['manufacturer_id']: m for m in rows(t, 'manufacturers')}
        params = {p['parameter_code']: p for p in rows(t, 'technical_parameters')}
        fur = {f['asset_id']: f for f in rows(t, 'fur_records')}
        idents: dict[str, dict] = {}
        for i in rows(t, 'asset_identifiers'):
            idents.setdefault(i['asset_id'], {})[i['identifier_type_code']] = i['identifier_value']
        type_info = {x['asset_type_id']: x for x in rows(t, 'asset_types')}

        for asset in rows(t, 'assets'):
            ids = idents.get(asset['asset_id'], {})
            tag = TAG_OVERRIDE.get(asset['asset_id'], ids.get('TAG_ACTIVO'))
            plant_asset = by_tag.get(tag)
            if not plant_asset:
                missing.append(f"{asset['asset_id']} ({tag})")
                continue
            tid = asset['asset_type_id']
            type_code = plant_asset['type']['code']
            f = fur.get(asset['asset_id'])
            ident = {
                'Proyecto': project_name,
                'N.° de inventario': str(asset['inventory_no']),
                'TAG activo': tag,
                'TAG mapa': ids.get('TAG_MAPA') or 'Sin alias documentado',
                'Código FUR': f['fur_code'] if f else None,
                'Etapa de proceso': stage_name.get(asset['stage_id']),
                'Clasificación': role.get(asset['role_code']),
                'Criticidad': crit.get(asset['criticality_code']),
                'Estado de la ficha': f"{state.get(asset['state_code'], asset['state_code'])}"
                + (f" — {VALIDATION.get(f['validation_status'], f['validation_status'].replace('_', ' ').lower())}" if f else ''),
            }
            comps = [
                comp_name[c['component_type_id']]
                for c in sorted((c for c in rows(t, 'asset_type_components') if c['asset_type_id'] == tid), key=lambda c: c['display_order'])
                if c['component_type_id'] in comp_name
            ]
            refs = [
                {
                    'nombre': mfr[r['manufacturer_id']]['manufacturer_name'],
                    'alcance': r.get('reference_scope'),
                    'sitioWeb': mfr[r['manufacturer_id']].get('website_url'),
                }
                for r in rows(t, 'asset_type_manufacturer_references')
                if r['asset_type_id'] == tid and r['manufacturer_id'] in mfr
            ]
            model_data[plant_asset['model']['id']] = {
                'identificacion': {k: v for k, v in ident.items() if v},
                'componentes': comps,
                'fabricantesReferencia': refs,
                'fuente': dataset,
            }
            if type_info[tid].get('functional_description'):
                type_desc[type_code] = type_info[tid]['functional_description']
            for req in rows(t, 'asset_type_parameter_requirements'):
                if req['asset_type_id'] != tid or req['parameter_code'] not in params:
                    continue
                p = params[req['parameter_code']]
                unit = UNIT_SYMBOL.get(p.get('unit_code'), p.get('unit_code'))
                order += 1
                w = wanted.setdefault(p['parameter_code'], {'label': p['parameter_name'], 'unit': unit, 'types': set(), 'networks': set(), 'order': order})
                w['types'].add(type_code)
                # La red es la de la familia FUR del registro del activo (FUR-PROC en estos inventarios), no se deduce de la unidad.
                w['networks'].add((f or {}).get('fur_family') or 'FUR-PROC')

    print(f"Activos vinculados: {len(model_data)} | sin vincular: {len(missing)} {missing}")
    print(f"Tipos con descripción funcional: {len(type_desc)} | variables de parámetros técnicos: {len(wanted)}")

    plan = {'tipos': 0, 'modelos': len(model_data), 'variables_nuevas': 0, 'variables_ampliadas': 0}

    # 1) descripción funcional del tipo (solo si está vacía)
    for code, desc in type_desc.items():
        tp = types.get(code)
        if tp and not tp.get('description'):
            plan['tipos'] += 1
            if args.aplicar:
                api.call('PATCH', f"/catalog/types/{tp['id']}", {'description': desc})

    # 2) variables con alcance por tipo
    for pcode, w in sorted(wanted.items(), key=lambda kv: kv[1]['order']):
        existing = variables.get(pcode)
        if existing:
            merged = sorted(set(existing.get('assetTypeCodes') or []) | w['types'])
            fix: dict = {}
            if merged != sorted(existing.get('assetTypeCodes') or []):
                fix['assetTypeCodes'] = merged
            # Solo las que creó este script (mismo grupo): se alinean con la red del registro FUR.
            if existing.get('group') == GROUP and sorted(existing.get('networkCodes') or []) != sorted(w['networks']):
                fix['networkCodes'] = sorted(w['networks'])
            if fix:
                plan['variables_ampliadas'] += 1
                if args.aplicar:
                    api.call('PATCH', f"/catalog/variables/{existing['id']}", fix)
            continue
        plan['variables_nuevas'] += 1
        body = {
            'code': pcode,
            'label': w['label'],
            'valueType': 'NUMBER' if w['unit'] else 'TEXT',
            'networkCodes': sorted(w['networks']),
            'assetTypeCodes': sorted(w['types']),
            'group': GROUP,
            'sortOrder': w['order'],
        }
        if w['unit']:
            body['unit'] = w['unit']
        if args.aplicar:
            api.call('POST', '/catalog/variables', body)

    # 3) datos técnicos del modelo (se conservan las demás claves)
    models = {m['id']: m for m in api.call('GET', '/catalog/assets?pageSize=100&status=ALL')['items']}
    for model_id, data in model_data.items():
        current = models.get(model_id, {}).get('technicalData') or {}
        if args.aplicar:
            api.call('PATCH', f'/catalog/models/{model_id}', {'technicalData': {**current, **data}})

    print('Plan:' if not args.aplicar else 'Aplicado:', plan)
    if not args.aplicar:
        print('Simulacro: no se cambió nada. Repite con --aplicar.')


if __name__ == '__main__':
    main()
