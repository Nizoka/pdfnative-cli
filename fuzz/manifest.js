/**
 * pdfnative-cli — fuzz target: the batch manifest validator
 * =========================================================
 * Coverage-guided fuzzing of `parseManifest` and `assertOfflinePolicy`:
 * the `{ version: 1, tasks: [...] }` grammar, the command whitelist, task
 * ids, `@id` references to earlier outputs, path flags resolved against the
 * manifest directory after the traversal check, and the network-reaching
 * flags refused without `--allow-network`. Pure data validation — no task
 * runs.
 *
 * See `_contract.js` for what a crash means.
 *
 * @module fuzz/manifest
 */

import { assertOfflinePolicy, parseManifest } from '#fuzz-surface';
import { assertPrototypeClean, isRefusal, text } from './_contract.js';

/** An absolute anchor on every platform (`path.isAbsolute('/fuzz')` holds on Windows too). */
const MANIFEST_DIR = '/fuzz';

/**
 * @param {Buffer} data Bytes chosen by the fuzzer.
 * @returns {void}
 */
export function fuzz(data) {
    try {
        const plan = parseManifest(text(new Uint8Array(data)), MANIFEST_DIR);
        for (const task of plan.tasks) {
            for (const key of Object.keys(task.flags)) {
                if (!Object.hasOwn(task.flags, key)) throw new TypeError(`flag "${key}" of task ${task.id} is not an own key`);
            }
        }
        assertOfflinePolicy(plan, false);
        assertPrototypeClean();
    } catch (error) {
        if (!isRefusal(error)) throw error;
    }
}
