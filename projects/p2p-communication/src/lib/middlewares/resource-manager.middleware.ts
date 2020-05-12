import { Subscription, Observable, Subscriber } from 'rxjs';
import { map } from 'rxjs/operators';
import { IdProvider, SequentialIdProvider, removeSelected, Disposable, toJSON } from '../utils';
import { Channel, IncomingRequestMiddleware, IncomingRequestContext } from '../channel';

export type ResourceProtocolMessageType=
'observable-create'|'observable-subscribe'|'observable-unsubscribe'|'observable-next'|'observable-complete'|'observable-error'|
'promise-create'|'promise-resolve'|'promise-reject'|'promise-ping';

export interface ResourceProtocolMessage{
  type: ResourceProtocolMessageType;
}

export interface ObservableCreateMessage extends ResourceProtocolMessage{
  type:'observable-create';
  id:number;
}
export interface ObservableSubscribeMessage extends ResourceProtocolMessage{
  type:'observable-subscribe';
  id:number;
  subId:number;
}
export interface ObservableUnsubscribeMessage extends ResourceProtocolMessage{
  type:'observable-unsubscribe';
  id:number;
  subId:number;
}
export interface ObservableNextMessage extends ResourceProtocolMessage{
  type:'observable-next';
  id:number;
  payload: any;
}
export interface ObservableCompleteMessage extends ResourceProtocolMessage{
  type:'observable-complete';
  id:number;
}
export interface ObservableErrorMessage extends ResourceProtocolMessage{
  type:'observable-error';
  id:number;
  payload:any;
}

export interface PromiseCreateMessage extends ResourceProtocolMessage{
  type:'promise-create';
  id:number;
}
export interface PromiseResolveMessage extends ResourceProtocolMessage{
  type:'promise-resolve';
  id:number;
  payload:any;
}
export interface PromiseRejectMessage extends ResourceProtocolMessage{
  type:'promise-reject';
  id:number;
  payload:any;
}
export interface PromisePingMessage extends ResourceProtocolMessage{
  type:'promise-ping';
  id:number;
}

export function isObservableCreateMessage(p:any):p is ObservableCreateMessage{
  return !!p && p.type === 'observable-create';
}
export function isObservableSubscribeMessage(p:any):p is ObservableSubscribeMessage{
  return !!p && p.type === 'observable-subscribe';
}
export function isObservableUnsubscribeMessage(p:any):p is ObservableUnsubscribeMessage{
  return !!p && p.type === 'observable-unsubscribe';
}
export function isObservableNextMessage(p:any):p is ObservableNextMessage{
  return !!p && p.type === 'observable-next';
}
export function isObservableCompleteMessage(p:any):p is ObservableCompleteMessage{
  return !!p && p.type === 'observable-complete';
}
export function isObservableErrorMessage(p:any):p is ObservableErrorMessage{
  return !!p && p.type === 'observable-error';
}
export function isPromiseCreateMessage(p:any):p is PromiseCreateMessage{
  return !!p && p.type === 'promise-create';
}
export function isPromiseResolveMessage(p:any):p is PromiseResolveMessage{
  return !!p && p.type === 'promise-resolve';
}
export function isPromiseRejectMessage(p:any):p is PromiseRejectMessage{
  return !!p && p.type === 'promise-reject';
}
export function isPromisePingMessage(p:any):p is PromisePingMessage{
  return !!p && p.type === 'promise-ping';
}

export function isResourceActiveMessage(p:any):boolean{
  return p && (p.type === 'observable-subscribe' || p.type === 'observable-unsubscribe' || p.type === 'promise-ping');
}
export function isResourcePassiveMessage(p:any):boolean{
  return p && (p.type === 'observable-next' || p.type === 'observable-complete' || p.type === 'observable-error' || p.type === 'promise-resolve' || p.type === 'promise-reject');
}

export abstract class Resource implements Disposable{
  public readonly age:number;

  protected _errored:boolean;
  public errored():boolean{
    return this._errored;
  }

  protected _disposed:boolean;
  public disposed():boolean{
    return this._disposed;
  }

  constructor(public readonly id:number){
    this.age = new Date().getTime();

    this._errored = false;
    this._disposed = false;
  }

  protected _error:any;
  public setError(value:any){
    this._errored=true;
    this._error=value;
  }
  public getError():any{
    return this._error;
  }
  public dispose(){
    this._disposed=true;
  }

