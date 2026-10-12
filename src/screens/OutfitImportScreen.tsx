import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { database } from '../db/database';
import { extractOutfitPieces, type OutfitExtraction, type OutfitPhotoKind } from '../services/localAI';
import { ColorPicker, MaterialPicker, SingleSelectPicker } from '../components/GarmentMetadataPickers';
import type { Slot } from '../types';

const categories: { id: Slot; label: string }[] = [
  { id: 'top', label: 'Arriba' },
  { id: 'bottom', label: 'Abajo' },
  { id: 'shoes', label: 'Calzado' },
  { id: 'accessory', label: 'Accesorio' },
];
const styles = ['Casual', 'Streetwear', 'Clásico', 'Deportivo', 'Minimalista', 'Formal', 'Vintage', 'Y2K'];
const seasons = ['Todo el año', 'Primavera / verano', 'Otoño / invierno', 'Entretiempo'];
const subs: Record<Slot, string[]> = {
  top: ['Camiseta', 'Camisa', 'Sudadera', 'Jersey', 'Chaqueta', 'Abrigo', 'Blazer'],
  bottom: ['Vaqueros', 'Pantalón', 'Shorts', 'Falda', 'Chándal'],
  shoes: ['Zapatillas', 'Botas', 'Sandalias', 'Mocasines'],
  accessory: ['Gorra / gorro', 'Calcetines', 'Bufanda', 'Bolso', 'Cinturón', 'Gafas', 'Anillo', 'Collar', 'Pulsera'],
};
type Candidate = OutfitExtraction & { selected: boolean };

