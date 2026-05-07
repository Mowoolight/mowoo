<script lang="ts">
    import { language } from "src/lang";
    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte";
    import ShButton from "src/lib/UI/GUI/ShButton.svelte";
    import ShAlert from "src/lib/UI/GUI/ShAlert.svelte";
    import ShAccordion from "src/lib/UI/GUI/ShAccordion.svelte";
    import Button from "src/lib/UI/GUI/Button.svelte";
    import { alertConfirm } from "src/ts/alert";
    import {
        LoadLocalBackup,
        SaveLocalBackup,
        SaveLocalBackupForUpstream,
        SavePartialLocalBackup,
        ImportFromSaveZip,
        CleanupMigratedFiles,
    } from "src/ts/drive/backuplocal";
    import { exportAsDataset } from "src/ts/storage/exportAsDataset";
    import { SettingsMenuIndex, SystemSubmenuIndex } from "src/ts/stores.svelte";
    import { InfoIcon } from "@lucide/svelte";

    function gotoBackupTab() {
        SettingsMenuIndex.set(23);
        SystemSubmenuIndex.set(1);
    }
</script>

<SettingPage title={language.migration}>
    <p class="text-textcolor2 text-sm leading-relaxed mb-4">{language.migrationDesc}</p>

    <ShAlert variant="info" className="mb-4">
        {#snippet icon()}<InfoIcon />{/snippet}
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
            <span class="leading-relaxed">{language.migrationInfoBackupMoved}</span>
            <ShButton variant="outline" size="sm" onclick={gotoBackupTab}>
                {language.migrationGotoBackupTab}
            </ShButton>
        </div>
    </ShAlert>

    <!-- Migration: upstream RisuAI ↔ NodeOnly ─────────────────────────── -->
    <Button
        onclick={async () => {
            if (await alertConfirm(language.saveBackupForUpstreamConfirm)) {
                SaveLocalBackupForUpstream();
            }
        }} className="mt-2">
        {language.saveBackupForUpstream}
    </Button>

    <Button
        onclick={async () => {
            if ((await alertConfirm(language.backupLoadConfirm)) && (await alertConfirm(language.backupLoadConfirm2))) {
                LoadLocalBackup();
            }
        }} className="mt-2">
        {language.loadBackupLocal}
    </Button>

    <h3 class="mb-1 text-lg font-bold mt-6">{language.importSaveFolderHeader}</h3>

    <p class="text-sm text-textcolor2 mb-2">{language.importSaveZipDesc}</p>
    <Button onclick={ImportFromSaveZip} className="mt-1">
        {language.importSaveZip}
    </Button>

    <p class="text-sm text-textcolor2 mt-3 mb-2">{language.cleanupMigratedDesc}</p>
    <Button onclick={CleanupMigratedFiles} className="mt-1">
        {language.cleanupMigratedFiles}
    </Button>

    <!-- Legacy backup options — collapsed by default ─────────────────── -->
    <div class="mt-6">
        <ShAccordion name={language.migrationLegacyAccordion} variant="card">
            <Button
                onclick={async () => {
                    if (await alertConfirm(language.backupConfirm)) {
                        SaveLocalBackup();
                    }
                }} className="mt-2">
                {language.saveBackupLocal}
            </Button>

            <Button
                onclick={async () => {
                    if (await alertConfirm(language.backupConfirm)) {
                        SavePartialLocalBackup();
                    }
                }} className="mt-2">
                {language.savePartialLocalBackup}
            </Button>

            <Button onclick={exportAsDataset} className="mt-2">
                {language.exportAsDataset}
            </Button>
        </ShAccordion>
    </div>
</SettingPage>
