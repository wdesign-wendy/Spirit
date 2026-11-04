const encoder=new TextEncoder(),decoder=new TextDecoder();
export const VAULT_ITERATIONS=600000;
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function createVault({passphrase,projectId,userId,crypto=globalThis.crypto}){
  if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw Error('대본 잠금 비밀번호를 12자 이상으로 입력해 주세요.');
  const scope=`SPIRIT/v1/${projectId}/${userId}`;
  const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  const salt=await crypto.subtle.digest('SHA-256',encoder.encode(scope));
  let key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:VAULT_ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const check=()=>{if(!key)throw Error('대본이 잠겼습니다. 다시 로그인하고 잠금을 해제해 주세요.');};
  return {
    lock(){key=null;},
    async seal(value,purpose){check();const active=key,iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(scope+'/'+purpose)},active,encoder.encode(JSON.stringify(value)));check();return {format:'spirit-vault-v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:VAULT_ITERATIONS,iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};},
    async open(value,purpose){check();if(value?.format!=='spirit-vault-v1'||value.algorithm!=='AES-256-GCM'||value.kdf!=='PBKDF2-SHA256'||value.iterations!==VAULT_ITERATIONS||typeof value.iv!=='string'||typeof value.ciphertext!=='string'||value.ciphertext.length>22000000)throw Error('암호화된 대본 형식이 아닙니다. 기존 파일을 덮어쓰지 말고 백업을 확인해 주세요.');try{const iv=decode(value.iv);if(iv.length!==12)throw Error();const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(scope+'/'+purpose)},key,decode(value.ciphertext));check();return JSON.parse(decoder.decode(plain));}catch{throw Error('잠금 비밀번호가 다르거나 암호문이 손상되었습니다. 저장된 대본은 변경하지 않았습니다.');}}
  };
}
