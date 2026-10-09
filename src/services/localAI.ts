import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import {Image} from 'react-native';
import NativeAI,{type VisionAnalysis} from '../../modules/closet-local-ai/src';
import {persistOriginal,processedPath} from './storage';
import type {DraftAnalysis,Slot} from '../types';

type LocalTag={identifier:string;confidence:number};

const emptyDraft=():DraftAnalysis=>({name:'Nueva prenda',category:'top',subcategory:'',color:'',material:'',style:'',season:'',brand:'',confidence:0});

function normalized(labels:LocalTag[]){return labels.map(item=>item.identifier.toLowerCase()).join(' ')}
function includes(text:string,...terms:string[]){return terms.some(term=>text.includes(term))}

function inferCategory(text:string):{category:Slot;subcategory:string;name:string}{
 if(includes(text,'sneaker','shoe','boot','sandal','footwear','loafer','heel'))return{category:'shoes',subcategory:'Zapatillas',name:'Zapatillas'};
 if(includes(text,'jean','trouser','pant','short','skirt','leggin'))return{category:'bottom',subcategory:includes(text,'jean')?'Vaqueros':'Pantalón',name:includes(text,'jean')?'Vaqueros':'Pantalón'};
 if(includes(text,'hat','cap','beanie','scarf','bag','belt','watch','ring','necklace','bracelet','sock','glasses')){
  const subtype=includes(text,'sock')?'Calcetines':includes(text,'hat','cap','beanie')?'Gorra / gorro':includes(text,'scarf')?'Bufanda':includes(text,'ring')?'Anillo':includes(text,'necklace')?'Collar':includes(text,'bracelet')?'Pulsera':'Accesorio';
  return{category:'accessory',subcategory:subtype,name:subtype};
 }
 if(includes(text,'jacket','coat','blazer','hoodie','sweater','cardigan','shirt','t-shirt','top','dress')){
  const subtype=includes(text,'jacket')?'Chaqueta':includes(text,'coat')?'Abrigo':includes(text,'hoodie')?'Sudadera':includes(text,'sweater','cardigan')?'Jersey':includes(text,'t-shirt')?'Camiseta':includes(text,'shirt')?'Camisa':includes(text,'dress')?'Vestido':'Parte de arriba';
  return{category:'top',subcategory:subtype,name:subtype};
 }
 return{category:'top',subcategory:'',name:'Nueva prenda'};
}

function inferMaterial(text:string){
 if(includes(text,'denim','jean'))return'Denim';
 if(includes(text,'leather','suede'))return'Cuero';
 if(includes(text,'wool'))return'Lana';
 if(includes(text,'cotton'))return'Algodón';
 if(includes(text,'linen'))return'Lino';
 if(includes(text,'silk'))return'Seda';
 return'';
}

function inferStyle(text:string){
 if(includes(text,'sneaker','hoodie','cap','streetwear'))return'Streetwear';
 if(includes(text,'blazer','loafer','shirt','coat'))return'Clásico';
 if(includes(text,'running','sport','athletic'))return'Deportivo';
 return'Casual';
}

function inferSeason(text:string){
 if(includes(text,'coat','jacket','sweater','hoodie','scarf','boot'))return'Otoño / invierno';
 if(includes(text,'short','sandal','t-shirt','linen'))return'Primavera / verano';
 return'Todo el año';
}

export async function modelStatus(){
 try{return await NativeAI?.status()??{foreground:false,tags:false,platform:'not-installed'}}catch{return{foreground:false,tags:false,platform:'not-available'}}
}

/** Runs inside iOS Vision. A safe local PNG copy is used when Vision cannot isolate foreground. */
export async function removeBackground(uri:string,userId:number){
 const destination=await processedPath(userId);
 if(NativeAI){
  try{return await NativeAI.removeBackground(uri,destination)}catch(error){console.info('Local foreground extraction unavailable; keeping local image.',error)}
 }
 const rendered=await ImageManipulator.manipulateAsync(uri,[],{format:ImageManipulator.SaveFormat.PNG,compress:1});
 await FileSystem.copyAsync({from:rendered.uri,to:destination});
 return destination;
}

export async function analyzeGarment(uri:string):Promise<DraftAnalysis>{
 const fallback=emptyDraft();
 if(!NativeAI)return fallback;
 try{
  const response:VisionAnalysis=await NativeAI.analyze(uri);
  const labels=response.labels||[];
  const text=normalized(labels);
  const category=inferCategory(text);
  return{name:category.name,category:category.category,subcategory:category.subcategory,color:response.dominantColor||'',material:inferMaterial(text),style:inferStyle(text),season:inferSeason(text),brand:'',confidence:labels[0]?.confidence||0};
 }catch(error){console.info('Local Vision labels unavailable.',error);return fallback}
}

export type OutfitExtraction={id:string;original_uri:string;processed_uri:string;draft:DraftAnalysis};

const outfitZones:{id:string;category:Slot;name:string;crop:(width:number,height:number)=>ImageManipulator.ActionCrop}[]=[
 {id:'accessory',category:'accessory',name:'Accesorio visible',crop:(width,height)=>({crop:{originX:Math.round(width*.2),originY:Math.round(height*.02),width:Math.round(width*.6),height:Math.round(height*.22)}})},
 {id:'top',category:'top',name:'Parte de arriba',crop:(width,height)=>({crop:{originX:Math.round(width*.1),originY:Math.round(height*.19),width:Math.round(width*.8),height:Math.round(height*.34)}})},
 {id:'bottom',category:'bottom',name:'Parte de abajo',crop:(width,height)=>({crop:{originX:Math.round(width*.14),originY:Math.round(height*.49),width:Math.round(width*.72),height:Math.round(height*.3)}})},
 {id:'shoes',category:'shoes',name:'Calzado',crop:(width,height)=>({crop:{originX:Math.round(width*.12),originY:Math.round(height*.78),width:Math.round(width*.76),height:Math.max(1,Math.round(height*.2))}})}
];

function imageSize(uri:string){return new Promise<{width:number;height:number}>((resolve,reject)=>Image.getSize(uri,(width,height)=>resolve({width,height}),reject))}

/**
 * Local beta: it preserves the visible pixels of a full-body outfit photograph,
 * separates its usual zones, then applies the same on-device foreground removal
 * and label proposal used for individual pieces. It deliberately never invents
 * hidden details of a garment.
 */
export async function extractOutfitPieces(uri:string,userId:number):Promise<OutfitExtraction[]>{
 const {width,height}=await imageSize(uri);
 if(height<width*1.05)throw new Error('Usa una foto vertical donde se vea el outfit completo, de cabeza a zapatos.');
 const pieces:OutfitExtraction[]=[];
 for(const zone of outfitZones){
  const crop=await ImageManipulator.manipulateAsync(uri,[zone.crop(width,height)],{format:ImageManipulator.SaveFormat.PNG,compress:1});
  const original=await persistOriginal(crop.uri,userId);
  const processed=await removeBackground(original,userId);
  const suggested=await analyzeGarment(original);
  pieces.push({id:zone.id,original_uri:original,processed_uri:processed,draft:{...suggested,category:zone.category,name:suggested.name==='Nueva prenda'?zone.name:suggested.name,subcategory:suggested.subcategory||zone.name}});
 }
 return pieces;
}

/** The model is embedded in the iPhone build; remote model downloads are intentionally unsupported. */
export async function installModelFromUri(_kind:'background'|'tags',_source:string){
 throw new Error('Closet Local no descarga modelos: la IA se incluye y se ejecuta dentro del dispositivo.');
}
