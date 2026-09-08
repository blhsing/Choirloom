import {EventEmitter} from 'node:events';
export const events=new EventEmitter();events.setMaxListeners(100);
export function changed(table:string){events.emit('change',table);}
