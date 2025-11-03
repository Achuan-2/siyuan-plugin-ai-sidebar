/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2023-07-15 15:31:31
 * @FilePath     : /scripts/make_dev_link.js
 * @LastEditTime : 2024-09-06 18:13:53
 * @Description  : 
 */
// make_dev_link.js
import fs from 'fs';
import { log, error, getSiYuanDir, chooseTarget, getThisPluginName, makeSymbolicLink } from './utils.js';

let targetDir = '';

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Try to visit constant "targetDir" in make_dev_link.js...');
if (targetDir === '') {
    log('>>> Constant "targetDir" is empty, try to get SiYuan directory automatically....');
    let res = await getSiYuanDir();

    if (!res || res.length === 0) {
        log('>>> Can not get SiYuan directory automatically, try to visit environment variable "SIYUAN_PLUGIN_DIR"....');
        let env = process.env?.SIYUAN_PLUGIN_DIR;
        if (env) {
            targetDir = env;
            log(`\tGot target directory from environment variable "SIYUAN_PLUGIN_DIR": ${targetDir}`);
        } else {
            error('\tCan not get SiYuan directory from environment variable "SIYUAN_PLUGIN_DIR", failed!');
            process.exit(1);
        }
    } else {
        targetDir = await chooseTarget(res);
    }

    log(`>>> Successfully got target directory: ${targetDir}`);
}
if (!fs.existsSync(targetDir)) {
    error(`Failed! Plugin directory not exists: "${targetDir}"`);
    error('Please set the plugin directory in scripts/make_dev_link.js');
    process.exit(1);
}

/**
 * 2. The dev directory, which contains the compiled plugin code
 */
const devDir = `${process.cwd()}/dev`;
if (!fs.existsSync(devDir)) {
    fs.mkdirSync(devDir);
}


/**
 * 3. The target directory to make symbolic link to dev directory
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

/**
 * 4. Make symbolic link
 */
makeSymbolicLink(devDir, targetPath);
