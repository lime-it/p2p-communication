import { ResourceManager } from "./resource-manager.middleware";
import { Channel } from '../channel';
import { ServiceManager } from './service-manager.middleware';
import { Subject, Observable } from 'rxjs';
import { tap, take } from 'rxjs/operators';
import { TracingMiddleware } from './tracing.middleware';

function delayTest(time:number):Promise<void>{
  if(time && time>0)
    return new Promise<void>((resolve,_)=>{
      setTimeout(()=>resolve(),time);
    });
  else
    return Promise.resolve();
}

describe('service manager middleware', () => {

  it('remote invocation primitive', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/valueX2', async (value:number)=>value*2);
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const valueX2 = svcManger2.getMethodInvoker<number, number>('test/valueX2');

    const res_0 = await valueX2(5);

    await delayTest(100);

    expect(res_0).toEqual(10);

  });
  
  it('remote invocation primitive error', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/valueX2', async (value:number)=>{throw new Error('test');});
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const valueX2 = svcManger2.getMethodInvoker<number, number>('test/valueX2');

    try{
      await valueX2(5);
      fail('Error expected');
    }
    catch(err){
      expect(err.message).toEqual('test');
    }

  });
  
  it('remote invocation promise', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/promiseX2', async (value:number)=>await new Promise<number>((r)=>setTimeout(()=>r(value*2),500)));
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const promiseX2 = svcManger2.getMethodInvoker<number, number>('test/promiseX2');

    const res_1 = await promiseX2(5);
    
    await delayTest(100);
    
    expect(res_1).toEqual(10);

  });
  
  it('remote invocation promise error', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/promiseX2', async (value:number)=>await new Promise<number>((_,r)=>setTimeout(()=>r(new Error('test')),500)));
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const promiseX2 = svcManger2.getMethodInvoker<number, number>('test/promiseX2');

    try{
      await promiseX2(5);
      fail('Error expected');
    }
    catch(err){
      expect(err.message).toEqual('test');
    }

  });
  
  it('remote invocation promise nested', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/promiseX2', async (value:number)=>({res: new Promise<number>((r)=>setTimeout(()=>r(value*2),500))}));
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const promiseX2 = svcManger2.getMethodInvoker<number, {res:Promise<number>}>('test/promiseX2');

    const res_1 = await promiseX2(5);
    
    await delayTest(100);
    
    expect(await res_1.res).toEqual(10);

  });

  it('remote invocation observable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/observableX2', async (value:number)=>{
            const subject = new Subject<number>();
            setTimeout(() => {
              subject.next(value*2);
              subject.complete();
            }, 500);
            return subject;
          });
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const observableX2 = svcManger2.getMethodInvoker<number, Observable<number>>('test/observableX2');

    const res_2 = await observableX2(5);

    await delayTest(100);

    expect(await res_2.pipe(tap(p=>stack.push(p))).toPromise()).toEqual(10);
    expect(stack).toEqual([10]);

  });
  
  it('remote invocation observable error', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/observableX2', async (value:number)=>{
            const subject = new Subject<number>();
            setTimeout(() => {
              subject.error(new Error('test'));
            }, 500);
            return subject;
          });
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const observableX2 = svcManger2.getMethodInvoker<number, Observable<number>>('test/observableX2');
    
    const res_2 = await observableX2(5);

    await delayTest(100);
    
    try{
      await res_2.pipe(take(1)).toPromise();
      fail('Error expected');
    }
    catch(err){
      expect(err.message).toEqual('test');
    }
  });

  it('remote invocation observable nested', async () => {
    const mc = new MessageChannel();

    const stack = [];

    let manager1:ResourceManager;
    let svcManger1:ServiceManager;
    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .use(manager1=new ResourceManager(c))
      .use(svcManger1 = new ServiceManager(c,manager1,(s,builder)=>{
        builder
          .addService('test/observableX2', async (value:number)=>{
            const subject = new Subject<number>();
            setTimeout(() => {
              subject.next(value*2);
              subject.complete();
            }, 500);
            return {res:subject};
          });
      }));
    });

    let manager2:ResourceManager;
    let svcManger2:ServiceManager;
    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.use(manager2=new ResourceManager(c)).use(svcManger2=new ServiceManager(c, manager2, (s,builder)=>{}));
    });

    const observableX2 = svcManger2.getMethodInvoker<number, {res:Observable<number>}>('test/observableX2');

    const res_2 = await observableX2(5);

    await delayTest(100);

    expect(await res_2.res.pipe(tap(p=>stack.push(p))).toPromise()).toEqual(10);
    expect(stack).toEqual([10]);

  });
});