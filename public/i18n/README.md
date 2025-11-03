思源支持的 i18n 文件范围，可以在控制台 `siyuan.config.langs` 中查看。以下是目前（2024-10-24）支持的语言方案：

The range of i18n files supported by SiYuan can be viewed in the console under `siyuan.config.langs`. Below are the language schemes currently supported as of now (October 24, 2024) :

```js
>>> siyuan.config.langs.map( lang => lang.name)
['de_DE', 'en_US', 'es_ES', 'fr_FR', 'he_IL', 'it_IT', 'ja_JP', 'pl_PL', 'ru_RU', 'zh_CHT', 'zh_CN']
```

在插件开发中，默认使用 JSON 格式作为国际化（i18n）的载体文件。如果您更喜欢使用 YAML 语法，可以将 JSON 文件替换为 YAML 文件（例如 `en_US.yaml`），并在其中编写 i18n 文本。本模板提供了相关的 Vite 插件，可以在编译时自动将 YAML 文件转换为 JSON 文件（请参见 `/yaml-plugin.js`）。本 MD 文件 和 YAML 文件会在  `npm run build` 时自动从 `dist` 目录下删除，仅保留必要的 JSON 文件共插件系统使用。

In plugin development, JSON format is used by default as the carrier file for internationalization (i18n). If you prefer to use YAML syntax, you can replace the JSON file with a YAML file (e.g., `en_US.yaml`) and write the i18n text within it. This template provides a related Vite plugin that can automatically convert YAML files to JSON files during the compilation process (see `/yaml-plugin.js`). This markdown file and YAML files will be automatically removed from the `dist` directory during `npm run build`, leaving only the necessary JSON files for plugin system to use.
