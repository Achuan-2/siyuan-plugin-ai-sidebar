/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-13
 * @FilePath     : /scripts/make_dev_copy.js
 * @LastEditTime : 2025-07-13
 * @Description  : Copy plugin files to SiYuan plugins directory instead of creating symbolic links
 */
import fs from 'fs';
import path from 'path';
import { log, error, getSiYuanDir, chooseTarget, getThisPluginName, copyDirectory } from './utils.js';

let targetDir =`D:\\Notes\\Siyuan\\Achuan-2\\data\\plugins`;

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Try to visit constant "targetDir" in make_dev_copy.js...');
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
    error('Please set the plugin directory in scripts/make_dev_copy.js');
    process.exit(1);
}

/**
 * 2. The dev directory, which contains the compiled plugin code
 */
const devDir = `${process.cwd()}/dev`;
if (!fs.existsSync(devDir)) {
    error(`Failed! Dev directory not exists: "${devDir}"`);
    error('Please run "pnpm run build" or "pnpm run dev" first to generate the dev directory');
    process.exit(1);
}

/**
 * 3. The target directory to copy dev directory contents
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

/**
 * 4. Create target directory and copy contents
 */
log(`>>> Creating target directory: ${targetPath}`);
if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
    log(`Created directory: ${targetPath}`);
} else {
    // Clean existing directory contents
    log(`>>> Cleaning existing directory: ${targetPath}`);
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(targetPath, { recursive: true });
    log(`Cleaned and recreated directory: ${targetPath}`);
}

/**
 * 5. Copy all contents from dev directory to target directory
 */
copyDirectory(devDir, targetPath);
log(`>>> Successfully copied all files to SiYuan plugins directory!`);
