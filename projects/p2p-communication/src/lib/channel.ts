import { Subject, Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { SequentialIdProvider, IdProvider, Disposable, isDisposable, toJSON, visitObject } from './utils';

export enum ResponseCode{
  OK=200,
  CHANNEL_UNKNOWN_ERROR=-1,
  RESPONSE_HANDLING_ERROR=410,
  REQUEST_ERROR = 500,
  REQUEST_MISSING_RESPONSE_ERROR = 501,
  REQUEST_TIMEOUT_ERROR = 502
}

export class ChannelError{  
  constructor(public readonly message:string, public readonly code:ResponseCode) {
  }
}

export class NoResponseError extends ChannelError{
  code:ResponseCode.REQUEST_MISSING_RESPONSE_ERROR;
  constructor(message:string='Missing response') {
    super(message, ResponseCode.REQUEST_MISSING_RESPONSE_ERROR);
  }
}
export class RequestTimeoutError extends ChannelError{
  code:ResponseCode.REQUEST_TIMEOUT_ERROR;
  constructor(message:string='Request timeout') {
    super(message, ResponseCode.REQUEST_TIMEOUT_ERROR);
  }
}
export class ResponseHandlingError extends ChannelError{
  code:ResponseCode.RESPONSE_HANDLING_ERROR;
  constructor(public readonly originalError:any, message:string='Response handling error') {
    super(message, ResponseCode.RESPONSE_HANDLING_ERROR);
  }
}

export type MessageType='rpc-request'|'rpc-response'|'event';

export interface Message{
  type:MessageType
  id:number;
  payload:any;
}

export interface EventMessage extends Message{
  type:'event';
}

export interface RequestMessage extends Message{
  type:'rpc-request';
}

export interface ResponseMessage extends Message{
  type:'rpc-response';
  reqId:number;
  code:ResponseCode;
}

export interface SuccessResponse extends ResponseMessage{
  reqId:number;
  code:ResponseCode.OK;
}

export interface ErrorPayload{
  code:ResponseCode;
  message:string;
}

export interface ErrorResponse extends ResponseMessage {
  reqId:number;
  payload:ErrorPayload;
}

export function isEvent(p:any): p is EventMessage{
  return p && p.type === 'event';
}
export function isRequest(p:any): p is RequestMessage{
  return p && p.type === 'rpc-request';
}
export function isResponse(p:any): p is ResponseMessage{
  return p && p.type === 'rpc-response';
}

export function isSuccessResponse(p:any): p is SuccessResponse{
  return isResponse(p) && p.code===ResponseCode.OK;
}
export function isErrorResponse(p:any): p is ErrorResponse{
  return isResponse(p) && p.code!==ResponseCode.OK;
}

interface ActiveRequest {
  age:number;
  request:RequestMessage;
  resolve:(p:any)=>void;
  reject:(e:ChannelError)=>void;
  timer?:any;
}

export interface Transport {
  onmessage: ((ev: MessageEvent) => any) | null;
  onmessageerror: ((ev: MessageEvent) => any) | null;
  close(): void;
  postMessage(message: any, transfer?: Transferable[]): void;
  start(): void;
}

export interface OutgoingRequestContext {
  getRequest():RequestMessage;
  getTransferables():Transferable[];
  timeout:number;
}
export interface IncomingRequestContext{
  getRequest():RequestMessage;
  setResult(value:any):void;
  getResult():any;
  getTransferables():Transferable[];
  isCompleted():boolean;
}
export interface IncomingResponseContext {
  getRequest():RequestMessage;
  getResponse():ResponseMessage;
}

class OutgoingRequestContextImpl implements OutgoingRequestContext{
  
  private _transferables:Transferable[]=[];
  constructor(private readonly _request:RequestMessage) {
  }

  timeout:number;

  getRequest():RequestMessage{
    return this._request;
  }
  getTransferables():Transferable[]{
    return this._transferables;
  }
}

class IncomingRequestContextImpl implements IncomingRequestContext{
  private _completed:boolean;
  private _result:any;
  
  private _transferables:Transferable[]=[];
  constructor(private readonly _request:RequestMessage) {
  }

  getRequest():RequestMessage{
    return this._request;
  }
  
  isCompleted():boolean{
    return this._completed;
  }

  getTransferables():Transferable[]{
    return this._transferables;
  }
  getResult():any{
    return this._result;
  }
  setResult(value:any){    
    if(value===undefined)
      throw new Error("'value' must be set")
    if(this.isCompleted())
      throw new Error("'result' already set");

    this._completed = true;
    this._result = value;
  }
}

class IncomingResponseContextImpl implements IncomingResponseContext{
  constructor(private readonly _request:RequestMessage, private readonly _response:ResponseMessage) {
  }

  timeout:number;

  getRequest():RequestMessage{
    return this._request;
  }
  getResponse():ResponseMessage{
    return this._response;
  }
}

export type OutgoingRequestMiddlewareFn=(ctx:OutgoingRequestContext, next:()=>Promise<void>)=>Promise<void>;
export type IncomingRequestMiddlewareFn=(ctx:IncomingRequestContext, next:()=>Promise<void>)=>Promise<void>;
export type IncomingResponseMiddlewareFn=(ctx:IncomingResponseContext, next:()=>Promise<void>)=>Promise<void>;

export interface IncomingRequestMiddleware{
  handleIncomingRequest(ctx:IncomingRequestContext, next:()=>Promise<void>):Promise<void>;
}
export interface OutgoingRequestMiddleware{
  handleOutogingRequest(ctx:OutgoingRequestContext, next:()=>Promise<void>):Promise<void>;
}
export interface IncomingResponseMiddleware{
  handleIncomingResponse(ctx:IncomingResponseContext, next:()=>Promise<void>):Promise<void>;
}

export function isIncomingRequestMiddleware(p:any):p is IncomingRequestMiddleware{
  return p && p.handleIncomingRequest && typeof(p.handleIncomingRequest)==='function';
}
export function isOutgoingRequestMiddleware(p:any):p is OutgoingRequestMiddleware{
  return p && p.handleOutogingRequest && typeof(p.handleOutogingRequest)==='function';
}
export function isIncomingResponseMiddleware(p:any):p is IncomingResponseMiddleware{
  return p && p.handleIncomingResponse && typeof(p.handleIncomingResponse)==='function';
}

export interface ChannelConfigurationOptions{
  globalRequestTimeout:number
}

const defaultChannelConfigurationOptions:ChannelConfigurationOptions = {
  globalRequestTimeout:30*1000
};

export interface ChannelBuilder{
  use(md:OutgoingRequestMiddleware|IncomingRequestMiddleware|IncomingResponseMiddleware):this;
  useForOutgoingRequest(fn:OutgoingRequestMiddlewareFn|OutgoingRequestMiddleware):this;
  useForIncomingRequest(fn:IncomingRequestMiddlewareFn|IncomingRequestMiddleware):this;
  useForIncomingResponse(fn:IncomingResponseMiddlewareFn|IncomingResponseMiddleware):this;
  config(options:Partial<ChannelConfigurationOptions>):this;
}

export type ChannelBuilderFn=(channel:Channel, builder:ChannelBuilder)=>void;

export class Channel implements Disposable {
  
  protected readonly _error$:Subject<any> = new Subject<any>();
  public readonly error$:Observable<any> = this._error$.pipe(share());

  protected readonly _event$:Subject<any> = new Subject<any>();
  public readonly event$:Observable<any> = this._event$.pipe(share());

  protected readonly _outgoingRequest$:Subject<RequestMessage> = new Subject<RequestMessage>();
  public readonly outgoingRequest$:Observable<RequestMessage> = this._outgoingRequest$.pipe(share());

  protected readonly _outgoingResponse$:Subject<ResponseMessage> = new Subject<ResponseMessage>();
  public readonly outgoingResponse$:Observable<ResponseMessage> = this._outgoingResponse$.pipe(share());
  
  protected readonly _outgoingEvent$:Subject<EventMessage> = new Subject<EventMessage>();
  public readonly outgoingEvent$:Observable<EventMessage> = this._outgoingEvent$.pipe(share());

  protected readonly _incomingRequest$:Subject<RequestMessage> = new Subject<RequestMessage>();
  public readonly incomingRequest$:Observable<RequestMessage> = this._incomingRequest$.pipe(share());

  protected readonly _incomingResponse$:Subject<ResponseMessage> = new Subject<ResponseMessage>();
  public readonly incomingResponse$:Observable<ResponseMessage> = this._incomingResponse$.pipe(share());
  
  protected readonly _incomingEvent$:Subject<EventMessage> = new Subject<EventMessage>();
  public readonly incomingEvent$:Observable<EventMessage> = this._incomingEvent$.pipe(share());

  protected readonly idProvider:IdProvider;

  protected options:ChannelConfigurationOptions = {...defaultChannelConfigurationOptions};

  protected outgoingRequestMiddlewares:(OutgoingRequestMiddlewareFn|OutgoingRequestMiddleware)[]=[];
  protected incomingRequestMiddlewares:(IncomingRequestMiddlewareFn|IncomingRequestMiddleware)[]=[];
  protected incomingResponseMiddlewares:(IncomingResponseMiddlewareFn|IncomingResponseMiddleware)[]=[];

  protected findIndexOf(op:number|ActiveRequest){
    if(typeof(op)==='number'){
      return this._activeRequests.findIndex(p=>p.request.id==op);
    }
    else{
      return this._activeRequests.indexOf(op);
    }
  }

  protected removeActiveRequest(op:number|ActiveRequest){
    const idx=this.findIndexOf(op);

    if(idx>=0){
      if(!!this._activeRequests[idx].timer)
        clearTimeout(this._activeRequests[idx].timer);
      this._activeRequests.splice(idx, 1);
    }
  }

  protected tryResolveActiveRequest(op:number|ActiveRequest, result:any){

    const idx=this.findIndexOf(op);

    if(idx>=0)
      this._activeRequests[idx].resolve(result);
  }
  
  protected tryRejectActiveRequest(op:number|ActiveRequest, error:ChannelError){

    const idx=this.findIndexOf(op);

    if(idx>=0)
      this._activeRequests[idx].reject(error);
  }

  constructor(protected readonly transport:Transport, builderFn:ChannelBuilderFn) {
    if(!transport)
      throw new Error("'transport' must be set");
    
    if(!builderFn)
      throw new Error("'builderFn' must be set");

    this.idProvider =  new SequentialIdProvider();

    const self = this;
    builderFn(this, {
      use: function(md:OutgoingRequestMiddleware|IncomingRequestMiddleware|IncomingResponseMiddleware){
        if(isOutgoingRequestMiddleware(md))
          self.outgoingRequestMiddlewares.push(md);
        if(isIncomingRequestMiddleware(md))
          self.incomingRequestMiddlewares.push(md);
        if(isIncomingResponseMiddleware(md))
          self.incomingResponseMiddlewares.push(md);

        return this;
      },
      useForOutgoingRequest: function(fn:OutgoingRequestMiddlewareFn|OutgoingRequestMiddleware){
        if(!fn)
          throw new Error("'fn' must be set");
        if(typeof(fn)!=='function' && !isOutgoingRequestMiddleware(fn))
          throw new Error("'fn' must be a middleware");

        self.outgoingRequestMiddlewares.push(fn);

        return this;
      },
      useForIncomingRequest:function (fn:IncomingRequestMiddlewareFn|IncomingRequestMiddleware){
        if(!fn)
          throw new Error("'fn' must be set");
        if(typeof(fn)!=='function' && !isIncomingRequestMiddleware(fn))
          throw new Error("'fn' must be a middleware");

        self.incomingRequestMiddlewares.push(fn);

        return this;
      },
      useForIncomingResponse:function (fn:IncomingResponseMiddlewareFn|IncomingResponseMiddleware){
        if(!fn)
          throw new Error("'fn' must be set");
        if(typeof(fn)!=='function' && !isIncomingRequestMiddleware(fn))
          throw new Error("'fn' must be a middleware");

        self.incomingResponseMiddlewares.push(fn);

        return this;
      },
      config:function (options:Partial<ChannelConfigurationOptions>){
        if(!options)
          throw new Error("'options' must be set");

        self.options = {...self.options, ...options};

        return this;
      }
    });

    transport.onmessage = (evt)=>this.handleMessage(evt);
    transport.onmessageerror = (evt)=>this.handleError(evt);

    transport.start();
  }

  protected _disposed:boolean=false;
  dispose():void{
    if(!this._disposed){
      this._disposed=true;

      this.incomingRequestMiddlewares.filter(p=>isDisposable(p)).forEach(p=>(<any>p).dispose());
      this.outgoingRequestMiddlewares.filter(p=>isDisposable(p)).forEach(p=>(<any>p).dispose());
      this.incomingResponseMiddlewares.filter(p=>isDisposable(p)).forEach(p=>(<any>p).dispose());

      this.incomingRequestMiddlewares.splice(0, this.incomingRequestMiddlewares.length);
      this.outgoingRequestMiddlewares.splice(0, this.outgoingRequestMiddlewares.length);
      this.incomingResponseMiddlewares.splice(0, this.incomingResponseMiddlewares.length);

      this.transport.close();
    }
  }

  protected readonly _activeRequests:ActiveRequest[]=[];

  private async executeOutgoingRequestMiddlewarePipeline(middlewares:(OutgoingRequestMiddlewareFn|OutgoingRequestMiddleware)[], ctx:OutgoingRequestContext, index:number=0):Promise<void>{
    if(this._disposed)
      throw new Error('Channel disposed');

    if(middlewares && middlewares.length>0 && index<middlewares.length){
      const middleware = middlewares[index];
      if(isOutgoingRequestMiddleware(middleware))
        await middleware.handleOutogingRequest(ctx, ()=>this.executeOutgoingRequestMiddlewarePipeline(middlewares, ctx, index+1));
      else
        await middleware(ctx, ()=>this.executeOutgoingRequestMiddlewarePipeline(middlewares, ctx, index+1));
    }
  }
  private async executeIncomingRequestMiddlewarePipeline(middlewares:(IncomingRequestMiddlewareFn|IncomingRequestMiddleware)[], ctx:IncomingRequestContext, index:number=0):Promise<void>{
    if(this._disposed)
      throw new Error('Channel disposed');

    if(middlewares && middlewares.length>0 && index<middlewares.length && !ctx.isCompleted()){
      const middleware = middlewares[index];
      if(isIncomingRequestMiddleware(middleware))
        await middleware.handleIncomingRequest(ctx, ()=>this.executeIncomingRequestMiddlewarePipeline(middlewares, ctx, index+1));
      else
        await middleware(ctx, ()=>this.executeIncomingRequestMiddlewarePipeline(middlewares, ctx, index+1));
    }
  }
  private async executeIncomingResponseMiddlewarePipeline(middlewares:(IncomingResponseMiddlewareFn|IncomingResponseMiddleware)[], ctx:IncomingResponseContext, index:number=0):Promise<void>{
    if(this._disposed)
      throw new Error('Channel disposed');

    if(middlewares && middlewares.length>0 && index<middlewares.length){
      const middleware = middlewares[index];
      if(isIncomingResponseMiddleware(middleware))
        await middleware.handleIncomingResponse(ctx, ()=>this.executeIncomingResponseMiddlewarePipeline(middlewares, ctx, index+1));
      else
        await middleware(ctx, ()=>this.executeIncomingResponseMiddlewarePipeline(middlewares, ctx, index+1));
    }
  }

  public async sendRequest(payload:any, timeout?:number, transferables?:Transferable[]):Promise<any>{
    if(this._disposed)
      throw new Error('Channel disposed');

    const request:RequestMessage = {
      type:'rpc-request',
      id:this.idProvider.nextId(),
      payload: payload
    };

    const ctx = new OutgoingRequestContextImpl(request);

    if(transferables && transferables.length>0)
      ctx.getTransferables().splice(0,0,...transferables);

    await this.executeOutgoingRequestMiddlewarePipeline(this.outgoingRequestMiddlewares, ctx);

    const promise = new Promise<any>((resolve, reject)=>{
      const op:ActiveRequest = {
        age:new Date().getTime(),
        request: request,
        resolve: resolve,
        reject: reject
      };
    
      timeout = timeout && timeout>0 ? timeout : 
        ctx.timeout && ctx.timeout>0 ? ctx.timeout : 
        this.options.globalRequestTimeout;

      if(!!timeout && timeout>0){
        op.timer = setTimeout(()=>{
          op.reject(new RequestTimeoutError());
        }, timeout);
      }
      this._activeRequests.push(op);
    });

    promise.then(
      result=>this.removeActiveRequest(payload.id),
      (error:ChannelError)=>{ this.removeActiveRequest(payload.id); throw error; }
    );

    visitObject(request.payload, p=>{
      if(p instanceof Error){
        return { value: JSON.parse(toJSON(p)), visited:true};
      }
      else{
        return {value:null, visited:false};
      }
    });

    this._outgoingRequest$.next(request);

    const tr = ctx.getTransferables();
    if(tr.length>0){
      this.transport.postMessage(request, tr);
    }
    else{
      this.transport.postMessage(request);
    }

    return await promise;
  }
  
  public sendResponse(reqId:number, code:ResponseCode, ctx:ChannelError):void
  public sendResponse(reqId:number, code:ResponseCode.OK, ctx:IncomingRequestContext):void
  public sendResponse(reqId:number, code:ResponseCode, ctx:IncomingRequestContext|ChannelError):void{
    if(this._disposed)
      return;

    if(!reqId)
      throw new Error("'reqId' must be set");

    const response:ResponseMessage = {
      type:'rpc-response',
      id:this.idProvider.nextId(),
      payload: code === ResponseCode.OK ? (<IncomingRequestContext>ctx).getResult():<ChannelError>ctx,
      reqId: reqId,
      code: code
    };
    
    visitObject(response.payload, p=>{
      if(p instanceof Error){
        return { value: JSON.parse(toJSON(p)), visited:true };
      }
      else{
        return {value:null, visited:false};
      }
    });

    this._outgoingResponse$.next(response);

    if(code === ResponseCode.OK){
      const transferables=(<IncomingRequestContext>ctx).getTransferables();
      if(transferables.length>0){
        this.transport.postMessage(response, transferables);
      }
      else{
        this.transport.postMessage(response);
      }
    }
    else{
      this.transport.postMessage(response);
    }
  }

  public sendEvent(payload:any, transferables?:Transferable[]):void{
    if(this._disposed)
      return;

    const event:EventMessage = {
      type:'event',
      id:this.idProvider.nextId(),
      payload: payload
    };
    
    visitObject(event.payload, p=>{
      if(p instanceof Error){
        return { value: JSON.parse(toJSON(p)), visited:true};
      }
      else{
        return {value:null, visited:false};
      }
    });

    this._outgoingEvent$.next(event);

    if(transferables && transferables.length>0)
      this.transport.postMessage(event, transferables);
    else
      this.transport.postMessage(event);
  }

  protected async handleMessage(message:MessageEvent){
    const data = message.data;
    try{
      if (isRequest(data)){
        this._incomingRequest$.next(data);

        try{
          const ctx=new IncomingRequestContextImpl(data);

          await this.executeIncomingRequestMiddlewarePipeline(this.incomingRequestMiddlewares, ctx);

          if(!ctx.isCompleted())
            throw new NoResponseError();

          this.sendResponse(data.id, ResponseCode.OK, ctx);
        }
        catch(error){
          if(error instanceof ChannelError === false){
            error = new ChannelError(error.message, ResponseCode.REQUEST_ERROR);
          }
          this.sendResponse(data.id, error.code, error);
        }
      }
      else if(isResponse(data)){
        this._incomingResponse$.next(data);

        const idx=this.findIndexOf(data.reqId);
        if(idx>=0){
          const activeRequest = this._activeRequests[idx];
          const ctx = new IncomingResponseContextImpl(activeRequest.request, data);

          try{
            await this.executeIncomingResponseMiddlewarePipeline(this.incomingResponseMiddlewares, ctx);
          }
          catch(error){
            this.tryRejectActiveRequest(activeRequest, new ResponseHandlingError(error));
          }

          const response = ctx.getResponse();
          if(isSuccessResponse(response)){
            this.tryResolveActiveRequest(activeRequest, response.payload);
          }
          else if(isErrorResponse(response)){
            this.tryRejectActiveRequest(activeRequest, response.payload);
          }
        }
      }
      else if(isEvent(data)){
        this._incomingEvent$.next(data);
        
        this._event$.next(data.payload);
      }
    }
    catch(error){
      this._error$.next(error);
    }
  }
  protected handleError(message:MessageEvent){
    this._error$.next(message.data);
  }
}