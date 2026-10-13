"""
Carga en REVEMIN II el primer inventario de la etapa 01 (10 activos) desde
apps/web/public/REVEMIN_II_E01_10_ACTIVOS_PROCESOS_ETAPA_1.json, usando la API (mismas validaciones, auditoría y
códigos FUR que la aplicación).

    FUR_EMAIL=admin@fur.local FUR_PASSWORD=… python -I docs/inventario-revemin/cargar-etapa-1.py            # solo muestra el plan
    FUR_EMAIL=admin@fur.local FUR_PASSWORD=… python -I docs/inventario-revemin/cargar-etapa-1.py --aplicar   # crea

Es idempotente: lo que ya existe (familia, tipo, fabricante, modelo, activo por tag) se reutiliza.

Decisiones:
  * tag del activo = TAG_ACTIVO del archivo (CAND-01-01 … y FT-002 tal como viene).
  * El código FUR lo genera el sistema (FUR-REV-II-0000N); el del archivo (FUR-PROC-E01-001) queda en metadata.fur_origen.
  * Tipos del archivo: si ya existe uno equivalente en el catálogo se usa; si no, se crea (etapa D01, red FUR-PROC).
  * Un modelo «por definir» por tipo y sin fabricante: los fabricantes del archivo son referencias comerciales, no marcas
    verificadas, y quedan en el catálogo de fabricantes y en metadata.referencias_fabricante de cada activo.
  * Criticidad A/B/C → HIGH/MEDIUM/LOW. Estado: el archivo es un registro referencial (no dice si opera), se deja el
    estado por defecto del sistema y se marca metadata.estado_registro.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'apps' / 'web' / 'public' / 'REVEMIN_II_E01_10_ACTIVOS_PROCESOS_ETAPA_1.json'
API = os.environ.get('FUR_API', 'http://localhost:3000/api/v1')
PLANT = os.environ.get('FUR_PLANT', 'revemin-ii')
APPLY = '--aplicar' in sys.argv

# tipo del archivo → (código de tipo en el catálogo, familia, ¿ya existe?)
TYPE_MAP = {
    'ROM_STOCKPILE': ('PATIO_RECEPCION_ROM', 'PATIO', True),
    'RECEIVING_HOPPER': ('TOLVA_RECEPCION', 'ALMACENAMIENTO', False),
    'RECEPTION_SCREEN': ('CRIBA_RECEPCION', 'CRIBAS', False),
    'APRON_FEEDER': ('ALIMENTADOR_PLACAS', 'TRANSPORTADORES', False),
    'FEED_BELT_CONVEYOR': ('CORREA_TRANSPORTADORA', 'TRANSPORTADORES', True),
    'MAGNETIC_SEPARATOR': ('SEPARADOR_MAGNETICO', 'SEPARACION', False),
    'BELT_SCALE': ('BASCULA_MINERAL', 'INSTRUMENTOS', False),
    'ROCK_BREAKER': ('ROMPEDOR_ROCAS', 'TRITURADORAS', False),
    'DUST_SUPPRESSION': ('SUPRESION_POLVO', 'CONTROL_AMBIENTAL', False),
    'METAL_DETECTOR': ('DETECTOR_METALES', 'SEPARACION', False),
}
NEW_FAMILIES = {
    'ALMACENAMIENTO': ('Tolvas y silos', 'Equipos de almacenamiento y amortiguación de mineral.'),
    'SEPARACION': ('Separación y detección', 'Separadores magnéticos y detectores de metales.'),
    'CONTROL_AMBIENTAL': ('Control de polvo y ambiental', 'Supresión de polvo y control de emisiones.'),
}
CRITICALITY = {'A': 'HIGH', 'B': 'MEDIUM', 'C': 'LOW'}

token = None


def call(method, path, body=None):
    req = urllib.request.Request(f'{API}/{path}', method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    data = json.dumps(body).encode('utf-8') if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as r:
            raw = r.read().decode('utf-8')
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ERROR {method} {path} → {e.code}: {e.read().decode("utf-8")[:400]}')


def main():
    global token
    sys.stdout.reconfigure(encoding='utf-8')
    d = json.loads(SRC.read_text(encoding='utf-8'))['tables']
    types_src = {t['asset_type_id']: t for t in d['asset_types']}
    makers_src = {m['manufacturer_id']: m for m in d['manufacturers']}
    comp_names = {c['component_type_id']: c['component_name'] for c in d['component_types']}
    param_src = {p['parameter_code']: p for p in d['technical_parameters']}
    roles = {r['role_code']: r['role_name'] for r in d['asset_roles']}
    states = {s['state_code']: s['state_name'] for s in d['record_states']}

    email, password = os.environ.get('FUR_EMAIL'), os.environ.get('FUR_PASSWORD')
    if not email or not password:
        raise SystemExit('Define FUR_EMAIL y FUR_PASSWORD (administrador).')
    token = call('POST', 'auth/login', {'email': email, 'password': password})['accessToken']

    families = {f['code'] for f in call('GET', 'catalog/families')}
    types = {t['code'] for t in call('GET', 'catalog/types')}
    makers = {m['name'].lower(): m for m in call('GET', 'catalog/manufacturers')}
    models = {(m['type']['code'], m['modelName']): m for m in call('GET', 'catalog/assets?pageSize=100&status=ALL')['items']}
    existing_tags = {a['tag'] for a in call('GET', f'plants/{PLANT}/assets?pageSize=100')['items']}

    log = []

    # 1) familias nuevas
    for code, (name, desc) in NEW_FAMILIES.items():
        if code not in families:
            log.append(f'familia  + {code} «{name}»')
            if APPLY:
                call('POST', 'catalog/families', {'code': code, 'name': name, 'description': desc})
            families.add(code)

    # 2) tipos nuevos (clasificados en la etapa 01 y la red de procesos)
    for src_id, (code, fam, exists) in TYPE_MAP.items():
        if code in types:
            continue
        if exists:
            raise SystemExit(f'El tipo {code} debía existir en el catálogo y no está.')
        t = types_src[src_id]
        log.append(f'tipo     + {code} «{t["asset_type_name"]}» ({fam})')
        if APPLY:
            call('POST', 'catalog/types', {'familyCode': fam, 'code': code, 'name': t['asset_type_name'],
                                           'description': t['functional_description'], 'stageCodes': ['D01'], 'networkCodes': ['FUR-PROC']})
        types.add(code)

    # 3) fabricantes (referencias comerciales)
    for m in d['manufacturers']:
        if m['manufacturer_name'].lower() not in makers:
            log.append(f'fabric.  + {m["manufacturer_name"]}')
            if APPLY:
                created = call('POST', 'catalog/manufacturers', {'name': m['manufacturer_name'], 'website': m['website_url']})
                makers[m['manufacturer_name'].lower()] = created
            else:
                makers[m['manufacturer_name'].lower()] = {'id': None}

    # 4) un modelo «por definir» por tipo (o el existente del tipo, si el usuario ya lo creó)
    model_of = {}
    for src_id, (code, fam, exists) in TYPE_MAP.items():
        found = [m for (tc, _), m in models.items() if tc == code and m['status'] == 'ACTIVE']
        if found:
            model_of[src_id] = found[0]['id']
            continue
        name = f'{types_src[src_id]["asset_type_name"]} (por definir)'
        log.append(f'modelo   + {name} → {code}')
        mid = call('POST', 'catalog/models', {'typeCode': code, 'modelName': name})['id'] if APPLY else None
        model_of[src_id] = mid

    # 5) activos, en el orden del inventario
    ids = {}
    for i in d['asset_identifiers']:
        ids.setdefault(i['asset_id'], {})[i['identifier_type_code']] = i['identifier_value']
    fur = {f['asset_id']: f for f in d['fur_records']}
    refs = {}
    for r in d['asset_type_manufacturer_references']:
        refs.setdefault(r['asset_type_id'], []).append({'fabricante': makers_src[r['manufacturer_id']]['manufacturer_name'], 'alcance': r['reference_scope']})
    comps = {}
    for c in sorted(d['asset_type_components'], key=lambda x: (x['asset_type_id'], x['display_order'])):
        comps.setdefault(c['asset_type_id'], []).append(comp_names[c['component_type_id']])
    params = {}
    for p in d['asset_type_parameter_requirements']:
        info = param_src[p['parameter_code']]
        params.setdefault(p['asset_type_id'], []).append({'codigo': p['parameter_code'], 'nombre': info['parameter_name'], 'unidad': info['unit_code']})
    flags = {}
    for fl in d['data_quality_flags']:
        flags.setdefault(fl['asset_id'], []).append({'campo': fl['field_name'], 'detalle': fl['issue_detail'], 'estado': fl['resolution_status']})

    for a in sorted(d['assets'], key=lambda x: x['inventory_no']):
        sid = a['asset_type_id']
        tag = ids[a['asset_id']]['TAG_ACTIVO']
        name = types_src[sid]['asset_type_name']
        meta = {
            'fuente': 'REVEMIN II / Etapa 01 / 10 activos físicos (REVEMIN_II_E01_10_ACTIVOS_PROCESOS_ETAPA_1.json)',
            'id_origen': a['asset_id'], 'numero_inventario': a['inventory_no'],
            'rol': roles[a['role_code']], 'estado_registro': states[a['state_code']],
            'fur_origen': {'codigo': fur[a['asset_id']]['fur_code'], 'familia': fur[a['asset_id']]['fur_family'], 'validacion': fur[a['asset_id']]['validation_status']},
            'identificadores': ids[a['asset_id']],
            'referencias_fabricante': refs.get(sid, []),
            'componentes': comps.get(sid, []),
            'parametros_requeridos': params.get(sid, []),
        }
        if a['asset_id'] in flags:
            meta['calidad_datos'] = flags[a['asset_id']]
        body = {'tag': tag, 'name': name, 'assetModelId': model_of[sid], 'stageCode': 'D01',
                'criticality': CRITICALITY[a['criticality_code']], 'networkCodes': ['FUR-PROC'], 'metadata': meta}
        if tag in existing_tags:
            log.append(f'activo   = {tag} ya existe, se omite')
            continue
        log.append(f'activo   + {tag}  {name}  [{TYPE_MAP[sid][0]}, crit. {CRITICALITY[a["criticality_code"]]}]')
        if APPLY:
            res = call('POST', f'plants/{PLANT}/assets', body)
            log[-1] += f'  → {res["furCode"]}'

    print(('APLICADO' if APPLY else 'PLAN (no se escribió nada; usa --aplicar)') + f' — {len(log)} cambios')
    for ln in log:
        print(' ', ln)


if __name__ == '__main__':
    main()
