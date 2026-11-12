"""Motor de referencia del MVP de presupuestos. Utiliza la biblioteca estándar."""

import argparse
import json
import re
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path


BASES = {
    "MATERIAL": "POR_UNIDAD_INSUMO",
    "EQUIPO": "POR_EQUIPO_DIA",
    "MANO_OBRA": "POR_PERSONA_DIA",
}
CIEN = Decimal(100)


def decimal(valor, campo, positivo=False):
    """Aceptar números exactos y rechazar entradas ambiguas o negativas."""
    if type(valor) not in (str, int) or not re.fullmatch(
        r"[0-9]{1,15}(?:\.[0-9]{1,8})?", str(valor)
    ):
        raise ValueError(f"{campo}: indicar un decimal no negativo con punto.")
    numero = Decimal(valor)
    if positivo and numero == 0:
        raise ValueError(f"{campo}: debe ser mayor que cero.")
    return numero


def texto(valor, campo):
    if not isinstance(valor, str) or not valor.strip():
        raise ValueError(f"{campo}: indicar un texto no vacío.")
    return valor.strip()


def dinero(numero, precision):
    return numero.quantize(precision, rounding=ROUND_HALF_UP)


def desglosar_apu(apu, moneda, precision):
    rendimiento = decimal(apu["rendimiento_dia"], "rendimiento_dia", positivo=True)
    factores = apu.get("factores_pct", {})
    fcas = decimal(factores.get("recargo_fcas", 0), "recargo_fcas") / CIEN
    costos = dict.fromkeys(BASES, Decimal(0))
    if not apu["insumos"]:
        raise ValueError("Un APU requiere al menos un insumo.")

    for insumo in apu["insumos"]:
        tipo = insumo["tipo"]
        codigo = texto(insumo["codigo"], "codigo de insumo")
        if tipo not in BASES or insumo["base_costo"] != BASES[tipo]:
            raise ValueError(f"{codigo}: la base de costo no corresponde al tipo de insumo.")
        if insumo["moneda"] != moneda:
            raise ValueError(f"{codigo}: la moneda del costo debe coincidir con el presupuesto.")
        cantidad = decimal(insumo["cantidad"], f"{codigo}.cantidad", positivo=True)
        precio = decimal(insumo["costo"], f"{codigo}.costo")
        if precio == 0:
            texto(insumo.get("motivo_costo_cero"), f"{codigo}.motivo_costo_cero")
        desperdicio = decimal(insumo.get("desperdicio_pct", 0), f"{codigo}.desperdicio_pct")
        if tipo == "MATERIAL":
            costos[tipo] += cantidad * precio * (1 + desperdicio / CIEN)
        else:
            if desperdicio:
                raise ValueError(f"{codigo}: el desperdicio se aplica a materiales.")
            costo_diario = cantidad * precio
            if tipo == "MANO_OBRA":
                costo_diario *= 1 + fcas
            costos[tipo] += costo_diario / rendimiento

    directo = sum(costos.values())
    administracion = directo * decimal(factores.get("administracion", 0), "administracion") / CIEN
    utilidad = (directo + administracion) * decimal(factores.get("utilidad", 0), "utilidad") / CIEN
    financiamiento = (
        (directo + administracion + utilidad)
        * decimal(factores.get("financiamiento", 0), "financiamiento")
        / CIEN
    )
    return {
        "material": costos["MATERIAL"],
        "equipo": costos["EQUIPO"],
        "mano_obra": costos["MANO_OBRA"],
        "directo": directo,
        "administracion": administracion,
        "utilidad": utilidad,
        "financiamiento": financiamiento,
        "precio_calculado": dinero(directo + administracion + utilidad + financiamiento, precision),
    }


def calcular_presupuesto(documento):
    with localcontext() as contexto:
        contexto.prec = 60
        return calcular(documento)


def calcular(documento):
    moneda = texto(documento["moneda"], "moneda")
    if not re.fullmatch(r"[A-Z]{3}", moneda):
        raise ValueError("Moneda: indicar un código de tres letras mayúsculas.")
    decimales = documento.get("decimales_moneda", 2)
    if type(decimales) is not int or not 0 <= decimales <= 4:
        raise ValueError("decimales_moneda debe ser un entero entre 0 y 4.")
    precision = Decimal(1).scaleb(-decimales)
    impuesto_pct = decimal(documento.get("impuesto_pct", 0), "impuesto_pct")
    if impuesto_pct > CIEN:
        raise ValueError("impuesto_pct debe estar entre 0 y 100.")
    if not documento["renglones"]:
        raise ValueError("El presupuesto requiere al menos un renglón.")

    capitulos = {}
    renglones = []
    ids = set()
    base_imponible = Decimal(0)
    for linea in documento["renglones"]:
        id_linea = texto(linea["id"], "id de renglón")
        if id_linea in ids:
            raise ValueError(f"Renglón duplicado: {id_linea}.")
        ids.add(id_linea)
        capitulo = texto(linea["capitulo"], f"{id_linea}.capitulo")
        cantidad = decimal(linea["cantidad"], f"{id_linea}.cantidad", positivo=True)
        modo = linea["modo"]
        if modo not in ("CALCULADO", "ASUMIDO", "MANUAL"):
            raise ValueError(f"{id_linea}: modo de precio desconocido.")

        apu = None
        if modo == "MANUAL":
            if linea.get("apu") is not None:
                raise ValueError(f"{id_linea}: una partida manual se registra sin APU.")
            precio = dinero(decimal(linea["precio_manual"], f"{id_linea}.precio_manual"), precision)
        else:
            apu = desglosar_apu(linea["apu"], moneda, precision)
            precio = apu["precio_calculado"]
            if modo == "ASUMIDO":
                texto(linea.get("motivo_precio_asumido"), f"{id_linea}.motivo_precio_asumido")
                precio = dinero(decimal(linea["precio_asumido"], f"{id_linea}.precio_asumido"), precision)

        importe = dinero(cantidad * precio, precision)
        gravado = linea.get("gravado", True)
        if type(gravado) is not bool:
            raise ValueError(f"{id_linea}.gravado: indicar true o false.")
        if gravado:
            base_imponible += importe
        capitulos[capitulo] = capitulos.get(capitulo, Decimal(0)) + importe
        renglones.append({
            "id": id_linea,
            "capitulo": capitulo,
            "modo": modo,
            "apu": apu,
            "precio_adoptado": precio,
            "importe": importe,
            "gravado": gravado,
        })

    subtotal = sum(capitulos.values())
    impuesto = dinero(base_imponible * impuesto_pct / CIEN, precision)
    return {
        "moneda": moneda,
        "renglones": renglones,
        "subtotales_capitulo": capitulos,
        "subtotal": subtotal,
        "base_imponible": base_imponible,
        "impuesto": impuesto,
        "total": subtotal + impuesto,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("presupuesto", type=Path)
    args = parser.parse_args()
    try:
        documento = json.loads(args.presupuesto.read_text(encoding="utf-8"))
        resultado = calcular_presupuesto(documento)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        parser.exit(2, f"Presupuesto inválido: {exc}\n")
    print(json.dumps(resultado, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
