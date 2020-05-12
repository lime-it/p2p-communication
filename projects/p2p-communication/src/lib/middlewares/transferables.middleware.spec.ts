import { Channel } from "../channel";

import { InputAllTransferableMiddleware, InputCheckTransferableMiddleware, OutputAllTransferableMiddleware, OutputCheckTransferableMiddleware } from ".";
import { TracingMiddleware } from './tracing.middleware';

describe('transferables middleware', () => {

  it('input pipeline all transferable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForIncomingRequest(async (c,n)=>{
        await n();
        expect(c.getTransferables().length).toBe(1);
      })
      .useForIncomingRequest(new InputAllTransferableMiddleware())
      .useForIncomingRequest(async (c,n)=>{
        c.setResult({value:1, buffer:new ArrayBuffer(10)});
      })
    });

    const result = await channel1.sendRequest({});
  });
  
  it('input pipeline check transferable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForIncomingRequest(async (c,n)=>{
        await n();
        expect(c.getTransferables().length).toBe(1);
      })
      .useForIncomingRequest(new InputCheckTransferableMiddleware())
      .useForIncomingRequest(new InputAllTransferableMiddleware())
      .useForIncomingRequest(async (c,n)=>{
        c.setResult({value:1, buffer:new ArrayBuffer(10)});
        c.getTransferables().push(<any>1);
      })
    });

    const result = await channel1.sendRequest({});
  });
  
  it('output pipeline all transferable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForOutgoingRequest(async (c,n)=>{
        await n();
        expect(c.getTransferables().length).toBe(1);
      })
      .useForOutgoingRequest(new OutputAllTransferableMiddleware())
      .useForOutgoingRequest(async (c,n)=>{
        c.getRequest().payload={value:1, buffer:new ArrayBuffer(10)};
      })
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (c,n)=>{
        c.setResult(c.getRequest().payload);
      })
    });

    const result = await channel1.sendRequest({});
  });
  
  it('output pipeline check transferable', async () => {
    const mc = new MessageChannel();

    const stack = [];

    const channel1 = new Channel(mc.port1, (c, b)=>{
      b.use(new TracingMiddleware());
      b
      .useForOutgoingRequest(async (c,n)=>{
        await n();
        expect(c.getTransferables().length).toBe(1);
      })
      .useForOutgoingRequest(new OutputCheckTransferableMiddleware())
      .useForOutgoingRequest(new OutputAllTransferableMiddleware())
      .useForOutgoingRequest(async (c,n)=>{
        c.getRequest().payload={value:1, buffer:new ArrayBuffer(10)};
        c.getTransferables().push(<any>1);
      })
    });

    const channel2 = new Channel(mc.port2, (c, b)=>{
      b.use(new TracingMiddleware());
      b.useForIncomingRequest(async (c,n)=>{
        c.setResult(c.getRequest().payload);
      })
    });

    const result = await channel1.sendRequest({});
  });

});
