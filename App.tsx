import {useEffect,useState} from 'react';
import {Alert,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {ensureLocalOwner,migrate} from './src/db/database';
import {initStorage} from './src/services/storage';
import {backupSummary,readLocalBackup,restoreLocalBackup,shareLocalBackup} from './src/services/backup';
import {ClosetScreen} from './src/screens/ClosetScreen';
import {LooksScreen} from './src/screens/LooksScreen';
import {PackingScreen} from './src/screens/PackingScreen';
import {AddGarmentScreen} from './src/screens/AddGarmentScreen';

type Tab='closet'|'looks'|'packing'|'device';

export default function App(){
 const [userId,setUserId]=useState<number|undefined>(undefined);
 const [bootError,setBootError]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
 const [tab,setTab]=useState<Tab>('looks');
 const [adding,setAdding]=useState(false);
 const [refresh,setRefresh]=useState(0);

 useEffect(()=>{
  let mounted=true;
  setUserId(undefined);setBootError(null);
  void (async()=>{try{
   migrate();
   await initStorage();
   const owner=ensureLocalOwner();
   if(mounted)setUserId(owner);
  }catch(error){
   console.error('Closet Local boot failed',error);
   if(mounted)setBootError(error instanceof Error?error.message:'No se pudo inicializar el almacenamiento local.');
  }})();
  return()=>{mounted=false};
 },[retry]);

 if(bootError)return <SafeAreaProvider><StatusBar style="dark"/><View style={s.bootError}><Text style={s.bootTitle}>No se pudo abrir Closet Local</Text><Text style={s.bootCopy}>{bootError}</Text><Pressable style={s.retry} onPress={()=>setRetry(x=>x+1)}><Text style={s.retryText}>Reintentar</Text></Pressable></View></SafeAreaProvider>;
 if(userId===undefined)return <View style={{flex:1,backgroundColor:'#fff'}}/>;

 return <SafeAreaProvider><StatusBar style="dark"/><View style={s.app}>
  {tab==='closet'?<ClosetScreen userId={userId} refresh={refresh}/>:tab==='looks'?<LooksScreen userId={userId} refresh={refresh}/>:tab==='packing'?<PackingScreen userId={userId} refresh={refresh}/>:<DeviceScreen userId={userId} restored={()=>setRefresh(x=>x+1)}/>} 
  <View style={s.nav}>{([['packing','Maletas','◇'],['closet','Armario','▢'],['looks','Stylist','✦'],['device','Local','●']]as const).map(([id,label,icon])=><Pressable key={id} onPress={()=>setTab(id)} style={[s.navItem,tab===id&&s.navActive]}><Text style={[s.icon,tab===id&&s.active]}>{icon}</Text><Text style={[s.navText,tab===id&&s.active]}>{label}</Text></Pressable>)}<Pressable style={s.add} onPress={()=>setAdding(true)}><Text style={s.addText}>＋</Text></Pressable></View>
  <Modal visible={adding} animationType="slide"><AddGarmentScreen userId={userId} close={()=>setAdding(false)} saved={()=>setRefresh(x=>x+1)}/></Modal>
 </View></SafeAreaProvider>;
}

function DeviceScreen({userId,restored}:{userId:number;restored:()=>void}){
 const [busy,setBusy]=useState(false);
 const exportBackup=async()=>{setBusy(true);try{await shareLocalBackup(userId)}catch(error){Alert.alert('No se pudo exportar',error instanceof Error?error.message:'No se pudo crear la copia local.')}finally{setBusy(false)}};
 const restoreBackup=async()=>{try{
  const chosen=await DocumentPicker.getDocumentAsync({type:'*/*',multiple:false,copyToCacheDirectory:true});
  if(chosen.canceled||!chosen.assets?.[0])return;
  setBusy(true);
  const backup=await readLocalBackup(chosen.assets[0].uri);
  setBusy(false);
  const summary=backupSummary(backup);
  Alert.alert('Restaurar copia local',`Se sustituirá el armario actual por ${summary.garments} prendas, ${summary.outfits} looks y ${summary.packingLists} maletas.`,[{text:'Cancelar',style:'cancel'},{text:'Restaurar',style:'destructive',onPress:()=>{void (async()=>{setBusy(true);try{await restoreLocalBackup(userId,backup);restored();Alert.alert('Copia restaurada','Tu armario ya está disponible en este iPhone.')}catch(error){Alert.alert('No se pudo restaurar',error instanceof Error?error.message:'La copia no se pudo restaurar.')}finally{setBusy(false)}})()}}]);
 }catch(error){setBusy(false);Alert.alert('No se pudo importar',error instanceof Error?error.message:'Selecciona una copia válida de Closet Local.')}};
 return <ScrollView style={s.device} contentContainerStyle={s.deviceContent}><Text style={s.deviceTitle}>Este iPhone</Text><Text style={s.deviceCopy}>No necesitas crear una cuenta. Tus prendas, fotografías, looks y maletas se guardan solo en este dispositivo.</Text><View style={s.deviceTile}><Text style={s.tileTitle}>Privacidad local</Text><Text style={s.tileCopy}>Sin nube · Sin inicio de sesión · Sin rastreo</Text></View><View style={s.deviceTile}><Text style={s.tileTitle}>Copia de seguridad</Text><Text style={s.tileCopy}>Exporta un archivo con tus prendas, fotos, looks y maletas para llevarlo a otro iPhone.</Text><Pressable disabled={busy} style={[s.backupButton,busy&&s.disabled]} onPress={exportBackup}><Text style={s.backupButtonText}>{busy?'Preparando copia…':'Exportar mi armario'}</Text></Pressable><Pressable disabled={busy} style={[s.importButton,busy&&s.disabled]} onPress={restoreBackup}><Text style={s.importButtonText}>Importar una copia</Text></Pressable></View><Text style={s.backupNote}>La copia incluye tus fotos. Guárdala en Archivos o envíala por AirDrop solo a una persona de confianza.</Text></ScrollView>}

const s=StyleSheet.create({app:{flex:1,backgroundColor:'#fff'},bootError:{flex:1,backgroundColor:'#fff',padding:28,justifyContent:'center'},bootTitle:{fontSize:28,fontWeight:'900',letterSpacing:-.6},bootCopy:{color:'#777',lineHeight:21,marginTop:10},retry:{height:52,marginTop:24,alignItems:'center',justifyContent:'center',backgroundColor:'#050505',borderRadius:26},retryText:{color:'#fff',fontWeight:'900'},nav:{position:'absolute',left:18,right:82,bottom:14,height:70,backgroundColor:'rgba(245,245,247,.96)',borderRadius:35,flexDirection:'row',alignItems:'center',padding:6,shadowColor:'#000',shadowOpacity:.08,shadowRadius:20,shadowOffset:{width:0,height:5}},navItem:{flex:1,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',gap:1},navActive:{backgroundColor:'#fff',shadowColor:'#000',shadowOpacity:.08,shadowRadius:10},icon:{color:'#94949A',fontSize:20},navText:{color:'#94949A',fontSize:10,fontWeight:'700'},active:{color:'#050505'},add:{position:'absolute',right:-66,width:58,height:58,borderRadius:29,backgroundColor:'#050505',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.22,shadowRadius:12,shadowOffset:{width:0,height:5}},addText:{fontSize:34,color:'#fff',marginTop:-4},device:{flex:1,backgroundColor:'#fff'},deviceContent:{padding:25,paddingTop:80,paddingBottom:125},deviceTitle:{fontSize:42,fontWeight:'900',letterSpacing:-1.5},deviceCopy:{fontSize:16,lineHeight:24,color:'#777',marginTop:12},deviceTile:{backgroundColor:'#F5F5F7',borderRadius:20,padding:20,marginTop:20},tileTitle:{fontSize:18,fontWeight:'900'},tileCopy:{fontSize:13,lineHeight:19,color:'#777',marginTop:5},backupButton:{height:48,borderRadius:24,backgroundColor:'#050505',alignItems:'center',justifyContent:'center',marginTop:18},backupButtonText:{color:'#fff',fontWeight:'900'},importButton:{height:48,borderRadius:24,borderWidth:1,borderColor:'#D6D6DA',alignItems:'center',justifyContent:'center',marginTop:10,backgroundColor:'#fff'},importButtonText:{fontWeight:'900'},disabled:{opacity:.45},backupNote:{fontSize:12,lineHeight:18,color:'#8A8A91',paddingHorizontal:4,marginTop:16}});
