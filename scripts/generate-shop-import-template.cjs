const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
 const book = new ExcelJS.Workbook();book.creator='Ecosistema FUR';
 const instructions=book.addWorksheet('Instrucciones');
 for(const line of [
 'IMPORTACION DE PRODUCTOS PROPIOS DE LA TIENDA',
 '1. Completa Productos, Variantes, Especificaciones e Imagenes. Conserva hojas y encabezados.',
 '2. referencia vincula las hojas; es una clave del archivo, no un modelo del catalogo.',
 '3. Usa el codigo exacto de categoria existente; puedes consultarlos en Herramientas de la tienda.',
 '4. Cada producto necesita al menos una variante, una especificacion y una portada.',
 '5. condicion: NEW, USED o REFURBISHED. modalidad: DIRECT o QUOTE. moneda: USD, VES, etc.',
 '6. Precio, stock, minimo y preparacion_dias deben ser celdas numericas. No se aceptan formulas.',
 '7. Especificaciones: NUMBER usa una celda numerica; TEXT texto; BOOLEAN true/false; LIST ["A","B"]; RANGE {"min":1,"max":2}.',
 '8. Imagenes: archivo incluye extension, uso PORTADA o GALERIA, orden numerico 0 a 7 para galeria.',
 '9. Adjunta los JPG/PNG/WebP nombrados en Imagenes junto al Excel. No se aceptan enlaces externos ni fotos incrustadas en Excel.',
 '10. Maximo 200 productos, 100 variantes por producto, 80 especificaciones y 8 fotos de galeria; 40 archivos y 50 MB de imagenes por lote, 5 MB por archivo.',
 '11. Los SKU existentes o repetidos bloquean la carga. Se crean borradores, sin sobrescribir productos.',
 '12. Analiza, revisa todos los errores y confirma el mismo archivo y las mismas imagenes.',
 '13. Para portadas de productos existentes usa la carga por SKU: SKU.jpg, SKU.png o SKU.webp.',
 ]) instructions.addRow([line]);instructions.getColumn(1).width=115;instructions.eachRow(r=>{r.alignment={wrapText:true};r.height=34});
 const headers={Productos:['referencia','titulo','categoria','moneda','marca','modelo','condicion','modalidad','descripcion','garantia','preparacion_dias'],Variantes:['referencia','sku','nombre','precio','stock','minimo'],Especificaciones:['referencia','caracteristica','tipo','unidad','valor'],Imagenes:['referencia','archivo','uso','orden']};
 for(const [name,columns] of Object.entries(headers)){const sheet=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});sheet.addRow(columns);columns.forEach((_,i)=>sheet.getColumn(i+1).width=24);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF102644'}};sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:columns.length}};sheet.getRow(1).height=28;}
 const folder=path.resolve('../planta_beneficio_oro_suppliers/public/templates');fs.mkdirSync(folder,{recursive:true});await book.xlsx.writeFile(path.join(folder,'plantilla-productos-tienda.xlsx'));console.log('Plantilla de tienda generada');
})().catch(e=>{console.error(e);process.exit(1)});
