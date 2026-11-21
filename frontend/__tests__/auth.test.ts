import { adminFetch, clearAdminSession, loginAdmin } from '../lib/auth'

describe('lib/auth', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('adminFetch always sends same-origin credentials and keeps caller options', async () => {
    await adminFetch('/api/admin/queue', { method: 'PATCH', headers: { 'X-Test': '1' } })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/queue', {
      method: 'PATCH',
      headers: { 'X-Test': '1' },
      credentials: 'same-origin',
    })
  })

  it('adminFetch cannot be downgraded to credentials: include', async () => {
    await adminFetch('/api/admin/queue', { credentials: 'include' })
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin')
  })

  it('clearAdminSession POSTs to /api/admin/logout', async () => {
    await clearAdminSession()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    )
  })

  it('clearAdminSession swallows network failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(clearAdminSession()).resolves.toBeUndefined()
  })

  it('loginAdmin posts the key once as JSON and reports success', async () => {
    await expect(loginAdmin('secret-key')).resolves.toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ key: 'secret-key' })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(loginAdmin('wrong')).resolves.toBe(false)
  })
})
