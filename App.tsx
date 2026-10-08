import {useState} from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View} from 'react-native';

/*
 * iPhone launch probe.
 *
 * This screen deliberately imports no Expo or third-party native module.
 * It lets us distinguish a signing/runtime issue from a feature-module crash
 * before restoring the wardrobe one module at a time.
 */
export default function App(){
  const [confirmed,setConfirmed]=useState(false);
  return <SafeAreaView style={s.page}>
    <View style={s.top}><Text style={s.brand}>closet</Text><View style={s.dot}/></View>
    <View style={s.content}>
      <View style={s.mark}><Text style={s.markText}>✓</Text></View>
      <Text style={s.title}>La app ha arrancado.</Text>
      <Text style={s.copy}>Esta compilación de diagnóstico no carga todavía la base de datos, fotos ni IA. Si ves esta pantalla, la instalación y el motor de la app funcionan correctamente.</Text>
      <Pressable style={[s.button,confirmed&&s.buttonDone]} onPress={()=>setConfirmed(true)}><Text style={s.buttonText}>{confirmed?'Comprobado':'Tocar para comprobar'}</Text></Pressable>
      {confirmed&&<Text style={s.success}>Interfaz y JavaScript funcionando.</Text>}
    </View>
    <Text style={s.version}>CLOSET LOCAL · DIAGNÓSTICO 0.2.3 · JSC</Text>
  </SafeAreaView>
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},top:{height:68,paddingHorizontal:24,alignItems:'center',justifyContent:'space-between',flexDirection:'row'},brand:{fontSize:29,fontWeight:'900',letterSpacing:-1.5,color:'#080808'},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#F6A623'},content:{flex:1,padding:28,justifyContent:'center'},mark:{width:74,height:74,borderRadius:37,alignItems:'center',justifyContent:'center',backgroundColor:'#050505',marginBottom:28},markText:{fontSize:37,color:'#fff',fontWeight:'800'},title:{fontSize:34,lineHeight:39,fontWeight:'900',letterSpacing:-1.2,color:'#050505'},copy:{fontSize:16,lineHeight:24,color:'#74747A',marginTop:14},button:{height:56,borderRadius:28,backgroundColor:'#050505',alignItems:'center',justifyContent:'center',marginTop:30},buttonDone:{backgroundColor:'#188A57'},buttonText:{color:'#fff',fontWeight:'900',fontSize:16},success:{marginTop:16,textAlign:'center',fontSize:13,color:'#188A57',fontWeight:'700'},version:{paddingHorizontal:24,paddingBottom:20,fontSize:10,letterSpacing:1.5,color:'#9A9AA0',fontWeight:'800'}});
