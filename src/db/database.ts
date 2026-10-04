import * as SQLite from 'expo-sqlite';
import type {Garment, OutfitItem} from '../types';

const db=SQLite.openDatabaseSync('closet-local.db');
export function migrate(){db.execSync(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS garments(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,category TEXT NOT NULL,subcategory TEXT,color TEXT,material TEXT,style TEXT,season TEXT,brand TEXT,price REAL,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS garment_images(id INTEGER PRIMARY KEY,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,original_uri TEXT NOT NULL,processed_uri TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wears(id INTEGER PRIMARY KEY,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,worn_on TEXT NOT NULL,UNIQUE(garment_id,worn_on));
CREATE TABLE IF NOT EXISTS outfits(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS outfit_items(id INTEGER PRIMARY KEY,outfit_id INTEGER NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,slot TEXT NOT NULL,accessory_type TEXT,jewelry_type TEXT,layer_index INTEGER NOT NULL DEFAULT 0,x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,scale REAL NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS packing_lists(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,destination TEXT,starts_on TEXT,ends_on TEXT);
CREATE TABLE IF NOT EXISTS packing_items(id INTEGER PRIMARY KEY,packing_list_id INTEGER NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,packed INTEGER NOT NULL DEFAULT 0,UNIQUE(packing_list_id,garment_id));
CREATE INDEX IF NOT EXISTS idx_garments_user ON garments(user_id,archived);
CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_packing_user ON packing_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_wears_garment ON wears(garment_id,worn_on);
`)}

export const database={
 raw:db,
 createUser:(email:string,name:string,hash:string,salt:string)=>{const r=db.runSync('INSERT INTO users(email,display_name,password_hash,password_salt) VALUES(?,?,?,?)',email.toLowerCase(),name,hash,salt);return Number(r.lastInsertRowId)},
 userByEmail:(email:string)=>db.getFirstSync<{id:number;email:string;display_name:string;password_hash:string;password_salt:string}>('SELECT * FROM users WHERE email=?',email.toLowerCase()),
 garments:(userId:number)=>db.getAllSync<Garment>(`SELECT g.*,gi.processed_uri image_uri,COUNT(w.id) wear_count,CASE WHEN g.price IS NOT NULL AND COUNT(w.id)>0 THEN ROUND(g.price/COUNT(w.id),2) END cost_per_wear FROM garments g LEFT JOIN garment_images gi ON gi.garment_id=g.id AND gi.sort_order=0 LEFT JOIN wears w ON w.garment_id=g.id WHERE g.user_id=? AND g.archived=0 GROUP BY g.id ORDER BY g.created_at DESC`,userId),
 createGarment:(userId:number,g:Omit<Garment,'id'|'user_id'|'wear_count'|'cost_per_wear'|'image_uri'>,images:{original_uri:string;processed_uri:string}[])=>db.withTransactionSync(()=>{const r=db.runSync('INSERT INTO garments(user_id,name,category,subcategory,color,material,style,season,brand,price) VALUES(?,?,?,?,?,?,?,?,?,?)',userId,g.name,g.category,g.subcategory||null,g.color||null,g.material||null,g.style||null,g.season||null,g.brand||null,g.price||null);const id=Number(r.lastInsertRowId);images.forEach((x,i)=>db.runSync('INSERT INTO garment_images(garment_id,original_uri,processed_uri,sort_order) VALUES(?,?,?,?)',id,x.original_uri,x.processed_uri,i));return id}),
 wearToday:(userId:number,id:number)=>{const owned=db.getFirstSync('SELECT 1 FROM garments WHERE id=? AND user_id=?',id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync("INSERT OR IGNORE INTO wears(garment_id,worn_on) VALUES(?,date('now','localtime'))",id)},
 saveOutfit:(userId:number,name:string,items:OutfitItem[])=>db.withTransactionSync(()=>{const r=db.runSync('INSERT INTO outfits(user_id,name) VALUES(?,?)',userId,name);const id=Number(r.lastInsertRowId);items.forEach(i=>{const owned=db.getFirstSync('SELECT 1 FROM garments WHERE id=? AND user_id=?',i.garment.id,userId);if(!owned)throw new Error('Prenda no autorizada');db.runSync('INSERT INTO outfit_items(outfit_id,garment_id,slot,layer_index,x,y,scale) VALUES(?,?,?,?,?,?,?)',id,i.garment.id,i.slot,i.layer,i.x,i.y,i.scale)});return id}),
 createPackingList:(userId:number,name:string,destination:string,garmentIds:number[])=>db.withTransactionSync(()=>{const r=db.runSync('INSERT INTO packing_lists(user_id,name,destination) VALUES(?,?,?)',userId,name,destination);const id=Number(r.lastInsertRowId);[...new Set(garmentIds)].forEach(g=>db.runSync('INSERT INTO packing_items(packing_list_id,garment_id) SELECT ?,id FROM garments WHERE id=? AND user_id=?',id,g,userId));return id})
};