  protected _refCount:number=0;
  protected _lastUpdate:number=this.age;
  public touch(){
    this._lastUpdate = new Date().getTime();
  }
  public use(){
    this._refCount++;
    this.touch();
  }
  public release(){
    this._refCount--;
    this.touch();
  }
  public getRefCount():number{
    return this._refCount;
  }
  public getLastUpdate():number{
    return this._lastUpdate;
  }

  abstract shouldHandle(message:ResourceProtocolMessage):boolean;

  abstract handle(message:ResourceProtocolMessage):void;
}

export class PromiseResource extends Resource {

  public onresolve:(resource:Resource, p:any)=>void;
  public onreject:(resource:Resource, e:any)=>void;

  protected onResolve(p:any){
    if(this.onresolve)
      this.onresolve(this, p);
  }
  protected onReject(e:any){
    if(this.onreject)
      this.onreject(this, e);
  }

  protected _innerResolve:(p:any)=>void;
  protected _innerReject:(e:any)=>void;

  constructor(id:number, public readonly promise:Promise<any>){
    super(id);

    if(!promise)
      throw new Error("'promise' must be set");

    this.promise = Promise.race([
      promise, 
      new Promise<void>((resolve, reject)=>{
        this._innerResolve = p=>resolve(p); 
        this._innerReject = e=>reject(e); 
      })
    ]);
  }

  public setError(value:any){
    super.setError(value);

    this._innerReject(value);
  }

  public dispose(){
    if(!this._disposed){
      super.dispose();

      this._innerReject(new ResourceDisposedError());
    }
  }

  shouldHandle(message:PromisePingMessage){
    return message && message.id===this.id && message.type==='promise-ping';
  }

  handle(message:ResourceProtocolMessage):void{
    if(this.errored())
      this.onReject(this.getError());    
    else if(this.disposed()) 
      this.onReject(new ResourceDisposedError());
    else{
      this.promise.then(
        p=>{this.release();this.onResolve(p);},
        e=>{this.release();this.onReject(e);}
      );
      this.use();
    }
  }
}

export class PromiseListenerResource extends Resource {

  public readonly promise:Promise<any>;

  protected resolve:(p:any)=>void;
  protected reject:(e:any)=>void;

  public onping:(resource:Resource)=>void;

  protected onPing(){
    if(this.onping)
      this.onping(this);
  }

  protected _resolved:boolean=false;
  protected _rejected:boolean=false;

  constructor(id:number){
    super(id);

    this.promise = new Promise<any>((resolve, reject)=>{
      this.resolve = p => {
        this._resolved = true;
        resolve(p);
      };
      this.reject = e => {
        this._rejected = true;
        reject(e);
      }
    });

    const then = this.promise.then;
    this.promise.then = (resolve, reject)=>{
      if(!this._resolved && !this._rejected)
        this.onPing();

      this.use();
        
      return then.call(
        this.promise, 
        (p:any)=>{
          this.release();
          resolve(p);
        }, 
        (e:any)=>{
          this.release();
          reject(e);
        }
      );
    };
  }

  public setError(value:any){
    super.setError(value);
    
    this.reject(value);
  }

  public dispose(){
    if(!this._disposed){
      super.dispose();

      this.reject(new ResourceDisposedError());
    }
  }

  shouldHandle(message:PromiseResolveMessage|PromiseRejectMessage){
    return message && message.id===this.id && (message.type==='promise-resolve' || message.type==='promise-reject');
  }

  handle(message:PromiseResolveMessage|PromiseRejectMessage){
    this.touch();

    if(isPromiseResolveMessage(message))
      this.resolve(message.payload);
    else if (isPromiseRejectMessage(message))
      this.reject(message.payload);
  }
}

export class ObservableResource extends Resource {

  public onnext:(resource:Resource, p:any)=>void;
  public oncomplete:(resource:Resource)=>void;
  public onerror:(resource:Resource, e:any)=>void;

  protected onNext(p:any){
    if(this.onnext)
      this.onnext(this, p);
  }
  protected onComplete(){
    if(this.oncomplete)
      this.oncomplete(this);
  }
  protected onError(e:any){
    if(this.onerror)
      this.onerror(this, e);
  }

  protected subscriptions:Map<number,Subscription> = new Map<number,Subscription>();

  protected readonly _subscribers:Subscriber<any>[] = [];

  constructor(id:number, public readonly observable:Observable<any>){
    super(id);

    if(!observable)
      throw new Error("'observable' must be set");

    this.observable = new Observable<any>(subscriber=>{

      this._subscribers.push(subscriber);

      const subscription = observable.subscribe(p=>subscriber.next(p), e=>subscriber.error(e), ()=>subscriber.complete());

      return {
        unsubscribe:()=>{
          subscription.unsubscribe();
          subscriber.unsubscribe();
          const idx = this._subscribers.indexOf(subscriber);
          if(idx>=0)
            this._subscribers.splice(idx, 1);
        }
      }
    });
    
  }

