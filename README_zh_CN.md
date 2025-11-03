


使用
```js
pnpm install
pnpm run dev
```

基于f佬的插件模板进行改进：https://github.com/siyuan-note/plugin-sample-vite-svelte/ 

我的改进点

- 使用`make_dev_copy.js`来直接复制插件代码到思源工作空间的plugins，不使用软链接的原因是因为软链接无法同步，会导致多端同步时造成插件被禁用。
- 使用`release.sh`来自动发版
- api.ts 添加一些我用过的API
- i18n使用自定义函数，支持变量传递
- 插件的设置界面优化
  - 使用多Tab的设置页面，符合我的开发需求
  - 默认设置参数使用i18n
  - textarea设置组件优化，支持指定rows行数，调整默认高度
