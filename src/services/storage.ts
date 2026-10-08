import * as FileSystem from 'expo-file-system';
const root=`${FileSystem.documentDirectory}closet/`;
export async function initStorage(){for(const p of [root,`${root}originals/`,`${root}processed/`,`${root}exports/`]){const i=await FileSystem.getInfoAsync(p);if(!i.exists)await FileSystem.makeDirectoryAsync(p,{intermediates:true})}}
export async function persistOriginal(uri:string,userId:number){const dir=`${root}originals/${userId}/`;await FileSystem.makeDirectoryAsync(dir,{intermediates:true});const target=`${dir}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;await FileSystem.copyAsync({from:uri,to:target});return target}
export async function processedPath(userId:number){const dir=`${root}processed/${userId}/`;await FileSystem.makeDirectoryAsync(dir,{intermediates:true});return `${dir}${Date.now()}-${Math.random().toString(36).slice(2)}.png`}
export async function exportPath(){return `${root}exports/look-${Date.now()}.png`}
export async function backupPath(){await initStorage();return `${root}exports/closet-local-backup-${Date.now()}.json`}
export async function restoredImagePath(userId:number,kind:'originals'|'processed',extension:string){const dir=`${root}${kind}/${userId}/`;await FileSystem.makeDirectoryAsync(dir,{intermediates:true});return `${dir}restore-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`}
