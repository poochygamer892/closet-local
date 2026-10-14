import {requireOptionalNativeModule} from 'expo-modules-core';

export type VisionLabel={identifier:string;confidence:number};
export type VisionAnalysis={labels:VisionLabel[];dominantColor:string;available:boolean};

export type ClosetLocalAINativeModule={
 status():Promise<{foreground:boolean;classification:boolean;generation?:boolean;generationMode?:string;platform:string}>;
 removeBackground(source:string,destination:string):Promise<string>;
 /** Separate foreground objects already isolated from one another (flat lays). */
 extractForegroundInstances(source:string,destinationPrefix:string):Promise<string[]>;
 /** Reconstruct one garment from several views of the same outfit piece. */
 generateFlatLay(sources:string[],destination:string,prompt:string):Promise<string>;
	/** Safe non-generative fallback that always returns a garment-only card. */
	fallbackFlatLay?(sources:string[],destination:string):Promise<string>;
 analyze(source:string):Promise<VisionAnalysis>;
};

export default requireOptionalNativeModule<ClosetLocalAINativeModule>('ClosetLocalAI');
