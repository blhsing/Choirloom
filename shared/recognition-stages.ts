export function recognitionStageLabel(stage:string,english:boolean){
 if(stage==='preparing-pages')return english?'Preparing score pages':'準備樂譜頁面';
 const match=/^(transcribing|checking-score|reconnecting-score):(\d+):(\d+)(?::(\d+))?$/.exec(stage||'');if(!match)return;
 const elapsed=match[4]?` · ${Math.floor(Number(match[4])/60)}:${String(Number(match[4])%60).padStart(2,'0')}`:'';return (english?`${match[1]==='transcribing'?'Transcribing':match[1]==='reconnecting-score'?'Reconnecting':'Verifying'} sheet ${match[2]} of ${match[3]}`:`${match[1]==='transcribing'?'辨識':match[1]==='reconnecting-score'?'重新連線':'核對'}第 ${match[2]} / ${match[3]} 頁`)+elapsed;
}
