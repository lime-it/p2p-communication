import { Transport, Channel } from './channel';
import { TracingMiddleware } from './middlewares/tracing.middleware';
import { ResourceManager } from './middlewares/resource-manager.middleware';
import { ServiceManager, ServiceManagerBuilderFn } from './middlewares/service-manager.middleware';
import { getTransferables, Disposable } from './utils';
import { Observable, Subject } from 'rxjs';
import { share } from 'rxjs/operators';

export interface ServiceChannelConfig{
  debug:boolean;
}

const defaultConfig:ServiceChannelConfig={
  debug:false
};

export function serviceChannelFactory(transport:Transport, builderFn?:ServiceManagerBuilderFn, config?:Partial<ServiceChannelConfig>){
  config = config ? {...defaultConfig, ...config} : {...defaultConfig};

  builderFn = builderFn ? builderFn : (m, b)=>{};
  
  let manager: ServiceManager = null;

  const channel = new Channel(transport, (c, b)=>{
    let rm = new ResourceManager(c);
    manager = new ServiceManager(c, rm, (m,b)=>{
      b.addService('dispose', async ()=>{ m.channel.dispose() });

      builderFn(m,b);
    });
    if(config.debug){
      b.use(new TracingMiddleware());
    }
    b.use(rm);
    b.use(manager);
  });

  return manager;
}

export function windowSelfToWindowTransport(endpoint:WindowProxy, targetOrigin:string = '*'):Transport{
  if(self.document===undefined)
    throw new Error('Not in a window');

  let onmessage:(evt:MessageEvent)=>void = null;
  let onmessageerror:(evt:MessageEvent)=>void = null;

  const result:Transport = {
    onmessage: null,
    onmessageerror: null,
    close:()=>{
      self.removeEventListener('message', onmessage);
      self.removeEventListener('messageerror', onmessageerror);
    },
    postMessage: (message: any, transfer?: Transferable[])=>{
      endpoint.postMessage(message, targetOrigin, transfer);
    },
    start:()=>{          
      self.addEventListener('message', onmessage = evt=> {
        if(evt.source === endpoint && result.onmessage){
          result.onmessage(evt);
          targetOrigin = evt.origin;
        }
      });
      self.addEventListener('messageerror', onmessageerror = evt=> {
        if(evt.source === endpoint && result.onmessageerror){
          result.onmessageerror(evt);
          targetOrigin = evt.origin;
        }
      });
    }
  };

  return result;
}

export function workerToTransport(endpoint:Worker):Transport{
  let onmessage:(evt:MessageEvent)=>void = null;
  let onmessageerror:(evt:MessageEvent)=>void = null;

  const result:Transport = {
    onmessage: null,
    onmessageerror: null,
    close:()=>{
      endpoint.removeEventListener('message', onmessage);
      endpoint.removeEventListener('messageerror', onmessageerror);
    },
    postMessage: (message: any, transfer?: Transferable[])=>{
      endpoint.postMessage(message, transfer);
    },
    start:()=>{    
      endpoint.addEventListener('message', onmessage = evt=> result.onmessage && result.onmessage(evt));
      endpoint.addEventListener('messageerror', onmessageerror = evt=> result.onmessageerror && result.onmessageerror(evt));
    }
  };

  return result;
}

export function workerSelfToTransport():Transport{
  if(self.document!==undefined)
    throw new Error('Not in a webworker');

  let onmessage:(evt:MessageEvent)=>void = null;
  let onmessageerror:(evt:MessageEvent)=>void = null;

  const result:Transport = {
    onmessage: null,
    onmessageerror: null,
    close:()=>{
      self.removeEventListener('message', onmessage);
      self.removeEventListener('messageerror', onmessageerror);
    },
    postMessage: (message: any, transfer?: Transferable[])=>{
      (self as any).postMessage(message, transfer);
    },
    start:()=>{
      self.addEventListener('message', onmessage = evt=> result.onmessage && result.onmessage(evt));
      self.addEventListener('messageerror', onmessageerror = evt=> result.onmessageerror && result.onmessageerror(evt));
    }
  };

  return result;
}

export class TransportLink<T1=any, T2=any> implements Disposable{
  private readonly _message$:Subject<{p1:T1,p2:T2}> = new Subject<{p1:T1,p2:T2}>();
  public readonly message$:Observable<{p1:T1,p2:T2}> = this._message$.pipe(share());
  constructor(public readonly t1:Transport, public readonly t2:Transport) {
    if(!t1)
      throw new Error("'t1' must be set")
    if(!t2)
      throw new Error("'t2' must be set")

    t1.onmessage=async e=>{
      const transferables = await getTransferables(e.data);

      this._message$.next({p1:e.data, p2:undefined});

      t2.postMessage(e.data, transferables);
    }
    t2.onmessage=async e=>{
      const transferables = await getTransferables(e.data);

      this._message$.next({p1:undefined, p2:e.data});

      t1.postMessage(e.data, transferables);
    }

    t1.start();
    t2.start();
  }
  dispose(): void {
    this.t1.onmessage = null;
    this.t2.onmessage = null;

    this._message$.complete();
  }
}