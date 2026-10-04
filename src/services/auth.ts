import * as Crypto from 'expo-crypto';import * as SecureStore from 'expo-secure-store';import {pbkdf2} from '@noble/hashes/pbkdf2';import {sha256} from '@noble/hashes/sha256';import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils';import {database} from '../db/database';
const KEY='closet.currentUser';
const digest=(password:string,salt:string)=>bytesToHex(pbkdf2(sha256,utf8ToBytes(password),utf8ToBytes(salt),{c:210000,dkLen:32}));
export async function register(email:string,name:string,password:string){if(password.length<8)throw new Error('La contraseña debe tener 8 caracteres');const salt=Crypto.randomUUID()+Crypto.randomUUID();const id=database.createUser(email,name,digest(password,salt),salt);await SecureStore.setItemAsync(KEY,String(id));return id}
export async function login(email:string,password:string){const u=database.userByEmail(email);if(!u||digest(password,u.password_salt)!==u.password_hash)throw new Error('Credenciales incorrectas');await SecureStore.setItemAsync(KEY,String(u.id));return u.id}
export async function session(){const id=await SecureStore.getItemAsync(KEY);return id?Number(id):null}export async function logout(){await SecureStore.deleteItemAsync(KEY)}
