// キットのフォルダの場所。まとめた後のファイルは app/・tools/ に置かれるので、その1つ上がキットのフォルダ。
// KIT_ROOT を指定すると上書きできる（試験用）。
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const KIT_ROOT = process.env.KIT_ROOT ? resolve(process.env.KIT_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const P = {
  root: (...f: string[]) => join(KIT_ROOT, ...f),
  config: (f: string) => join(KIT_ROOT, "config", f),
  data: (f: string) => join(KIT_ROOT, "data", f),
  masters: (f: string) => join(KIT_ROOT, "masters", f),
  ui: (f: string) => join(KIT_ROOT, "ui", f),
  app: (f: string) => join(KIT_ROOT, "app", f),
  work: (f: string) => join(KIT_ROOT, "work", f),
};
