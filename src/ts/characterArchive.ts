/**
 * Character archive — shown to users as "deactivate / activate".
 *
 * A deactivated character leaves `db.characters` and is kept as a small stub in
 * `db.nodeOnlyArchivedCharacters`; its full body (chats, asset list) lives on
 * the server in kv `archive/<chaId>/<archivedAt>` (one immutable row per
 * deactivation; the stub names its row). Lists render the stub in place (dimmed)
 * and every other consumer — plugins, scripts, search, dataset export — sees
 * the character as if it had been deleted.
 *
 * Both moves happen here on the client, after the server has written/read the
 * payload, so the change reaches the server through the normal save path
 * (/api/patch) and dbCache, hashes and etag stay in one flow. The server
 * rejects a patch that would leave a chaId in both lists.
 */
import { get } from "svelte/store"
import { language } from "src/lang"
import { alertConfirm, alertError, notifySuccess } from "./alert"
import { changeChar, deselectCharacter } from "./characters"
import { checkCharOrder, flushSaves, forageStorage, requestImmediateSave, requiresFullEncoderReload, trackCharacterForSave } from "./globalApi.svelte"
import { DBState, loadingOverlayStore, selectedCharID } from "./stores.svelte"
import { convertStubsToPlaceholders } from "./storage/chatStorage"
import type { ArchivedCharacterStub, character } from "./storage/database.svelte"
import { CharacterArchiveError, type NodeStorage } from "./storage/nodeStorage"
import { v4 } from "uuid"

export { CharacterArchiveError }

function storage(): NodeStorage {
    return forageStorage.realStorage as NodeStorage
}

export function getArchivedStubs(): ArchivedCharacterStub[] {
    return DBState.db.nodeOnlyArchivedCharacters ?? []
}

export function findArchivedStub(chaId: string): ArchivedCharacterStub | undefined {
    return getArchivedStubs().find((s) => s?.chaId === chaId)
}

export function isArchivedCharacter(chaId: string): boolean {
    return !!findArchivedStub(chaId)
}

function withOverlay<T>(fn: () => Promise<T>): Promise<T> {
    loadingOverlayStore.set({ active: true, text: language.loading ?? '', onCancel: null })
    return fn().finally(() => {
        loadingOverlayStore.set({ active: false, text: '', onCancel: null })
    })
}

function bulletList(names: string[], max = 5): string {
    const lines = names.slice(0, max).map((n) => `• ${n || '—'}`)
    if (names.length > max) lines.push(`• … +${names.length - max}`)
    return lines.join('\n')
}

/**
 * Deactivate the character at `index`. Asks for confirmation, then:
 * server writes + verifies the payload → the character moves from
 * `characters` to the stub list (one save tick) → selection is cleared.
 * Returns true when the character was deactivated.
 */
