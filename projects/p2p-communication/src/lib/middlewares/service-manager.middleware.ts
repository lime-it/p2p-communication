import { IncomingRequestMiddleware, IncomingRequestContext, Channel, IncomingResponseMiddleware, IncomingResponseContext, OutgoingRequestMiddleware, OutgoingRequestContext, RequestMessage, ResponseCode } from '../channel';
import { IdProvider, SequentialIdProvider, visitObjectAsync, visitObject, Disposable } from '../utils';
import { ResourceManager } from './resource-manager.middleware';
import { isObservable } from 'rxjs';

export type ValueType='primitive'|'promise'|'observable';

export interface Value{
  type:ValueType;
}

export interface PrimitiveValue extends Value{
  type:'primitive';
  value:any;
}
export interface PromiseValue extends Value{
  type:'promise';
  id:number;
}
export interface ObservableValue extends Value{
  type:'observable';
  id:number;
}

export function isPrimitiveValue(p:any):p is PrimitiveValue{
  return !!p && p.type === 'primitive';
}
export function isPromiseValue(p:any):p is PromiseValue{
  return !!p && p.type === 'promise';
}
export function isObservableValue(p:any):p is ObservableValue{
  return !!p && p.type === 'observable';
}

export type ServiceProtocolMessageType='service-invoke'|'service-invoke-result'|'service-invoke-error';

export interface ServiceProtocolMessage{
  type: ServiceProtocolMessageType;
}

export interface ServiceInvokeMessage extends ServiceProtocolMessage{
  type:'service-invoke';
  service:string;
  params:any[];
}
export interface ServiceInvokeResultMessage extends ServiceProtocolMessage{
  type:'service-invoke-result';
  result:any;
}
export interface ServiceInvokeErrorMessage extends ServiceProtocolMessage{
  type:'service-invoke-error';
  error:any;
}

export function isServiceInvokeMessage(p:any):p is ServiceInvokeMessage{
  return !!p && p.type === 'service-invoke';
}
export function isServiceInvokeResultMessage(p:any):p is ServiceInvokeResultMessage{
  return !!p && p.type === 'service-invoke-result';
}
export function isServiceInvokeErrorMessage(p:any):p is ServiceInvokeErrorMessage{
  return !!p && p.type === 'service-invoke-error';
}

export function isPromise(p:any):p is Promise<any>{
  return p && p.then && typeof(p.then)==='function';
}

export interface ServiceManagerOptions {

}

const defaultOptions:ServiceManagerOptions={
  
}

export interface ServiceManagerBuilder{
  addService(name:string, fn:(...params:any[])=>Promise<any>):this;
  config(options:Partial<ServiceManagerOptions>):this;
}

export type ServiceManagerBuilderFn=(manager:ServiceManager, builder:ServiceManagerBuilder)=>void;

export interface ServiceMethodInvoker0<R=any>{
  ():Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[]):Promise<R>;
}
export interface ServiceMethodInvoker1<R=any, T1=any>{
  (p1:T1):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1):Promise<R>;
}
export interface ServiceMethodInvoker2<R=any, T1=any, T2=any>{
  (p1:T1,p2:T2):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1,p2:T2):Promise<R>;
}
export interface ServiceMethodInvoker3<R=any, T1=any, T2=any, T3=any>{
  (p1:T1,p2:T2,p3:T3):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1,p2:T2,p3:T3):Promise<R>;
}
export interface ServiceMethodInvoker4<R=any, T1=any, T2=any, T3=any, T4=any>{
  (p1:T1,p2:T2,p3:T3,p4:T4):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1,p2:T2,p3:T3,p4:T4):Promise<R>;
}
export interface ServiceMethodInvoker5<R=any, T1=any, T2=any, T3=any, T4=any, T5=any>{
  (p1:T1,p2:T2,p3:T3,p4:T4,p5:T5):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1,p2:T2,p3:T3,p4:T4,p5:T5):Promise<R>;
}
export interface ServiceMethodInvokerN<R=any, T1=any, T2=any, T3=any, T4=any, T5=any>{
  (p1:T1,p2:T2,p3:T3,p4:T4,p5:T5,...params:any[]):Promise<R>;
  
  invokeWithTransferables(transferables:Transferable[], p1:T1,p2:T2,p3:T3,p4:T4,p5:T5,...params:any[]):Promise<R>;
}

async function InvokeServiceMethod<R>(transferables:Transferable[], channel:Channel, name:string, ...params:any[]){
  if(!channel)
    throw new Error("'channel' must be set");
  if(!name)
    throw new Error("'name' must be set");

  params = params || [];

  const result:R = await channel.sendRequest({
    type:'service-invoke',
    service:name,
    params:params
  },null, transferables);

  return result;
}

export class ServiceManager implements OutgoingRequestMiddleware, IncomingRequestMiddleware, IncomingResponseMiddleware, Disposable {

  protected readonly idProvider:IdProvider;

  protected options:ServiceManagerOptions = {...defaultOptions};

  protected _services:Map<string, (...params:any[])=>Promise<any>> = new Map<string, (...params:any[])=>Promise<any>>();
  
