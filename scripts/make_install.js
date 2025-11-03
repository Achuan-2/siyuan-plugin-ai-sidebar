/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-28 20:03:59
 * @FilePath     : /scripts/make_install.js
 * @LastEditTime : 2024-09-06 18:08:19
 * @Description  : 
 */
// make_install.js
import fs from 'fs';
import { log, error, getSiYuanDir, chooseTarget, copyDirectory, getThisPluginName } from './utils.js';

let targetDir = '';

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Try to visit constant "targetDir" in make_install.js...');
if (targetDir === '') {
    log('>>> Constant "targetDir" is empty, try to get SiYuan directory automatically....');
    let res = await getSiYuanDir();

    if (res === null || res === undefined || res.length === 0) {
        error('>>> Can not get SiYuan directory automatically');
        process.exit(1);
    } else {
        targetDir = await chooseTarget(res);
    }
    log(`>>> Successfully got target directory: ${targetDir}`);
}
if (!fs.existsSync(targetDir)) {
    error(`Failed! Plugin directory not exists: "${targetDir}"`);
    error('Please set the plugin directory in scripts/make_install.js');
    process.exit(1);
}

/**
 * 2. The dist directory, which contains the compiled plugin code
 */
const distDir = `${process.cwd()}/dist`;
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

/**
 * 3. The target directory to install the plugin
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

/**
 * 4. Copy the compiled plugin code to the target directory
 */
copyDirectory(distDir, targetPath);
