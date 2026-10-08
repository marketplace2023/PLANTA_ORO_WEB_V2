/** "D04" → "04": el número que se muestra junto al nombre de la etapa. */
export const stageNumber = (code: string) => code.replace(/^D/i, '')
