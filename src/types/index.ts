export type Slot='top'|'bottom'|'shoes'|'accessory';
export type AccessoryType='socks'|'headwear'|'scarf'|'bag'|'ring'|'necklace'|'bracelet'|'other';
export type Garment={id:number;user_id:number;name:string;category:Slot;subcategory?:string|null;color?:string|null;material?:string|null;style?:string|null;season?:string|null;brand?:string|null;price?:number|null;notes?:string|null;favorite?:number;image_uri?:string|null;image_count?:number;wear_count:number;cost_per_wear?:number|null};
export type DraftAnalysis={name:string;category:Slot;subcategory:string;color:string;material:string;style:string;season:string;brand:string;confidence:number};
export type OutfitItem={garment:Garment;slot:Slot;layer:number;x:number;y:number;scale:number;accessoryType?:AccessoryType|null;jewelryType?:string|null};
export type Outfit={id:number;user_id:number;name:string;notes?:string|null;created_at:string;image_uri?:string|null;item_count:number};
export type GarmentImage={id:number;garment_id:number;original_uri:string;processed_uri:string;sort_order:number};
