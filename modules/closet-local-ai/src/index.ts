import {requireOptionalNativeModule} from 'expo-modules-core';

export type VisionLabel={identifier:string;confidence:number};
export type VisionAnalysis={labels:VisionLabel[];dominantColor:string;available:boolean};

export type ClosetLocalAINativeModule={
 status():Promise<{foreground:boolean;classification:boolean;platform:string}>;
 removeBackground(source:string,destination:string):Promise<string>;
 /** Separate foreground objects already isolated from one another (flat lays). */
 extractForegroundInstances(source:string,destinationPrefix:string):Promise<string[]>;
 generateFlatLay(source:string,destination:string,prompt:string):Promise<string>;
 analyze(source:string):Promise<VisionAnalysis>;
};

export default requireOptionalNativeModule<ClosetLocalAINativeModule>('ClosetLocalAI');
