import {all,one,run,access,transaction,HttpError} from './db.ts';
import {uid} from '../shared/music.ts';
import {createJob} from './jobs.ts';
import {connected} from './ai.ts';
import {resolveReferences} from './references.ts';
export function currentChat(projectId:string,userId:string){
 let c=one('SELECT * FROM chat_sessions WHERE project_id=? AND user_id=? AND active=1',projectId,userId);if(c)return c;
 const id=uid();transaction(()=>{run('INSERT INTO chat_sessions(id,project_id,user_id,title,active,thread_id) VALUES(?,?,?,?,1,?)',id,projectId,userId,'Chat 1',one('SELECT thread_id FROM service_threads WHERE project_id=? AND user_id=?',projectId,userId)?.thread_id||null);run("UPDATE chats SET conversation_id=? WHERE project_id=? AND user_id=? AND conversation_id=''",id,projectId,userId);});run("UPDATE jobs SET payload=json_set(payload,'$.conversationId',?) WHERE project_id=? AND user_id=? AND kind='ai' AND json_extract(payload,'$.conversationId') IS NULL",id,projectId,userId);return one('SELECT * FROM chat_sessions WHERE id=?',id);
}
function idle(projectId:string,userId:string){if(one("SELECT id FROM jobs WHERE project_id=? AND user_id=? AND status IN ('queued','running')",projectId,userId))throw new HttpError(409,'jobBusy');}
export function switchChat(projectId:string,user:any,id?:string){access(projectId,user,true);idle(projectId,user.id);currentChat(projectId,user.id);return transaction(()=>{if(id&&!one('SELECT id FROM chat_sessions WHERE id=? AND project_id=? AND user_id=?',id,projectId,user.id))throw new HttpError(404,'notFound');run('UPDATE chat_sessions SET active=0 WHERE project_id=? AND user_id=?',projectId,user.id);if(id)run('UPDATE chat_sessions SET active=1 WHERE id=?',id);else{id=uid();const count=one('SELECT COUNT(*) AS n FROM chat_sessions WHERE project_id=? AND user_id=?',projectId,user.id).n;run('INSERT INTO chat_sessions(id,project_id,user_id,title,active,draft) VALUES(?,?,?,?,1,?)',id,projectId,user.id,'Chat '+(count+1),JSON.stringify({draft:'',referenceIds:[],barSelection:null,creationMode:'arrange'}));}return {id};});}
export function rewindChat(projectId:string,user:any,messageId:string,base:number,retry=false){
 const p=access(projectId,user,true);if(p.version!==base)throw new HttpError(409,'conflict');idle(projectId,user.id);const session=currentChat(projectId,user.id),message=one("SELECT rowid AS sequence,* FROM chats WHERE id=? AND project_id=? AND user_id=? AND conversation_id=? AND role='user'",messageId,projectId,user.id,session.id);if(!message)throw new HttpError(404,'notFound');
 const oldJob=one('SELECT payload FROM jobs WHERE id=?',message.job_id),payload=oldJob?JSON.parse(oldJob.payload):{prompt:message.content,mode:'chat',effort:'medium',locale:'en',referenceIds:JSON.parse(message.reference_ids||'[]')};
 const original=one('SELECT score FROM revisions WHERE project_id=? AND version=?',projectId,payload.version);if(!original)throw new HttpError(409,'rewindUnavailable');if(retry){if(!connected())throw new HttpError(409,'connectAI');resolveReferences(projectId,user,payload.referenceIds||[]);}
 return transaction(()=>{
  const discarded=all('SELECT job_id FROM chats WHERE project_id=? AND user_id=? AND conversation_id=? AND rowid>=?',projectId,user.id,session.id,message.sequence);
  run('DELETE FROM chats WHERE project_id=? AND user_id=? AND conversation_id=? AND rowid>=?',projectId,user.id,session.id,message.sequence);
  for(const row of discarded)if(row.job_id)run("DELETE FROM jobs WHERE id=? AND user_id=? AND kind='ai'",row.job_id,user.id);
  run('UPDATE chat_sessions SET thread_id=NULL WHERE id=?',session.id);
  const score=JSON.parse(original.score),version=p.version+1;
  run('UPDATE projects SET score=?,title=?,version=?,updated=CURRENT_TIMESTAMP WHERE id=?',original.score,score.title,version,projectId);
  run('INSERT INTO revisions(project_id,version,score,actor,label) VALUES(?,?,?,?,?)',projectId,version,original.score,user.id,'chat-rewind');
  const restored={prompt:message.content,mode:payload.mode||'chat',effort:payload.effort||'medium',locale:payload.locale||'en',referenceIds:payload.referenceIds||[],selection:payload.selection,conversationId:session.id};
  let job:any=null;if(retry){job=createJob({...p,version},user,'ai',restored);run('INSERT INTO chats(id,project_id,user_id,role,content,job_id,reference_ids,conversation_id) VALUES(?,?,?,?,?,?,?,?)',uid(),projectId,user.id,'user',restored.prompt,job.id,JSON.stringify(restored.referenceIds),session.id);}
  const view=JSON.parse(one('SELECT state FROM views WHERE project_id=? AND user_id=?',projectId,user.id)?.state||'{}');Object.assign(view,{draft:retry?'':restored.prompt,effort:restored.effort,referenceIds:retry?[]:restored.referenceIds,creationMode:restored.mode==='chat'?'arrange':restored.mode,barSelection:restored.selection||null});run('INSERT INTO views VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET state=excluded.state',projectId,user.id,JSON.stringify(view));
  run('UPDATE chat_sessions SET draft=? WHERE id=?',JSON.stringify({draft:view.draft,effort:view.effort,referenceIds:view.referenceIds,creationMode:view.creationMode,barSelection:view.barSelection}),session.id);return {restored,job,version};
 });
}
