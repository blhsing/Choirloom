import {XMLParser,XMLBuilder,XMLValidator} from 'fast-xml-parser';
import {createCanvas,loadImage} from '@napi-rs/canvas';
// Rasterize data-only SVG before handing it to the optical score recognizer.
export async function rasterizeScoreSvg(bytes:Buffer):Promise<Buffer>{
 const xml=bytes.toString('utf8');if(bytes.length>8_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('invalidSvg');
 const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false});const doc=parser.parse(xml),svg=doc.svg;if(!svg||typeof svg!=='object')throw Error('invalidSvg');
 const safeReference=(v:string)=>v.startsWith('#')||/^data:(?:image\/(?:png|jpeg|webp)|font\/(?:woff2?|ttf|otf));base64,[a-z0-9+/=\s]+$/i.test(v);
 const style=(v:string)=>{if(/@import|\\/i.test(v))throw Error('svgExternalResource');for(const match of v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi))if(!safeReference(match[2].trim()))throw Error('svgExternalResource');};
 const inspect=(node:any)=>{if(!node||typeof node!=='object')return;for(const [key,value] of Object.entries(node)){const name=key.replace(/^@_/,'').split(':').at(-1)!.toLowerCase();if(['script','foreignobject','iframe','object','embed'].includes(name)||key.startsWith('@_')&&name.startsWith('on'))throw Error('invalidSvg');if(name==='href'&&typeof value==='string'&&!safeReference(value.trim()))throw Error('svgExternalResource');if(typeof value==='string'&&(key.startsWith('@_')||name==='style'||name==='#text'))style(value);inspect(value);}};inspect(svg);
 const view=String(svg['@_viewBox']||'').trim().split(/[ ,]+/).map(Number);const size=(v:any)=>{const match=String(v||'').match(/^\s*(\d+(?:\.\d+)?)(px|pt|mm|cm|in)?\s*$/i);return match?Number(match[1])*({pt:96/72,mm:96/25.4,cm:96/2.54,in:96}[match[2]?.toLowerCase() as 'pt']||1):NaN;};
 const validView=view.length===4&&view.every(Number.isFinite)&&view[2]>0&&view[3]>0;const width=size(svg['@_width'])||(validView?view[2]:NaN),height=size(svg['@_height'])||(validView?view[3]:NaN);if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('invalidSvg');
 const scale=Math.min(4,5600/Math.max(width,height),Math.sqrt(20_000_000/(width*height)));const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));if(!validView)svg['@_viewBox']=`0 0 ${width} ${height}`;svg['@_width']=String(w);svg['@_height']=String(h);
 // Skia's SVG loader expects SVG 1.1 xlink references for reusable glyphs.
 const references=(node:any)=>{if(!node||typeof node!=='object')return;if(node['@_href']!==undefined){node['@_xlink:href']=node['@_href'];delete node['@_href'];}for(const value of Object.values(node))references(value);};references(svg);svg['@_xmlns']=svg['@_xmlns']||'http://www.w3.org/2000/svg';svg['@_xmlns:xlink']='http://www.w3.org/1999/xlink';
 const image=await loadImage(Buffer.from(new XMLBuilder({ignoreAttributes:false,attributeNamePrefix:'@_'}).build({svg})));const canvas=createCanvas(w,h),context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,w,h);context.drawImage(image,0,0,w,h);return canvas.toBuffer('image/png');
}