export async function archiveCharacter(index: number, arg: { skipConfirm?: boolean; trash?: boolean; trashedAt?: number; silent?: boolean } = {}): Promise<boolean> {
    const char = DBState.db.characters[index]
    if (!char?.chaId) return false
    const name = char.name || 'Unnamed'
    // skipConfirm: bulk callers (character manager) confirm once for the whole set.
    // trash: the trash is "deactivated + trashedAt marker" — same server row,
    // the stub just carries the marker (exported as upstream's trashTime).
    if (!arg.skipConfirm && !await alertConfirm(language.deactivateCharacterConfirm(name))) return false

    // acceptLostChats: chats whose body the server no longer has (lost before
    // this build) are stored as the empty chats they already show as. The
    // trash accepts that outright; a deactivation asks first.
    const run = async (acceptLostChats: boolean) => {
        // A chat without an id is never uploaded by the save path; give it
        // one so its body reaches the server with the save below.
        let assignedIds = false
        for (const chat of char.chats ?? []) {
            if (chat && !chat._placeholder && !chat.id) {
                chat.id = v4()
                assignedIds = true
            }
        }
        if (assignedIds) trackCharacterForSave(char.chaId)
        // The server builds the payload from its own view: every edit (and
        // every chat body this browser holds) must have reached it first,
        // or the archived copy would silently miss them.
        if (!await flushSaves()) throw new Error(language.archiveSaveFailed)
        const stub = await storage().archiveCharacter(char.chaId, { acceptLostChats })
        // Re-resolve both: a save above may have rebased the database object,
        // and the array may have shifted while the server worked.
        const db = DBState.db
        const idx = db.characters.findIndex((c) => c?.chaId === char.chaId)
        if (idx === -1) return false
        if (!Array.isArray(db.nodeOnlyArchivedCharacters)) db.nodeOnlyArchivedCharacters = []
        if (arg.trash) stub.trashedAt = arg.trashedAt ?? Date.now()
        db.nodeOnlyArchivedCharacters.push(stub)
        const selectedIndex = get(selectedCharID)
        db.characters.splice(idx, 1)
        checkCharOrder()
        requiresFullEncoderReload.state = true
        // Keep whatever else was selected (bulk actions and the boot-time
        // trash migration run while a chat may be open); only the archived
        // character itself loses the selection. Indices after `idx` shift by one.
        if (selectedIndex === idx || selectedIndex < 0) deselectCharacter()
        else if (selectedIndex > idx) selectedCharID.set(selectedIndex - 1)
        // Until this save lands the server still sees the character active.
        // The overlay stays up meanwhile; activation also waits for it.
        if (arg.silent) void requestImmediateSave()
        else await flushSaves()
        if (!arg.silent) notifySuccess(arg.trash ? language.trashCharacterDone : language.deactivateCharacterDone)
        return true
    }
    // silent: no overlay, no dialogs — the caller reports (migration logs).
    const attempt = (acceptLostChats: boolean) => arg.silent ? run(acceptLostChats) : withOverlay(() => run(acceptLostChats))
    const fail = (error: unknown) => {
        alertError(language.deactivateCharacterFailed + (error instanceof Error ? error.message : String(error)))
        return false
    }
    try {
        return await attempt(!!arg.trash)
    } catch (error) {
        if (arg.silent) throw error
        if (!(error instanceof CharacterArchiveError && error.code === 'ARCHIVE_CHATS_UNAVAILABLE')) return fail(error)
        if (!await alertConfirm(language.deactivateCharacterLostChats(name, error.chats.length, bulletList(error.chats)))) return false
        return await attempt(true).catch(fail)
    }
}

/**
 * Re-activate a deactivated character. Server registers its chats and hands
 * back the client view; the character returns to `characters` and the stub is
 * removed (one save tick). Resolves to the new index, or -1 when there was
 * nothing to activate. Throws CharacterArchiveError on server failure.
 */
export async function activateCharacter(chaId: string): Promise<number> {
    const list = DBState.db.nodeOnlyArchivedCharacters ?? []
    const stubIndex = list.findIndex((s) => s?.chaId === chaId)
    const existing = DBState.db.characters.findIndex((c) => c?.chaId === chaId)
    if (existing !== -1) {
        // Already active (e.g. another device activated it): just drop the stub.
        if (stubIndex !== -1) list.splice(stubIndex, 1)
        return existing
    }
    if (stubIndex === -1) return -1

    // Name the exact row this stub was made with (rows are versioned).
    const archivedAt = list[stubIndex]?.archivedAt
    let restored: character
    try {
        restored = await storage().activateCharacter(chaId, archivedAt)
    } catch (error) {
        if (!(error instanceof CharacterArchiveError && error.code === 'ARCHIVE_ALREADY_ACTIVE')) throw error
        // Usually our own deactivation has not reached the server yet: it
        // still lists the character as active. Dropping the stub here used to
        // make the save that followed delete the character outright. Finish
        // saving, then ask again; the stub stays whatever happens.
        if (!await flushSaves()) throw new CharacterArchiveError(error.code, language.archiveSaveFailed)
        try {
            restored = await storage().activateCharacter(chaId, archivedAt)
        } catch (retryError) {
            if (retryError instanceof CharacterArchiveError && retryError.code === 'ARCHIVE_ALREADY_ACTIVE') {
                throw new CharacterArchiveError(retryError.code, language.activateCharacterAlreadyActive)
            }
            throw retryError
        }
    }
    // Re-read: a save while we waited may have rebased the database object.
    const db = DBState.db
    if (db.characters.some((c) => c?.chaId === chaId)) {
        const stubIdx = (db.nodeOnlyArchivedCharacters ?? []).findIndex((s) => s?.chaId === chaId)
        if (stubIdx !== -1) db.nodeOnlyArchivedCharacters!.splice(stubIdx, 1)
        return db.characters.findIndex((c) => c?.chaId === chaId)
    }
    // The server sends chats as stubs; the client works with placeholders
    // (same conversion bootstrap applies to the whole database).
    restored.chats = convertStubsToPlaceholders(restored.chats ?? [])
    // The trash marker lives on the stub, never on the body (a body archived
    // by the legacy-trash migration may still carry the old flag).
    delete restored.trashTime
    db.characters.push(restored)
    const stubIdxNow = (db.nodeOnlyArchivedCharacters ?? []).findIndex((s) => s?.chaId === chaId)
    if (stubIdxNow !== -1) db.nodeOnlyArchivedCharacters!.splice(stubIdxNow, 1)
    checkCharOrder()
    requiresFullEncoderReload.state = true
    void requestImmediateSave()
    return db.characters.length - 1
}

