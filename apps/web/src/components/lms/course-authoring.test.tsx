import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CourseDetail } from '@/features/lms/use-lms'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { CourseAuthoring } from './course-authoring'

vi.mock('sonner', () => ({ toast: {success: vi.fn(), error: vi.fn()} }))
const fixture = { id:'c1', title:'Trabajo seguro', description:'Un curso práctico para preparar el trabajo y aplicar procedimientos seguros antes de intervenir equipos de la planta.', level:'BASIC' as const, durationMinutes:10, certificate:true, price:95, currency:'USD', instructorName:'María Rodríguez', status:'DRAFT' as const, owner:{type:'ECOSYSTEM' as const,id:null,name:'Ecosistema FUR',verified:true}, stages:[], lessonCount:1, createdAt:'2026-11-09', myEnrollment:null, canManage:true, category:'Seguridad y ambiente', language:'es', learningObjectives:['Identificar riesgos'], requirements:[], targetAudience:['Técnicos'],
  sections:[{id:'s1',title:'Preparación',description:null,position:0},{id:'s2',title:'Intervención',description:null,position:1}],
  lessons:[{id:'l1',sectionId:'s1',title:'Preparar la intervención',content:'Revisa el permiso de trabajo.',videoUrl:null,position:0,durationMinutes:10,completed:false}],
  publication:{ready:true,checks:[{id:'content',label:'Contenido completo',complete:true}]},
}
const course: CourseDetail = fixture
afterEach(() => vi.unstubAllGlobals())

describe('Course authoring workspace', () => {
  it('retries a failed cover upload without creating a second course', async () => {
    let attempts = 0
    const api = mockApi({
      'POST /courses':{status:201,body:course},
      'PATCH /courses/c1':{body:course},
      'POST /courses/c1/cover':() => ++attempts === 1 ? {status:503,body:{message:'Upload unavailable'}} : {status:201,body:{...course,coverSource:'upload',coverUrl:'/courses/c1/cover?v=123'}},
    })
    const created = vi.fn()
    renderWithProviders(<CourseAuthoring owner={{ownerType:'ECOSYSTEM'}} onCreated={created} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Título del curso'),'Curso con portada')
    await userEvent.upload(screen.getByLabelText('Imagen de portada'),new File(['image'],'cover.png',{type:'image/png'}))
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload unavailable')
    expect(created).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    await waitFor(()=>expect(created).toHaveBeenCalledWith('c1','presentation'))
    expect(api.count('POST /courses')).toBe(1)
    expect(api.count('POST /courses/c1/cover')).toBe(2)
    const form = api.calls.find(c=>c.path.endsWith('/cover'))!.init.body as FormData
    expect((form.get('file') as File).name).toBe('cover.png')
    expect(JSON.parse(api.calls.find(c=>c.method==='PATCH')!.init.body as string)).not.toHaveProperty('coverUrl')
  })

  it('preserves an uploaded cover when saving other course fields', async () => {
    const withCover = {...course,coverSource:'upload' as const,coverUrl:'/courses/018f0000-0000-7000-8000-000000000000/cover?v=123'}
    const api = mockApi({'PATCH /courses/c1':{body:withCover},'GET /courses/018f0000-0000-7000-8000-000000000000/cover':{raw:'image',headers:{'Content-Type':'image/png'}}})
    renderWithProviders(<CourseAuthoring course={withCover} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    await waitFor(()=>expect(api.count('PATCH /courses/c1')).toBe(1))
    expect(JSON.parse(api.calls.find(c=>c.method==='PATCH')!.init.body as string)).not.toHaveProperty('coverUrl')
    await userEvent.click(screen.getByLabelText('Sin portada'))
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    await waitFor(()=>expect(api.count('PATCH /courses/c1')).toBe(2))
    expect(JSON.parse(api.calls.filter(c=>c.method==='PATCH')[1].init.body as string).coverUrl).toBeNull()
  })

  it('creates a saved draft and continues to learning without stage fields', async () => {
    const api = mockApi({'POST /courses':{status:201,body:course}})
    const created = vi.fn()
    renderWithProviders(<CourseAuthoring owner={{ownerType:'ECOSYSTEM'}} onCreated={created} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un título')
    expect(api.calls).toHaveLength(0)
    await userEvent.type(screen.getByLabelText('Título del curso'),'Curso de mantenimiento')
    await userEvent.click(screen.getByRole('button',{name:'Guardar y continuar'}))
    await waitFor(() => expect(created).toHaveBeenCalledWith('c1','audience'))
    const body = JSON.parse(api.calls[0].init.body as string)
    expect(body).toMatchObject({title:'Curso de mantenimiento',ownerType:'ECOSYSTEM',learningObjectives:[],price:0})
    expect(body).not.toHaveProperty('stageCodes')
    expect(screen.queryByText('Etapas relacionadas')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Qué aprenderán 1')).toBeInTheDocument()
  })

  it('saves multiple learning outcomes and keeps the price and audience', async () => {
    const api = mockApi({'PATCH /courses/c1':{body:course}})
    renderWithProviders(<CourseAuthoring course={course} initialStep="audience" onClose={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Qué aprenderán 1'))
    await userEvent.type(screen.getByLabelText('Qué aprenderán 1'),'Preparar un permiso de trabajo')
    await userEvent.click(screen.getAllByRole('button',{name:'Agregar otro'})[0])
    await userEvent.type(screen.getByLabelText('Qué aprenderán 2'),'Identificar fuentes de energía')
    await userEvent.click(screen.getByRole('button',{name:'Guardar borrador'}))
    await waitFor(() => expect(api.calls).toHaveLength(1))
    expect(JSON.parse(api.calls[0].init.body as string)).toMatchObject({learningObjectives:['Preparar un permiso de trabajo','Identificar fuentes de energía'],price:95,targetAudience:['Técnicos']})
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  })

  it('edits and reorders modules and allows moving a lesson to another module', async () => {
    const api = mockApi({'PATCH /courses/c1/sections/s2':{body:course},'PATCH /courses/c1/lessons/l1':{body:course}})
    renderWithProviders(<CourseAuthoring course={course} initialStep="curriculum" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button',{name:'Subir módulo Intervención'}))
    await waitFor(() => expect(api.calls[0].path).toBe('/courses/c1/sections/s2'))
    expect(JSON.parse(api.calls[0].init.body as string)).toEqual({position:0})
    await userEvent.click(screen.getByRole('button',{name:'Editar lección Preparar la intervención'}))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Módulo'),'s2')
    await userEvent.click(within(dialog).getByRole('button',{name:'Guardar cambios'}))
    await waitFor(() => expect(api.calls.find(c=>c.path.endsWith('/lessons/l1'))).toBeDefined())
    expect(JSON.parse(api.calls.find(c=>c.path.endsWith('/lessons/l1'))!.init.body as string).sectionId).toBe('s2')
  })

  it('uses server readiness and saves before requesting publication', async () => {
    const api = mockApi({'PATCH /courses/c1':{body:course}})
    renderWithProviders(<CourseAuthoring course={course} initialStep="review" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button',{name:'Publicar curso'}))
    await waitFor(() => expect(api.calls).toHaveLength(2))
    expect(JSON.parse(api.calls[1].init.body as string)).toEqual({status:'PUBLISHED'})
  })
})