  public setError(value:any){
    super.setError(value);

    this._subscribers.forEach(p=>p.error(value));
  }

  public dispose(){
    if(!this._disposed){
      super.dispose();

      const error = new ResourceDisposedError();
      this._subscribers.forEach(p=>p.error(error));
    }
  }

  shouldHandle(message:ObservableSubscribeMessage|ObservableSubscribeMessage){
    return message && message.id===this.id && (message.type==='observable-subscribe' || message.type==='observable-unsubscribe');
  }

  protected removeSubscription(id:number){
    if(this.subscriptions.has(id)){
      this.subscriptions.get(id).unsubscribe();
      this.subscriptions.delete(id);
    }
  }

  handle(message:ObservableSubscribeMessage|ObservableNextMessage|ObservableCompleteMessage|ObservableErrorMessage){
    if(isObservableSubscribeMessage(message)){  
      const subId=message.subId;      
      this.subscriptions.set(subId,this.observable.pipe(
        map(p=>{
          if(this.errored())
            throw this.getError();
          else if(this.disposed())
            throw new ResourceDisposedError();
          else
            return p;
        })
      )
      .subscribe(
        p=>{ this.touch(); this.onNext(p); },
        e=>{ this.touch(); this.onError(e); this.removeSubscription(subId); },
        ()=>{ this.touch(); this.onComplete(); this.removeSubscription(subId); }
      ));

      this.use();
    }
    else if(isObservableUnsubscribeMessage(message)){
      this.removeSubscription(message.subId);
      this.release();
    }
  }
}

export class ObservableListenerResource extends Resource {

  public onsubscribe:(resource:Resource)=>number;
  public onunsubscribe:(resource:Resource, subId:number)=>void;

  protected onSubscribe():number{
    if(this.onsubscribe)
      return this.onsubscribe(this);
  }
  protected onUnsubscribe(subId:number){
    if(this.onunsubscribe)
      this.onunsubscribe(this, subId);
  }

  protected subscribers:Map<number,Subscriber<any>> = new Map<number,Subscriber<any>>();
  public readonly observable:Observable<any>;

  constructor(id:number){
    super(id);

    this.observable = new Observable<any>(subscriber=>{
        
      this.use();

      if(this.errored())
        subscriber.error(this.getError());
      else if(this.disposed())
        subscriber.error(new ResourceDisposedError());
      else{
        const subId = this.onSubscribe();
        this.subscribers.set(subId, subscriber);

        return {
          unsubscribe:()=>{
            this.release();
            subscriber.unsubscribe();
            this.onUnsubscribe(subId);
            this.subscribers.delete(subId);
          }
        };
      }

      return {
        unsubscribe:()=>{
          this.release();
          subscriber.unsubscribe();
        }
      };
    });
  }

  public setError(value:any){
    super.setError(value);
    
    this.subscribers.forEach((v,k)=>{
      v.error(value);
    });
  }

  public dispose(){
    if(!this._disposed){
      super.dispose();

      const error = new ResourceDisposedError();
      this.subscribers.forEach((v,k)=>{
        v.error(error);
      });
    }
  }

  shouldHandle(message:ObservableNextMessage|ObservableCompleteMessage|ObservableErrorMessage){
    return message && message.id===this.id && (message.type==='observable-next' || message.type==='observable-complete' || message.type === 'observable-error');
  }

  handle(message:ObservableNextMessage|ObservableCompleteMessage|ObservableErrorMessage){
    this.touch();

    if(isObservableNextMessage(message)){
      this.subscribers.forEach((v,k)=>{
        v.next(message.payload);
      });
    }
    else if(isObservableCompleteMessage(message)){
      this.subscribers.forEach((v,k)=>{
        v.complete();
      });
    }
    else if(isObservableErrorMessage(message)){
      this.subscribers.forEach((v,k)=>{
        v.error(message.payload);
      });
    }
  }
}

export interface ResourceManagerOptions{
  garbageCollectionPeriod:number;
  slidingWindowTime:null|number;
  maximumResourceLifetime:null|number;
  expirationGraceTime:number;
}

const defaultOptions:ResourceManagerOptions = {
  slidingWindowTime:600*1000,
  garbageCollectionPeriod:30*1000,
  maximumResourceLifetime:null,
  expirationGraceTime:10*1000
}


export class ResourceError{  
  constructor(public readonly message:string) {
  }
}

