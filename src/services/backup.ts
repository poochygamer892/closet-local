import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {database,localBackupSnapshot,replaceLocalBackup,type ImportedImageUris,type LocalBackupSnapshot} from '../db/database';
import {backupPath,restoredImagePath} from './storage';

const FORMAT='closet-local-backup';
const VERSION=1;

type BackupImageData={original_base64:string;original_extension:string;processed_base64:string;processed_extension:string};
export type LocalBackupFile={format:string;version:number;created_at:string;snapshot:LocalBackupSnapshot;images:Record<string,BackupImageData>};

function extension(uri:string,fallback:string){const match=uri.split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/);return match?.[1]?.toLowerCase()||fallback}
function validExtension(value:string,fallback:string){return /^[a-z0-9]{1,5}$/i.test(value)?value.toLowerCase():fallback}
function isArray(value:unknown){return Array.isArray(value)}

function validate(value:unknown):LocalBackupFile{
 const backup=value as Partial<LocalBackupFile>;
 if(backup?.format!==FORMAT||backup.version!==VERSION||!backup.snapshot||!backup.images)throw new Error('Este archivo no es una copia válida de Closet Local.');
 const snapshot=backup.snapshot as LocalBackupSnapshot;
 if(!isArray(snapshot.garments)||!isArray(snapshot.garment_images)||!isArray(snapshot.wears)||!isArray(snapshot.outfits)||!isArray(snapshot.outfit_items)||!isArray(snapshot.packing_lists)||!isArray(snapshot.packing_items))throw new Error('La copia de seguridad está incompleta.');
 return backup as LocalBackupFile;
}

export async function createLocalBackup(userId:number){
 const snapshot=localBackupSnapshot(userId);
 const images:Record<string,BackupImageData>={};
 // Image locations are read separately so the portable backup never contains
 // the previous phone's private file paths.
 const paths=await imagePathsForOwner(userId);
 for(const image of snapshot.garment_images){
  const location=paths[image.id];
  if(!location)throw new Error('Falta una fotografía local. No se ha creado la copia.');
  images[String(image.id)]={
   original_base64:await FileSystem.readAsStringAsync(location.original_uri,{encoding:FileSystem.EncodingType.Base64}),
   original_extension:extension(location.original_uri,'jpg'),
   processed_base64:await FileSystem.readAsStringAsync(location.processed_uri,{encoding:FileSystem.EncodingType.Base64}),
   processed_extension:extension(location.processed_uri,'png')
  };
 }
 const payload:LocalBackupFile={format:FORMAT,version:VERSION,created_at:new Date().toISOString(),snapshot,images};
 const path=await backupPath();
 await FileSystem.writeAsStringAsync(path,JSON.stringify(payload),{encoding:FileSystem.EncodingType.UTF8});
 return path;
}

async function imagePathsForOwner(userId:number){
 // Only this query needs image URIs; snapshots intentionally omit them.
 const rows=database.raw.getAllSync<{id:number;original_uri:string;processed_uri:string}>('SELECT gi.id,gi.original_uri,gi.processed_uri FROM garment_images gi JOIN garments g ON g.id=gi.garment_id WHERE g.user_id=?',userId);
 return Object.fromEntries(rows.map(row=>[row.id,row]));
}

export async function shareLocalBackup(userId:number){
 const path=await createLocalBackup(userId);
 if(!(await Sharing.isAvailableAsync()))throw new Error('No se puede abrir la hoja de compartir en este dispositivo.');
 await Sharing.shareAsync(path,{mimeType:'application/json',UTI:'public.json',dialogTitle:'Guardar copia de Closet Local'});
 return path;
}

export async function readLocalBackup(uri:string){
 const text=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.UTF8});
 try{return validate(JSON.parse(text))}catch(error){if(error instanceof Error)throw error;throw new Error('No se pudo leer la copia de seguridad.');}
}

export function backupSummary(backup:LocalBackupFile){return{garments:backup.snapshot.garments.length,outfits:backup.snapshot.outfits.length,packingLists:backup.snapshot.packing_lists.length}}

export async function restoreLocalBackup(userId:number,backup:LocalBackupFile){
 const materialised:ImportedImageUris={};
 for(const image of backup.snapshot.garment_images){
  const data=backup.images[String(image.id)];
  if(!data?.original_base64||!data?.processed_base64)throw new Error('La copia tiene fotografías incompletas.');
  const original=await restoredImagePath(userId,'originals',validExtension(data.original_extension,'jpg'));
  const processed=await restoredImagePath(userId,'processed',validExtension(data.processed_extension,'png'));
  await FileSystem.writeAsStringAsync(original,data.original_base64,{encoding:FileSystem.EncodingType.Base64});
  await FileSystem.writeAsStringAsync(processed,data.processed_base64,{encoding:FileSystem.EncodingType.Base64});
  materialised[image.id]={original_uri:original,processed_uri:processed};
 }
 replaceLocalBackup(userId,backup.snapshot,materialised);
}
