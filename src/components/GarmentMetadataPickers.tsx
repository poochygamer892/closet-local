import{useMemo,useState}from'react';
import{Pressable,StyleSheet,Text,View}from'react-native';

const colors=[
 ['Negro','#171717'],['Blanco','#F9F9F7'],['Gris','#9A9A9E'],['Beige','#D5BE94'],['Marrón','#80533A'],['Azul','#4B8DE3'],['Celeste','#8DD1ED'],['Verde','#74B990'],['Amarillo','#FFD957'],['Naranja','#EE9842'],['Rojo','#E75A5C'],['Rosa','#F298B8'],['Morado','#9A79C9'],['Multicolor','#D9D5F4']
]as const;
const materials=['Algodón','Denim','Lana','Cuero','Gamuza','Poliéster','Nailon','Lino','Seda','Viscosa','Punto','Mezcla'];
const values=(value:string)=>value.split(',').map(item=>item.trim()).filter(Boolean);
const write=(items:string[])=>items.join(', ');

export function ColorPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const selected=useMemo(()=>values(value),[value]);
 const toggle=(name:string)=>onChange(write(selected.includes(name)?selected.filter(item=>item!==name):[...selected,name].slice(0,4)));
 return <View style={s.section}><Text style={s.label}>COLORES · HASTA 4</Text><View style={s.colors}>{colors.map(([name,hex])=><Pressable key={name} accessibilityLabel={name} onPress={()=>toggle(name)} style={[s.color,selected.includes(name)&&s.colorOn]}><View style={[s.swatch,{backgroundColor:hex},name==='Blanco'&&s.white]}/><Text style={s.colorText}>{name}</Text></Pressable>)}</View>{selected.length>0&&<Text style={s.selected}>{selected.join(' · ')}</Text>}</View>
}

export function MaterialPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const[selectedOpen,setSelectedOpen]=useState(false);
 const selected=useMemo(()=>values(value),[value]);
 const toggle=(name:string)=>onChange(write(selected.includes(name)?selected.filter(item=>item!==name):selected.length<2?[...selected,name]:selected));
 return <View style={s.section}><Text style={s.label}>MATERIALES · OPCIONAL</Text><Pressable onPress={()=>setSelectedOpen(open=>!open)} style={s.select}><Text style={[s.selectText,!selected.length&&s.placeholder]}>{selected.length?selected.join(' · '):'Seleccionar hasta 2'}</Text><Text style={s.chevron}>{selectedOpen?'⌃':'⌄'}</Text></Pressable>{selectedOpen&&<View style={s.materials}>{materials.map(name=><Pressable key={name} onPress={()=>toggle(name)} style={[s.material,selected.includes(name)&&s.materialOn]}><Text style={[s.materialText,selected.includes(name)&&s.materialTextOn]}>{name}</Text></Pressable>)}</View>}</View>
}

const s=StyleSheet.create({section:{marginTop:17},label:{fontSize:10,letterSpacing:1.5,fontWeight:'800',color:'#75757B'},colors:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},color:{height:34,borderRadius:17,borderWidth:1,borderColor:'#E0E0E3',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#fff'},colorOn:{borderColor:'#111',backgroundColor:'#F1F1F2'},swatch:{width:12,height:12,borderRadius:6},white:{borderWidth:1,borderColor:'#CECED2'},colorText:{fontSize:11,fontWeight:'800'},selected:{fontSize:12,color:'#63636A',marginTop:9},select:{height:48,borderBottomWidth:1,borderColor:'#D5D5D8',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},selectText:{fontSize:17},placeholder:{color:'#A8A8AE'},chevron:{fontSize:20,color:'#777'},materials:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},material:{borderWidth:1,borderColor:'#DEDEE2',borderRadius:17,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#fff'},materialOn:{backgroundColor:'#181A18',borderColor:'#181A18'},materialText:{fontSize:12,fontWeight:'800'},materialTextOn:{color:'#fff'}});
