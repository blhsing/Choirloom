declare module 'verovio/wasm' { const create:()=>Promise<any>;export default create; }
declare module 'verovio/esm' { export class VerovioToolkit {constructor(module:any);setOptions(options:any):void;loadData(data:string):boolean;getPageCount():number;renderToSVG(page:number):string;destroy():void;} }
