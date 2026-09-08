import {Download} from 'lucide-react';
import {type Score} from '../shared/music';
import {selectParts,exportName} from '../shared/selection';
import {renderScore} from './ScoreView';
import {pageFiles,downloadFiles,download} from './exports';
type Props={score:Score,locale:string,base:string,projectId:string,shareToken:string|null,selected:string[]|null,onSelected:(ids:string[]|null)=>void,layout:string,onLayout:(value:string)=>void,format:string,onFormat:(value:string)=>void,busy:boolean,run:(action:()=>Promise<void>)=>Promise<void>,beforeExport:()=>Promise<number>};
export function ExportDialog(p:Props){
 const t=(zh:string,en:string)=>p.locale==='en'?en:zh,ids=p.selected===null?p.score.parts.map(v=>v.id):p.selected.filter(id=>p.score.parts.some(v=>v.id===id));
 async function save(){
  const version=await p.beforeExport(),chosen=selectParts(p.score,ids),separate=p.layout==='separate';
  if(['pdf','png','svg'].includes(p.format)){
   let files:Record<string,Uint8Array>={};
   if(separate){for(let i=0;i<chosen.parts.length;i++){const part=chosen.parts[i];Object.assign(files,await pageFiles(await renderScore(selectParts(chosen,[part.id])),p.format,`${String(i+1).padStart(2,'0')} - ${part.name}`));}}
   else files=await pageFiles(await renderScore(chosen),p.format,chosen.title+(chosen.parts.length===1?' - '+chosen.parts[0].name:''));
   downloadFiles(files,exportName(chosen.title)+' - parts');return;
  }
  const query=new URLSearchParams({parts:ids.join(','),separate:separate?'1':'0'});
  if(p.shareToken)query.set('share',p.shareToken);else query.set('version',String(version));
  const response=await fetch(`${p.base}/api/projects/${p.projectId}/export/${p.format}?${query}`);
  if(!response.ok){const error=await response.json();throw Error(error.error||'serverError');}
  const extension=separate&&ids.length>1?'zip':p.format;
  download(await response.blob(),`${exportName(chosen.title)} - ${ids.length===1?exportName(chosen.parts[0].name):ids.length+' voices'}.${extension}`);
 }
 return <><div className="eyebrow">TAKE YOUR MUSIC WITH YOU</div><h2>{t('匯出作品','Export your work')}</h2>
  <div className="export-selection-heading"><strong>{t('選擇聲部','Choose voices')} · {ids.length}/{p.score.parts.length}</strong><div><button onClick={()=>p.onSelected(null)}>{t('全選','All')}</button><button onClick={()=>p.onSelected([])}>{t('清除','Clear')}</button></div></div>
  <fieldset className="export-voices"><legend className="sr-only">{t('要匯出的聲部','Voices to export')}</legend>{p.score.parts.map(part=><label className="export-voice-row" key={part.id}><input type="checkbox" checked={ids.includes(part.id)} onChange={e=>p.onSelected(e.target.checked?[...ids,part.id]:ids.filter(id=>id!==part.id))}/><span>{part.name}<small>{part.type}</small></span></label>)}</fieldset>
  <label>{t('檔案編排','File arrangement')}<select value={p.layout} onChange={e=>p.onLayout(e.target.value)}><option value="combined">{t('合併所選聲部（總譜／混音）','Combine selected voices (score / mix)')}</option><option value="separate">{t('各聲部獨立檔案（多聲部下載 ZIP）','Separate files per voice (ZIP for multiple voices)')}</option></select></label>
  <div className="export-grid">{[['pdf','PDF',t('列印樂譜','Print score')],['png','PNG',t('高解析圖片','Score image')],['svg','SVG',t('向量圖片','Vector score')],['musicxml','MusicXML',t('結構化樂譜','Structured score')],['mxl','MXL',t('壓縮樂譜','Compressed score')],['mid','MIDI',t('音符與節奏','Notes & timing')],['wav','WAV',t('無損歌聲','Lossless singing')],['mp3','MP3',t('壓縮音訊','Compressed audio')]].map(([id,label,sub])=><button key={id} className={p.format===id?'chosen':''} onClick={()=>p.onFormat(id)}><strong>{label}</strong><small>{sub}</small></button>)}</div>
  {['wav','mp3'].includes(p.format)&&<p className="muted small">{t('請先合成歌聲。混音使用所選聲部的音量；獨立檔案為原始分軌。此處勾選決定匯出內容，不受試聽靜音或獨唱影響。','Render singing first. Combined audio uses the selected voice levels; separate files contain unmixed stems. This selection controls inclusion, independently of playback mute or solo.')}</p>}
  {!ids.length&&<p role="status" className="muted small">{t('請至少選擇一個聲部。','Select at least one voice.')}</p>}
  <button className="primary wide" disabled={p.busy||!ids.length} onClick={()=>void p.run(save)}><Download size={16}/>{p.busy?t('正在準備…','Preparing…'):t('下載檔案','Download files')}</button>
 </>;
}