export class ResourceDisposedError extends ResourceError{  
  constructor(message:string = 'Resource is disposed') {
    super(message);
  }
}

export class ResourceExpiredError extends ResourceError{  
  constructor(message:string = 'Resource lifespan expired') {
    super(message);
  }
}

export class ResourceSlidingUsageExpiredError extends ResourceError{  
  constructor(message:string = 'Resource sliding usage expired') {
    super(message);
  }
}

export class ResourceManager implements IncomingRequestMiddleware, Disposable {
  protected readonly resources:Resource[]=[];
  protected readonly listenerResources:Resource[]=[];

  protected readonly idProvider:IdProvider;

  protected options:ResourceManagerOptions = {...defaultOptions};

  protected _gcHandle:any;

  constructor(public readonly channel:Channel, options?:Partial<ResourceManagerOptions>){
    if(!channel)
      throw new Error("'channel' must be set");

    this.idProvider = new SequentialIdProvider();

    if(options)
      this.options = {...this.options, ...options };

    this._gcHandle = setInterval(()=>{
      if(!this._disposed)
        this.garbageColletion();
    }, this.options.garbageCollectionPeriod);
  }

  protected handleResourceCollection(p:Resource):boolean{
    p.dispose();
    return true;
  }
  protected handleErroredCollection(p:Resource):boolean{
    if(p.errored()){
      return this.handleResourceCollection(p);
    }
    else
      return false;
  }
  protected handleExpiredCollection(now:number, p:Resource):boolean{
    const max = this.options.maximumResourceLifetime;
    const grace = this.options.expirationGraceTime;
    if(now-p.age>max && now-p.getLastUpdate()>grace && !p.errored()){
      if(!p.disposed()){
        p.setError(new ResourceExpiredError());
        return false;
      }
      else{
        return this.handleResourceCollection(p);
      }
    }
    else
      return false;
  }
  protected handleRefCountCollection(p:Resource):boolean{
    if(p.getRefCount()<=0 && p.age<p.getLastUpdate())
      return this.handleResourceCollection(p);
    else
      return false;
  }
  protected handleExpiredSlidingWindowCollection(now:number, p:Resource):boolean{
    const max = this.options.slidingWindowTime;
    if(now-p.getLastUpdate()>max && !p.errored()){
      if(!p.disposed()){
        p.setError(new ResourceSlidingUsageExpiredError());
        return false;
      }
      else{
        return this.handleResourceCollection(p);
      }
    }
    else
      return false;
  }

  protected garbageColletion(){
    if(this._disposed){
      removeSelected(this.resources, p=>this.handleResourceCollection(p))
      removeSelected(this.listenerResources, p=>this.handleResourceCollection(p));
    }
    else{
      removeSelected(this.resources, p=>this.handleRefCountCollection(p));      
      removeSelected(this.listenerResources, p=>this.handleRefCountCollection(p));
      
      removeSelected(this.resources, p=>this.handleErroredCollection(p));      
      removeSelected(this.listenerResources, p=>this.handleErroredCollection(p));
      
      const now = new Date().getTime();

      if(this.options.slidingWindowTime!==null && this.options.slidingWindowTime>0){
        removeSelected(this.resources, p=>this.handleExpiredSlidingWindowCollection(now, p));
        removeSelected(this.listenerResources, p=>this.handleExpiredSlidingWindowCollection(now, p));
      }

      if(this.options.maximumResourceLifetime!==null && this.options.maximumResourceLifetime>0){

        removeSelected(this.resources, p=>this.handleExpiredCollection(now,p));
        removeSelected(this.listenerResources, p=>this.handleExpiredCollection(now,p));
      }
    }
  }

  protected _disposed:boolean = false;
  dispose():void{
    if(!this._disposed){
      this._disposed = true;
      clearInterval(this._gcHandle);
      this.garbageColletion();
    }
  }

