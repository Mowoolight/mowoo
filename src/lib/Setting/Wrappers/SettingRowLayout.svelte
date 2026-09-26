<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { SettingItem } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';
    import { language } from 'src/lang';
    import Help from 'src/lib/Others/Help.svelte';

    interface Props {
        item: SettingItem;
        /** The control, rendered right-aligned and vertically centered. */
        control?: Snippet;
        /** Free-text controls: below `sm` the control drops under the label at
         * full width instead of squeezing the label into a narrow column. */
        wideControl?: boolean;
    }

    let { item, control, wideControl = false }: Props = $props();

    // Inline help text under the label (replaces the tooltip icon in row mode).
    const helpText = $derived(
        item.helpKey ? (language.help as any)[item.helpKey] as string | undefined : undefined
    );
    // Only the lead paragraph is shown inline; markdown detail blocks after a
    // blank line (option lists etc.) stay reachable through the help icon.
    const helpLead = $derived(helpText?.split('\n\n')[0].replace(/\*\*|`/g, ''));
    const helpHasMore = $derived(!!helpText && helpText.includes('\n\n'));
</script>

<!-- data-setting-id: anchor for settings search deep-links (searchIndex.ts) -->
<div
    class="flex justify-between py-3 border-t border-darkborderc {wideControl ? 'flex-col gap-2 sm:flex-row sm:items-center sm:gap-3' : 'items-center gap-3'}"
    data-setting-id={item.id}
>
    <div class="flex flex-col min-w-0">
        <span class="text-sm text-textcolor">
            {getLabel(item)}
            {#if item.showExperimental}<Help key="experimental"/>{/if}
            {#if item.helpKey && (item.helpUnrecommended || helpHasMore)}<Help key={item.helpKey as any} unrecommended={item.helpUnrecommended ?? false}/>{/if}
        </span>
        {#if helpLead}<p class="text-xs text-textcolor2 mt-0.5 whitespace-pre-line">{helpLead}</p>{/if}
    </div>
    <div class="shrink-0 {wideControl ? 'w-full sm:w-auto' : ''}">{@render control?.()}</div>
</div>
