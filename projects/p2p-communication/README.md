# @lime.it/p2p-communication

Structured communication support for modern multi-agent web application

## Features

The library is meant to facilitate the creation of structured communication channel between two agents implementing a [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort)-like interface. Hence it can be easily used between:

* Two webRTC channels
* The main page and a webworker
* The main page and a modal window
* The main page and an IFrame
* The main page and a websocket
* Two prcesses in a nodeJs application
* The electron main process and a Renderer process
* Any combination of the above mentioned channels

The library offers both the low level primitive to establish a peer to perr connection, with message delivery check and an increasing higher level functions, from rpc, to Promise and (Rxjs) observable wrapping. It is implemented with a chain of responibility pattern allowing further customization and extensions through the use of specific middlewares.

## API and Examples

The basic building block of the library is the **P2pConncetion**. It encapsulate one side of the communication channel and waits for the other to be ready.

    it('create', async () => {
        const mc = new MessageChannel();

        const peer1=new P2pConnection(mc.port1,(e, p)=>{

        }, {debug: true, peerReadyTiemout:3*100});

        
        const peer2=new P2pConnection(mc.port2,(e, p)=>{

        }, {debug: true, peerReadyTiemout:3*100});

        await expectAsync(peer1.waitPeer()).toBeResolved();
        await expectAsync(peer2.waitPeer()).toBeResolved();
    });

In its onconnect callback, it has available both and endpoint name (in order to select one of N connection on the same transport) and a Transport to use to instruct how this side of the channel must act.

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

In this case the *peer2* is configured to answer for service (RPC like) *echo-svc* which is mapped to a procedure *echo*.
The other side of the channel *peer1* can connect to a service wrapped MessagPort, in order to access the helper factory method **getMethodInvoker**
which returns a constranide callable value which directly perform RPC on the channel to the registerd endpoint for *peer2*.

The **serviceChannelFactory** is one of many helper methods which ease the configuration process attaching the middlewares needed to enable the desider interaction on the channel.

* **serviceChannelFactory**: Create the foundation for a statefull RPC (supporting Promises and Observables) interaction on the channel
* **windowSelfToWindowTransport**: Create a *Transport* out of the *window* object, usable as a side of the channel to communicate with modal windows, iframe or webworkers.
* **workerToTransport**: Create a *Transport* out a given webworker object, usable as a side of the channel to communicate with modal windows, iframe or webworkers.
* **workerSelfToTransport**: Create a *Transport* out of the current webworker object, usable as a side of the channel to communicate with modal windows, iframe or webworkers.
* **TransportLink**: Create a *Transport* which is actually the link between to existing *Transports* much like a Unix Pipe.

### Regarding RPC parameters and results

The **serviceChannelFactory** takes care of the transfer of both the parameters and the results. If the exposed function has promises or observables in its parameters theyare wrapped in order to behave remotely exactly has they were local. So the actual service handler will have as argument promises which resolved on the other peer also resolve with the same value (or reject with the same error) on its side of the channel. Same thing for observables, they will emit or error on its side when and only when they emit, error or complete remotely.
Same thing goes for the results, with the unique difference that regardless of the returned type, on the user side of the service, it will be always wrapped in a Promise, due to the async nature of the communication. 

### Regarding Observables

The observables wrapped by the library are all *hot*, they live (emit, error or complete) indipendently from the actual local subscription. That is because it is not possible to determine or force the client to subscribe to the observable and also guarantee that the server doesn't keep the resource waiting forever. If some sort of synchroniation is needed, it must bu implemented ad-hoc. 

## Further examples

Please have a look at the tests to have more insights and examples of usage.