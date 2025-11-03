<script>
    import SettingItem from "./setting-item.svelte";
    import { showMessage } from "siyuan";
    import { onMount, onDestroy } from 'svelte';
    onMount(() => {
        showMessage("Setting panel opened");
    });
    onDestroy(() => {
        showMessage("Setting panel closed");
    });
</script>

<!--
You can use this template to quickly create a setting panel,
with the same UI style in SiYuan
-->

<div class="config__tab-container">
    <div data-type="Header" class="fn__flex b3-label">
        <div class="fn_flex-1">
            <h4>This setting panel is provided by a svelte component</h4>
            <div class="b3-label__text">
                <span class="fn__flex-1">
                    See:
                    <pre style="display: inline">/lib/setting-pannel.svelte</pre>
                </span>
            </div>
        </div>
    </div>
    <SettingItem
        type="checkbox"
        title="Checkbox"
        text="This is a checkbox"
        settingKey="Checkbox"
        settingValue={true}
        on:changed={(event) => {
            showMessage(
                `Checkbox changed: ${event.detail.key} = ${event.detail.value}`
            );
        }}
    />
    <SettingItem
        type="input"
        title="Input"
        text="This is an input"
        settingKey="Input"
        settingValue=""
        placeholder="Input something"
        on:changed={(event) => {
            showMessage(
                `Input changed: ${event.detail.key} = ${event.detail.value}`
            );
        }}
    />
    <SettingItem
        type="button"
        title="Button"
        text="This is a button"
        settingKey="Button"
        settingValue="Click me"
        on:clicked={() => {
            showMessage("Button clicked");
        }}
    />
    <SettingItem
        type="select"
        title="Select"
        text="This is a select"
        settingKey="Select"
        settingValue="left"
        options={{
            left: "Left",
            center: "Center",
            right: "Right",
        }}
        on:changed={(event) => {
            showMessage(
                `Select changed: ${event.detail.key} = ${event.detail.value}`
            );
        }}
    />
    <SettingItem
        type="slider"
        title="Slide"
        text="This is a slide"
        settingKey="Slide"
        settingValue={50}
        slider={{
            min: 0,
            max: 100,
            step: 1,
        }}
        on:changed={(event) => {
            showMessage(
                `Slide changed: ${event.detail.key} = ${event.detail.value}`
            );
        }}
    />
</div>
