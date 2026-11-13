import {config} from './config.js';
import {createSupabaseStore} from './supabase-store.mjs';
import {createVault} from './vault.mjs';

export function validatePasswordChange(password,confirm){
 if(password.length<8)return '새 비밀번호는 8자 이상으로 입력해 주세요.';
 if(password!==confirm)return '비밀번호가 서로 달라요. 다시 확인해 주세요.';
 return '';
}
export function passwordChangeError(error){
 if(error?.status===401||error?.status===403||['session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used','reauthentication_needed','reauthentication_not_valid','user_not_found'].includes(error?.code))return '다시 로그인한 뒤 시도해 주세요.';
 if(error?.code==='weak_password')return '더 안전한 새 비밀번호를 입력해 주세요. 영문·숫자·기호를 함께 사용해 보세요.';
 if(error?.code==='same_password')return '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.';
 return '비밀번호를 바꾸지 못했어요. 네트워크를 확인하고 다시 시도해 주세요. 계속되면 다시 로그인해 주세요.';
}
function passwordChangeDialog(client,onSuccess,isCurrent){
 const dlg=document.createElement('dialog');dlg.id='password-change';dlg.className='newpres password-change';dlg.setAttribute('aria-labelledby','password-change-title');
 dlg.innerHTML=`<form class="newpres-form" novalidate>
 <div class="newpres-head"><h2 id="password-change-title">비밀번호 변경</h2><button type="button" class="text-action" data-password-close>닫기</button></div>
 ${[['password-new','새 비밀번호'],['password-confirm','새 비밀번호 확인']].map(([id,label])=>`<div class="np-field"><label for="${id}">${label}</label><div class="auth-password-input"><input id="${id}" type="password" autocomplete="new-password" minlength="8" required aria-describedby="password-change-error"><button type="button" class="password-toggle" data-password-toggle="${id}" aria-label="${label} 보기" aria-pressed="false"><img src="icons/auth-eye.svg" alt="" width="18" height="18"></button></div></div>`).join('')}
 <p id="password-change-error" role="alert"></p><button type="submit" class="primary np-create">확인</button></form>`;
 document.body.append(dlg);
 const form=dlg.querySelector('form'),inputs=[...dlg.querySelectorAll('input')],submit=dlg.querySelector('[type="submit"]'),error=dlg.querySelector('[role="alert"]');
 let busy=false,closed=false;
 const clear=()=>{for(const input of inputs){input.value='';input.type='password';}for(const toggle of dlg.querySelectorAll('[data-password-toggle]')){toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label',dlg.querySelector('#'+toggle.dataset.passwordToggle).labels[0].textContent+' 보기');}};
 const close=()=>{closed=true;clear();if(dlg.open)dlg.close();dlg.remove();};
 dlg.querySelector('[data-password-close]').onclick=close;
 dlg.addEventListener('cancel',event=>{event.preventDefault();close();});
 dlg.addEventListener('click',event=>{if(event.target===dlg)close();});
 dlg.addEventListener('close',()=>{closed=true;clear();dlg.remove();});
 for(const toggle of dlg.querySelectorAll('[data-password-toggle]'))toggle.onclick=()=>{const input=dlg.querySelector('#'+toggle.dataset.passwordToggle),visible=input.type==='password';input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',input.labels[0].textContent+(visible?' 숨기기':' 보기'));};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||closed)return;
  if(!isCurrent()){close();return;}
  error.textContent=validatePasswordChange(inputs[0].value,inputs[1].value);if(error.textContent)return;
  busy=true;submit.disabled=true;inputs.forEach(input=>input.disabled=true);submit.textContent='변경 중…';form.setAttribute('aria-busy','true');
  try{
   const request=client.auth.updateUser({password:inputs[0].value});clear();
   const result=await request;if(closed||!isCurrent()){close();return;}if(result.error)throw result.error;
   close();onSuccess?.('비밀번호를 바꿨어요.');
  }catch(reason){clear();if(!closed&&isCurrent())error.textContent=passwordChangeError(reason);else close();}
  finally{busy=false;submit.disabled=false;inputs.forEach(input=>input.disabled=false);submit.textContent='확인';form.setAttribute('aria-busy','false');}
 };
 dlg.showModal();inputs[0].focus();return close;
}

export function cloudMode(location,settings=config){
 const url=new URL(location.href),local=['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol==='file:';
 return !local||settings.storage==='supabase'||url.searchParams.get('storage')==='cloud'||url.searchParams.has('flow')||/type=(invite|recovery)/.test(url.hash);
}
export async function startCloud({helpers,onSessionEnd,beforeLogout,onToast,settings=config,createClient:injectedClient}={}){
 const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname)||location.protocol==='file:';
 const controls=document.createElement('div');controls.id='account-controls';controls.className='account-controls';document.querySelector('.header-actions').append(controls);
 const localUrl=new URL(location.href);localUrl.search='';localUrl.hash='';
 if(!cloudMode(location,settings)){
  const link=document.createElement('a'),url=new URL(location.href);url.searchParams.set('storage','cloud');link.href=url.href;link.textContent='클라우드 로그인';link.className='action-button';controls.append(link);return null;
 }
 document.body.classList.add('auth-required');
 const gate=document.createElement('section');gate.className='auth-gate';gate.setAttribute('aria-label','SPIRIT 로그인');gate.innerHTML=`
 <div class="auth-brand-side">
  <div class="auth-brand"></div>
  <div class="auth-pitch">
   <p class="auth-eyebrow">나만의 대본 연습 공간</p>
   <h2>한 문장씩,<br>내 목소리로 외우는<br>발표 대본</h2>
   <ul class="auth-features">
    <li><span class="auth-feature-icon"><img src="icons/auth-shield.svg" alt="" width="20" height="20"></span><div><strong>내 계정만</strong><p>대본은 내 계정으로 로그인해야만 열려요.</p></div></li>
    <li><span class="auth-feature-icon"><img src="icons/auth-lock.svg" alt="" width="20" height="20"></span><div><strong>초대받은 사람만</strong><p>허용 명단에 있는 이메일만 들어올 수 있어요.</p></div></li>
    <li><span class="auth-feature-icon"><img src="icons/auth-devices.svg" alt="" width="20" height="20"></span><div><strong>PC와 휴대폰에서</strong><p>어디서든 이어서 연습해요.</p></div></li>
   </ul>
  </div>
  <div class="auth-local auth-local-desktop"></div>
 </div>
 <div class="auth-form-side"><div class="auth-panel">
  <p class="auth-eyebrow auth-mobile-eyebrow">나만의 대본 연습 공간</p><h1 id="auth-title">로그인</h1><p id="auth-description">초대받은 계정만 사용할 수 있어요.</p>
  <form id="auth-form">
   <label id="auth-email-label">이메일<input id="auth-email" name="email" type="email" autocomplete="username" placeholder="name@example.com" required></label>
   <div id="auth-password-label" class="auth-password-field"><label for="auth-password" id="auth-password-title">비밀번호</label><div class="auth-password-input"><input id="auth-password" name="password" type="password" autocomplete="current-password" required><button id="auth-password-toggle" type="button" aria-label="비밀번호 보기" aria-pressed="false"><img src="icons/auth-eye.svg" alt="" width="18" height="18"></button></div></div>
   <label id="auth-confirm-label" hidden>비밀번호 확인<input id="auth-confirm" name="confirm" type="password" autocomplete="new-password"></label>
   <p id="auth-vault-note" hidden>예전 대본을 열기 위한 비밀번호입니다. 이전을 마치면 로그인 비밀번호만 사용합니다.</p>
   <button class="primary" id="auth-submit" type="submit" disabled>연결 중…</button>
  </form>
  <p id="auth-message" role="status" aria-live="polite"></p><button id="auth-reset" class="auth-text-button" type="button">비밀번호를 잊으셨나요?</button><button id="auth-switch" class="auth-text-button" type="button" hidden>다른 계정으로 로그인</button>
 </div></div>
 <div class="auth-footer"><div class="auth-invite-note"><img src="icons/auth-note-shield.svg" alt="" width="20" height="20"><div><strong>내 계정으로만 열려요</strong><p>초대받은 계정만 들어올 수 있어요. 공용 컴퓨터에서는 꼭 로그아웃하세요.</p></div></div><div class="auth-local auth-local-mobile"></div></div>`;
 const logo=document.querySelector('aside .brand svg')?.cloneNode(true);if(logo)gate.querySelector('.auth-brand').append(logo);document.body.append(gate);
 if(local)for(const parent of [...gate.querySelectorAll('.auth-local'),controls]){const a=document.createElement('a');a.href=localUrl.href;a.textContent='이 기기의 기존 대본 열기 (암호화 전)';a.className='auth-text-button';parent.append(a);}
 const q=id=>gate.querySelector('#'+id),form=q('auth-form'),submit=q('auth-submit');
 const passwordToggle=q('auth-password-toggle');
 passwordToggle.onclick=()=>{const input=q('auth-password'),visible=input.type==='password';input.type=visible?'text':'password';passwordToggle.setAttribute('aria-pressed',String(visible));passwordToggle.setAttribute('aria-label',visible?'비밀번호 숨기기':'비밀번호 보기');};
 const tell=t=>q('auth-message').textContent=t;
 const deadline=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('network')),10000))]).finally(()=>clearTimeout(timer));};
 let client,activeStore=null,activeVault=null,activeId=null,pending=null,authorizing=false,resolved=false,mode='login',generation=0,checking=false,submitting=false;
 let loadingScripts=false;
 let closePasswordDialog;
 window.addEventListener('pagehide',()=>closePasswordDialog?.());
 function progress(label=''){gate.setAttribute('aria-busy',String(!!label));submit.classList.toggle('is-loading',!!label);submit.disabled=!!label||!client;form.querySelectorAll('input').forEach(el=>el.disabled=!!label);q('auth-reset').disabled=!!label;q('auth-switch').disabled=!!label;fresh.disabled=!!label;if(label){submit.textContent=label;tell(label);}else{submit.textContent=submit.dataset.idleLabel||submit.textContent;}}
 let resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);
 const initial=new URL(location.href),hash=new URLSearchParams(initial.hash.slice(1));
 let needsPassword=initial.searchParams.get('flow')==='set-password'||['invite','recovery'].includes(hash.get('type'));
 const projectId=new URL(settings.supabaseUrl).hostname.split('.')[0];
 const show=()=>{gate.hidden=false;form.hidden=false;document.body.classList.add('auth-required');document.body.dataset.view='auth';};
 const hide=()=>{gate.hidden=true;document.body.classList.remove('auth-required');};
 function setMode(next){
  q('auth-password').type='password';passwordToggle.setAttribute('aria-pressed','false');passwordToggle.setAttribute('aria-label','비밀번호 보기');
  mode=next;gate.dataset.mode=next;fresh.hidden=next!=='vault';const setting=next==='password',reset=next==='reset',vault=next==='vault';
  q('auth-title').textContent=vault?(pending?.fresh?'대본 잠금 만들기':'예전 잠금 비밀번호로 열기'):setting?'비밀번호 설정':reset?'비밀번호 재설정':'로그인';
  q('auth-description').textContent=vault?'예전에 암호화한 대본을 한 번만 열어 이전하세요.':setting?'초대받은 계정의 로그인 비밀번호를 정해주세요.':reset?'초대받은 이메일로 재설정 링크를 보내드려요.':'초대받은 계정만 사용할 수 있어요.';
  q('auth-email-label').hidden=setting||vault;q('auth-email').required=!setting&&!vault;
  q('auth-password-title').textContent=vault?'대본 잠금 비밀번호 (12자 이상)':'비밀번호';
  q('auth-password-label').hidden=reset;q('auth-password').required=!reset;q('auth-password').minLength=vault?12:setting?8:0;
  q('auth-password').autocomplete=vault?'off':setting?'new-password':'current-password';q('auth-password').name=vault?'vault-passphrase':'password';q('auth-password').value='';
  const confirm=setting||(vault&&pending?.fresh);q('auth-confirm-label').hidden=!confirm;q('auth-confirm').required=confirm;q('auth-confirm').value='';q('auth-vault-note').hidden=!vault;
  q('auth-switch').hidden=!vault&&!setting;gate.querySelector('.auth-invite-note').hidden=vault||setting;q('auth-reset').hidden=setting||vault;q('auth-reset').textContent=reset?'로그인으로 돌아가기':'비밀번호를 잊으셨나요?';
  submit.textContent=vault?(pending?.fresh?'잠금 설정하고 시작':'대본 열기'):setting?'비밀번호 저장':reset?'재설정 메일 보내기':'로그인';submit.dataset.idleLabel=submit.textContent;submit.disabled=!client;tell('');
 }
 function clearLink(){const u=new URL(location.href);u.hash='';u.searchParams.delete('flow');history.replaceState(null,'',u.href);}
 function endSession(reason='다시 로그인해 주세요.'){
  closePasswordDialog?.();
  generation++;void activeStore?.clearAccountCache();activeVault?.lock();activeStore=activeVault=null;activeId=null;pending=null;authorizing=false;
  q('auth-password').value='';q('auth-confirm').value='';controls.querySelectorAll('button,.account-email').forEach(n=>n.remove());onSessionEnd?.();show();setMode('login');tell(reason);
  // End authorized access and discard rendered account state. SDK removes its own session.
  void client?.auth.signOut({scope:'local'});
 }
 async function access(session){
  const {data,error}=await deadline(client.auth.getUser());if(error||!data?.user||data.user.id!==session?.user?.id)throw Error('auth');
  const result=await deadline(client.rpc('spirit_access_status'));if(result.error)throw Error('setup');if(result.data!==true)throw Error('denied');return data.user;
 }
 async function authorize(session){
  if(!session?.user||authorizing||activeId===session.user.id||pending?.user.id===session.user.id)return;
  if(resolved&&!activeId){location.reload();return;}
  if(activeId&&activeId!==session.user.id){endSession();return;}
  const epoch=generation;authorizing=true;progress('로그인 확인 중…');
  try{
   const user=await access(session);if(epoch!==generation)return;
   if(needsPassword){setMode('password');show();return;}
   const remote=await client.from('spirit_states').select('state,version').eq('user_id',user.id).maybeSingle();if(remote.error)throw Error('setup');if(epoch!==generation)return;
   const raw=localStorage.getItem(`spirit-cloud:${projectId}:${user.id}:draft`);
   if(remote.data?.state?.format==='spirit-vault-v1'){pending={user,session,remote:remote.data.state,version:remote.data.version,raw,fresh:false};setMode('vault');show();}else{finish(user);}
  }catch(error){pending=null;show();setMode('login');tell(error.message==='denied'?'이 계정은 허용 명단에 없거나 초대가 취소되었습니다. 관리자에게 문의해 주세요.':error.message==='setup'?'접근 권한을 확인하지 못했습니다. SQL 적용과 네트워크를 확인해 주세요.':'로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');}
  finally{authorizing=false;if(!loadingScripts&&!submitting)progress();}
 }
 function finish(user,vault){
  activeId=user.id;activeVault=vault;
  activeStore=createSupabaseStore({client,userId:activeId,projectId,storage:localStorage,...helpers,vault,onAccessDenied:()=>endSession('접근 권한이 취소되었습니다.')});
  const email=document.createElement('span');email.className='account-email';email.textContent=user.email||'내 계정';email.title=email.textContent;controls.prepend(email);
  const changePassword=document.createElement('button');changePassword.type='button';changePassword.textContent='비밀번호 변경';changePassword.className='action-button';changePassword.onclick=()=>{if(!activeId||loadingScripts)return;closePasswordDialog?.();const epoch=generation;closePasswordDialog=passwordChangeDialog(client,onToast,()=>!!activeId&&epoch===generation);};controls.prepend(changePassword);
  
  const logout=document.createElement('button');logout.textContent='로그아웃';logout.className='action-button';logout.onclick=async()=>{logout.disabled=true;try{await beforeLogout?.();await activeStore?.clearAccountCache();const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}catch{logout.disabled=false;alert('저장 완료와 네트워크를 확인한 뒤 다시 시도해 주세요.');}};controls.prepend(logout);
  loadingScripts=true;show();progress('대본 불러오는 중…');q('auth-title').textContent='대본을 불러오고 있어요';q('auth-description').textContent='잠시만 기다려주세요.';resolved=true;resolveReady({store:activeStore,onLoaded(){loadingScripts=false;progress();hide();},showLoadError(error){loadingScripts=false;progress();show();form.hidden=true;q('auth-reset').hidden=true;q('auth-title').textContent='대본을 열지 못했어요';q('auth-description').textContent='저장된 대본은 변경하지 않았습니다.';tell(error.message);const retry=document.createElement('button');retry.className='primary';retry.textContent='다시 연결';retry.onclick=()=>location.reload();gate.querySelector('.auth-panel').append(retry,logout);}});
 }
 async function checkCurrent(){if(!activeStore||checking)return;checking=true;try{await activeStore.checkAccess();}catch{endSession('접근 권한을 확인할 수 없어 잠갔습니다.');}finally{checking=false;}}
 const timer=setInterval(checkCurrent,30000);window.addEventListener('pagehide',()=>{clearInterval(timer);activeStore?.invalidate();activeVault?.lock();});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkCurrent();});
 q('auth-switch').onclick=async()=>{await client.auth.signOut({scope:'local'});clearLink();location.reload();};
 const fresh=document.createElement('button');fresh.type='button';fresh.className='auth-text-button';fresh.textContent='이 계정을 빈 상태로 새로 시작';fresh.hidden=true;gate.querySelector('.auth-panel').append(fresh);fresh.onclick=()=>{if(!pending)return;pending.state=helpers.emptyState();mode='migrate';q('auth-password-label').hidden=true;q('auth-password').required=false;submit.textContent='빈 상태를 새 버전으로 저장';tell('기존 서버 대본을 빈 상태의 새 버전으로 바꿉니다. 예전 기기 캐시와 백업은 보존합니다. 계속하려면 저장 버튼을 누르세요.');};
 q('auth-reset').onclick=()=>setMode(mode==='reset'?'login':'reset');
 form.onsubmit=async event=>{
  event.preventDefault();if(!client||submitting)return;submitting=true;progress(mode==='login'?'로그인 중…':mode==='reset'?'메일 보내는 중…':mode==='password'?'비밀번호 저장 중…':mode==='migrate'?'대본 저장 중…':'대본 여는 중…');
  try{
   if(mode==='reset'){const redirect=new URL(localUrl.href);redirect.searchParams.set('storage','cloud');redirect.searchParams.set('flow','set-password');const {error}=await client.auth.resetPasswordForEmail(q('auth-email').value.trim(),{redirectTo:redirect.href});if(error)throw error;tell('등록된 이메일이면 재설정 링크가 발송됩니다. 메일함을 확인해 주세요.');}
   else if(mode==='password'){
    if(q('auth-password').value!==q('auth-confirm').value)throw Error('password_mismatch');const {data:s}=await client.auth.getSession();await access(s.session);const {error}=await client.auth.updateUser({password:q('auth-password').value});if(error)throw error;q('auth-password').value='';q('auth-confirm').value='';needsPassword=false;clearLink();authorizing=false;await authorize(s.session);
   }else if(mode==='vault'){
    const p=pending,epoch=generation;if(!p)throw Error('auth');if(p.fresh&&q('auth-password').value!==q('auth-confirm').value)throw Error('password_mismatch');
    const secret=q('auth-password').value;q('auth-password').value='';q('auth-confirm').value='';let vault;
    try{await access(p.session);vault=await createVault({passphrase:secret,projectId,userId:p.user.id});if(p.remote)await vault.open(p.remote,'state');if(p.raw){try{await vault.open(JSON.parse(p.raw),'cache')}catch{}}if(epoch!==generation){vault.lock();return;}const state=await vault.open(p.remote,'state');if(!helpers.toState(state))throw Error('대본 형식이 올바르지 않습니다.');pending.state=state;vault.lock();submit.textContent='평문으로 다시 저장';submit.dataset.idleLabel=submit.textContent;mode='migrate';q('auth-password-label').hidden=true;q('auth-password').required=false;tell('내용을 열었습니다. 평문으로 다시 저장을 누르면 로그인만으로 대본을 볼 수 있습니다.');}catch(error){vault?.lock();throw error;}
   }else if(mode==='migrate'){const p=pending,epoch=generation;await access(p.session);if(epoch!==generation)return;const r=await client.rpc('save_spirit_state',{expected_version:p.version,next_state:p.state,expected_user_id:p.user.id});if(r.error)throw Error(r.error.code==='40001'?'다른 기기에서 저장했습니다. 새로고침 후 다시 이전하세요.':'이전 저장에 실패했습니다. SQL 003 적용을 확인하세요.');if(epoch!==generation)return;pending=null;finish(p.user);
   }else{const {data,error}=await client.auth.signInWithPassword({email:q('auth-email').value.trim(),password:q('auth-password').value});q('auth-password').value='';if(error)throw error;await authorize(data.session);}
  }catch(error){tell(error.message==='password_mismatch'?'비밀번호가 서로 다릅니다.':['vault','migrate'].includes(mode)?error.message:mode==='login'?'이메일과 비밀번호를 확인해 주세요. 허용된 초대 계정만 사용할 수 있습니다.':'요청을 완료하지 못했습니다. 초대 링크·접근 권한·네트워크를 확인해 주세요.');}
  finally{submitting=false;if(!authorizing&&!loadingScripts)progress();}
 };
 try{
  if(!local&&location.protocol!=='https:')throw Error('https');
  const createClient=injectedClient||(await import(settings.sdkUrl)).createClient;
  client=createClient(settings.supabaseUrl,settings.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'sb-'+projectId+'-auth-token'}});
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){if(activeId||pending)queueMicrotask(()=>endSession());return;}if(event==='PASSWORD_RECOVERY'){needsPassword=true;queueMicrotask(()=>authorize(session));return;}if(event==='SIGNED_IN')queueMicrotask(()=>authorize(session));});
  setMode(needsPassword?'password':'login');const {data,error}=await client.auth.getSession();if(error)throw error;
  if(hash.has('error')||initial.searchParams.has('error')){clearLink();tell('링크가 만료되었거나 올바르지 않습니다. 다시 초대받거나 비밀번호 재설정을 요청해 주세요.');}
  else if(needsPassword&&!data.session)tell('초대 또는 재설정 메일의 링크를 다시 열어주세요.');else await authorize(data.session);
 }catch{submit.disabled=true;submit.textContent='연결하지 못했어요';tell('안전한 로그인 서비스를 불러오지 못했습니다. HTTPS 주소와 네트워크를 확인해 주세요.');}
 return ready;
}
