export interface IdProvider{
  nextId():number;
}

export class SequentialIdProvider implements IdProvider{
  private _currentId:number;
  constructor() {
    this._currentId = Math.floor(Math.random()*(1000000));
  }

  nextId(): number {
    return this._currentId++;
  }
}

export interface Disposable{
  dispose():void;
}

export function isDisposable(p:any):p is Disposable{
  return p && p.dispose && typeof(p.dispose) === 'function';
}

export interface VisitResult{
  value:any;
  visited:boolean;
}
export type VisitAsyncFn=(value:any)=>Promise<VisitResult>;

export async function visitObjectAsync(obj:any, fn:VisitAsyncFn, visited:any[]=[]):Promise<any>{
  if(obj===null || obj===undefined)
    return obj;

  if(visited.indexOf(obj)>=0)
    return obj;
  else
    visited.push(obj);

  fn = fn || ((p)=>Promise.resolve({value:p,visited:true}));

  const result = await fn(obj);

  if(result.visited){
    if(result.value!==obj)
      visited.push(result.value);

    return result.value;
  }
  else{    
    if(typeof(obj)!=='string'){
      for(let key of Object.keys(obj)){
        obj[key] = await visitObjectAsync(obj[key], fn, visited);
      }
    }

    return obj;
  }
}

export type VisitFn=(value:any)=>VisitResult;

export function visitObject(obj:any, fn:VisitFn, visited:any[]=[]):any{
  if(obj===null || obj===undefined)
    return obj;

  if(visited.indexOf(obj)>=0)
    return obj;
  else
    visited.push(obj);

  fn = fn || ((p)=>({value:p,visited:true}));

  const result = fn(obj);

  if(result.visited){
    if(result.value!==obj)
      visited.push(result.value);

    return result.value;
  }
  else{    
    if(typeof(obj)!=='string'){
      for(let key of Object.keys(obj)){
        obj[key] = visitObject(obj[key], fn, visited);
      }
    }

    return obj;
  }
}

export async function flattenObject(obj:any):Promise<any[]>{
  const result=[];
  await visitObjectAsync(obj, async (value)=>{
    result.push(value);
    return {value:value, visited:false};
  });
  return result;
}
export async function getTransferables(obj:any):Promise<Transferable[]>{
  const flattening = await flattenObject(obj);
  if(!flattening){
    return null;
  }
  else{
    return flattening.filter((p:any)=>p instanceof ArrayBuffer || p instanceof ImageBitmap || p instanceof MessagePort);
  }
}

export function removeSelected<T>(value:T[], fn:(value:T)=>boolean):void{
  if(value && value.length>0 && fn && typeof(fn)==='function'){
    for(let i=0;i<value.length;i++){
      if(fn(value[i])){
        value.splice(i,1);
        i--;
      }
    }
  }
}

export function toJSON(error:any) {
  return !error ? null : JSON.stringify(error, (key, value)=>{
    if (value instanceof Error) {
      var error = {};

      Object.getOwnPropertyNames(value).forEach(function (key) {
        error[key] = value[key];
      });
  
      return error;
    }
  
    return value;
  });
}

export interface MemoizedFn0<R=any> extends Disposable{
  ():R;
}
export interface MemoizedFn1<T1=any, R=any> extends Disposable{
  (p1:T1):R;
}
export interface MemoizedFn2<T1=any, T2=any, R=any> extends Disposable{
  (p1:T1,p2:T2):R;
}
export interface MemoizedFn3<T1=any, T2=any, T3=any, R=any> extends Disposable{
  (p1:T1,p2:T2,p3:T3):R;
}
export interface MemoizedFn4<T1=any, T2=any, T3=any, T4=any, R=any> extends Disposable{
  (p1:T1,p2:T2,p3:T3,p4:T4):R;
}
export interface MemoizedFn5<T1=any, T2=any, T3=any, T4=any, T5=any, R=any> extends Disposable{
  (p1:T1,p2:T2,p3:T3,p4:T4,p5:T5):R;
}
export interface MemoizedFnN<T1=any, T2=any, T3=any, T4=any, T5=any, R=any> extends Disposable{
  (p1:T1,p2:T2,p3:T3,p4:T4,p5:T5,...params:any[]):R;
}

export function memoizedFnBuilder<R=any>(fn:()=>(()=>R)):MemoizedFn0<R>
export function memoizedFnBuilder<T1=any, R=any>(fn:()=>((p1:T1)=>R)):MemoizedFn1<T1, R>
export function memoizedFnBuilder<T1=any, T2=any, R=any>(fn:()=>((p1:T1,p2:T2)=>R)):MemoizedFn2<T1, T2, R>
export function memoizedFnBuilder<T1=any, T2=any, T3=any, R=any>(fn:()=>((p1:T1,p2:T2,p3:T3)=>R)):MemoizedFn3<T1, T2, T3, R>
export function memoizedFnBuilder<T1=any, T2=any, T3=any, T4=any, R=any>(fn:()=>((p1:T1,p2:T2,p3:T3,p4:T4)=>R)):MemoizedFn4<T1, T2, T3, T4, R>
export function memoizedFnBuilder<T1=any, T2=any, T3=any, T4=any, T5=any, R=any>(fn:()=>((p1:T1,p2:T2,p3:T3,p4:T4,p5:T5)=>R)):MemoizedFn5<T1, T2, T3, T4, T5, R>
export function memoizedFnBuilder<T1=any, T2=any, T3=any, T4=any, T5=any, R=any>(fn:()=>((p1:T1,p2:T2,p3:T3,p4:T4,p5:T5,...params:any[])=>R)):MemoizedFnN<T1, T2, T3, T4, T5, R>{
  let builtFn:((p1?:T1, p2?:T2, p3?:T3, p4?:T4, p5?:T5, ...params:any[])=>R) = null;
  const result = (p1?:T1, p2?:T2, p3?:T3, p4?:T4, p5?:T5, ...params:any[])=>{
    params = params || [];
    
    if(p5!==undefined)
      params.unshift(p5);
    if(p4!==undefined)
      params.unshift(p4);
    if(p3!==undefined)
      params.unshift(p3);
    if(p2!==undefined)
      params.unshift(p2);
    if(p1!==undefined)
      params.unshift(p1);

    if(builtFn==null)
      builtFn = fn();

    return builtFn(...params);
  }
  (<any>result).dispose = ()=>builtFn=null;

  return <any>result;
}