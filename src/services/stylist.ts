import type { Garment, OutfitItem, Slot } from '../types';

export type StylistSuggestion = {
  items: OutfitItem[];
  title: string;
  explanation: string;
  missing: Slot[];
};

const neutral = new Set(['negro', 'blanco', 'gris', 'beige', 'marrón', 'marron', 'crema', 'camel']);
const warm = new Set(['rojo', 'naranja', 'amarillo', 'rosa', 'marrón', 'marron', 'beige']);
const cool = new Set(['azul', 'celeste', 'verde', 'morado', 'lila']);

function textOf(garment: Garment) {
  return [garment.name, garment.subcategory, garment.color, garment.material, garment.style, garment.season, garment.brand]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-záéíóúüñ0-9]+/i).filter(token => token.length > 2);
}

function colors(value: string | null | undefined) {
  return (value || '').toLowerCase().split(',').map(item => item.trim()).filter(Boolean);
}

function isNeutral(value: string) {
  return neutral.has(value) || value.includes('negro') || value.includes('blanc') || value.includes('gris');
}

function colorScore(left: Garment, right: Garment) {
  const first = colors(left.color);
  const second = colors(right.color);
  if (!first.length || !second.length) return 1;
  if (first.some(color => second.includes(color))) return 2;
  if (first.some(isNeutral) || second.some(isNeutral)) return 2;
  const firstWarm = first.some(color => warm.has(color));
  const secondWarm = second.some(color => warm.has(color));
  const firstCool = first.some(color => cool.has(color));
  const secondCool = second.some(color => cool.has(color));
  if ((firstWarm && secondCool) || (firstCool && secondWarm)) return 1.5;
  return -1;
}

function score(garment: Garment, requestTokens: string[], anchor?: Garment) {
  const searchable = textOf(garment);
  const keywordScore = requestTokens.reduce((total, token) => total + (searchable.includes(token) ? 4 : 0), 0);
  const harmonyScore = anchor ? colorScore(garment, anchor) : 0;
  const rotationScore = garment.favorite ? 2 : 0;
  const freshnessScore = garment.wear_count === 0 ? 1.5 : Math.max(0, 1 - garment.wear_count * .15);
  return keywordScore + harmonyScore + rotationScore + freshnessScore;
}

function best(garments: Garment[], category: Slot, requestTokens: string[], anchor?: Garment) {
  return garments
    .filter(garment => garment.category === category)
    .sort((left, right) => score(right, requestTokens, anchor) - score(left, requestTokens, anchor))[0];
}

function item(garment: Garment, slot: Slot, layer: number, x: number, y: number): OutfitItem {
  return { garment, slot, layer, x, y, scale: 1, accessoryType: null };
}

/**
 * Offline, explainable outfit ranking. It never uploads a photo or requires a
 * model: user intent, colour harmony, favourites and wear rotation are enough
 * to produce a useful first look while keeping the app genuinely local.
 */
export function suggestOutfit(garments: Garment[], request = ''): StylistSuggestion {
  const requestTokens = tokens(request);
  const normalizedRequest = request.toLowerCase();
  const tops = garments.filter(garment => garment.category === 'top');
  const dress = tops.find(garment => /vestido|dress/.test(textOf(garment)));
  const top = dress && /vestido|dress|evento|fiesta|cena/.test(normalizedRequest)
    ? dress
    : best(garments, 'top', requestTokens);
  const bottom = top && /vestido|dress/.test(textOf(top)) ? undefined : best(garments, 'bottom', requestTokens, top);
  const shoes = best(garments, 'shoes', requestTokens, bottom || top);
  const accessory = /fiesta|cena|formal|lluvia|frío|frio|viaje|playa/.test(normalizedRequest)
    ? best(garments, 'accessory', requestTokens, top)
    : undefined;

  const items: OutfitItem[] = [];
  if (top) items.push(item(top, 'top', 0, 30, 20));
  if (bottom) items.push(item(bottom, 'bottom', 0, 33, 48));
  if (shoes) items.push(item(shoes, 'shoes', 0, 29, 76));
  if (accessory) items.push(item(accessory, 'accessory', 0, 39, 5));

  const missing: Slot[] = [];
  if (!top) missing.push('top');
  if (!bottom && !dress) missing.push('bottom');
  if (!shoes) missing.push('shoes');

  const occasion = request.trim() || 'para hoy';
  const pieces = items.length === 1 ? 'una pieza compatible' : `${items.length} piezas coordinadas`;
  const explanation = missing.length
    ? `He encontrado ${pieces} ${occasion}. Añade más prendas para completar: ${missing.map(slot => slot === 'top' ? 'parte de arriba' : slot === 'bottom' ? 'parte de abajo' : 'calzado').join(', ')}.`
    : `He elegido ${pieces} ${occasion}, priorizando colores compatibles, prendas favoritas y las que menos has usado.`;

  return { items, title: request.trim() ? `Look ${request.trim()}` : 'Look para hoy', explanation, missing };
}
