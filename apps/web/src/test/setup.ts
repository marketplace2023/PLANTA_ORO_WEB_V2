import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy*/waitFor esperan 1 s por defecto: con varios archivos en paralelo da falsos negativos.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})

// jsdom no implementa estas APIs de puntero/scroll que Radix (Select, Dialog…) usa internamente.
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
}

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom no implementa object URLs (se usan para la vista previa y las descargas de documentos).
if (typeof URL !== 'undefined') {
  URL.createObjectURL ??= () => 'blob:fur-test'
  URL.revokeObjectURL ??= () => undefined
}
