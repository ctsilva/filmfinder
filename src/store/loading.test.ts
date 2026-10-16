import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useApp } from './useApp.ts'

const emptyIndex = { names: [], films: [] }
const peopleFile = {
  directors: emptyIndex,
  actors: emptyIndex,
  actresses: emptyIndex,
}

function respond(ok: boolean, body: unknown = {}): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response
}

beforeEach(() => {
  useApp.setState({
    dataBase: '/data/',
    peopleStatus: 'idle',
    creditsStatus: 'idle',
    credits: null,
    indexes: {},
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('people list loading', () => {
  test('a failed request becomes an error state, and a retry recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(false))
      .mockResolvedValueOnce(respond(true, peopleFile))
    vi.stubGlobal('fetch', fetchMock)

    await useApp.getState().loadPeople()
    expect(useApp.getState().peopleStatus).toBe('error')
    expect(useApp.getState().indexes.actor).toBeUndefined()

    await useApp.getState().loadPeople() // the Retry button
    expect(useApp.getState().peopleStatus).toBe('ready')
    expect(useApp.getState().indexes.actor).toEqual(emptyIndex)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('a ready list is not fetched again, and a request in flight is not duplicated', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(true, peopleFile))
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([
      useApp.getState().loadPeople(),
      useApp.getState().loadPeople(),
    ])
    await useApp.getState().loadPeople()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('the title list does not depend on it: other state stays intact on failure', async () => {
    useApp.setState({ indexes: { title: emptyIndex } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(false)))
    await useApp.getState().loadPeople()
    expect(useApp.getState().indexes.title).toEqual(emptyIndex)
  })
})

describe('cast list loading', () => {
  test('failure then retry', async () => {
    const credits = { directors: [], actors: [], actresses: [], photos: [] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(respond(false))
        .mockResolvedValueOnce(respond(true, credits)),
    )
    await useApp.getState().loadCredits()
    expect(useApp.getState().creditsStatus).toBe('error')
    expect(useApp.getState().credits).toBeNull()
    await useApp.getState().loadCredits()
    expect(useApp.getState().creditsStatus).toBe('ready')
    expect(useApp.getState().credits).toEqual(credits)
  })

  test('a network error (fetch rejects) is also an error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network down')),
    )
    await useApp.getState().loadCredits()
    expect(useApp.getState().creditsStatus).toBe('error')
  })
})

describe('associative search by person', () => {
  beforeEach(() => {
    // the store coalesces query updates with requestAnimationFrame, which Node does not have
    vi.stubGlobal('requestAnimationFrame', () => 0)
  })

  test('selecting a person by index queries that person, not another with the same name', () => {
    const smith = { names: ['Smith, John', 'Smith, John'], films: [[0], [1]] }
    useApp.setState({ indexes: { director: smith }, selected: 5 })
    useApp.getState().selectPerson('director', 1)
    const q = useApp.getState().query
    expect(q.alpha.director).toBe(1)
    expect(q.alpha.actor).toBeNull()
    expect(useApp.getState().selected).toBe(-1)
  })

  test('does nothing while the people lists are not loaded', () => {
    useApp.setState({ indexes: {}, selected: 5 })
    useApp.getState().selectPerson('director', 0)
    expect(useApp.getState().selected).toBe(5)
  })
})
