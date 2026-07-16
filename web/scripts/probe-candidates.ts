import { sb } from "./lib/supabase";
import Parser from "rss-parser";
const parser = new Parser({ timeout: 15000 });

// master candidates (sub, label, pref). city derived from label loosely.
const GOGUY: [string,string,string][] = [
  // 東京
  ["suginami","杉並区","東京都"],["setagaya","世田谷区","東京都"],["meguro","目黒区","東京都"],
  ["nishitokyo","西東京市","東京都"],["ome-hamura","青梅市","東京都"],["tama-inagi","多摩市","東京都"],
  ["chofu-komae","調布市","東京都"],["higashikurume-kiyose","東久留米市","東京都"],
  // 埼玉 (big gap)
  ["kazo-hanyu","加須市","埼玉県"],["kuki-satte","久喜市","埼玉県"],["shiraoka-hasuda","白岡市","埼玉県"],
  ["misato-yashio","三郷市","埼玉県"],["kumagaya","熊谷市","埼玉県"],["kounosu-kitamoto","鴻巣市","埼玉県"],
  ["ageo-okegawa","上尾市","埼玉県"],["sakado-tsurugashima","坂戸市","埼玉県"],["toda-warabi","戸田市","埼玉県"],
  ["fujimi-fujimino","富士見市","埼玉県"],["niiza-shiki","新座市","埼玉県"],["asaka-wako","朝霞市","埼玉県"],
  ["sayama-iruma","狭山市","埼玉県"],["fukaya-honjo","深谷市","埼玉県"],["saitamaminuma-iwatsuki","さいたま市見沼区","埼玉県"],["saitamaurawa-midori","さいたま市浦和区","埼玉県"],
  // 千葉
  ["abiko","我孫子市","千葉県"],["kamagaya-shiroi-inzai","鎌ケ谷市","千葉県"],["narita-tomisato","成田市","千葉県"],
  ["kisarazu-kimitsu-futtsu-sodegaura","木更津市","千葉県"],["yachiyo-narashino","八千代市","千葉県"],
  ["sakura-yotsukaido-yachimata","佐倉市","千葉県"],["nagareyama-noda","流山市","千葉県"],
  // 神奈川
  ["yokohamakanazawa-isogo","横浜市金沢区","神奈川県"],["kawasakimiyamae","川崎市宮前区","神奈川県"],
  ["hadano-isehara","秦野市","神奈川県"],["odawara","小田原市","神奈川県"],["ebina-zama-ayase","海老名市","神奈川県"],
  ["yokohamamidori-aoba","横浜市青葉区","神奈川県"],["yokohamakonan-sakae","横浜市港南区","神奈川県"],
  // 愛知
  ["nagoyakita-higashi","名古屋市北区","愛知県"],["nagoyanishi-nakamura","名古屋市西区","愛知県"],
  ["ama-tsushima-aisai","あま市","愛知県"],["komaki-inuyama","小牧市","愛知県"],["tokai-obu","東海市","愛知県"],
  ["kariya-chiryu","刈谷市","愛知県"],["anjo-takahama-hekinan","安城市","愛知県"],["toyokawa-gamagori","豊川市","愛知県"],["toyohashi-tahara","豊橋市","愛知県"],
  // 大阪
  ["yodogawaku","大阪市淀川区","大阪府"],["fukushima-konohana","大阪市福島区","大阪府"],["miyakojima-asahi","大阪市都島区","大阪府"],
  ["tsurumi-joto","大阪市鶴見区","大阪府"],["higashinari-ikuno","大阪市東成区","大阪府"],["minato-taisho","大阪市港区","大阪府"],
  ["sumiyoshi-higashisumiyoshi","大阪市住吉区","大阪府"],["naniwa-nishinari","大阪市浪速区","大阪府"],["daitoshijonawate","大東市","大阪府"],
  ["moriguchikadoma","守口市","大阪府"],["minoh","箕面市","大阪府"],["settsu","摂津市","大阪府"],["neyagawa","寝屋川市","大阪府"],
  ["kishiwada-kaizuka","岸和田市","大阪府"],["tondabayashi-kawachinagano","富田林市","大阪府"],["izumisano-sennan-hannan","泉佐野市","大阪府"],
  ["habikino-fujiidera-kashiwara","羽曳野市","大阪府"],["kanku-area","泉大津市","大阪府"],
  // 京都
  ["kyotoyamasina-higasiyama","京都市山科区","京都府"],["nagaokakyo","長岡京市","京都府"],["uji-joyo","宇治市","京都府"],["kyotanabekizugawa","京田辺市","京都府"],
];

