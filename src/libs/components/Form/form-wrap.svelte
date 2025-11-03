<!--
 Copyright (c) 2024 by frostime. All Rights Reserved.
 Author       : frostime
 Date         : 2024-06-01 20:03:50
 FilePath     : /src/libs/components/item-wrap.svelte
 LastEditTime : 2024-07-19 15:28:57
 Description  : The setting item container
-->
<script lang="ts">
    export let title: string; // Displayint Setting Title
    export let description: string; // Displaying Setting Text
    export let direction: 'row' | 'column' = 'column';
</script>

{#if direction === "row"}
    <div class="item-wrap b3-label" data-key="CustomCSS">
        <div class="fn__block">
            <span class="title">{title}</span>
            <div class="b3-label__text">{@html description}</div>
            <div class="fn__hr"></div>
            <div style="display: flex; flex-direction: column; gap: 5px; position: relative;">
                <slot />
            </div>
        </div>
    </div>
{:else}
    <div class="item-wrap fn__flex b3-label config__item">
        <div class="fn__flex-1">
            <span class="title">{title}</span>
            <div class="b3-label__text">
                {@html description}
            </div>
        </div>
        <span class="fn__space" />
        <slot />
    </div>
{/if}

<style>
    span.title {
        font-weight: bold;
        color: var(--b3-theme-primary)
    }
    .item-wrap.b3-label {
        box-shadow: none !important;
        padding-bottom: 16px;
        margin-bottom: 16px;
    }

    .item-wrap.b3-label:not(:last-child) {
        border-bottom: 1px solid var(--b3-border-color);
    }
</style>
