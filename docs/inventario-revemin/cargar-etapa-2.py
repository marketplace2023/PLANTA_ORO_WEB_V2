"""
Carga en REVEMIN II el inventario de la etapa 02 — Trituración primaria (9 activos) desde
apps/web/public/REVEMIN_II_E02_09_ACTIVOS.json, usando la API (mismas validaciones, auditoría y códigos FUR que la app).

    FUR_EMAIL=… FUR_PASSWORD=… python -I docs/inventario-revemin/cargar-etapa-2.py            # solo muestra el plan
    FUR_EMAIL=… FUR_PASSWORD=… python -I docs/inventario-revemin/cargar-etapa-2.py --aplicar   # crea

Idempotente: lo que ya existe (familia, tipo, fabricante, modelo, activo por tag) se reutiliza.

Mismas reglas que la etapa 1 (cargar-etapa-1.py): tag = TAG_ACTIVO del archivo, FUR generado por el sistema con el del
archivo en metadata.fur_origen, un modelo «(por definir)» por tipo del archivo y sin fabricante (referencias comerciales,
no marcas verificadas), criticidad A/B/C → HIGH/MEDIUM/LOW, estado por defecto del sistema.

Única corrección: el archivo trae el tag SC-001 en dos activos (filas 12 y 13) y el sistema no admite tags repetidos. La
cinta (12) conserva SC-001 y la criba de rechazo (13) pasa a CAND-02-02, el hueco de la secuencia (la fila 14 ya es
CAND-02-03). El tag original queda anotado en metadata.tag_ajustado para el cotejo.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'apps' / 'web' / 'public' / 'REVEMIN_II_E02_09_ACTIVOS.json'
API = os.environ.get('FUR_API', 'http://localhost:3000/api/v1')
PLANT = os.environ.get('FUR_PLANT', 'revemin-ii')
APPLY = '--aplicar' in sys.argv
STAGE = 'D02'

# tipo del archivo → (código de tipo en el catálogo, familia, ¿ya existe?)
TYPE_MAP = {
    'JAW_CRUSHER': ('CHANCADORA_MANDIBULAS', 'TRITURADORAS', True),
    'MAIN_CONVEYOR': ('CORREA_TRANSPORTADORA', 'TRANSPORTADORES', True),
    'REJECT_SCREEN': ('CRIBA_RECHAZO', 'CRIBAS', False),
    'PRIMARY_DISCHARGE_CONVEYOR': ('CORREA_TRANSPORTADORA', 'TRANSPORTADORES', True),
    'GRIZZLY_FEEDER': ('ALIMENTADOR_GRIZZLY', 'TRANSPORTADORES', False),
    'CRUSHER_LUBRICATION': ('LUBRICACION_CHANCADORA', 'TRITURADORAS', False),
    'HYDRAULIC_ADJUSTMENT_UNIT': ('UNIDAD_HIDRAULICA_AJUSTE', 'TRITURADORAS', False),
    'PRIMARY_DISCHARGE_CHUTE': ('CHUTE_DESCARGA_PRIMARIA', 'TRANSPORTADORES', False),
    'PRIMARY_DUST_COLLECTOR': ('COLECTOR_POLVO_PRIMARIO', 'CONTROL_AMBIENTAL', False),
}
CRITICALITY = {'A': 'HIGH', 'B': 'MEDIUM', 'C': 'LOW'}
TAG_OVERRIDE = {  # asset_id → (tag a usar, motivo)
    'REV2-E02-003': ('CAND-02-02', 'El archivo asigna SC-001 también a la cinta transportadora principal (REV2-E02-002); '
                                   'se usa CAND-02-02, el hueco de la secuencia, hasta cotejar con la fuente editable.'),
}

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

    types = {t['code'] for t in call('GET', 'catalog/types')}
    families = {f['code'] for f in call('GET', 'catalog/families')}
    makers = {m['name'].lower(): m for m in call('GET', 'catalog/manufacturers')}
    models = {(m['type']['code'], m['modelName']): m for m in call('GET', 'catalog/assets?pageSize=100&status=ALL')['items']}
    existing_tags = {a['tag'] for a in call('GET', f'plants/{PLANT}/assets?pageSize=100')['items']}

    # el tag original no debe chocar con lo ya cargado: se verifica antes de escribir nada
    wanted = [TAG_OVERRIDE.get(a['asset_id'], (None,))[0] or next(i['identifier_value'] for i in d['asset_identifiers']
              if i['asset_id'] == a['asset_id'] and i['identifier_type_code'] == 'TAG_ACTIVO') for a in d['assets']]
    dup = {t for t in wanted if wanted.count(t) > 1}
    if dup:
        raise SystemExit(f'Tags repetidos en la carga: {sorted(dup)}')

    log = []

    for src_id, (code, fam, exists) in TYPE_MAP.items():
        if fam not in families:
            raise SystemExit(f'La familia {fam} no existe en el catálogo.')
        if code in types:
            continue
        if exists:
            raise SystemExit(f'El tipo {code} debía existir en el catálogo y no está.')
        t = types_src[src_id]
        log.append(f'tipo     + {code} «{t["asset_type_name"]}» ({fam})')
        if APPLY:
            call('POST', 'catalog/types', {'familyCode': fam, 'code': code, 'name': t['asset_type_name'],
                                           'description': t['functional_description'], 'stageCodes': [STAGE], 'networkCodes': ['FUR-PROC']})
        types.add(code)

    for m in d['manufacturers']:
        if m['manufacturer_name'].lower() not in makers:
            log.append(f'fabric.  + {m["manufacturer_name"]}')
            if APPLY:
                makers[m['manufacturer_name'].lower()] = call('POST', 'catalog/manufacturers', {'name': m['manufacturer_name'], 'website': m['website_url']})
            else:
                makers[m['manufacturer_name'].lower()] = {'id': None}

    # un modelo «(por definir)» por tipo del archivo (dos tipos del archivo pueden compartir tipo de catálogo)
    model_of = {}
    for src_id, (code, fam, exists) in TYPE_MAP.items():
        name = f'{types_src[src_id]["asset_type_name"]} (por definir)'
        found = models.get((code, name))
        if found:
            model_of[src_id] = found['id']
            continue
        log.append(f'modelo   + {name} → {code}')
        model_of[src_id] = call('POST', 'catalog/models', {'typeCode': code, 'modelName': name})['id'] if APPLY else None

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
        file_tag = ids[a['asset_id']]['TAG_ACTIVO']
        tag, why = TAG_OVERRIDE.get(a['asset_id'], (file_tag, None))
        name = types_src[sid]['asset_type_name']
        meta = {
            'fuente': 'REVEMIN II / Etapa 02 / 9 activos físicos (REVEMIN_II_E02_09_ACTIVOS.json)',
            'id_origen': a['asset_id'], 'numero_inventario': a['inventory_no'],
            'rol': roles[a['role_code']], 'estado_registro': states[a['state_code']],
            'fur_origen': {'codigo': fur[a['asset_id']]['fur_code'], 'familia': fur[a['asset_id']]['fur_family'], 'validacion': fur[a['asset_id']]['validation_status']},
            'identificadores': ids[a['asset_id']],
            'referencias_fabricante': refs.get(sid, []),
            'componentes': comps.get(sid, []),
            'parametros_requeridos': params.get(sid, []),
        }
        if why:
            meta['tag_ajustado'] = {'tag_original_archivo': file_tag, 'tag_asignado': tag, 'motivo': why}
        if a['asset_id'] in flags:
            meta['calidad_datos'] = flags[a['asset_id']]
        body = {'tag': tag, 'name': name, 'assetModelId': model_of[sid], 'stageCode': STAGE,
                'criticality': CRITICALITY[a['criticality_code']], 'networkCodes': ['FUR-PROC'], 'metadata': meta}
        if tag in existing_tags:
            log.append(f'activo   = {tag} ya existe, se omite')
            continue
        note = f'  (archivo: {file_tag})' if why else ''
        log.append(f'activo   + {tag}  {name}  [{TYPE_MAP[sid][0]}, crit. {CRITICALITY[a["criticality_code"]]}]{note}')
        if APPLY:
            res = call('POST', f'plants/{PLANT}/assets', body)
            log[-1] += f'  → {res["furCode"]}'

    print(('APLICADO' if APPLY else 'PLAN (no se escribió nada; usa --aplicar)') + f' — {len(log)} cambios')
    for ln in log:
        print(' ', ln)


if __name__ == '__main__':
    main()
