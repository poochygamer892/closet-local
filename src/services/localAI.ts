import type {DraftAnalysis} from '../types';

/*
 * The first sideload build exited before React could render.  The likely
 * culprit is the experimental ONNX native runtime being initialised as part
 * of the app bundle even though no model is included yet.  Keep the public
 * interface stable, but make the release build independent of that native
 * module.  The image is stored locally and the user can edit every field.
 *
 * A model-enabled build will live behind an explicit feature flag once its
 * weights and iOS runtime have been validated on a physical device.
 */
const manualDraft=():DraftAnalysis=>({name:'Nueva prenda',category:'top',subcategory:'',color:'',material:'',style:'',season:'',brand:'',confidence:0});

export async function modelStatus(){return{background:false,tags:false}}

export async function removeBackground(uri:string,_userId:number){
  // The original remains on-device and is used as the preview until the
  // optional, tested segmentation runtime is enabled.
  return uri;
}

export async function analyzeGarment(_uri:string):Promise<DraftAnalysis>{
  return manualDraft();
}

export async function installModelFromUri(_kind:'background'|'tags',_source:string){
  throw new Error('La IA local se activará en una compilación posterior validada para iPhone.');
}
