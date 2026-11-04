// Local amplitude only: no recording, storage, network or audio output connection.
export function createMicrophoneMeter({mediaDevices=globalThis.navigator?.mediaDevices,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame,onLevel=()=>{},onError=()=>{}}={}){
 let generation=0,stream=null,context=null,frame=null;
 function stop(){generation++;if(frame!==null)caf(frame);frame=null;stream?.getTracks().forEach(t=>t.stop());stream=null;const old=context;context=null;if(old)void old.close().catch(()=>{});onLevel(0);}
 async function start(){stop();const epoch=generation;try{const acquired=await mediaDevices.getUserMedia({audio:true});if(epoch!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;context=new AudioContext();await context.resume();if(epoch!==generation)return;const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);const samples=new Float32Array(analyser.fftSize);const tick=()=>{if(epoch!==generation)return;analyser.getFloatTimeDomainData(samples);let sum=0;for(const n of samples)sum+=n*n;onLevel(Math.min(1,Math.sqrt(sum/samples.length)*5));frame=raf(tick);};tick();}catch{if(epoch===generation){stop();onError();}}}
 return {start,stop};
}
