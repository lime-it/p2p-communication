import { Channel, RequestTimeoutError } from './channel';
import { TracingMiddleware } from './middlewares/tracing.middleware';

describe('channel', () => {

  it('create channel', async () => {
    const mc = new MessageChannel();

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
    });

    await expectAsync(channel1.sendRequest({})).toBeRejected();
  });

  it('handle request', async () => {
    const mc = new MessageChannel();

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (ctx, next)=>{
        ctx.setResult(ctx.getRequest().payload);
        return await next();
      });
    });

    const result = await channel1.sendRequest({value:'test'});
    expect(result).toEqual({value:'test'});
  });
  
  it('request timeout', async () => {
    const mc = new MessageChannel();

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForOutgoingRequest(async (ctx, next)=>{
        ctx.timeout=1000;
        return await next();
      });
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (ctx, next)=>{
        await new Promise((r,_)=>setTimeout(()=>r(),10*1000));
        ctx.setResult(ctx.getRequest().payload);
        return await next();
      });
    });

    await expectAsync(channel1.sendRequest({})).toBeRejectedWith(new RequestTimeoutError());
  });
  
  it('input pipeline', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());      
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForIncomingRequest(async (c,n)=>{
        stack.push(0);
        await n();
        stack.push('a');
      })
      .useForIncomingRequest(async (c,n)=>{
        stack.push(1);
        await n();
        stack.push('b');
      })
      .useForIncomingRequest(async (c,n)=>{
        stack.push(2);
        await n();
        c.setResult(null);
        stack.push('c');
      })
    });

    const result = await channel1.sendRequest({});
    expect(result).toBeNull();
    expect(stack).toEqual([0,1,2,'c','b','a']);
  });

  it('input pipeline interrupted', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());      
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForIncomingRequest(async (c,n)=>{
        stack.push(0);
        await n();
        stack.push('a');
      })
      .useForIncomingRequest(async (c,n)=>{
        stack.push(1);
        c.setResult(null);
        await n();
        stack.push('b');
      })
      .useForIncomingRequest(async (c,n)=>{
        stack.push(2);
        await n();
        stack.push('c');
      })
    });

    const result = await channel1.sendRequest({});
    expect(result).toBeNull();
    expect(stack).toEqual([0,1,'b','a']);
  });
    
  it('output pipeline', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b          
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(0);
        await n();
        stack.push('a');
      })
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(1);
        await n();
        stack.push('b');
      })
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(2);
        await n();
        stack.push('c');
      })
      .useForOutgoingRequest(async (c,n)=>{
        c.getRequest().payload.value='test';
      })
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (c,n)=>{
        c.setResult(c.getRequest().payload);
      })
    });

    const result = await channel1.sendRequest({});
    expect(result).toEqual({value:'test'});
    expect(stack).toEqual([0,1,2,'c','b','a']);
  });

  it('output pipeline interrupted', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b      
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(0);
        await n();
        stack.push('a');
      })
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(1);
        
        stack.push('b');
      })
      .useForOutgoingRequest(async (c,n)=>{
        stack.push(2);
        await n();
        stack.push('c');
      })
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (c,n)=>{
        c.setResult(c.getRequest().payload);
      })
    });

    const result = await channel1.sendRequest(null);
    expect(result).toBeNull();
    expect(stack).toEqual([0,1,'b','a']);
  });

});
