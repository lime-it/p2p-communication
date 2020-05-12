import { Transport, Channel, ResponseCode } from './channel';
import { ServiceManager, TracingMiddleware } from './middlewares';
import { serviceChannelFactory } from './factories';
import { Subscription, Observable } from 'rxjs';

class Signal<T>{
  public readonly promise:Promise<T>;
  private _resolve:(value:T)=>void;
  private _reject:(err:Error)=>void;
  constructor(){
    this.promise=new Promise<T>((resolve, reject)=>{
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  private _value:T = null;
  get value(){
    return this._value;
  }
  
  private _error:any = null;
  get error(){
    return this._error;
  }

  private _completed:boolean=false;
  get completed(){
    return this._completed;
  }
  private _failed:boolean=null;
  get failed(){
    return this._failed;
  }

  fail(err?:Error){
    if(!this._completed && !this._failed){
      this._error=err;
      this._failed=true;
      this._reject(err);
    }
  }
  complete(value:T){
    if(!this._completed && !this._failed){
      this._value = value;
      this._completed=true;
      this._resolve(value);
    }
  }
}

export interface P2pConnectionConfig{
  debug:boolean;
  peerReadyPollInterval:number;
  peerReadyTiemout:number;
}

const defaultConfig: P2pConnectionConfig = {
  debug: false,
  peerReadyPollInterval: 250,
  peerReadyTiemout:30*1000
};

export type ConnectRequestHandlerFn = (endpoint:string,port:MessagePort)=>void;

export class P2pConnection {

  private _eventSub:Subscription=Subscription.EMPTY;

  public readonly event$:Observable<any>;
  public readonly error$:Observable<any>;

  private readonly _channel:Channel;

  private _peerReady:Signal<boolean> = new Signal<boolean>();

  constructor(private readonly transport:Transport, private readonly onconnect:ConnectRequestHandlerFn, config?:Partial<P2pConnectionConfig>) {
    config = config ? {...defaultConfig, ...config} : {...defaultConfig};

    if(!config.peerReadyPollInterval || config.peerReadyPollInterval <=0)
      throw new Error("'peerReadyPollInterval' must be set and greater than 0");
    if(!config.peerReadyTiemout || config.peerReadyTiemout <=0)
      throw new Error("'peerReadyTiemout' must be set and greater than 0");
    if(!onconnect)
      throw new Error("'onconnect' must be set");

    this._channel = new Channel(transport, (c, b)=>{
      if(config.debug){
        b.use(new TracingMiddleware(c));
      }
      b.useForIncomingRequest(async (ctx, next)=>{
        const req = ctx.getRequest();
        if(req.payload.endpoint && req.payload.port){
          this.onconnect(req.payload.endpoint, req.payload.port);
          ctx.setResult(null);
        }
        else
          await next();
      });
    });

    this._eventSub = this._channel.event$.subscribe(evt=>{
      if(evt=='ready'){
        this._peerReady.complete(true);
      }
      else if(evt=='close'){
        this._peerReady.fail(new Error('peer closed'));
        this.close();
      }
    });

    this.event$ = this._channel.event$;
    this.error$ = this._channel.error$;

    const poll_h = setInterval(()=>this.notifyReady(), config.peerReadyPollInterval);
    const timeout_h = setTimeout(()=>{
      this.close();
      this._peerReady.fail(new Error("peer ready timeout"));
    }, config.peerReadyTiemout);

    this._peerReady.promise
    .then(()=>this.notifyReady(), e=>this.close())
    .then(()=>{
      clearTimeout(timeout_h);
      clearInterval(poll_h);
    });
  }

  async waitPeer():Promise<void>{
    await this._peerReady.promise;
  }

  isPeerReady():boolean{
    return this._peerReady.value;
  }

  notifyReady():void{
    this._channel.sendEvent('ready');
  }

  async connect(endpoint:string, port:MessagePort, timeout:number=5000):Promise<void>{
    await this._channel.sendRequest({endpoint:endpoint, port: port}, timeout, [port]);
  }

  close():void{
    try{
      this._channel.sendEvent('close');
    }
    catch(err){}
    
    this._eventSub.unsubscribe();
    this._channel.dispose();
  }
}