/** Move an already-deactivated character to the trash (marker only; nothing moves on the server). */
export function trashDeactivatedCharacter(chaId: string): boolean {
    const stub = findArchivedStub(chaId)
    if (!stub || stub.trashedAt) return false
    stub.trashedAt = Date.now()
    checkCharOrder()
    void requestImmediateSave()
    return true
}

/** Take a trashed character out of the trash. It stays deactivated (its previous state) until opened. */
export function restoreTrashedCharacter(chaId: string): boolean {
    const stub = findArchivedStub(chaId)
    if (!stub || !stub.trashedAt) return false
    delete stub.trashedAt
    checkCharOrder()
    void requestImmediateSave()
    return true
}

/** Permanently delete a trashed character: server rows first, then the stub. Throws CharacterArchiveError. */
export async function deleteTrashedCharacter(chaId: string): Promise<boolean> {
    const stub = findArchivedStub(chaId)
    if (!stub) return false
    await storage().deleteArchivedCharacter(chaId)
    return removeArchivedStub(chaId)
}

/**
 * Legacy trash (a live character carrying `trashTime`, written by older
 * builds, upstream imports or .bin restores) → deactivated + trashedAt.
 * Best effort at boot: a character that fails to archive stays legacy and is
 * retried next boot. The lists render both shapes.
 */
export async function migrateLegacyTrash(): Promise<void> {
    const db = DBState.db
    const ids = db.characters.filter((c) => c?.chaId && c.trashTime).map((c) => c.chaId)
    for (const chaId of ids) {
        const idx = db.characters.findIndex((c) => c?.chaId === chaId)
        if (idx === -1) continue
        const trashedAt = db.characters[idx].trashTime
        try {
            await archiveCharacter(idx, { skipConfirm: true, trash: true, trashedAt, silent: true })
        } catch (error) {
            console.warn('[Trash] legacy trash migration skipped for', chaId, error)
        }
    }
}

/** Drop a stub whose payload is gone for good (recovery path; nothing else is deleted). */
export function removeArchivedStub(chaId: string): boolean {
    const list = DBState.db.nodeOnlyArchivedCharacters ?? []
    const idx = list.findIndex((s) => s?.chaId === chaId)
    if (idx === -1) return false
    list.splice(idx, 1)
    checkCharOrder()
    requiresFullEncoderReload.state = true
    void requestImmediateSave()
    return true
}

/**
 * List-click entry point: "This character is deactivated. Activate it?" →
 * activate → open it like a normal selection.
 */
export async function promptActivateCharacter(chaId: string, arg: { reseter?: () => any } = {}): Promise<boolean> {
    const stub = findArchivedStub(chaId)
    if (!stub) return false
    if (!await alertConfirm(language.activateCharacterConfirm(stub.name || 'Unnamed'))) return false
    try {
        const index = await withOverlay(() => activateCharacter(chaId))
        if (index < 0) return false
        changeChar(index, arg)
        return true
    } catch (error) {
        if (error instanceof CharacterArchiveError
            && (error.code === 'ARCHIVE_PAYLOAD_MISSING' || error.code === 'ARCHIVE_PAYLOAD_INVALID')) {
            // Nothing to restore from: offer to drop the stub so the dashboard,
            // orphan sweep and export stop failing closed on it.
            if (await alertConfirm(language.activateCharacterMissing + '\n\n' + language.activateCharacterRemoveStub)) {
                removeArchivedStub(chaId)
            }
        } else {
            alertError(language.activateCharacterFailed + (error instanceof Error ? error.message : String(error)))
        }
        return false
    }
}

/** Every deactivated character as a full record (for the client-assembled partial backup). */
export async function fetchArchivedCharactersInline(): Promise<character[]> {
    if (getArchivedStubs().length === 0) return []
    return await storage().fetchArchivedCharactersInline()
}

export function isCharacterSelected(index: number): boolean {
    return get(selectedCharID) === index
}
