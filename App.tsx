import {useEffect,useState} from 'react';
import {Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ensureLocalOwner,migrate} from './src/db/database';
import {initStorage} from './src/services/storage';
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
  {tab==='closet'?<ClosetScreen userId={userId} refresh={refresh}/>:tab==='looks'?<LooksScreen userId={userId} refresh={refresh}/>:tab==='packing'?<PackingScreen userId={userId} refresh={refresh}/>:<DeviceScreen/>}
  <View style={s.nav}>{([['packing','Maletas','◇'],['closet','Armario','▢'],['looks','Stylist','✦'],['device','Local','●']]as const).map(([id,label,icon])=><Pressable key={id} onPress={()=>setTab(id)} style={[s.navItem,tab===id&&s.navActive]}><Text style={[s.icon,tab===id&&s.active]}>{icon}</Text><Text style={[s.navText,tab===id&&s.active]}>{label}</Text></Pressable>)}<Pressable style={s.add} onPress={()=>setAdding(true)}><Text style={s.addText}>＋</Text></Pressable></View>
  <Modal visible={adding} animationType="slide"><AddGarmentScreen userId={userId} close={()=>setAdding(false)} saved={()=>setRefresh(x=>x+1)}/></Modal>
 </View></SafeAreaProvider>;
}

function DeviceScreen(){return <View style={s.device}><Text style={s.deviceTitle}>Este iPhone</Text><Text style={s.deviceCopy}>No necesitas crear una cuenta. Tus prendas, fotografías, looks y maletas se guardan solo en este dispositivo.</Text><View style={s.deviceTile}><Text style={s.tileTitle}>Privacidad local</Text><Text style={s.tileCopy}>Sin nube · Sin inicio de sesión · Sin rastreo</Text></View><View style={s.deviceTile}><Text style={s.tileTitle}>Un solo armario</Text><Text style={s.tileCopy}>Esta instalación abre directamente tu armario privado.</Text></View></View>}

const s=StyleSheet.create({app:{flex:1,backgroundColor:'#fff'},bootError:{flex:1,backgroundColor:'#fff',padding:28,justifyContent:'center'},bootTitle:{fontSize:28,fontWeight:'900',letterSpacing:-.6},bootCopy:{color:'#777',lineHeight:21,marginTop:10},retry:{height:52,marginTop:24,alignItems:'center',justifyContent:'center',backgroundColor:'#050505',borderRadius:26},retryText:{color:'#fff',fontWeight:'900'},nav:{position:'absolute',left:18,right:82,bottom:14,height:70,backgroundColor:'rgba(245,245,247,.96)',borderRadius:35,flexDirection:'row',alignItems:'center',padding:6,shadowColor:'#000',shadowOpacity:.08,shadowRadius:20,shadowOffset:{width:0,height:5}},navItem:{flex:1,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',gap:1},navActive:{backgroundColor:'#fff',shadowColor:'#000',shadowOpacity:.08,shadowRadius:10},icon:{color:'#94949A',fontSize:20},navText:{color:'#94949A',fontSize:10,fontWeight:'700'},active:{color:'#050505'},add:{position:'absolute',right:-66,width:58,height:58,borderRadius:29,backgroundColor:'#050505',alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.22,shadowRadius:12,shadowOffset:{width:0,height:5}},addText:{fontSize:34,color:'#fff',marginTop:-4},device:{flex:1,padding:25,paddingTop:80},deviceTitle:{fontSize:42,fontWeight:'900',letterSpacing:-1.5},deviceCopy:{fontSize:16,lineHeight:24,color:'#777',marginTop:12},deviceTile:{backgroundColor:'#F5F5F7',borderRadius:20,padding:20,marginTop:20},tileTitle:{fontSize:18,fontWeight:'900'},tileCopy:{fontSize:13,color:'#777',marginTop:5}});
