import {z} from 'zod';
export const telemetrySchema=z.object({clientId:z.string().max(100),csrf:z.string().max(150).optional(),events:z.array(z.object({id:z.string().min(1).max(100),time:z.string().max(40),level:z.enum(['debug','info','warn','error']),event:z.string().min(1).max(80),message:z.string().max(2500).optional(),context:z.record(z.string(),z.unknown()).optional()})).max(30)});
