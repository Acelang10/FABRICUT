import {addDoc,collection,deleteDoc,doc,getDocFromServer,getDocsFromServer,updateDoc,setDoc} from 'firebase/firestore'
import {currentDb} from './context'
import type {Collection,Document} from '../types'
export interface Repository {set:(name:Collection,id:string,data:Record<string,unknown>)=>Promise<Document>;list:(name:Collection)=>Promise<Document[]>;get:(name:Collection,id:string)=>Promise<Document|null>;create:(name:Collection,data:Record<string,unknown>)=>Promise<Document>;update:(name:Collection,id:string,data:Record<string,unknown>)=>Promise<Document|null>;remove:(name:Collection,id:string)=>Promise<boolean>;measurements:()=>Promise<Document>}
export const repository:Repository={
 async set(name,id,data){await setDoc(doc(currentDb(),name,id),data);return {...data,id}},
 async list(name){const snapshot=await getDocsFromServer(collection(currentDb(),name));return snapshot.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>String((a as Document).createdAt||'').localeCompare(String((b as Document).createdAt||'')))},
 async get(name,id){const d=await getDocFromServer(doc(currentDb(),name,id));return d.exists()?{...d.data(),id:d.id}:null},
 async create(name,data){const now=new Date().toISOString(),payload={...data,createdAt:now,updatedAt:now};const d=await addDoc(collection(currentDb(),name),payload);return {...payload,id:d.id}},
 async update(name,id,data){const existing=await this.get(name,id);if(!existing)return null;const updatedAt=new Date().toISOString();await updateDoc(doc(currentDb(),name,id),{...data,updatedAt});return {...existing,...data,updatedAt}},
 async remove(name,id){if(!await this.get(name,id))return false;await deleteDoc(doc(currentDb(),name,id));return true},
 async measurements(){const existing=await this.get('measurements','current');if(existing)return existing;return {id:'current',chest:'',sleeves:'',sleevesLength:'',neck:'',hips:'',notes:''}}
}
export async function saveMeasurements(data:Record<string,unknown>){const now=new Date().toISOString(),existing=await repository.get('measurements','current');await setDoc(doc(currentDb(),'measurements','current'),{...data,createdAt:existing?.createdAt||now,updatedAt:now});return {...data,id:'current',createdAt:existing?.createdAt||now,updatedAt:now}}
