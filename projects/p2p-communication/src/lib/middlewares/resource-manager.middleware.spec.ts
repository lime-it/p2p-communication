import { Channel } from "../channel";
import { ResourceManager } from './resource-manager.middleware';
import { Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TracingMiddleware } from './tracing.middleware';

function delayTest(time:number):Promise<void>{
  if(time && time>0)
    return new Promise<void>((resolve,_)=>{
      setTimeout(()=>resolve(),time);
    });
  else
    return Promise.resolve();
}

describe('resource manager middleware', () => {

  it('remote promise', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localPromise = new Promise<string>((resolve,reject)=>{
      setTimeout(()=>resolve('test'),500);
    });

    const rid = await manager1.wrapPromise(localPromise);

    const remotePromise = manager2.getListeningPromise(rid);

    expect(remotePromise).not.toBeNull();

    expectAsync(remotePromise).toBeResolvedTo('test');
    expectAsync(localPromise).toBeResolvedTo('test');

  });
  
  it('remote promise rejection', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localPromise = new Promise<string>((resolve,reject)=>{
      setTimeout(()=>reject('test'),500);
    });

    const rid = await manager1.wrapPromise(localPromise);

    const remotePromise = manager2.getListeningPromise(rid);

    expect(remotePromise).not.toBeNull();

    expectAsync(remotePromise).toBeRejectedWith('test');
    expectAsync(localPromise).toBeRejectedWith('test');

  });

  it('remote observable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localObservable = new Subject<number>();

    const rid = await manager1.wrapObservable(localObservable.pipe(tap(p=>stack.push(p))));

    const remoteObservable = manager2.getListeningObservable(rid);

    localObservable.next(0);
    localObservable.next(1);
    localObservable.next(2);

    await delayTest(100);

    expect(remoteObservable).not.toBeNull();
    expect(stack).toEqual([]);

    const rStack=[];
    let completed=false;
    remoteObservable.subscribe(p=>{
      expect(p).toBeGreaterThanOrEqual(0);
      rStack.push(p);
    },()=>{},()=>{completed=true})

    await delayTest(100);

    expect(completed).toBeFalsy();
    
    localObservable.next(3);
    localObservable.next(4);

    expect(stack).toEqual([3,4]);

    localObservable.complete();

    localObservable.next(5);

    expect(stack).toEqual([3,4]);

    await delayTest(100);
    
    expect(completed).toBeTruthy();

    expect(rStack).toEqual([3,4]);
  }, 5000);

  it('remote observable error', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localObservable = new Subject<number>();

    const rid = await manager1.wrapObservable(localObservable.pipe(tap(p=>stack.push(p))));

    const remoteObservable = manager2.getListeningObservable(rid);

    localObservable.next(0);
    localObservable.next(1);
    localObservable.next(2);

    await delayTest(100);

    expect(remoteObservable).not.toBeNull();
    expect(stack).toEqual([]);

    const rStack=[];
    let completed=false;
    let error:any=null;
    remoteObservable.subscribe(p=>{
      expect(p).toBeGreaterThanOrEqual(0);
      rStack.push(p);
    },(e)=>{error=e},()=>{completed=true})

    await delayTest(100);

    expect(completed).toBeFalsy();
    
    localObservable.next(3);
    localObservable.next(4);

    expect(stack).toEqual([3,4]);

    localObservable.error('test');

    localObservable.next(5);

    expect(stack).toEqual([3,4]);

    await delayTest(100);
    
    expect(completed).toBeFalsy();
    expect(error).toEqual('test');

    expect(rStack).toEqual([3,4]);
  }, 5000);

  it('remote observable already completed', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localObservable = new Subject<number>();
    localObservable.complete();

    const rid = await manager1.wrapObservable(localObservable.pipe(tap(p=>stack.push(p))));

    const remoteObservable = manager2.getListeningObservable(rid);

    localObservable.next(0);
    localObservable.next(1);
    localObservable.next(2);

    await delayTest(100);

    expect(remoteObservable).not.toBeNull();
    expect(stack).toEqual([]);

    const rStack=[];
    let completed=false;
    remoteObservable.subscribe(p=>{
      expect(p).toBeGreaterThanOrEqual(0);
      rStack.push(p);
    },()=>{},()=>{completed=true})

    await delayTest(100);

    expect(completed).toBeTruthy();
    
    localObservable.next(3);
    localObservable.next(4);

    expect(stack).toEqual([]);

    expect(rStack).toEqual([]);
  }, 5000);
  
  it('remote observable already errored', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localObservable = new Subject<number>();
    localObservable.error('test');

    const rid = await manager1.wrapObservable(localObservable.pipe(tap(p=>stack.push(p))));

    const remoteObservable = manager2.getListeningObservable(rid);

    localObservable.next(0);
    localObservable.next(1);
    localObservable.next(2);

    await delayTest(100);

    expect(remoteObservable).not.toBeNull();
    expect(stack).toEqual([]);

    const rStack=[];
    let completed=false;
    let error:any=null;
    remoteObservable.subscribe(p=>{
      expect(p).toBeGreaterThanOrEqual(0);
      rStack.push(p);
    },(e)=>{error=e},()=>{completed=true})

    await delayTest(100);

    expect(completed).toBeFalsy();
    expect(error).toEqual('test');
    
    localObservable.next(3);
    localObservable.next(4);

    expect(stack).toEqual([]);

    expect(rStack).toEqual([]);
  }, 5000);
  
  it('remote observable unsubscribe', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager1=new ResourceManager(c));
    });

    let manager2:ResourceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(manager2=new ResourceManager(c));
    });

    const localObservable = new Subject<number>();

    const rid = await manager1.wrapObservable(localObservable.pipe(tap(p=>stack.push(p))));

    const remoteObservable = manager2.getListeningObservable(rid);

    localObservable.next(0);
    localObservable.next(1);
    localObservable.next(2);

    await delayTest(100);

    expect(remoteObservable).not.toBeNull();
    expect(stack).toEqual([]);

    const rStack=[];
    let completed=false;
    let error:any=null;
    const subscription=remoteObservable.subscribe(p=>{
      expect(p).toBeGreaterThanOrEqual(0);
      rStack.push(p);
    },(e)=>{error=e},()=>{completed=true})

    await delayTest(100);

    expect(completed).toBeFalsy();
    
    localObservable.next(3);
    localObservable.next(4);

    expect(stack).toEqual([3,4]);

    await delayTest(100);
    
    subscription.unsubscribe();

    localObservable.next(5);

    expect(stack).toEqual([3,4,5]);

    await delayTest(100);
    
    expect(completed).toBeFalsy();
    expect(error).toBeNull();

    expect(rStack).toEqual([3,4]);
  }, 5000);

});