  async handleIncomingRequest(ctx: IncomingRequestContext, next: () => Promise<void>): Promise<void> {
    if(this._disposed)
      return await next();

    const request=ctx.getRequest();
    if(isPromiseCreateMessage(request.payload)){
      const resource = new PromiseListenerResource(request.payload.id);

      this.listenerResources.push(resource);
      
      resource.onping = (r) => {
        this.channel.sendRequest({
          type:'promise-ping',
          id:r.id
        })
        .catch((error)=>r.setError(error));
      }

      ctx.setResult(true);
    }
    else if(isObservableCreateMessage(request.payload)){
      const resource = new ObservableListenerResource(request.payload.id);

      this.listenerResources.push(resource);

      const subId = this.idProvider.nextId();
      resource.onsubscribe = p=>{
        this.channel.sendRequest({
          type:'observable-subscribe',
          id:p.id,
          subId:subId
        })
        .catch(error=>p.setError(error));

        return subId;
      }
      resource.onunsubscribe = (p, id)=>{
        this.channel.sendRequest({
          type:'observable-unsubscribe',
          id:p.id,
          subId:id
        })
        .catch(error=>p.setError(error));
      }

      ctx.setResult(true);
    }
    else if(isResourceActiveMessage(request.payload)){
      const resource = this.resources.find(p=>p.shouldHandle(request.payload));

      if(resource){
        resource.handle(request.payload);
        ctx.setResult(true);
      }
      else
        return await next();
    }
    else if(isResourcePassiveMessage(request.payload)){
      const resource = this.listenerResources.find(p=>p.shouldHandle(request.payload));

      if(resource){
        resource.handle(request.payload);
        ctx.setResult(true);
      }
      else
        return await next();
    }
    else
      return await next();
  }

  async wrapPromise<T>(promise:Promise<T>):Promise<number>{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = new PromiseResource(this.idProvider.nextId(), promise);

    resource.onresolve = (r,p) => {
      this.channel.sendRequest({
        type:'promise-resolve',
        id:r.id,
        payload:p
      })
      .then(()=>r.dispose())
      .catch((error)=>r.setError(error));
    }
    resource.onreject = (r,e) => {
      this.channel.sendRequest({
        type:'promise-reject',
        id:r.id,
        payload:e
      })
      .then(()=>r.dispose())
      .catch((error)=>r.setError(error));
    }

    this.resources.push(resource);

    return await this.channel.sendRequest({
      type:'promise-create',
      id:resource.id
    })
    .then(()=>resource.id)
    .catch(error=>{
      resource.setError(error);
      throw error;
    });
  }
  
  async wrapObservable<T>(observable:Observable<T>):Promise<number>{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = new ObservableResource(this.idProvider.nextId(), observable);
    
    resource.onnext = (r, p)=>{
      this.channel.sendRequest({
        type:'observable-next',
        id:r.id,
        payload:p
      })
      .catch((error)=>r.setError(error));
    };
    resource.onerror = (r, e)=>{
      this.channel.sendRequest({
        type:'observable-error',
        id:r.id,
        payload:e
      })
      .then(()=>r.dispose())
      .catch((error)=>r.setError(error));
    }
    resource.oncomplete = (r)=>{
      this.channel.sendRequest({
        type:'observable-complete',
        id:r.id
      })
      .then(()=>r.dispose())
      .catch((error)=>r.setError(error));
    }

    this.resources.push(resource);

    return await this.channel.sendRequest({
      type:'observable-create',
      id:resource.id
    })
    .then(()=>resource.id)
    .catch(error=>{
      resource.setError(error);
      throw error;
    });
  }

  getWrappedPromiseId(promise:Promise<any>):number{
    if(this._disposed)
      throw new Error("Manager disposed");

    const p = this.resources.find(p=>p instanceof PromiseResource && !p.errored() && !p.disposed() && p.promise === promise);
    return !p ? null : p.id;
  }

  getWrappedObservableId(observable:Observable<any>):number{
    if(this._disposed)
      throw new Error("Manager disposed");

    const p = this.resources.find(p=>p instanceof ObservableResource && !p.errored() && !p.disposed() && p.observable === observable);
    return !p ? null : p.id;
  }

  getListeningPromise(id:number):Promise<any>{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = this.listenerResources.find(p=>p.id===id && p instanceof PromiseListenerResource && !p.errored() && !p.disposed());

    return resource ? (<PromiseListenerResource>resource).promise : null;
  }

  getListeningObservable(id:number):Observable<any>{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = this.listenerResources.find(p=>p.id===id && p instanceof ObservableListenerResource && !p.errored() && !p.disposed());

    return resource ? (<ObservableListenerResource>resource).observable : null;
  }

  getListeningPromiseId(promise:Promise<any>):number{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = this.listenerResources.find(p=>p instanceof PromiseListenerResource && !p.errored() && !p.disposed() && p.promise===promise);

    return !resource ? null : resource.id;
  }

  getListeningObservableId(observable:Observable<any>):number{
    if(this._disposed)
      throw new Error("Manager disposed");

    const resource = this.listenerResources.find(p=>p instanceof ObservableListenerResource && !p.errored() && !p.disposed() && p.observable===observable);

    return !resource ? null : resource.id;
  }
}