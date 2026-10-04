export type Slot='top'|'bottom'|'shoes'|'accessory';
export type Garment={id:number;user_id:number;name:string;category:Slot;subcategory?:string|null;color?:string|null;material?:string|null;style?:string|null;season?:string|null;brand?:string|null;price?:number|null;image_uri?:string|null;wear_count:number;cost_per_wear?:number|null};
export type DraftAnalysis={name:string;category:Slot;subcategory:string;color:string;material:string;style:string;season:string;brand:string;confidence:number};
export type OutfitItem={garment:Garment;slot:Slot;layer:number;x:number;y:number;scale:number};
