import { IncomingRequestContext, RequestMessage, OutgoingRequestContext, IncomingRequestMiddleware, OutgoingRequestMiddleware } from '../channel';
import { getTransferables } from '../utils';

export class InputAllTransferableMiddleware implements IncomingRequestMiddleware {
  async handleIncomingRequest(ctx:IncomingRequestContext, next:()=>Promise<void>):Promise<void>{  

    await next();

    const transferables = ctx.getTransferables();  
    const result = ctx.getResult();
    if(result){
      const t = await getTransferables(result);

      transferables.push(...t);
    }
  }
}
export class InputCheckTransferableMiddleware implements IncomingRequestMiddleware {
  async handleIncomingRequest(ctx:IncomingRequestContext, next:()=>Promise<void>):Promise<void>{

    await next();

    const transferables = ctx.getTransferables();
    const result = ctx.getResult();
    if(result && transferables && transferables.length>0){

      const d = [];
      for(let i=0;i<transferables.length;i++){
        if(d.indexOf(transferables[i])<0)
          d.push(transferables[i]);
      }

      transferables.splice(0, transferables.length, ...d);

      const t = await getTransferables(result);
      
      let idx = -1;
      while((idx=transferables.findIndex(p=>t.indexOf(p)<0))>=0){
        transferables.splice(idx, 1);
      }
    }
  }
}

export class OutputAllTransferableMiddleware implements OutgoingRequestMiddleware{
  async handleOutogingRequest(ctx:OutgoingRequestContext, next:()=>Promise<void>):Promise<void>{

    await next();

    const request:RequestMessage = ctx.getRequest();
    const transferables = ctx.getTransferables();
    if(request.payload){
      const t = await getTransferables(request.payload);
      transferables.push(...t);
    }
  }
}
export class OutputCheckTransferableMiddleware implements OutgoingRequestMiddleware {
  async handleOutogingRequest(ctx:OutgoingRequestContext, next:()=>Promise<void>):Promise<void>{    

    await next();
    
    const request:RequestMessage = ctx.getRequest();
    const transferables = ctx.getTransferables();
    if(request.payload && transferables.length>0){

      const d = [];
      for(let i=0;i<transferables.length;i++){
        if(d.indexOf(transferables[i])<0)
          d.push(transferables[i]);
      }

      transferables.splice(0, transferables.length, ...d);

      const t = await getTransferables(request.payload);
      
      let idx = -1;
      while((idx=transferables.findIndex(p=>t.indexOf(p)<0))>=0){
        transferables.splice(idx, 1);
      }
    }
  }
}