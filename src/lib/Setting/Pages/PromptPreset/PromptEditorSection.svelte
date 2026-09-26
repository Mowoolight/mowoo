<script lang="ts">
    import { language } from "src/lang";
    import { DBState } from "src/ts/stores.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import ShSwitch from "src/lib/UI/GUI/ShSwitch.svelte";
    import DropList from "src/lib/SideBars/DropList.svelte";
    import PromptSettings from "../PromptSettings.svelte";
    import SettingRowLayout from "../../Wrappers/SettingRowLayout.svelte";

    function helpLead(key: string): string | undefined {
        return ((language.help as any)[key] as string | undefined)?.split('\n\n')[0].replace(/\*\*|`/g, '')
    }
</script>

{#snippet fieldLabel(label: string, helpKey: string)}
    <span class="text-sm text-textcolor">{label}</span>
    {#if helpLead(helpKey)}<p class="text-xs text-textcolor2 mt-0.5 whitespace-pre-line">{helpLead(helpKey)}</p>{/if}
{/snippet}

{#if !DBState.db.promptTemplate}
    <!-- Row-layout field grammar: full-width prompts, format order, preprocess switch. -->
    <div class="flex flex-col [&>*:first-child]:border-t-0">
        <div class="py-3 border-t border-darkborderc">
            {@render fieldLabel(language.mainPrompt, 'mainprompt')}
            <TextAreaInput className="mt-2" fullwidth autocomplete="off" height={"32"} bind:value={DBState.db.mainPrompt}></TextAreaInput>
        </div>
        <div class="py-3 border-t border-darkborderc">
            {@render fieldLabel(language.jailbreakPrompt, 'jailbreak')}
            <TextAreaInput className="mt-2" fullwidth autocomplete="off" height={"32"} bind:value={DBState.db.jailbreak}></TextAreaInput>
        </div>
        <div class="py-3 border-t border-darkborderc">
            {@render fieldLabel(language.globalNote, 'globalNote')}
            <TextAreaInput className="mt-2" fullwidth autocomplete="off" height={"32"} bind:value={DBState.db.globalNote}></TextAreaInput>
        </div>
        <div class="py-3 border-t border-darkborderc flex flex-col">
            {@render fieldLabel(language.formatingOrder, 'formatOrder')}
            <div class="mt-2 flex flex-col"><DropList bind:list={DBState.db.formatingOrder} /></div>
        </div>
        <SettingRowLayout item={{ id: 'promptPreset.promptPreprocess', type: 'custom', fallbackLabel: language.promptPreprocess, helpKey: 'promptPreprocess' }}>
            {#snippet control()}
                <ShSwitch checked={!!DBState.db.promptPreprocess} onCheckedChange={(v) => DBState.db.promptPreprocess = v} />
            {/snippet}
        </SettingRowLayout>
    </div>
{:else}
    <PromptSettings mode='inline' />
{/if}
