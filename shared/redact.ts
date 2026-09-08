const sensitive=/password|secret|authorization|cookie|csrf|(?:access|refresh|id)[_-]?token|device.?code|^prompt$|^score$|^lyrics?$|^body$|^content$|auth\.json/i;
export function redactText(value:string){return value.replace(/(\/api\/shared\/)[A-Za-z0-9_-]+/g,'$1[redacted]').replace(/Bearer\s+[^\s"']+|\bsk-[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]').replace(/([?&](?:token|key|code|share|password|csrf|secret)=)[^\s&#"']+/gi,'$1[redacted]').replace(/((?:password|access_token|refresh_token|id_token|authorization|cookie|csrf|secret)["']?\s*[:=]\s*["']?)[^\s,}"']+/gi,'$1[redacted]').replace(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/g,'[device code redacted]').slice(0,2500);}
export function redact(value:unknown,depth=0):any{
 if(depth>4)return '[depth limit]';if(value instanceof Error)return {name:value.name,message:redactText(value.message),stack:redactText(value.stack||'')};
 if(typeof value==='string')return redactText(value);if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(Array.isArray(value))return value.slice(0,30).map(v=>redact(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,30).map(([key,item])=>[key,sensitive.test(key)?'[redacted]':redact(item,depth+1)]));
 return String(value).slice(0,200);
}