const KEIZAI: [string,string,string][] = [
  // 東京 (big gap)
  ["katsushika","葛飾","東京都"],["edogawa","江戸川","東京都"],["koto","江東","東京都"],["asakusa","浅草","東京都"],
  ["bunkyo","文京","東京都"],["akiba","アキバ","東京都"],["ginza","銀座","東京都"],["roppongi","六本木","東京都"],
  ["akabane","赤羽","東京都"],["nerima","練馬","東京都"],["takadanobaba","高田馬場","東京都"],["koenji","高円寺","東京都"],
  ["kyodo","経堂","東京都"],["sancha","三軒茶屋","東京都"],["nikotama","二子玉川","東京都"],["nishitama","西多摩","東京都"],
  ["shimokita","下北沢","東京都"],["machida","町田","東京都"],["adachi","北千住","東京都"],
  // 神奈川
  ["yokosuka","横須賀","神奈川県"],["zushi-hayama","逗子葉山","神奈川県"],["kamakura","鎌倉","神奈川県"],
  ["shonan","湘南","神奈川県"],["odawara-hakone","小田原箱根","神奈川県"],["kohoku","港北","神奈川県"],
  // 埼玉
  ["kawaguchi","川口","埼玉県"],["sayama","狭山","埼玉県"],["kumagaya","熊谷","埼玉県"],["honjo","本庄","埼玉県"],["chichibu","秩父","埼玉県"],
  // 千葉
  ["urayasu","浦安","千葉県"],["narashino","習志野","千葉県"],["sotobo","外房","千葉県"],["choshi","銚子","千葉県"],
];

async function existing(){
  let all:string[]=[];
  for(let f=0;;f+=1000){const{data}=await sb.from("sources").select("url").range(f,f+999);if(!data||!data.length)break;all=all.concat(data.map((r:any)=>r.url));if(data.length<1000)break;}
  return new Set(all);
}

async function probe(url:string){
  try{ const feed=await parser.parseURL(url); return feed.items?.length ?? 0; }
  catch(e:any){ return -1; }
}

async function main(){
  const have = await existing();
  const results:any[]=[];
  const tasks:Promise<void>[]=[];
  const run = async(sub:string,label:string,pref:string,type:"号外NET"|"経済新聞")=>{
    const base = type==="号外NET" ? `https://${sub}.goguynet.jp/` : `https://${sub}.keizai.biz/`;
    const rss = type==="号外NET" ? `${base}category/cat_openclose/feed/` : `${base}rss.xml`;
    const dup = have.has(base);
    const n = await probe(rss);
    results.push({type,pref,label,base,rss,items:n,dup});
  };
  for(const [s,l,p] of GOGUY) tasks.push(run(s,l,p,"号外NET"));
  for(const [s,l,p] of KEIZAI) tasks.push(run(s,l,p,"経済新聞"));
  // run with limited concurrency
  const pool=8; let i=0;
  async function worker(){ while(i<tasks.length){ const j=i++; await tasks[j]; } }
  await Promise.all(Array.from({length:pool},()=>worker()));

  const fresh = results.filter(r=>!r.dup && r.items>0);
  const dead = results.filter(r=>!r.dup && r.items<=0);
  const dupd = results.filter(r=>r.dup);
  console.log(`\n=== 新規追加可能(フィード生存): ${fresh.length} ===`);
  fresh.sort((a,b)=>a.pref.localeCompare(b.pref)).forEach(r=>console.log(`  [${r.type}] ${r.pref} ${r.label}  items=${r.items}`));
  console.log(`\n=== フィード無効/404: ${dead.length} ===`);
  dead.forEach(r=>console.log(`  [${r.type}] ${r.pref} ${r.label} (${r.items===-1?'err':'0件'})`));
  console.log(`\n=== 既にDBにある(重複): ${dupd.length} ===`);
}
main().catch(console.error);
