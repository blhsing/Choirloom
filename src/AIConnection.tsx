import {useLiveEvent} from './live';
import {useState} from 'react';
import {Sparkles} from 'lucide-react';
type Props={locale:string,status:any,onStatus:(status:any)=>void,api:(url:string,method?:string,body?:any)=>Promise<any>,onError:(error:any)=>void};
export function AIConnection({locale,status,onStatus,api,onError}:Props){const t=(zh:string,en:string)=>locale==='en'?en:zh,[busy,setBusy]=useState(false);
 useLiveEvent('ai',onStatus);
 async function change(action:string){setBusy(true);try{onStatus(await api('/ai/'+action,'POST',{}));}catch(error){onError(error);}finally{setBusy(false);}}
 return <><div className="connection-card"><Sparkles size={22}/><div><h3>ChatGPT · GPT-6</h3><p>{status.connected?t('共用 AI 服務已連線，可供所有使用者編曲。','Shared AI is connected and available to all users.'):t('共用 AI 服務尚未連線。','Shared AI is not connected.')}</p></div></div>
  {status.canManage?<><p className="muted small">{t('管理員：在此連結的 ChatGPT 帳號會提供所有使用者的 AI 服務。','Administrator: the ChatGPT account connected here supplies AI for all users.')}</p>{status.connected?<button disabled={busy} onClick={()=>void change('disconnect')}>{t('中斷共用 AI 連線','Disconnect shared AI')}</button>:<button className="primary" disabled={busy||status.status==='running'} onClick={()=>void change('connect')}>{status.status==='running'?t('等待登入…','Waiting for sign-in…'):t('連結共用 ChatGPT','Connect shared ChatGPT')}</button>}
   {status.status==='running'&&<button disabled={busy} onClick={()=>void change('disconnect')}>{t('取消登入','Cancel sign-in')}</button>}
   {status.url&&status.status==='running'&&!status.connected&&<div className="device-code"><a href={status.url} target="_blank" rel="noreferrer">{t('開啟登入頁面','Open sign-in page')} ↗</a><strong>{status.code||'…'}</strong><p>{t('在登入頁面輸入此代碼。','Enter this code on the sign-in page.')}</p></div>}
   {['failed','expired'].includes(status.status)&&<p role="alert" className="library-error">{t('登入未完成或已逾時，請重新連結。','Sign-in failed or expired. Connect again.')}</p>}
  </>:<p className="muted small">{t('ChatGPT 連線由管理員維護，您不需要登入 ChatGPT。','An administrator manages this connection. You do not need to sign in to ChatGPT.')}</p>}
 </>;
}
