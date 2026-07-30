declare module "node:test" {
  export interface TestContext {
    readonly name: string;
  }

  export function test(name: string, fn: (context: TestContext) => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function ok(value: unknown, message?: string): asserts value;
}

declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(location: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    all(...params: readonly unknown[]): unknown[];
    get(...params: readonly unknown[]): unknown;
    run(...params: readonly unknown[]): unknown;
  }
}
