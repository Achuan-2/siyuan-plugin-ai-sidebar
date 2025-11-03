
<script lang="ts">
    // Define the message prop
    export let message: string;
</script>

<div class="loading-dialog">
    <div class="loading-spinner"></div>
    <div class="loading-message">{message}</div>
</div>

<style>
.loading-dialog {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--b3-theme-background);
    border-top: 3px solid var(--b3-theme-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.loading-message {
    font-size: 14px;
    color: var(--b3-theme-on-background);
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>



<!-- usage
private showLoadingDialog(message: string) {
    if (this.loadingDialog) {
        this.loadingDialog.destroy();
    }
    this.loadingDialog = new Dialog({
        title: "Processing",
        content: `<div id="loadingDialogContent"></div>`,
        width: "300px",
        height: "150px",
        disableClose: true, // 禁止点击外部关闭
        destroyCallback: null // 禁止自动关闭
    });
    new LoadingDialog({
        target: this.loadingDialog.element.querySelector('#loadingDialogContent'),
        props: { message }
    });
}

private closeLoadingDialog() {
    if (this.loadingDialog) {
        this.loadingDialog.destroy();
        this.loadingDialog = null;
    }
} -->