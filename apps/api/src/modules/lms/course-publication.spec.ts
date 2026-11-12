import { coursePublication } from './course-publication'
import { updateCourseSchema } from './lms.schemas'

const course = { title:'Trabajo seguro', description:'Una formación práctica para identificar riesgos y ejecutar trabajos con procedimientos seguros antes de intervenir equipos.', instructorName:'Instructora', learningObjectives:['Identificar riesgos'], targetAudience:['Personal técnico'] }
describe('Course publication readiness', () => {
  it('accepts a complete text course without stage data', () => {
    expect(coursePublication(course,[{content:'Procedimientos',videoUrl:null}],true).ready).toBe(true)
  })
  it.each(['PENDING','PROCESSING','FAILED'])('blocks video status %s even with introductory text', status => {
    expect(coursePublication(course,[{content:'Introducción',videoUrl:null,video:{status}}],true).ready).toBe(false)
  })
  it('accepts a ready uploaded video without text', () => {
    expect(coursePublication(course,[{content:null,videoUrl:null,video:{status:'READY'}}],true).ready).toBe(true)
  })
  it('keeps defaults out of partial updates', () => {
    expect(updateCourseSchema.parse({price:20})).toEqual({price:20})
  })
  it('identifies missing objectives and owner eligibility', () => {
    const checks = coursePublication({...course,learningObjectives:[]},[{content:'Text',videoUrl:null}],false).checks
    expect(checks.filter(c=>!c.complete).map(c=>c.id)).toEqual(['learningObjectives','owner'])
  })
})
