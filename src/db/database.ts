import * as SQLite from 'expo-sqlite';
import type {Garment,GarmentImage,Outfit,OutfitItem} from '../types';

const db=SQLite.openDatabaseSync('closet-local.db');
export function migrate(){db.execSync(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS garments(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,category TEXT NOT NULL,subcategory TEXT,color TEXT,material TEXT,style TEXT,season TEXT,brand TEXT,price REAL,notes TEXT,favorite INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS garment_images(id INTEGER PRIMARY KEY,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,original_uri TEXT NOT NULL,processed_uri TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wears(id INTEGER PRIMARY KEY,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,worn_on TEXT NOT NULL,UNIQUE(garment_id,worn_on));
CREATE TABLE IF NOT EXISTS outfits(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS outfit_items(id INTEGER PRIMARY KEY,outfit_id INTEGER NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,slot TEXT NOT NULL,accessory_type TEXT,jewelry_type TEXT,layer_index INTEGER NOT NULL DEFAULT 0,x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,scale REAL NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS idx_garments_user ON garments(user_id,archived);
CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_wears_garment ON wears(garment_id,worn_on);
`);
 ensureColumn('garments','notes','TEXT');
 ensureColumn('garments','favorite','INTEGER NOT NULL DEFAULT 0');
}

function ensureColumn(table:string,column:string,definition:string){
 const columns=db.getAllSync<{name:string}>(`PRAGMA table_info(${table})`);
 if(!columns.some(item=>item.name===column))db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** A private, on-device owner for installations that do not use accounts. */
export function ensureLocalOwner(){
 const email='closet-local@this-device.invalid';
 db.runSync('INSERT OR IGNORE INTO users(email,display_name,password_hash,password_salt) VALUES(?,?,?,?)',email,'Mi armario local','not-used','not-used');
 const owner=db.getFirstSync<{id:number}>('SELECT id FROM users WHERE email=?',email);
 if(!owner)throw new Error('No se pudo inicializar el armario local.');
 return owner.id;
}

type BackupGarment={id:number;name:string;category:string;subcategory:string|null;color:string|null;material:string|null;style:string|null;season:string|null;brand:string|null;price:number|null;archived:number;created_at:string};
type BackupImage={id:number;garment_id:number;sort_order:number};
type BackupWear={garment_id:number;worn_on:string};
type BackupOutfit={id:number;name:string;notes:string|null;created_at:string};
type BackupOutfitItem={outfit_id:number;garment_id:number;slot:string;accessory_type:string|null;jewelry_type:string|null;layer_index:number;x:number;y:number;scale:number};

export type LocalBackupSnapshot={garments:BackupGarment[];garment_images:BackupImage[];wears:BackupWear[];outfits:BackupOutfit[];outfit_items:BackupOutfitItem[];};
export type ImportedImageUris=Record<number,{original_uri:string;processed_uri:string}>;

export function localBackupSnapshot(userId:number):LocalBackupSnapshot{return{
 garments:db.getAllSync<BackupGarment>('SELECT id,name,category,subcategory,color,material,style,season,brand,price,archived,created_at FROM garments WHERE user_id=? ORDER BY id',userId),
 garment_images:db.getAllSync<BackupImage>('SELECT id,garment_id,sort_order FROM garment_images WHERE garment_id IN (SELECT id FROM garments WHERE user_id=?) ORDER BY id',userId),
 wears:db.getAllSync<BackupWear>('SELECT garment_id,worn_on FROM wears WHERE garment_id IN (SELECT id FROM garments WHERE user_id=?) ORDER BY id',userId),
 outfits:db.getAllSync<BackupOutfit>('SELECT id,name,notes,created_at FROM outfits WHERE user_id=? ORDER BY id',userId),
 outfit_items:db.getAllSync<BackupOutfitItem>('SELECT outfit_id,garment_id,slot,accessory_type,jewelry_type,layer_index,x,y,scale FROM outfit_items WHERE outfit_id IN (SELECT id FROM outfits WHERE user_id=?) ORDER BY id',userId)
}}

export function replaceLocalBackup(userId:number,snapshot:LocalBackupSnapshot,images:ImportedImageUris){db.withTransactionSync(()=>{
 db.runSync('DELETE FROM outfits WHERE user_id=?',userId);
 db.runSync('DELETE FROM garments WHERE user_id=?',userId);
 const garments=new Map<number,number>();
 snapshot.garments.forEach(g=>{const r=db.runSync('INSERT INTO garments(user_id,name,category,subcategory,color,material,style,season,brand,price,archived,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',userId,g.name,g.category,g.subcategory,g.color,g.material,g.style,g.season,g.brand,g.price,g.archived,g.created_at);garments.set(g.id,Number(r.lastInsertRowId))});
 snapshot.garment_images.forEach(image=>{const garmentId=garments.get(image.garment_id),paths=images[image.id];if(!garmentId||!paths)throw new Error('La copia de seguridad contiene una imagen inválida.');db.runSync('INSERT INTO garment_images(garment_id,original_uri,processed_uri,sort_order) VALUES(?,?,?,?)',garmentId,paths.original_uri,paths.processed_uri,image.sort_order)});
 snapshot.wears.forEach(wear=>{const garmentId=garments.get(wear.garment_id);if(!garmentId)throw new Error('La copia de seguridad contiene una puesta inválida.');db.runSync('INSERT OR IGNORE INTO wears(garment_id,worn_on) VALUES(?,?)',garmentId,wear.worn_on)});
 const outfits=new Map<number,number>();
 snapshot.outfits.forEach(outfit=>{const r=db.runSync('INSERT INTO outfits(user_id,name,notes,created_at) VALUES(?,?,?,?)',userId,outfit.name,outfit.notes,outfit.created_at);outfits.set(outfit.id,Number(r.lastInsertRowId))});
 snapshot.outfit_items.forEach(item=>{const outfitId=outfits.get(item.outfit_id),garmentId=garments.get(item.garment_id);if(!outfitId||!garmentId)throw new Error('La copia de seguridad contiene un look inválido.');db.runSync('INSERT INTO outfit_items(outfit_id,garment_id,slot,accessory_type,jewelry_type,layer_index,x,y,scale) VALUES(?,?,?,?,?,?,?,?,?)',outfitId,garmentId,item.slot,item.accessory_type,item.jewelry_type,item.layer_index,item.x,item.y,item.scale)});
})}

export const database={
 raw:db,
 createUser:(email:string,name:string,hash:string,salt:string)=>{const r=db.runSync('INSERT INTO users(email,display_name,password_hash,password_salt) VALUES(?,?,?,?)',email.toLowerCase(),name,hash,salt);return Number(r.lastInsertRowId)},
 userByEmail:(email:string)=>db.getFirstSync<{id:number;email:string;display_name:string;password_hash:string;password_salt:string}>('SELECT * FROM users WHERE email=?',email.toLowerCase()),
 garments:(userId:number)=>db.getAllSync<Garment>(`SELECT g.*,(SELECT processed_uri FROM garment_images WHERE garment_id=g.id ORDER BY sort_order LIMIT 1) image_uri,(SELECT COUNT(*) FROM garment_images WHERE garment_id=g.id) image_count,(SELECT COUNT(*) FROM wears WHERE garment_id=g.id) wear_count,CASE WHEN g.price IS NOT NULL AND (SELECT COUNT(*) FROM wears WHERE garment_id=g.id)>0 THEN ROUND(g.price/(SELECT COUNT(*) FROM wears WHERE garment_id=g.id),2) END cost_per_wear FROM garments g WHERE g.user_id=? AND g.archived=0 ORDER BY g.favorite DESC,g.created_at DESC`,userId),
 garment:(userId:number,id:number)=>db.getFirstSync<Garment>(`SELECT g.*,(SELECT processed_uri FROM garment_images WHERE garment_id=g.id ORDER BY sort_order LIMIT 1) image_uri,(SELECT COUNT(*) FROM garment_images WHERE garment_id=g.id) image_count,(SELECT COUNT(*) FROM wears WHERE garment_id=g.id) wear_count,CASE WHEN g.price IS NOT NULL AND (SELECT COUNT(*) FROM wears WHERE garment_id=g.id)>0 THEN ROUND(g.price/(SELECT COUNT(*) FROM wears WHERE garment_id=g.id),2) END cost_per_wear FROM garments g WHERE g.user_id=? AND g.id=? AND g.archived=0`,userId,id),
 garmentImages:(userId:number,id:number)=>db.getAllSync<GarmentImage>('SELECT gi.* FROM garment_images gi JOIN garments g ON g.id=gi.garment_id WHERE gi.garment_id=? AND g.user_id=? ORDER BY gi.sort_order',id,userId),
 createGarment:(userId:number,g:Omit<Garment,'id'|'user_id'|'wear_count'|'cost_per_wear'|'image_uri'>,images:{original_uri:string;processed_uri:string}[])=>db.withTransactionSync(()=>{const r=db.runSync('INSERT INTO garments(user_id,name,category,subcategory,color,material,style,season,brand,price) VALUES(?,?,?,?,?,?,?,?,?,?)',userId,g.name,g.category,g.subcategory||null,g.color||null,g.material||null,g.style||null,g.season||null,g.brand||null,g.price||null);const id=Number(r.lastInsertRowId);images.forEach((x,i)=>db.runSync('INSERT INTO garment_images(garment_id,original_uri,processed_uri,sort_order) VALUES(?,?,?,?)',id,x.original_uri,x.processed_uri,i));return id}),
 updateGarment:(userId:number,id:number,g:Pick<Garment,'name'|'category'|'subcategory'|'color'|'material'|'style'|'season'|'brand'|'price'|'notes'>)=>{const owned=db.getFirstSync('SELECT 1 FROM garments WHERE id=? AND user_id=?',id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync('UPDATE garments SET name=?,category=?,subcategory=?,color=?,material=?,style=?,season=?,brand=?,price=?,notes=? WHERE id=? AND user_id=?',g.name,g.category,g.subcategory||null,g.color||null,g.material||null,g.style||null,g.season||null,g.brand||null,g.price||null,g.notes||null,id,userId)},
 toggleFavorite:(userId:number,id:number)=>{const owned=db.getFirstSync<{favorite:number}>('SELECT favorite FROM garments WHERE id=? AND user_id=?',id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync('UPDATE garments SET favorite=? WHERE id=? AND user_id=?',owned.favorite?0:1,id,userId)},
 archiveGarment:(userId:number,id:number)=>db.runSync('UPDATE garments SET archived=1 WHERE id=? AND user_id=?',id,userId),
 wearToday:(userId:number,id:number)=>{const owned=db.getFirstSync('SELECT 1 FROM garments WHERE id=? AND user_id=?',id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync("INSERT OR IGNORE INTO wears(garment_id,worn_on) VALUES(?,date('now','localtime'))",id)},
 outfits:(userId:number)=>db.getAllSync<Outfit>(`SELECT o.*,(SELECT COUNT(*) FROM outfit_items WHERE outfit_id=o.id) item_count,(SELECT gi.processed_uri FROM outfit_items oi JOIN garment_images gi ON gi.garment_id=oi.garment_id AND gi.sort_order=0 WHERE oi.outfit_id=o.id ORDER BY oi.layer_index LIMIT 1) image_uri FROM outfits o WHERE o.user_id=? ORDER BY o.created_at DESC`,userId),
 outfitItems:(userId:number,outfitId:number)=>db.getAllSync<any>(`SELECT oi.*,g.user_id,g.name,g.category,g.subcategory,g.color,g.material,g.style,g.season,g.brand,g.price,g.notes,g.favorite,(SELECT processed_uri FROM garment_images WHERE garment_id=g.id ORDER BY sort_order LIMIT 1) image_uri,(SELECT COUNT(*) FROM wears WHERE garment_id=g.id) wear_count,CASE WHEN g.price IS NOT NULL AND (SELECT COUNT(*) FROM wears WHERE garment_id=g.id)>0 THEN ROUND(g.price/(SELECT COUNT(*) FROM wears WHERE garment_id=g.id),2) END cost_per_wear FROM outfit_items oi JOIN outfits o ON o.id=oi.outfit_id JOIN garments g ON g.id=oi.garment_id WHERE oi.outfit_id=? AND o.user_id=? ORDER BY oi.layer_index`,outfitId,userId).map(row=>({garment:{id:row.garment_id,user_id:row.user_id,name:row.name,category:row.category,subcategory:row.subcategory,color:row.color,material:row.material,style:row.style,season:row.season,brand:row.brand,price:row.price,notes:row.notes,favorite:row.favorite,image_uri:row.image_uri,wear_count:row.wear_count,cost_per_wear:row.cost_per_wear},slot:row.slot,layer:row.layer_index,x:row.x,y:row.y,scale:row.scale,accessoryType:row.accessory_type,jewelryType:row.jewelry_type} as OutfitItem)),
 deleteOutfit:(userId:number,id:number)=>db.runSync('DELETE FROM outfits WHERE id=? AND user_id=?',id,userId),
 saveOutfit:(userId:number,name:string,items:OutfitItem[])=>db.withTransactionSync(()=>{const r=db.runSync('INSERT INTO outfits(user_id,name) VALUES(?,?)',userId,name.trim()||'Look sin nombre');const id=Number(r.lastInsertRowId);items.forEach(i=>{const owned=db.getFirstSync('SELECT 1 FROM garments WHERE id=? AND user_id=?',i.garment.id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync('INSERT INTO outfit_items(outfit_id,garment_id,slot,accessory_type,jewelry_type,layer_index,x,y,scale) VALUES(?,?,?,?,?,?,?,?,?)',id,i.garment.id,i.slot,i.accessoryType||null,i.jewelryType||null,i.layer,i.x,i.y,i.scale)});return id})
};
