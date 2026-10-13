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

function looksLikeHuman(response:VisionAnalysis){
 const text=normalized(response.labels||[]);
 return includes(text,'person','human','man','woman','face','portrait','model','body');
}

async function generateIsolatedGarment(sources:string[],destination:string,prompt:string){
 if(!NativeAI?.generateFlatLay)throw new Error('El generador local de prendas no está incluido en esta compilación.');
 let output=await NativeAI.generateFlatLay(sources,destination,prompt);
 // A worn outfit can still win the first diffusion pass. Check the result
 // locally and spend one extra pass only when Vision sees a person in it.
 for(let attempt=0;attempt<2;attempt++){
  let human=false;
  try{human=looksLikeHuman(await NativeAI.analyze(output));}catch{return output}
  if(!human)return output;
  if(attempt===0){
   output=await NativeAI.generateFlatLay(sources,destination,`${prompt}, flat-lay garment catalog cutout, absolutely no human figure`);
  }
 }
 throw new Error('El generador local todavía ve una persona; no se guardó un recorte humano.');
}

function reconstructionPrompt(description:string){
 return `single clothing product, ${description || 'garment'}, reconstructed from the reference views board, use all views to infer one complete item, laid perfectly flat and fully visible on a clean warm-white studio background, front-facing ecommerce catalog photograph, centered with generous margins, preserve the exact garment color, silhouette, seams, pockets, hardware, logos and visible pattern from the references, remove the person and reconstruct any hidden parts naturally, output one item only, no collage, no multiple views, no person, no human, no body, no torso, no legs, no face, no head, no hands, no arms, no feet, no skin, no mannequin, no hanger, no room, no mirror, no background clutter, no text, no watermark`;
}

export type OutfitImage={original_uri:string;processed_uri:string};
export type OutfitExtraction={id:string;original_uri:string;processed_uri:string;images?:OutfitImage[];draft:DraftAnalysis};
export type OutfitPhotoKind='flat'|'worn';

function imageSize(uri:string){return new Promise<{width:number;height:number}>((resolve,reject)=>Image.getSize(uri,(width,height)=>resolve({width,height}),reject))}

async function extractWornPieces(uris:string[],userId:number):Promise<OutfitExtraction[]>{
 const uri=uris[0];
 if(!uri)throw new Error('Selecciona al menos una vista del outfit.');
 const {width,height}=await imageSize(uri);
 // These are reference bands only. The saved image is always produced by the
 // local diffusion pass; the crop must never be presented as the final garment.
 const bands:{id:string;category:Slot;name:string;crop:ImageManipulator.ActionCrop}[]=[
  {id:'worn-top',category:'top',name:'Parte de arriba visible',crop:{crop:{originX:Math.round(width*.08),originY:Math.round(height*.18),width:Math.round(width*.84),height:Math.max(1,Math.round(height*.36))}}},
  {id:'worn-bottom',category:'bottom',name:'Parte de abajo visible',crop:{crop:{originX:Math.round(width*.12),originY:Math.round(height*.49),width:Math.round(width*.76),height:Math.max(1,Math.round(height*.34))}}},
  {id:'worn-shoes',category:'shoes',name:'Calzado visible',crop:{crop:{originX:Math.round(width*.1),originY:Math.round(height*.77),width:Math.round(width*.8),height:Math.max(1,Math.round(height*.23))}}}
 ];
 const pieces:OutfitExtraction[]=[];
 for(const band of bands){
  const references:{original:string;draft:DraftAnalysis}[]=[];
  for(const viewUri of uris){
   const viewSize=await imageSize(viewUri);
   const scaleX=viewSize.width/width;
   const scaleY=viewSize.height/height;
   const cropAction=band.crop.crop;
   const crop=await ImageManipulator.manipulateAsync(viewUri,[{crop:{originX:Math.max(0,Math.round(cropAction.originX*scaleX)),originY:Math.max(0,Math.round(cropAction.originY*scaleY)),width:Math.max(1,Math.min(viewSize.width-Math.round(cropAction.originX*scaleX),Math.round(cropAction.width*scaleX))),height:Math.max(1,Math.min(viewSize.height-Math.round(cropAction.originY*scaleY),Math.round(cropAction.height*scaleY)))}}],{format:ImageManipulator.SaveFormat.PNG,compress:1});
   const original=await persistOriginal(crop.uri,userId);
   const suggested=await analyzeGarment(original);
   references.push({original,draft:suggested});
  }
  if(!references.length)throw new Error(`No se pudieron preparar las vistas de ${band.name.toLowerCase()}.`);
  const destination=await processedPath(userId);
  const descriptions=references.flatMap(reference=>[reference.draft.subcategory,reference.draft.color,reference.draft.material]).filter(Boolean);
  const description=[band.name,...Array.from(new Set(descriptions))].join(', ').toLowerCase();
  // iPhone and Android receive the reference crops and reconstruct them with
  // their bundled local diffusion runtime. Android extracts its MediaPipe
  // checkpoint into app-private storage on first use and never uploads it.
  const processed=NativeAI?.generateFlatLay
   ? await generateIsolatedGarment(references.map(reference=>reference.original),destination,reconstructionPrompt(description))
   : await removeBackground(references[0].original,userId);
  const selected:OutfitImage={original_uri:references[0].original,processed_uri:processed};
  const selectedDraft=references[0].draft;
  {
   const draft=selectedDraft||emptyDraft();
   pieces.push({id:band.id,original_uri:selected.original_uri,processed_uri:selected.processed_uri,images:[selected],draft:{...draft,category:band.category,name:draft.name==='Nueva prenda'?band.name:draft.name,subcategory:draft.subcategory||band.name}});
  }
 }
 return pieces;
}

/**
 * Separate pieces in a flat-lay using individual Vision foreground instances.
 * A worn outfit cannot use foreground extraction: Vision correctly sees one
 * person, not individual clothes, so it is reserved for the local parser.
 */
export async function extractOutfitPieces(uris:string[],userId:number,kind:OutfitPhotoKind):Promise<OutfitExtraction[]>{
 if(!uris.length)throw new Error('Selecciona al menos una foto.');
 if(kind==='worn')return extractWornPieces(uris,userId);
 if(!NativeAI?.extractForegroundInstances)throw new Error('Actualiza a la versión con detector local de prendas separadas.');
 const allInstances:OutfitImage[]=[];
 for(const uri of uris){
  const prefix=await processedPath(userId);
  const instanceUris=await NativeAI.extractForegroundInstances(uri,prefix);
  for(const instanceUri of instanceUris)allInstances.push({original_uri:await persistOriginal(instanceUri,userId),processed_uri:instanceUri});
 }
 if(!allInstances.length)throw new Error('No se han encontrado prendas separadas. Deja espacio entre ellas y prueba con un fondo liso.');
 const pieces:OutfitExtraction[]=[];
 for(const [index,instance] of allInstances.entries()){
  const suggested=await analyzeGarment(instance.original_uri);
  pieces.push({id:`flat-${index}`,original_uri:instance.original_uri,processed_uri:instance.processed_uri,images:[instance],draft:suggested});
 }
 return pieces;
}

/** The model is embedded in the iPhone build; remote model downloads are intentionally unsupported. */
export async function installModelFromUri(_kind:'background'|'tags',_source:string){
 throw new Error('Closet Local no descarga modelos: la IA se incluye y se ejecuta dentro del dispositivo.');
}
