/* tslint:disable */
/* eslint-disable */

/**
 * The StateJournal, driven from the page. Payloads cross as JSON
 * strings; the canonical form and the chain are the Rust core's own.
 */
export class CoreJournal {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Append one entry; returns its checksum. Ticks cross the boundary
     * as i32 on purpose: wasm-bindgen maps i64 to BigInt, and the
     * island's ticks are small counters that should stay plain
     * JavaScript numbers. The core's journal keeps i64 internally.
     */
    append(event_type: string, tick: number, payload_json: string): string;
    checksum_until_tick(tick: number): string;
    constructor();
    verify(): boolean;
    readonly head: string;
    readonly length: number;
}

/**
 * Project one WGS84 point into the frame of the given origin.
 * Returns [east, north, up] in meters.
 */
export function core_enu(origin_lat: number, origin_lon: number, origin_elev: number, lat: number, lon: number, elev: number): Float64Array;

/**
 * hash_world_state over a JSON stats string.
 */
export function core_hash_world_state(stats_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_corejournal_free: (a: number, b: number) => void;
    readonly core_enu: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly core_hash_world_state: (a: number, b: number) => [number, number, number, number];
    readonly corejournal_append: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly corejournal_checksum_until_tick: (a: number, b: number) => [number, number];
    readonly corejournal_head: (a: number) => [number, number];
    readonly corejournal_length: (a: number) => number;
    readonly corejournal_new: () => number;
    readonly corejournal_verify: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
