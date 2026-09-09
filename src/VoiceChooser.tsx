import {useEffect,useRef,useState} from 'react';
import {Play,Square,ChevronDown,Check} from 'lucide-react';
let activeSample:HTMLAudioElement|null=null;
export function voiceProperties(voice:any,locale:string){
 const en=locale==='en';const gender=voice.gender==='male'?(en?'Male':'男聲'):voice.gender==='female'?(en?'Female':'女聲'):(en?'Gender unspecified':'性別未標示');
 return [gender,...(voice.languages||[]).filter((l:string)=>!l.startsWith('Wordless')), ...(voice.approximateLanguages?.length?[(en?'Approx. ':'近似發音：')+voice.approximateLanguages.join('/').toUpperCase()]:[])].join(' · ');
}
export function VoiceChooser({voices,value,disabled,locale,onChange}:{voices:any[],value:string,disabled:boolean,locale:string,onChange:(id:string)=>void}){
 const en=locale==='en',selected=voices.find(v=>v.id===value),details=useRef<HTMLDetailsElement>(null),audio=useRef<HTMLAudioElement|null>(null);
 const [samples,setSamples]=useState<string[]>([]),[playing,setPlaying]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true;const refresh=()=>fetch(import.meta.env.BASE_URL+'voice-samples/index.json').then(r=>r.ok?r.json():[]).then(ids=>{if(live)setSamples(ids);}).catch(()=>{});void refresh();const timer=setInterval(refresh,30000);return()=>{live=false;clearInterval(timer);audio.current?.pause();};},[]);
 async function play(id:string){if(playing===id){audio.current?.pause();return;}activeSample?.pause();const clip=new Audio(import.meta.env.BASE_URL+'voice-samples/'+encodeURIComponent(id)+'.mp3');audio.current=clip;activeSample=clip;clip.onpause=()=>setPlaying('');clip.onended=()=>setPlaying('');setError('');setPlaying(id);try{await clip.play();}catch{setPlaying('');setError(en?'Sample could not play. Try again.':'無法播放試聽，請重試。');}}
 const name=(v:any)=>v.displayName?.[locale]||v.name;
 return <div className="voice-chooser"><details ref={details}><summary><span><strong>{selected?name(selected):en?'Choose a singer':'選擇歌聲'}</strong>{selected&&<small>{voiceProperties(selected,locale)}</small>}</span><ChevronDown size={14}/></summary><div className="voice-options" aria-label={en?'Choose a singer':'選擇歌聲'}>{voices.map(v=><div className="voice-option" key={v.id}><button disabled={disabled} className="voice-choice" onClick={()=>{onChange(v.id);if(details.current)details.current.open=false;}}><strong>{name(v)}{value===v.id&&<Check size={13}/>}</strong><small>{voiceProperties(v,locale)}</small></button><button className="voice-sample" disabled={!samples.includes(v.id)} title={samples.includes(v.id)?(en?'Play voice sample':'播放聲音範例'):(en?'Sample not available yet':'暫無試聽範例')} aria-label={(playing===v.id?(en?'Stop sample: ':'停止試聽：'):(en?'Play sample: ':'試聽：'))+name(v)} onClick={()=>void play(v.id)}>{playing===v.id?<Square size={14}/>:<Play size={14}/>}</button></div>)}</div></details>{selected&&<button className="selected-voice-sample" disabled={!samples.includes(value)} onClick={()=>void play(value)}>{playing===value?<Square size={13}/>:<Play size={13}/>} {playing===value?(en?'Stop sample':'停止試聽'):(en?'Voice sample':'聲音試聽')}</button>}{error&&<small role="alert">{error}</small>}</div>;
}

