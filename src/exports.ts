import {zipSync,strToU8} from 'fflate';
import {exportName} from '../shared/selection';
export function download(blob:Blob,name:string){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export function downloadFiles(files:Record<string,Uint8Array>,archiveName:string){const entries=Object.entries(files);if(entries.length===1)download(new Blob([entries[0][1] as BlobPart]),entries[0][0]);else download(new Blob([zipSync(files) as BlobPart],{type:'application/zip'}),archiveName+'.zip');}
async function raster(svg:string){const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=Math.max(image.width,1600);c.height=c.width*image.height/image.width;const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(url);}}
export async function pageFiles(pages:string[],format:string,title:string):Promise<Record<string,Uint8Array>>{
 if(!pages.length)throw Error('notationFailed');const name=exportName(title);
 if(format==='svg')return Object.fromEntries(pages.map((p,i)=>[`${name}${pages.length>1?' - '+(i+1):''}.svg`,strToU8(p)]));
 if(format==='pdf'){
  const {jsPDF}=await import('jspdf');const pdf=new jsPDF({unit:'mm',format:'a4'});
  for(let i=0;i<pages.length;i++){if(i)pdf.addPage();const c=await raster(pages[i]);const width=Math.min(190,277*c.width/c.height);pdf.addImage(c.toDataURL('image/png'),'PNG',10,10,width,width*c.height/c.width);}
  return {[`${name}.pdf`]:new Uint8Array(pdf.output('arraybuffer'))};
 }
 const files:Record<string,Uint8Array>={};for(let i=0;i<pages.length;i++){const c=await raster(pages[i]);const b=await new Promise<Blob>(resolve=>c.toBlob(blob=>resolve(blob!),'image/png'));files[`${name}${pages.length>1?' - '+(i+1):''}.png`]=new Uint8Array(await b.arrayBuffer());}return files;
}
