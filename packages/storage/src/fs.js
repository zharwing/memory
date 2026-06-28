import { promises as fs } from "node:fs";
import path from "node:path";
export async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
export async function ensureDir(target) {
    await fs.mkdir(target, { recursive: true });
}
export async function readJson(target, fallback) {
    if (!(await pathExists(target))) {
        return fallback;
    }
    const raw = await fs.readFile(target, "utf8");
    return JSON.parse(raw);
}
export async function writeJson(target, value) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
export async function writeText(target, value) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, value, "utf8");
}
export async function readText(target) {
    return fs.readFile(target, "utf8");
}
export async function listFiles(root, predicate) {
    if (!(await pathExists(root))) {
        return [];
    }
    const out = [];
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await listFiles(fullPath, predicate)));
        }
        else if (!predicate || predicate(fullPath)) {
            out.push(fullPath);
        }
    }
    return out.sort();
}
export async function copyDir(source, destination) {
    await ensureDir(destination);
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copyDir(from, to);
        }
        else {
            await ensureDir(path.dirname(to));
            await fs.copyFile(from, to);
        }
    }
}
export function normalizePath(input) {
    return path.resolve(input).replace(/\\/g, "/");
}
//# sourceMappingURL=fs.js.map