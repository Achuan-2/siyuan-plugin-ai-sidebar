/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-09-06 17:42:57
 * @FilePath     : /scripts/utils.js
 * @LastEditTime : 2024-09-06 19:23:12
 * @Description  : 
 */
// common.js
import fs from 'fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';

// Logging functions
export const log = (info) => console.log(`\x1B[36m%s\x1B[0m`, info);
export const error = (info) => console.log(`\x1B[31m%s\x1B[0m`, info);

// HTTP POST headers
export const POST_HEADER = {
    "Content-Type": "application/json",
};

// Fetch function compatible with older Node.js versions
export async function myfetch(url, options) {
    return new Promise((resolve, reject) => {
        let req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    ok: true,
                    status: res.statusCode,
                    json: () => JSON.parse(data)
                });
            });
        });
        req.on('error', (e) => {
            reject(e);
        });
        req.end();
    });
}

/**
 * Fetch SiYuan workspaces from port 6806
 * @returns {Promise<Object | null>}
 */
export async function getSiYuanDir() {
    let url = 'http://127.0.0.1:6806/api/system/getWorkspaces';
    let conf = {};
    try {
        let response = await myfetch(url, {
            method: 'POST',
            headers: POST_HEADER
        });
        if (response.ok) {
            conf = await response.json();
        } else {
            error(`\tHTTP-Error: ${response.status}`);
            return null;
        }
    } catch (e) {
        error(`\tError: ${e}`);
        error("\tPlease make sure SiYuan is running!!!");
        return null;
    }
    return conf?.data; // 保持原始返回值
}

/**
 * Choose target workspace
 * @param {{path: string}[]} workspaces
 * @returns {string} The path of the selected workspace
 */
export async function chooseTarget(workspaces) {
    let count = workspaces.length;
    log(`>>> Got ${count} SiYuan ${count > 1 ? 'workspaces' : 'workspace'}`);
    workspaces.forEach((workspace, i) => {
        log(`\t[${i}] ${workspace.path}`);
    });

    if (count === 1) {
        return `${workspaces[0].path}/data/plugins`;
    } else {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        let index = await new Promise((resolve) => {
            rl.question(`\tPlease select a workspace[0-${count - 1}]: `, (answer) => {
                resolve(answer);
            });
        });
        rl.close();
        return `${workspaces[index].path}/data/plugins`;
    }
}

/**
 * Check if two paths are the same
 * @param {string} path1
 * @param {string} path2
 * @returns {boolean}
 */
export function cmpPath(path1, path2) {
    path1 = path1.replace(/\\/g, '/');
    path2 = path2.replace(/\\/g, '/');
    if (path1[path1.length - 1] !== '/') {
        path1 += '/';
    }
    if (path2[path2.length - 1] !== '/') {
        path2 += '/';
    }
    return path1 === path2;
}

export function getThisPluginName() {
    if (!fs.existsSync('./plugin.json')) {
        process.chdir('../');
        if (!fs.existsSync('./plugin.json')) {
            error('Failed! plugin.json not found');
            return null;
        }
    }

    const plugin = JSON.parse(fs.readFileSync('./plugin.json', 'utf8'));
    const name = plugin?.name;
    if (!name) {
        error('Failed! Please set plugin name in plugin.json');
        return null;
    }

    return name;
}

export function copyDirectory(srcDir, dstDir) {
    if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir);
        log(`Created directory ${dstDir}`);
    }

    fs.readdirSync(srcDir, { withFileTypes: true }).forEach((file) => {
        const src = path.join(srcDir, file.name);
        const dst = path.join(dstDir, file.name);

        if (file.isDirectory()) {
            copyDirectory(src, dst);
        } else {
            fs.copyFileSync(src, dst);
        }
    });
    log(`All files copied!`);
}


export function makeSymbolicLink(srcPath, targetPath) {
    if (!fs.existsSync(targetPath)) {
        // fs.symlinkSync(srcPath, targetPath, 'junction');
        //Go 1.23 no longer supports junctions as symlinks
        //Please refer to https://github.com/siyuan-note/siyuan/issues/12399
        fs.symlinkSync(srcPath, targetPath, 'dir');
        log(`Done! Created symlink ${targetPath}`);
        return;
    }

    //Check the existed target path
    let isSymbol = fs.lstatSync(targetPath).isSymbolicLink();
    if (!isSymbol) {
        error(`Failed! ${targetPath} already exists and is not a symbolic link`);
        return;
    }
    let existedPath = fs.readlinkSync(targetPath);
    if (cmpPath(existedPath, srcPath)) {
        log(`Good! ${targetPath} is already linked to ${srcPath}`);
    } else {
        error(`Error! Already exists symbolic link ${targetPath}\nBut it links to ${existedPath}`);
    }
}
