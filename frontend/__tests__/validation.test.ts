import { validateReport } from '../components/report/validation'

describe('validateReport', () => {
  it('accepts a complete report', () => {
    expect(validateReport({ title: 'Pothole', description: 'Deep pothole near signal', hasLocation: true })).toEqual({})
  })

  it('reports every problem in on-screen order', () => {
    expect(Object.keys(validateReport({ title: ' ', description: '', hasLocation: false }))).toEqual([
      'title',
      'description',
      'location',
    ])
  })

  it('enforces the same minimum lengths as the API', () => {
    expect(validateReport({ title: 'ab', description: 'too short', hasLocation: true })).toEqual({
      title: 'Title must be at least 3 characters',
      description: 'Description must be at least 10 characters',
    })
  })
})
