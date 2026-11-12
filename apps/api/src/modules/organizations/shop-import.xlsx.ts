import { BadRequestException } from '@nestjs/common';
import readExcelFile from 'read-excel-file/node';
import { z } from 'zod';
import { unzipSync, strFromU8 } from 'fflate';
import { commercialSchema, variantSchema, specification } from './commerce.schemas';
export const SHOP_IMPORT_HEADERS = {
    Productos: ['referencia', 'titulo', 'categoria', 'moneda', 'marca', 'modelo', 'condicion', 'modalidad', 'descripcion', 'garantia', 'preparacion_dias'],
    Variantes: ['referencia', 'sku', 'nombre', 'precio', 'stock', 'minimo'],
    Especificaciones: ['referencia', 'caracteristica', 'tipo', 'unidad', 'valor'],
    Imagenes: ['referencia', 'archivo', 'uso', 'orden'],
} as const;
export type ShopImportIssue = {
    sheet: string;
    row: number;
    message: string;
};
const key = z.string().trim().min(1).max(80);
const productSchema = z.object({ reference: key, title: z.string().trim().min(1).max(200), family: z.string().trim().min(1).max(60), currency: z.string().regex(/^[A-Z]{3}$/), commercial: commercialSchema });
export type ImportProduct = z.infer<typeof productSchema> & {
    row: number;
    variants: Array<z.infer<typeof variantSchema>>;
};
export type ImportPhoto = {
    reference: string;
    file: string;
    use: 'PORTADA' | 'GALERIA';
    position: number;
    row: number;
};
/** Values only. Formulas are rejected, including formulas with cached results. */
export async function parseShopWorkbook(buffer: Buffer) {
    if (buffer.length > 5 * 1024 * 1024 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
        throw new BadRequestException('Adjunta un Excel .xlsx válido de hasta 5 MB');
    try {
        let size = 0, count = 0;
        const xml = unzipSync(buffer, { filter(entry) { size += entry.originalSize; count++; if (size > 50 * 1024 * 1024 || count > 1000)
                throw Error('Libro demasiado grande'); if (/vbaProject|externalLinks/i.test(entry.name))
                throw Error('Macros o vínculos externos'); if (/^xl\/media\//.test(entry.name))
                throw Error('Adjunta las imágenes por separado; no las incrustes en Excel'); return /^xl\/worksheets\/.*\.xml$/.test(entry.name); } });
        for (const data of Object.values(xml))
            if (/<(?:\w+:)?f(?:\s|>|\/)/.test(strFromU8(data)))
                throw Error('Fórmulas no permitidas; pega los valores');
    }
    catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Excel no válido');
    }
    let workbook: Awaited<ReturnType<typeof readExcelFile>>;
    try {
        workbook = await readExcelFile(buffer);
    }
    catch {
        throw new BadRequestException('No se pudo leer el Excel');
    }
    const issues: ShopImportIssue[] = [], products: ImportProduct[] = [], photos: ImportPhoto[] = [];
    const issue = (sheet: string, row: number, message: string) => issues.push({ sheet, row, message });
    const tables = new Map<string, Array<{
        row: number;
        data: Record<string, unknown>;
    }>>();
    for (const [name, headers] of Object.entries(SHOP_IMPORT_HEADERS)) {
        const sheets = workbook.filter(s => s.sheet === name);
        if (sheets.length !== 1) {
            issue(name, 1, 'Falta la hoja requerida o está duplicada');
            continue;
        }
        const rows = sheets[0].data;
        const first = rows[0]?.map(v => String(v ?? '').trim()) ?? [];
        if (first.length !== headers.length || headers.some((h, i) => first[i] !== h)) {
            issue(name, 1, `Encabezados exactos: ${headers.join(', ')}`);
            continue;
        }
        const parsed: Array<{
            row: number;
            data: Record<string, unknown>;
        }> = [];
        if (rows.length > 2001) {
            issue(name, 1, 'La hoja admite hasta 2.000 filas');
            continue;
        }
        rows.slice(1).forEach((values, i) => {
            if (values.every(v => v === null || v === ''))
                return;
            if (values.length > headers.length) {
                issue(name, i + 2, 'Hay columnas adicionales');
                return;
            }
            const data: Record<string, unknown> = {};
            headers.forEach((h, n) => data[h] = values[n] ?? '');
            parsed.push({ row: i + 2, data });
        });
        tables.set(name, parsed);
    }
    for (const sheet of workbook)
        if (!Object.hasOwn(SHOP_IMPORT_HEADERS, sheet.sheet) && !['Instrucciones', 'Categorias'].includes(sheet.sheet))
            issue(sheet.sheet, 1, 'Hoja desconocida; usa la plantilla de la tienda');
    const strings = (value: unknown) => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value);
    const number = (value: unknown, fallback?: number) => value === '' ? fallback : typeof value === 'number' ? value : NaN;
    for (const { row, data: d } of tables.get('Productos') ?? []) {
        if (typeof d.referencia !== 'string') {
            issue('Productos', row, 'La referencia debe ser texto para conservar ceros iniciales');
            continue;
        }
        const parsed = productSchema.safeParse({ reference: strings(d.referencia), title: strings(d.titulo), family: strings(d.categoria), currency: strings(d.moneda), commercial: { brand: strings(d.marca), model: strings(d.modelo), condition: strings(d.condicion) || 'NEW', saleMode: strings(d.modalidad), warranty: strings(d.garantia), leadDays: number(d.preparacion_dias, 0), specifications: [] } });
        if (!parsed.success) {
            issue('Productos', row, parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
            continue;
        }
        if (typeof d.descripcion !== 'string' || d.descripcion.length > 10000) {
            issue('Productos', row, 'Descripción inválida o mayor de 10.000 caracteres');
            continue;
        }
        if (products.some(p => p.reference === parsed.data.reference)) {
            issue('Productos', row, 'Referencia repetida');
            continue;
        }
        products.push({ ...parsed.data, row, variants: [] });
    }
    if (!products.length)
        issue('Productos', 2, 'Agrega al menos un producto válido');
    if (products.length > 200)
        issue('Productos', 1, 'Máximo 200 productos por importación');
    const skus = new Set<string>();
    for (const { row, data: d } of tables.get('Variantes') ?? []) {
        if (typeof d.sku !== 'string' || typeof d.referencia !== 'string') {
            issue('Variantes', row, 'SKU y referencia deben ser texto');
            continue;
        }
        const product = products.find(p => p.reference === strings(d.referencia));
        if (!product) {
            issue('Variantes', row, 'Referencia de producto desconocida');
            continue;
        }
        const parsed = variantSchema.safeParse({ sku: strings(d.sku), name: strings(d.nombre), price: number(d.precio), stock: number(d.stock), salesRules: { minQuantity: number(d.minimo, 1) } });
        if (!parsed.success) {
            issue('Variantes', row, parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
            continue;
        }
        if (skus.has(parsed.data.sku)) {
            issue('Variantes', row, 'SKU repetido en el archivo');
            continue;
        }
        skus.add(parsed.data.sku);
        product.variants.push(parsed.data);
    }
    for (const { row, data: d } of tables.get('Especificaciones') ?? []) {
        const product = products.find(p => p.reference === strings(d.referencia));
        if (!product) {
            issue('Especificaciones', row, 'Referencia desconocida');
            continue;
        }
        const type = strings(d.tipo);
        let value: unknown = d.valor;
        try {
            if (['LIST', 'RANGE', 'BOOLEAN'].includes(type))
                value = JSON.parse(strings(value));
        }
        catch {
            issue('Especificaciones', row, 'Usa JSON válido para LIST, RANGE o BOOLEAN');
            continue;
        }
        const parsed = specification.safeParse({ label: strings(d.caracteristica), type, unit: strings(d.unidad), value });
        if (!parsed.success) {
            issue('Especificaciones', row, parsed.error.issues.map(e => e.message).join('; '));
            continue;
        }
        if (product.commercial.specifications.some(s => s.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase())) {
            issue('Especificaciones', row, 'Característica repetida');
            continue;
        }
        product.commercial.specifications.push(parsed.data);
    }
    for (const { row, data: d } of tables.get('Imagenes') ?? []) {
        const reference = strings(d.referencia), file = strings(d.archivo), use = strings(d.uso), position = number(d.orden, 0);
        if (!products.some(p => p.reference === reference)) {
            issue('Imagenes', row, 'Referencia desconocida');
            continue;
        }
        if (!/^[^/\\]+\.(png|jpe?g|webp)$/i.test(file) || file.length > 200) {
            issue('Imagenes', row, 'Usa un nombre JPG, PNG o WebP sin carpetas');
            continue;
        }
        if (!['PORTADA', 'GALERIA'].includes(use) || position === undefined || !Number.isInteger(position) || position < 0 || position > 7) {
            issue('Imagenes', row, 'Uso: PORTADA o GALERIA; orden entero de 0 a 7');
            continue;
        }
        photos.push({ reference, file, use: use as ImportPhoto['use'], position, row });
    }
    for (const product of products) {
        if (!product.variants.length || product.variants.length > 100)
            issue('Productos', product.row, 'Cada producto requiere de 1 a 100 variantes');
        if (!product.commercial.specifications.length || product.commercial.specifications.length > 80)
            issue('Productos', product.row, 'Cada producto requiere de 1 a 80 especificaciones técnicas');
        const own = photos.filter(p => p.reference === product.reference), covers = own.filter(p => p.use === 'PORTADA'), gallery = own.filter(p => p.use === 'GALERIA');
        if (covers.length !== 1)
            issue('Productos', product.row, 'Cada producto requiere exactamente una portada');
        if (gallery.length > 8 || new Set(gallery.map(p => p.position)).size !== gallery.length)
            issue('Productos', product.row, 'Máximo 8 fotos de galería, sin repetir el orden');
    }
    return { products, photos, issues, descriptions: new Map((tables.get('Productos') ?? []).map(({ data }) => [strings(data.referencia), strings(data.descripcion)])) };
}
