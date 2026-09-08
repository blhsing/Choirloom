import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import {changed} from './events.ts';
export const dataDir=path.resolve(process.env.DATA_DIR||'data');mkdirSync(dataDir,{recursive:true,mode:0o700});
export const db=new DatabaseSync(path.join(dataDir,'choirloom.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,verified INTEGER DEFAULT 0,prefs TEXT DEFAULT '{}',pref_version INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,csrf TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,kind TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),title TEXT,version INTEGER DEFAULT 1,score TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,updated TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS revisions(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,version INTEGER,score TEXT,actor TEXT,label TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(project_id,version));
 CREATE TABLE IF NOT EXISTS members(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,email TEXT,role TEXT,PRIMARY KEY(project_id,email));
 CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,token TEXT UNIQUE,version INTEGER,downloads INTEGER DEFAULT 0,expires INTEGER,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT,role TEXT,content TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS threads(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT,thread_id TEXT,PRIMARY KEY(project_id,user_id));
 CREATE TABLE IF NOT EXISTS service_threads(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT,thread_id TEXT,PRIMARY KEY(project_id,user_id));
 CREATE TABLE IF NOT EXISTS views(project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT,state TEXT,PRIMARY KEY(project_id,user_id));
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT,kind TEXT,status TEXT,payload TEXT,result TEXT,error TEXT,progress INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP,updated TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,version INTEGER,path TEXT,mime TEXT,name TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
`);
// Existing accounts remain ordinary users until explicitly promoted by an operator.
if(!db.prepare('PRAGMA table_info(users)').all().some((column:any)=>column.name==='role'))db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))");
if(!db.prepare('PRAGMA table_info(jobs)').all().some((column:any)=>column.name==='stage'))db.exec("ALTER TABLE jobs ADD COLUMN stage TEXT NOT NULL DEFAULT 'queued'");
for(const [name,type] of [['job_id','TEXT'],['revision','INTEGER'],['reference_ids',"TEXT DEFAULT '[]'"],['request_id','TEXT']])if(!db.prepare('PRAGMA table_info(chats)').all().some((column:any)=>column.name===name))db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS chat_request ON chats(user_id,project_id,request_id) WHERE request_id IS NOT NULL');
if(!db.prepare('PRAGMA table_info(projects)').all().some((column:any)=>column.name==='source'))db.exec("ALTER TABLE projects ADD COLUMN source TEXT DEFAULT '{}' ");
db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,title TEXT,active INTEGER DEFAULT 0,thread_id TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE UNIQUE INDEX IF NOT EXISTS active_chat_session ON chat_sessions(project_id,user_id) WHERE active=1;`);
if(!db.prepare('PRAGMA table_info(chats)').all().some((c:any)=>c.name==='conversation_id'))db.exec("ALTER TABLE chats ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''");
if(!db.prepare('PRAGMA table_info(chat_sessions)').all().some((c:any)=>c.name==='draft'))db.exec("ALTER TABLE chat_sessions ADD COLUMN draft TEXT DEFAULT NULL");
export const one=(sql:string,...args:any[]):any=>db.prepare(sql).get(...args);
export const all=(sql:string,...args:any[]):any[]=>db.prepare(sql).all(...args);
export const run=(sql:string,...args:any[])=>{const result=db.prepare(sql).run(...args);if(result.changes){const table=sql.match(/(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i)?.[1];if(table)changed(table.toLowerCase());}return result;};
export const token=()=>randomBytes(32).toString('base64url');
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const emailKey=(s:string)=>s.trim().toLowerCase();
export function transaction<T>(fn:()=>T):T {db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function access(projectId:string,user:any,edit=false){const p=one('SELECT * FROM projects WHERE id=?',projectId);if(!p)throw new HttpError(404,'notFound');const member=user.verified?one('SELECT role FROM members WHERE project_id=? AND email=?',p.id,user.email)?.role:null;const role=p.owner===user.id?'owner':member||(user.role==='admin'?'viewer':null);if(!role||(edit&&role==='viewer'))throw new HttpError(403,'forbidden');return {...p,role,adminView:user.role==='admin'&&p.owner!==user.id&&!member};}
export function revision(p:any,score:any,actor:string,label='edit',base=p.version){return transaction(()=>{const r=run('UPDATE projects SET score=?,title=?,version=version+1,updated=CURRENT_TIMESTAMP WHERE id=? AND version=?',JSON.stringify(score),score.title,p.id,base);if(!r.changes)throw new HttpError(409,'conflict');run('INSERT INTO revisions(project_id,version,score,actor,label) VALUES(?,?,?,?,?)',p.id,base+1,JSON.stringify(score),actor,label);return base+1;});}