export function OutfitImportScreen({ userId, close, saved }: { userId: number; close: () => void; saved: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [kind, setKind] = useState<OutfitPhotoKind>('worn');
  const [pieces, setPieces] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8, quality: 1 });
    if (!result.canceled) setPhotos(result.assets.map(asset => asset.uri));
  };
  const switchKind = (next: OutfitPhotoKind) => {
    if (next === kind) return;
    setKind(next);
    // Do not accidentally run a set of worn-outfit views through the flat-lay
    // detector (or vice versa). Each tab starts with its own input selection.
    setPhotos([]);
    setPieces([]);
  };
  const extract = async () => {
    if (!photos.length) return;
    setBusy(true);
    try {
      const detected = await extractOutfitPieces(photos, userId, kind);
      setPieces(detected.map(piece => ({ ...piece, selected: true })));
    } catch (error) {
      Alert.alert('No se pudo leer el outfit', error instanceof Error ? error.message : 'Prueba con otras fotos.');
    } finally {
      setBusy(false);
    }
  };
  const edit = (index: number, patch: Partial<Candidate['draft']>) => setPieces(all => all.map((piece, i) => i === index ? { ...piece, draft: { ...piece.draft, ...patch } } : piece));
  const save = () => {
    const picked = pieces.filter(piece => piece.selected);
    if (!picked.length) return Alert.alert('Elige al menos una pieza', 'Selecciona al menos una prenda.');
    picked.forEach(piece => database.createGarment(userId, {
      name: piece.draft.name.trim() || 'Nueva prenda', category: piece.draft.category,
      subcategory: piece.draft.subcategory || null, color: piece.draft.color || null,
      material: piece.draft.material || null, style: piece.draft.style || null,
      season: piece.draft.season || null, brand: null, price: null,
    }, piece.images || [{ original_uri: piece.original_uri, processed_uri: piece.processed_uri }]));
    saved();
    close();
  };

  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <View style={s.head}><Pressable onPress={close}><Text style={s.cancel}>Cancelar</Text></Pressable><Text style={s.title}>Importar outfit</Text><View style={{ width: 60 }} /></View>
    {!pieces.length ? <>
      <View style={s.tabs} accessibilityRole="tablist">
        {(['worn', 'flat'] as OutfitPhotoKind[]).map(value => <Pressable key={value} onPress={() => switchKind(value)} accessibilityRole="tab" accessibilityState={{ selected: kind === value }} style={[s.tab, kind === value && s.tabOn]}>
          <Text style={[s.tabTitle, kind === value && s.tabTitleOn]}>{value === 'worn' ? 'Outfit puesto' : 'Prendas extendidas'}</Text>
          <Text style={[s.tabCopy, kind === value && s.tabCopyOn]}>{value === 'worn' ? 'Varias vistas + IA' : 'Cama o suelo'}</Text>
        </Pressable>)}
      </View>
      <Text style={s.hero}>Varias fotos. Un outfit.</Text>
      <Text style={s.copy}>Sube frente, espalda y detalles. La IA local crea una tarjeta por prenda y conserva las vistas para revisar el resultado.</Text>
      <Pressable onPress={choose} style={s.photo}>{photos.length ? <><Image source={{ uri: photos[0] }} style={s.source} /><View style={s.badge}><Text style={s.badgeText}>{photos.length} fotos seleccionadas</Text></View></> : <><Text style={s.plus}>＋</Text><Text style={s.photoText}>Elegir varias fotos</Text></>}</Pressable>
      <Text style={s.tip}>{kind === 'worn' ? 'Añade hasta 8 vistas del mismo outfit. Se combinan como referencias y se genera una sola foto plana por prenda; no se guarda el recorte de la persona. Se crea una pieza para arriba, otra para abajo y otra para calzado.' : 'Añade hasta 8 fotos de prendas separadas. Se elimina el fondo localmente y se crea una tarjeta por cada prenda visible.'}</Text>
      <Pressable disabled={!photos.length || busy} onPress={extract} style={[s.primary, (!photos.length || busy) && s.disabled]}><Text style={s.primaryText}>{busy ? 'Generando prendas en este iPhone…' : 'Detectar y preparar prendas'}</Text></Pressable>
    </> : <>
      <Text style={s.resultTitle}>Prendas reconstruidas</Text><Text style={s.resultCopy}>Cada tarjeta es una prenda generada en formato plano a partir de las vistas seleccionadas. Revisa las imágenes y los campos antes de guardarla.</Text>
      {pieces.map((piece, index) => <View key={piece.id} style={[s.card, !piece.selected && s.cardOff]}>
        <Pressable onPress={() => setPieces(all => all.map((item, i) => i === index ? { ...item, selected: !item.selected } : item))} style={[s.tick, piece.selected && s.tickOn]}><Text style={s.tickText}>{piece.selected ? '✓' : ''}</Text></Pressable>
        <Image source={{ uri: piece.processed_uri }} style={s.image} />
        <View style={s.form}>
          <TextInput value={piece.draft.name} onChangeText={name => edit(index, { name })} style={s.name} placeholder="Nombre" />
          <ScrollView horizontal contentContainerStyle={s.chips}>{categories.map(category => <Pressable key={category.id} onPress={() => edit(index, { category: category.id })} style={[s.chip, piece.draft.category === category.id && s.chipOn]}><Text style={[s.chipText, piece.draft.category === category.id && s.chipTextOn]}>{category.label}</Text></Pressable>)}</ScrollView>
          <SingleSelectPicker label="SUBCATEGORÍA" value={piece.draft.subcategory} onChange={subcategory => edit(index, { subcategory })} options={subs[piece.draft.category]} placeholder="Seleccionar" />
          <ColorPicker value={piece.draft.color} onChange={color => edit(index, { color })} />
          <MaterialPicker value={piece.draft.material} onChange={material => edit(index, { material })} />
          <SingleSelectPicker label="ESTILO" value={piece.draft.style} onChange={style => edit(index, { style })} options={styles} placeholder="Seleccionar" />
          <SingleSelectPicker label="TEMPORADA" value={piece.draft.season} onChange={season => edit(index, { season })} options={seasons} placeholder="Seleccionar" />
        </View>
      </View>)}
      <Pressable onPress={save} style={s.primary}><Text style={s.primaryText}>Guardar piezas seleccionadas</Text></Pressable>
      <Pressable onPress={() => { setPieces([]); setPhotos([]); }} style={s.tryAgain}><Text style={s.tryText}>Probar otro outfit</Text></Pressable>
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, content: { padding: 20, paddingTop: 58, paddingBottom: 40 }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cancel: { fontWeight: '800', width: 60 }, title: { fontWeight: '900', fontSize: 18 }, tabs: { flexDirection: 'row', marginTop: 24, borderBottomWidth: 1, borderBottomColor: '#E4E4E7' }, tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabOn: { borderBottomColor: '#050505' }, tabTitle: { fontWeight: '800', fontSize: 13, color: '#8A8A90' }, tabTitleOn: { color: '#050505' }, tabCopy: { fontSize: 11, color: '#A0A0A6', marginTop: 4 }, tabCopyOn: { color: '#555' }, hero: { fontSize: 29, fontWeight: '900', marginTop: 28 }, copy: { color: '#74747B', lineHeight: 21, marginTop: 9 }, photo: { height: 260, marginTop: 18, borderRadius: 22, backgroundColor: '#F4F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E7E7EA' }, source: { width: '100%', height: '100%', resizeMode: 'cover' }, plus: { fontSize: 43 }, photoText: { fontWeight: '900', marginTop: 7 }, badge: { position: 'absolute', bottom: 12, left: 12, right: 12, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.75)' }, badgeText: { color: '#fff', fontWeight: '900', textAlign: 'center' }, tip: { fontSize: 12, lineHeight: 18, color: '#85858B', marginTop: 11 }, primary: { height: 54, borderRadius: 27, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', marginTop: 22 }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .4 }, resultTitle: { fontSize: 24, fontWeight: '900', marginTop: 27 }, resultCopy: { fontSize: 13, color: '#777', lineHeight: 19, marginTop: 5 }, card: { marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E5E5E8', backgroundColor: '#fff', padding: 11, flexDirection: 'row' }, cardOff: { opacity: .45 }, tick: { position: 'absolute', right: 10, top: 10, zIndex: 3, width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: '#D2D2D6', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, tickOn: { backgroundColor: '#050505', borderColor: '#050505' }, tickText: { color: '#fff', fontWeight: '900' }, image: { width: 112, height: 122, resizeMode: 'contain', backgroundColor: '#F8F8F8', borderRadius: 12 }, form: { flex: 1, marginLeft: 12, paddingTop: 3 }, name: { fontSize: 16, fontWeight: '900', height: 34, padding: 0, paddingRight: 20 }, chips: { gap: 6, paddingVertical: 8 }, chip: { borderWidth: 1, borderColor: '#E0E0E4', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 }, chipOn: { backgroundColor: '#050505', borderColor: '#050505' }, chipText: { fontSize: 10, fontWeight: '800' }, chipTextOn: { color: '#fff' }, tryAgain: { height: 44, alignItems: 'center', justifyContent: 'center' }, tryText: { fontWeight: '800', color: '#555' },
});
