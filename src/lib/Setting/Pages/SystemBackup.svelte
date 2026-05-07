<script lang="ts">
    // System → Backups tab. Single home for snapshot management, full server
    // backups, and local backup actions. Migration-style legacy backups stay
    // in MigrationSettings so this page focuses on day-to-day operations.
    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'
    import ShAlert from 'src/lib/UI/GUI/ShAlert.svelte'
    import ShDialog from 'src/lib/UI/GUI/ShDialog.svelte'
    import ShInput from 'src/lib/UI/GUI/ShInput.svelte'
    import ServerBackupList from 'src/lib/Setting/ServerBackupList.svelte'
    import {
        CameraIcon,
        SaveIcon,
        DownloadIcon,
        UploadIcon,
        RotateCcwIcon,
        FolderIcon,
        TriangleAlertIcon,
        RefreshCwIcon,
    } from '@lucide/svelte'
    import { alertConfirm, alertError, alertWait, notifySuccess } from 'src/ts/alert'
    import { forageStorage } from 'src/ts/globalApi.svelte'
    import { setDatabase } from 'src/ts/storage/database.svelte'
    import { decodeRisuSave } from 'src/ts/storage/risuSave'
    import { language } from 'src/lang'
    import { LoadLocalBackup, SaveLocalBackup, SaveServerBackup } from 'src/ts/drive/backuplocal'

    // ── Types ────────────────────────────────────────────────────────────────
    interface Snapshot { key: string; size: number; timestamp: number | null }
    interface BackupPathInfo { path: string; default: string; isDefault: boolean }

    // ── State ────────────────────────────────────────────────────────────────
    let snapshots = $state<Snapshot[]>([])
    let snapshotLoading = $state(false)
    let snapshotError = $state<string | null>(null)

    let pathInfo = $state<BackupPathInfo | null>(null)
    let pathDialogOpen = $state(false)
    let pathDraft = $state('')
    let pathDialogError = $state<string | null>(null)
    let pathDialogBusy = $state(false)

    let backupListEl = $state<ServerBackupList | undefined>(undefined)
    let backupSaving = $state(false)

    // ── Format helpers ───────────────────────────────────────────────────────
    function fmtBytes(n: number): string {
        if (n < 1024) return `${n} B`
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
        if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
        return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    // ── Snapshots ────────────────────────────────────────────────────────────
    async function loadSnapshots() {
        snapshotLoading = true
        snapshotError = null
        try {
            const auth = await forageStorage.createAuth()
            const res = await fetch('/api/db/snapshots', { headers: { 'risu-auth': auth } })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            snapshots = json.snapshots ?? []
        } catch (err) {
            snapshotError = err instanceof Error ? err.message : String(err)
        } finally {
            snapshotLoading = false
        }
    }

    async function restoreSnapshot(snap: Snapshot) {
        if (!(await alertConfirm(language.backupLoadConfirm))) return
        if (!(await alertConfirm(language.backupLoadConfirm2))) return
        alertWait(language.serverBackupRestoring)
        try {
            // Same path as loadInternalBackup but without the alertSelect prompt —
            // user already picked the row, so we go straight to fetch + decode + apply.
            const data = await forageStorage.getItem(snap.key) as unknown as Uint8Array
            if (!data) throw new Error('Snapshot data unavailable')
            const decoded = await decodeRisuSave(Buffer.from(data) as unknown as Uint8Array)
            setDatabase(decoded)
            notifySuccess('Loaded backup')
            location.reload()
        } catch (err) {
            alertError(err instanceof Error ? err.message : String(err))
        }
    }

    // ── Backup path ──────────────────────────────────────────────────────────
    async function loadPath() {
        try {
            const auth = await forageStorage.createAuth()
            const res = await fetch('/api/backup/server/path', { headers: { 'risu-auth': auth } })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            pathInfo = await res.json()
        } catch (err) {
            // Non-fatal — path display will show '—'.
            console.error('[Backup path]', err)
        }
    }

    function openPathDialog() {
        pathDraft = pathInfo?.path ?? ''
        pathDialogError = null
        pathDialogOpen = true
    }

    async function submitPathChange() {
        const trimmed = pathDraft.trim()
        if (!trimmed) {
            pathDialogError = language.backupServerPathInputLabel
            return
        }
        pathDialogBusy = true
        pathDialogError = null
        try {
            const auth = await forageStorage.createAuth()
            const res = await fetch('/api/backup/server/path', {
                method: 'PUT',
                headers: { 'risu-auth': auth, 'content-type': 'application/json' },
                body: JSON.stringify({ path: trimmed }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                pathDialogError = json?.error || `HTTP ${res.status}`
                return
            }
            pathInfo = json
            pathDialogOpen = false
            notifySuccess(language.backupServerPathSuccess)
            // Refresh backup list since the dir changed (now empty unless user moved files).
            backupListEl?.loadBackups()
        } catch (err) {
            pathDialogError = err instanceof Error ? err.message : String(err)
        } finally {
            pathDialogBusy = false
        }
    }

    // ── Server backup actions ───────────────────────────────────────────────
    async function createServerBackup() {
        if (!(await alertConfirm(language.backupConfirm))) return
        backupSaving = true
        try {
            await SaveServerBackup()
            backupListEl?.loadBackups()
        } finally {
            backupSaving = false
        }
    }

    async function downloadLocal() {
        if (!(await alertConfirm(language.backupConfirm))) return
        SaveLocalBackup()
    }

    async function restoreFromLocalFile() {
        if (!(await alertConfirm(language.backupLoadConfirm))) return
        if (!(await alertConfirm(language.backupLoadConfirm2))) return
        LoadLocalBackup()
    }

    $effect(() => {
        loadSnapshots()
        loadPath()
    })
</script>

<p class="text-textcolor2 text-sm mb-4">{language.backupTabDesc}</p>

<!-- Snapshot section ─────────────────────────────────────────────────────── -->
<div class="border border-darkborderc bg-darkbg/40 rounded-md p-4 mb-4">
    <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2 text-textcolor">
            <CameraIcon size={16} />
            <span class="font-medium">{language.backupSnapshot}</span>
        </div>
        <ShButton variant="outline" size="sm" onclick={loadSnapshots} disabled={snapshotLoading}>
            <RefreshCwIcon size={14} class={snapshotLoading ? 'animate-spin' : ''} />
        </ShButton>
    </div>
    <p class="text-textcolor2 text-sm leading-relaxed mb-3">{language.storageBackupsAutoDesc}</p>

    {#if snapshotError}
        <ShAlert variant="destructive">
            {#snippet icon()}<TriangleAlertIcon />{/snippet}
            {snapshotError}
        </ShAlert>
    {:else if snapshots.length === 0 && !snapshotLoading}
        <p class="text-textcolor2 text-sm">{language.backupSnapshotEmpty}</p>
    {:else if snapshots.length > 0}
        <div class="border border-darkborderc rounded-md bg-darkbg/30 overflow-hidden">
            {#each snapshots as snap, i (snap.key)}
                <div class="flex items-center gap-3 px-3 py-2 {i > 0 ? 'border-t border-darkborderc/50' : ''}">
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-sm text-textcolor">
                            {snap.timestamp ? new Date(snap.timestamp).toLocaleString() : snap.key}
                        </span>
                        <span class="text-xs text-textcolor2 tabular-nums">{fmtBytes(snap.size)}</span>
                    </div>
                    <button class="text-textcolor2 hover:text-primary cursor-pointer" title={language.backupSnapshotRestore} aria-label={language.backupSnapshotRestore}
                        onclick={() => restoreSnapshot(snap)}>
                        <RotateCcwIcon size={18}/>
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Server backup section ────────────────────────────────────────────────── -->
<div class="border border-darkborderc bg-darkbg/40 rounded-md p-4 mb-4">
    <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div class="flex items-center gap-2 text-textcolor">
            <SaveIcon size={16} />
            <span class="font-medium">{language.backupServer}</span>
        </div>
    </div>
    <p class="text-textcolor2 text-sm leading-relaxed mb-3">{language.storageBackupsManualDesc}</p>

    <!-- Path control -->
    <div class="flex items-center gap-2 mb-3 p-2 border border-darkborderc/50 rounded-md bg-bgcolor/50">
        <FolderIcon size={14} class="text-textcolor2 shrink-0" />
        <span class="text-textcolor2 text-xs shrink-0">{language.backupServerPath}:</span>
        <span class="text-textcolor text-xs font-mono truncate flex-1 min-w-0">
            {pathInfo?.path ?? '—'}
        </span>
        {#if pathInfo?.isDefault}
            <span class="text-textcolor2 text-xs shrink-0 opacity-60">({language.backupServerPathDefault})</span>
        {/if}
        <ShButton variant="outline" size="xs" onclick={openPathDialog}>
            {language.backupServerPathChange}
        </ShButton>
    </div>

    <div class="flex justify-end mb-3">
        <ShButton variant="primary" onclick={createServerBackup} disabled={backupSaving}>
            <SaveIcon size={16} />
            {language.backupServerCreate}
        </ShButton>
    </div>

    <ServerBackupList bind:this={backupListEl} />
</div>

<!-- Local backup section ────────────────────────────────────────────────── -->
<div class="border border-darkborderc bg-darkbg/40 rounded-md p-4 mb-4">
    <div class="flex items-center gap-2 text-textcolor mb-3">
        <DownloadIcon size={16} />
        <span class="font-medium">{language.backupLocal}</span>
    </div>
    <p class="text-textcolor2 text-sm leading-relaxed mb-3">{language.backupLocalDesc}</p>

    <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3 p-3 border border-darkborderc/50 rounded-md bg-bgcolor/50">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-textcolor text-sm font-medium">{language.backupLocalDownload}</span>
                <span class="text-textcolor2 text-xs leading-relaxed mt-0.5">{language.backupLocalDownloadDesc}</span>
            </div>
            <ShButton variant="outline" size="sm" onclick={downloadLocal}>
                <DownloadIcon size={14} />
                {language.backupLocalDownload}
            </ShButton>
        </div>
        <div class="flex items-center justify-between gap-3 p-3 border border-darkborderc/50 rounded-md bg-bgcolor/50">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-textcolor text-sm font-medium">{language.loadBackupLocal}</span>
                <span class="text-textcolor2 text-xs leading-relaxed mt-0.5">{language.backupLocalRestoreDesc}</span>
            </div>
            <ShButton variant="outline" size="sm" onclick={restoreFromLocalFile}>
                <UploadIcon size={14} />
                {language.loadBackupLocal}
            </ShButton>
        </div>
    </div>
</div>

<!-- Path-change dialog ──────────────────────────────────────────────────── -->
<ShDialog bind:open={pathDialogOpen} size="lg">
    {#snippet title()}{language.backupServerPathDialog}{/snippet}
    <p class="text-textcolor2 text-sm leading-relaxed mb-3">{language.backupServerPathDialogDesc}</p>
    <label class="flex flex-col gap-1">
        <span class="text-textcolor2 text-sm">{language.backupServerPathInputLabel}</span>
        <ShInput bind:value={pathDraft} placeholder="/absolute/path/to/backups" />
    </label>
    {#if pathDialogError}
        <ShAlert variant="destructive" className="mt-3">
            {#snippet icon()}<TriangleAlertIcon />{/snippet}
            {pathDialogError}
        </ShAlert>
    {/if}
    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <ShButton variant="outline" onclick={() => (pathDialogOpen = false)} disabled={pathDialogBusy}>
                {language.cancel}
            </ShButton>
            <ShButton variant="primary" onclick={submitPathChange} disabled={pathDialogBusy}>
                {language.confirm}
            </ShButton>
        </div>
    {/snippet}
</ShDialog>
