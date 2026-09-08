export function recognitionStageLabel(stage:string,english:boolean){
 if(stage==='preparing-pages')return english?'Preparing score pages':'準備樂譜頁面';
 const match=/^(transcribing|checking-score):(\d+):(\d+)$/.exec(stage||'');if(!match)return;
 return english?`${match[1]==='transcribing'?'Transcribing':'Verifying'} sheet ${match[2]} of ${match[3]}`:`${match[1]==='transcribing'?'辨識':'核對'}第 ${match[2]} / ${match[3]} 頁`;
}
