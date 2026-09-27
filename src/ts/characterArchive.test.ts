import { describe, test, expect, vi, beforeEach } from 'vitest'

// Deactivate → activate before the deactivation's save reached the server:
// the server still lists the character as active (409 ARCHIVE_ALREADY_ACTIVE).
// Activation used to drop the stub then, and the save that followed deleted
// the character from the database. And deactivation must not ask the server
// to archive before every earlier edit has actually been saved.

class CharacterArchiveError extends Error {
    code: string
    chats: string[]
    constructor(code: string, message: string, chats: string[] = []) {
        super(message)
        this.code = code
        this.chats = chats
    }
}

const flushSaves = vi.fn<() => Promise<boolean>>()
const trackCharacterForSave = vi.fn()
const requestImmediateSave = vi.fn()
const storage = {
    activateCharacter: vi.fn(),
    archiveCharacter: vi.fn(),
}
const state: { db: any } = { db: null }

vi.mock('./globalApi.svelte', () => ({
    checkCharOrder: () => {},
    flushSaves: () => flushSaves(),
    forageStorage: { get realStorage() { return storage } },
    requestImmediateSave: () => requestImmediateSave(),
    requiresFullEncoderReload: { state: false },
    trackCharacterForSave: (id: string) => trackCharacterForSave(id),
}))
vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return {
        DBState: { get db() { return state.db } },
        loadingOverlayStore: { set: () => {} },
        selectedCharID: writable(-1),
    }
})
vi.mock('./alert', () => ({
    alertConfirm: async () => true,
    alertError: vi.fn(),
    notifySuccess: () => {},
}))
vi.mock('./characters', () => ({ changeChar: () => {}, deselectCharacter: () => {} }))
vi.mock('./storage/chatStorage', () => ({ convertStubsToPlaceholders: (chats: any[]) => chats }))
vi.mock('./storage/nodeStorage', () => ({ CharacterArchiveError }))
vi.mock('src/lang', () => ({
    language: new Proxy({}, { get: (_t, key) => typeof key === 'string' && key.endsWith('Confirm') ? () => 'confirm' : String(key) }),
}))

const { activateCharacter, archiveCharacter } = await import('./characterArchive')

const stub = { chaId: 'c1', name: 'One', archivedAt: 1000 }
const restored = () => ({ chaId: 'c1', name: 'One', chats: [{ id: 'x', name: 'Chat', _stub: true }] })

beforeEach(() => {
    vi.clearAllMocks()
    flushSaves.mockResolvedValue(true)
})

describe('activateCharacter', () => {
    test('waits for the pending save and retries when the server still has the character active', async () => {
        state.db = { characters: [], nodeOnlyArchivedCharacters: [{ ...stub }] }
        storage.activateCharacter
            .mockRejectedValueOnce(new CharacterArchiveError('ARCHIVE_ALREADY_ACTIVE', 'Character is already active'))
            .mockResolvedValueOnce(restored())
        expect(await activateCharacter('c1')).toBe(0)
        expect(flushSaves).toHaveBeenCalledTimes(1)
        expect(storage.activateCharacter).toHaveBeenNthCalledWith(2, 'c1', 1000)
        expect(state.db.characters.map((c: any) => c.chaId)).toEqual(['c1'])
        expect(state.db.nodeOnlyArchivedCharacters).toEqual([])
    })

    test('keeps the stub when the server still reports it active after saving', async () => {
        state.db = { characters: [], nodeOnlyArchivedCharacters: [{ ...stub }] }
        storage.activateCharacter.mockRejectedValue(new CharacterArchiveError('ARCHIVE_ALREADY_ACTIVE', 'Character is already active'))
        await expect(activateCharacter('c1')).rejects.toMatchObject({ code: 'ARCHIVE_ALREADY_ACTIVE' })
        expect(state.db.nodeOnlyArchivedCharacters).toEqual([stub])
        expect(state.db.characters).toEqual([])
    })

    test('keeps the stub when the pending save cannot be completed', async () => {
        state.db = { characters: [], nodeOnlyArchivedCharacters: [{ ...stub }] }
        flushSaves.mockResolvedValue(false)
        storage.activateCharacter.mockRejectedValue(new CharacterArchiveError('ARCHIVE_ALREADY_ACTIVE', 'Character is already active'))
        await expect(activateCharacter('c1')).rejects.toMatchObject({ code: 'ARCHIVE_ALREADY_ACTIVE' })
        expect(storage.activateCharacter).toHaveBeenCalledTimes(1)
        expect(state.db.nodeOnlyArchivedCharacters).toEqual([stub])
    })

    test('works on the database object current after the save, not the one it started with', async () => {
        const before = { characters: [], nodeOnlyArchivedCharacters: [{ ...stub }] }
        const after = { characters: [], nodeOnlyArchivedCharacters: [{ ...stub }] }
        state.db = before
        storage.activateCharacter
            .mockRejectedValueOnce(new CharacterArchiveError('ARCHIVE_ALREADY_ACTIVE', 'x'))
            .mockResolvedValueOnce(restored())
        flushSaves.mockImplementation(async () => { state.db = after; return true })
        await activateCharacter('c1')
        expect(after.characters.map((c: any) => c.chaId)).toEqual(['c1'])
        expect(after.nodeOnlyArchivedCharacters).toEqual([])
    })
})

describe('archiveCharacter', () => {
    test('does not archive while earlier edits are still unsaved', async () => {
        state.db = { characters: [{ chaId: 'c1', name: 'One', chats: [] }], nodeOnlyArchivedCharacters: [] }
        flushSaves.mockResolvedValue(false)
        expect(await archiveCharacter(0, { skipConfirm: true })).toBe(false)
        expect(storage.archiveCharacter).not.toHaveBeenCalled()
        expect(state.db.characters).toHaveLength(1)
    })

    test('gives an id-less chat an id and saves it before the server builds the payload', async () => {
        const chat: any = { name: 'Chat 1', message: [{ role: 'user', data: 'hi' }] }
        const placeholder: any = { id: 'p', name: 'Old', message: [], _placeholder: true }
        state.db = { characters: [{ chaId: 'c1', name: 'One', chats: [chat, placeholder] }], nodeOnlyArchivedCharacters: [] }
        const order: string[] = []
        trackCharacterForSave.mockImplementation(() => order.push('track'))
        flushSaves.mockImplementation(async () => { order.push('flush'); return true })
        storage.archiveCharacter.mockImplementation(async () => { order.push('archive'); return { ...stub } })
        expect(await archiveCharacter(0, { skipConfirm: true })).toBe(true)
        expect(typeof chat.id).toBe('string')
        expect(chat.id.length).toBeGreaterThan(0)
        expect(placeholder.id).toBe('p')
        expect(trackCharacterForSave).toHaveBeenCalledWith('c1')
        expect(order.slice(0, 3)).toEqual(['track', 'flush', 'archive'])
        expect(state.db.characters).toEqual([])
        expect(state.db.nodeOnlyArchivedCharacters.map((s: any) => s.chaId)).toEqual(['c1'])
    })

    test('waits for the transition to be saved before reporting success', async () => {
        state.db = { characters: [{ chaId: 'c1', name: 'One', chats: [] }], nodeOnlyArchivedCharacters: [] }
        storage.archiveCharacter.mockResolvedValue({ ...stub })
        await archiveCharacter(0, { skipConfirm: true })
        // Once before the server call, once after moving the character.
        expect(flushSaves).toHaveBeenCalledTimes(2)
        expect(requestImmediateSave).not.toHaveBeenCalled()
    })
})
