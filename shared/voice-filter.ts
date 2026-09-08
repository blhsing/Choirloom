export function filterVoices(banks:any[],query='',language='',status=''){
 const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().trim();
 const languageNames:Record<string,string>={en:'English 英語 英文',zh:'Chinese Mandarin 中文 國語 普通話',yue:'Cantonese 粵語 廣東話',ja:'Japanese 日文 日語',th:'Thai 泰文 泰語',fr:'French 法文 法語',ko:'Korean 韓文 韓語',es:'Spanish 西班牙文',pt:'Portuguese 葡萄牙文',ru:'Russian 俄文',de:'German 德文',it:'Italian 義大利文',pl:'Polish 波蘭文',vi:'Vietnamese 越南文',id:'Indonesian 印尼文',fil:'Filipino 菲律賓文'};
 const words=normalize(query).split(/\s+/).filter(Boolean);
 return banks.filter(b=>(!language||b.languageCodes?.includes(language))&&(!status||(status==='downloadable'?!['installed','downloading'].includes(b.status):b.status===status))&&words.every(w=>normalize([b.id,b.name,b.source||'',b.gender||'',...(b.languageCodes||[]).map((l:string)=>languageNames[l]||l),...Object.values(b.displayName||{}),...(b.aliases||[]),...(b.tags||[]),...(b.languages||[]),...Object.values(b.description||{})].join(' ')).includes(w)));
}
