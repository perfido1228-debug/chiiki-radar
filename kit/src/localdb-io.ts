// データファイルの読み書き（巡回と画面の両方で使う。読み込んだだけでは何も起きない部品）
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";

export function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
  } catch {
    throw new Error(`${file} を読めません（壊れている可能性があります）`);
  }
}

// 書いている途中で止まっても壊れないよう、別名で書いてから置き換える
export function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}
