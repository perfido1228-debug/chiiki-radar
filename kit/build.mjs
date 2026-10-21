// 地域密着レーダー（PC版）のキットを組み立てる。
// 使い方（ChiikiRadar フォルダで）: node kit/build.mjs [--no-zip]
//   kit/dist/地域密着レーダー/ にキット一式、kit/dist/地域密着レーダー_キット_YYYYMMDD.zip に配布用zipを作る。
// 巡回・読み取りの仕組みは本番（web/scripts）のものをそのまま使い、データの置き場所（Supabase → PCの中のファイル）と
// 対象の地域（7都府県 → config/area.json）だけを差し替える。
import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import { deflateRawSync } from "zlib";

const { build } = createRequire(import.meta.url)("../web/node_modules/esbuild");

const KIT = dirname(fileURLToPath(import.meta.url));
const ROOT = join(KIT, "..");
const WEB = join(ROOT, "web");
const NAME = "地域密着レーダー";
const OUT = join(KIT, "dist", NAME);
const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

// 本番の「データベース」と「対象地域の一覧」を、キット用に差し替える
const swapPlugin = {
  name: "kit-swap",
  setup(b) {
    const fromWebScripts = (importer) => importer.split(sep).join("/").includes("/web/scripts/");
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => (fromWebScripts(a.importer) ? { path: join(KIT, "src", "localdb.ts") } : undefined));
    b.onResolve({ filter: /(^|\/)municipalities$/ }, (a) => (fromWebScripts(a.importer) ? { path: join(KIT, "src", "area-master.ts") } : undefined));
  },
};
// 画面の「@/」（web フォルダ）
const atAliasPlugin = {
  name: "at-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = join(WEB, a.path.slice(2));
      for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return { path: base + ext };
      return undefined;
    });
  },
};

const nodeCommon = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  nodePaths: [join(WEB, "node_modules")],
  plugins: [swapPlugin],
  banner: { js: "import { createRequire as __kitRequire } from 'module'; const require = __kitRequire(import.meta.url);" },
  logLevel: "warning",
  legalComments: "none",
};

rmSync(join(KIT, "dist"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("プログラムをまとめています…");
await build({ ...nodeCommon, entryPoints: [join(WEB, "scripts", "crawl.ts")], outfile: join(OUT, "app", "crawl.mjs") });
await build({ ...nodeCommon, entryPoints: [join(KIT, "src", "server.ts")], outfile: join(OUT, "app", "server.mjs") });
for (const t of ["find-sources", "check-source", "sources", "area"]) {
  await build({ ...nodeCommon, entryPoints: [join(KIT, "tools", `${t}.ts`)], outfile: join(OUT, "tools", `${t}.mjs`) });
}
await build({
  entryPoints: [join(KIT, "ui", "main.tsx")],
  outfile: join(OUT, "ui", "app.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  nodePaths: [join(WEB, "node_modules")],
  plugins: [atAliasPlugin],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
  legalComments: "none",
});
copyFileSync(join(KIT, "ui", "index.html"), join(OUT, "ui", "index.html"));
writeFileSync(join(OUT, "ui", "app.css"), readFileSync(join(WEB, "app", "globals.css"), "utf8") + "\n" + readFileSync(join(KIT, "ui", "kit.css"), "utf8"));

console.log("説明書・設定・一覧をそろえています…");
// fs.cpSync は Windows で行き先が日本語のフォルダ名だと落ちる（Node 24）ので、自前で写す
copyDir(join(KIT, "files"), OUT);
mkdirSync(join(OUT, "masters"), { recursive: true });
for (const f of ["japan-municipalities.json", "known-sources.json", "minkei-editions.json", "living-editions.json"]) copyFileSync(join(KIT, "masters", f), join(OUT, "masters", f));
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "不明";
  }
})();
writeFileSync(join(OUT, "VERSION.txt"), `地域密着レーダー（PC版）キット ${stamp}\n元にした本番のしくみ: ${commit}\n`);

// .bat は Windows の改行（CRLF）、.command は Mac の改行（LF）にそろえる
for (const f of walk(OUT)) {
  if (f.endsWith(".bat")) writeFileSync(f, readFileSync(f, "utf8").replace(/\r?\n/g, "\r\n"));
  if (f.endsWith(".command")) writeFileSync(f, readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
}

if (!process.argv.includes("--no-zip")) {
  const zipFile = join(KIT, "dist", `${NAME}_キット_${stamp}.zip`);
  writeZip(zipFile, OUT, NAME);
  console.log(`zip: ${zipFile}（${(statSync(zipFile).size / 1024 / 1024).toFixed(1)}MB）`);
}
console.log(`キット: ${OUT}`);

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(join(from, e.name), join(to, e.name));
    else copyFileSync(join(from, e.name), join(to, e.name));
  }
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// zip（ファイル名は UTF-8、Mac で .command がそのまま動くよう Unix の実行権限を付ける）
function writeZip(file, dir, top) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of walk(dir).sort()) {
    const name = Buffer.from(`${top}/${relative(dir, f).split(sep).join("/")}`, "utf8");
    const data = readFileSync(f);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const mode = /\.(command|sh)$/.test(f) ? 0o100755 : 0o100644;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4); // Unix
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = centrals.length / 2;
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(file, Buffer.concat([...locals, cd, end]));
}
