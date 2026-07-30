import { ok } from "node:assert/strict";
import { test } from "node:test";

type WebRepository = typeof import("../../db/repository");
type NativeRepository = typeof import("../../db/repository.native");
type JsonRepositoryModule = typeof import("../../db/jsonRepository");
type SqliteRepositoryModule = typeof import("../../db/sqliteRepository");

type Assert<T extends true> = T;
type WebMatchesNative = Assert<WebRepository extends NativeRepository ? true : false>;
type NativeMatchesWeb = Assert<NativeRepository extends WebRepository ? true : false>;
type JsonRepositoryStaysInternal = Assert<"createJsonRepository" extends keyof WebRepository ? false : true>;
type SqliteRepositoryStaysInternal = Assert<"createSqliteRepository" extends keyof NativeRepository ? false : true>;
type FactoryReturnMatchesWeb = Assert<
  ReturnType<JsonRepositoryModule["createJsonRepository"]> extends Omit<WebRepository, keyof JsonRepositoryModule | keyof typeof import("../../db/types")>
    ? true
    : false
>;
type SqliteFactoryReturnMatchesNative = Assert<
  ReturnType<SqliteRepositoryModule["createSqliteRepository"]> extends Omit<NativeRepository, keyof SqliteRepositoryModule | keyof typeof import("../../db/types")>
    ? true
    : false
>;

const _webMatchesNative: WebMatchesNative = true;
const _nativeMatchesWeb: NativeMatchesWeb = true;
const _jsonRepositoryStaysInternal: JsonRepositoryStaysInternal = true;
const _sqliteRepositoryStaysInternal: SqliteRepositoryStaysInternal = true;
const _factoryReturnMatchesWeb: FactoryReturnMatchesWeb = true;
const _sqliteFactoryReturnMatchesNative: SqliteFactoryReturnMatchesNative = true;

test("web fallback and native repositories expose the same TypeScript API", () => {
  ok(_webMatchesNative);
  ok(_nativeMatchesWeb);
  ok(_jsonRepositoryStaysInternal);
  ok(_sqliteRepositoryStaysInternal);
  ok(_factoryReturnMatchesWeb);
  ok(_sqliteFactoryReturnMatchesNative);
});
