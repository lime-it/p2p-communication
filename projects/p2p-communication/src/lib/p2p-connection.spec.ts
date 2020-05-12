import { Channel } from './channel';
import { TracingMiddleware } from './middlewares/tracing.middleware';
import { P2pConnection } from './p2p-connection';
import { serviceChannelFactory } from './factories';

describe('p2p-connection', () => {

  it('create', async () => {
    const mc = new MessageChannel();

    const peer1=new P2pConnection(mc.port1,(e, p)=>{

    }, {debug: true, peerReadyTiemout:3*100});

    
    const peer2=new P2pConnection(mc.port2,(e, p)=>{

    }, {debug: true, peerReadyTiemout:3*100});

    await expectAsync(peer1.waitPeer()).toBeResolved();
    await expectAsync(peer2.waitPeer()).toBeResolved();
  });
  
  it('ready timeout', async () => {
    const mc = new MessageChannel();

    const peer1=new P2pConnection(mc.port1,(e, p)=>{

    }, {debug: true, peerReadyTiemout:3*100});

    await expectAsync(peer1.waitPeer()).toBeRejected();
  });

  
  it('connect', async () => {
    const mc = new MessageChannel();

    const peer1=new P2pConnection(mc.port1,(e, p)=>{
        if(e=='echo-svc'){
            const svc = serviceChannelFactory(p,(m,b)=>{
                b.addService('echo',async (value:string)=>`echo1-${value}`);
            })
        }

    }, {debug: true, peerReadyTiemout:3*100});

    
    const peer2=new P2pConnection(mc.port2,(e, p)=>{
        if(e=='echo-svc'){            
            const svc = serviceChannelFactory(p,(m,b)=>{
                b.addService('echo',async (value:string)=>`echo2-${value}`);
            })
        }
    }, {debug: true, peerReadyTiemout:3*100});

    await expectAsync(peer1.waitPeer()).toBeResolved();
    await expectAsync(peer2.waitPeer()).toBeResolved();

    const mc_s=new MessageChannel();

    const svc_1 = serviceChannelFactory(mc_s.port1, null, {debug:true});
    await peer1.connect('echo-svc', mc_s.port2);

    await expectAsync(svc_1.getMethodInvoker<string, string>('echo')('ciao')).toBeResolvedTo('echo2-ciao');
  });
});
