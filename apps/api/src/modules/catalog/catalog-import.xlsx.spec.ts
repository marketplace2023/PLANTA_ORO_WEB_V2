import { cleanManufacturerName } from './catalog-import.xlsx'

describe('Nombre del fabricante del listado maestro', () => {
  it.each([
    ['Releven (REV08 INV-060)', 'Releven'],
    ['Releven (REV08 INV-062)', 'Releven'],
    ['Staffa (motores hidráulicos) (REV08 INV-068)', 'Staffa'],
    ['Osborn MMD (por confirmar (REV08 ELEC-023))', 'Osborn MMD'],
    ['  Alfa   Laval (REV08 ELEC-079)  ', 'Alfa Laval'],
    ['Fabricante (nota) Industrial (otra nota)', 'Fabricante Industrial'],
    ['Fabricante (nota\nen varias líneas)', 'Fabricante'],
    ['Metso', 'Metso'],
    ['(Sin fabricante fuera de paréntesis)', ''],
  ])('normaliza %s a %s', (source, expected) => {
    expect(cleanManufacturerName(source)).toBe(expected)
  })
})