  constructor(public readonly channel:Channel, public readonly resourceManager:ResourceManager, builderFn:ServiceManagerBuilderFn){
    if(!channel)
      throw new Error("'channel' must be set");
    if(!resourceManager)
      throw new Error("'resourceManager' must be set");
    
    if(!builderFn)
      throw new Error("'builderFn' must be set");

    this.idProvider = new SequentialIdProvider();

    const self = this;

    builderFn(this, {
      addService:function(name:string, fn:(...params:any[])=>Promise<any>){
        if(!name)
          throw new Error("'name' must be set");
        if(!fn)
          throw new Error("'fn' must be set");
        if(typeof(fn) !== 'function')
          throw new Error("'fn' must be function");

        if(self._services.has(name))
          throw new Error(`Name '${name}' is already assigned to another service`);

        self._services.set(name, fn);

        return this;
      },
      config:function (options:Partial<ServiceManagerOptions>){
        if(!options)
          throw new Error("'options' must be set");

        self.options = {...self.options, ...options};

        return this;
      }
    });
  }

  protected _disposed:boolean = false;
  dispose():void{
    if(!this._disposed){
      this._disposed = true;
    }
  }
  private async getWrappedValue(value:any):Promise<any>{
    return await visitObjectAsync(value, async p=>{
      if(!p){
        return {value:p, visited:true};
      }
      else if(isPromise(p)){
        return {value:{type:'promise',id:await this.resourceManager.wrapPromise(p)}, visited:true};
      }
      else if(isObservable(p)){
        return {value:{type:'observable', id: await this.resourceManager.wrapObservable(p)}, visited:true};
      }
      else
        return {value:null, visited:false};
    });
  }
  private getUnwrappedValue(value:any):any{    
    return visitObject(value, p=>{
      if(!p){
        return {value:p, visited:true};
      }
      else if(isPromiseValue(p)){
        return {value:this.resourceManager.getListeningPromise(p.id), visited:true};
      }
      else if(isObservableValue(p)){
        return {value:this.resourceManager.getListeningObservable(p.id), visited:true};
      }
      else
        return {value:null, visited:false};
    });
  }

  private async getWrappedParamsArray(params:any[]):Promise<Value[]>{
    return !params ? null : await Promise.all(params.map(p=>this.getWrappedValue(p)));
  }
  private getUnwrappedParamsArray(params:Value[]):any[]{
    return !params ? null : params.map(p=>this.getUnwrappedValue(p));
  }
  
  protected _requests:RequestMessage[]=[];

  async handleOutogingRequest(ctx: OutgoingRequestContext, next: () => Promise<void>): Promise<void> {
    await next();

    const request = ctx.getRequest();
    if(isServiceInvokeMessage(request.payload)){
      this._requests.push(request);

      request.payload.params = await this.getWrappedParamsArray(request.payload.params);
    }
  }

  async handleIncomingResponse(ctx: IncomingResponseContext, next: () => Promise<void>): Promise<void> {
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const idx = this._requests.indexOf(request);
    if(idx>=0){
      this._requests.splice(idx, 1);

      if(isServiceInvokeResultMessage(response.payload)){
        response.payload = this.getUnwrappedValue(response.payload.result);
      }
      else if(isServiceInvokeErrorMessage(response.payload)){
        response.payload = response.payload.error;
        response.code = ResponseCode.REQUEST_ERROR;
      }
      else
        await next();
    }
      
    await next();
  }

  async handleIncomingRequest(ctx: IncomingRequestContext, next: () => Promise<void>): Promise<void> {
    if(this._disposed)
      await next();

    const request=ctx.getRequest();

    if(isServiceInvokeMessage(request.payload)){
      if(this._services.has(request.payload.service)){
        try{
          const params = this.getUnwrappedParamsArray(request.payload.params);
          const result = await this._services.get(request.payload.service).apply({}, params);
          ctx.setResult({
            type:'service-invoke-result',
            result: await this.getWrappedValue(result)
          });
        }
        catch(error){
          ctx.setResult({
            type:'service-invoke-error',
            error: error
          });
        }
      }
      else
        await next();
    }
    else
      await next();
  }

  getMethodInvoker<R=any>(name:string):ServiceMethodInvoker0<R>
  getMethodInvoker<T1=any, R=any>(name:string):ServiceMethodInvoker1<R, T1>
  getMethodInvoker<T1=any, T2=any, R=any>(name:string):ServiceMethodInvoker2<R, T1, T2>
  getMethodInvoker<T1=any, T2=any, T3=any, R=any>(name:string):ServiceMethodInvoker3<R, T1, T2, T3>
  getMethodInvoker<T1=any, T2=any, T3=any, T4=any, R=any>(name:string):ServiceMethodInvoker4<R, T1, T2, T3, T4>
  getMethodInvoker<T1=any, T2=any, T3=any, T4=any, T5=any, R=any>(name:string):ServiceMethodInvoker5<R, T1, T2, T3, T4, T5>
  getMethodInvoker<T1=any, T2=any, T3=any, T4=any, T5=any, R=any>(name:string):ServiceMethodInvokerN<R, T1, T2, T3, T4, T5>{
    if(this._disposed)
      throw new Error("Manager disposed");

    if(!name)
      throw new Error("'name' must be set");
    
    const invoker:ServiceMethodInvokerN<R, T1, T2, T3, T4, T5> = (p1?:T1, p2?:T2, p3?:T3, p4?:T4, p5?:T5, ...params:any[])=>{
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

      return InvokeServiceMethod<R>(null, this.channel, name, ...params);
    }
    invoker.invokeWithTransferables = (transferables:Transferable[], p1?:T1, p2?:T2, p3?:T3, p4?:T4, p5?:T5, ...params:any[])=>{
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

      return InvokeServiceMethod<R>(transferables, this.channel, name, ...params);
    }

    return invoker;
  }
}