import { IncomingRequestMiddleware, OutgoingRequestMiddleware, IncomingResponseMiddleware, IncomingRequestContext, OutgoingRequestContext, IncomingResponseContext, Channel } from '../channel';

export class TracingMiddleware implements IncomingRequestMiddleware, OutgoingRequestMiddleware, IncomingResponseMiddleware{
  constructor(private channel?:Channel){
    if(channel){
      channel.incomingEvent$.subscribe(e=>{
        console.log("%cIncoming Event R-->S", "font-weight:bold;");
        console.log(e);
      });
      channel.outgoingEvent$.subscribe(e=>{
        console.log("%cOutgoing Event S-->R", "font-weight:bold;");
        console.log(e);
      });
    }
  }

  async handleIncomingRequest(ctx: IncomingRequestContext, next: () => Promise<void>): Promise<void> {
    console.log("%cIncoming Request R-->S", "font-weight:bold;");
    console.log(ctx.getRequest());
    await next();
    console.log("%cResult S-->r", "font-weight:bold;");
    console.log(ctx.getResult());
  }  
  async handleOutogingRequest(ctx: OutgoingRequestContext, next: () => Promise<void>): Promise<void> {
    await next();
    console.log("%cOutgoing Request S-->R", "font-weight:bold;");
    console.log(ctx.getRequest());
  }
  async handleIncomingResponse(ctx: IncomingResponseContext, next: () => Promise<void>): Promise<void> {
    console.log("%cIncoming Response r-->S", "font-weight:bold;");
    console.log(ctx.getResponse());
    await next();
  }
}