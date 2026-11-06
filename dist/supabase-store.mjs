// No DOM or SDK import: inject a client so the adapter can be tested offline.
export function createSupabaseStore({client,userId,projectId,storage,emptyState,toState,pruneState,scopedDocuments,vault,onAccessDenied}) {
  const prefix=`spirit-cloud:${projectId}:${userId}`;
  const draftKey=prefix+':plain-draft';
  vault ||= {open:async v=>{if(v?.format==='spirit-vault-v1')throw Object.assign(Error('예전 잠금 비밀번호로 이전이 필요합니다.'),{code:'migration'});return structuredClone(v)},seal:async v=>structuredClone(v),lock(){}};
  const clone=v=>structuredClone(v);
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  let saved=null,loaded=false,busy=false,invalidated=false,working=null,writeQueue=Promise.resolve();
  const deadline=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('접근 권한 확인 시간이 초과되었습니다.')),10000))]).finally(()=>clearTimeout(timer));};
  const failure=(message,code='failed')=>Object.assign(new Error(message),{code});
  const check=()=>{if(invalidated)throw failure('로그인이 바뀌었습니다. 다시 로그인해 주세요.','auth');};
  const read=async key=>{const raw=storage.getItem(key);return raw?await vault.open(JSON.parse(raw),key===draftKey?'cache':'backup'):null;};
  const write=async(key,value)=>{const encrypted=await vault.seal(value,key===draftKey?'cache':'backup');check();storage.setItem(key,JSON.stringify(encrypted));};
  const flush=()=>{writeQueue=writeQueue.catch(()=>{}).then(()=>write(draftKey,{state:clone(working),saved:clone(saved)}));return writeQueue;};
  const validSnapshot=v=>v&&Number.isSafeInteger(v.version)&&v.version>=0&&toState(v.state);
  const apiError=e=>e?.code==='42501'?failure('접근 권한이 취소되었거나 허용되지 않은 계정입니다.','denied'):e?.code==='40001'||e?.code==='23505'?failure('다른 기기에서 먼저 저장했습니다. 현재 대본을 백업한 뒤 클라우드 저장본을 불러와 주세요.','conflict'):e?.code==='42P01'||e?.code==='PGRST202'||e?.code==='PGRST205'?failure('클라우드 테이블이 준비되지 않았습니다. SQL 마이그레이션 적용을 확인해 주세요.','setup'):failure('클라우드에 연결하지 못했습니다. 로그인과 네트워크를 확인해 주세요.');
  async function owner(){check();const {data,error}=await deadline(client.auth.getUser());check();if(error||data?.user?.id!==userId)throw failure('로그인이 만료되었거나 계정이 바뀌었습니다. 다시 로그인해 주세요.','auth');const access=await deadline(client.rpc('spirit_access_status'));check();if(access.error)throw apiError(access.error);if(access.data!==true){invalidated=true;vault.lock();onAccessDenied?.();throw failure('접근 권한이 취소되었거나 허용되지 않은 계정입니다.','denied');}}

  const store={
    kind:'supabase', userId,
    async fetchDefaultChapters(){
      // No storage cache or saved-version changes; RLS checks current invitation membership.
      await owner();try{const r=await deadline(client.from('spirit_default_chapters').select('stage,chapter,title_ko,title_en,mode,body,updated_at').order('stage').order('chapter'));check();if(r.error||!Array.isArray(r.data))return [];const seen=new Set();return r.data.filter(row=>{const id=row.stage+'/'+row.chapter;if(seen.has(id)||!Number.isInteger(row.stage)||row.stage<1||row.stage>5||!Number.isInteger(row.chapter)||row.chapter<1||row.chapter>10||typeof row.title_ko!=='string'||!row.title_ko.trim()||row.title_ko.length>120||typeof row.title_en!=='string'||!['bilingual','ko','en'].includes(row.mode))return false;if(row.body!==null&&!toState({format:'spirit-v2',collections:[{id:'template',name:'template',mode:'bilingual',order:0,chapters:[{id:'chapter',title:'',order:0,mode:row.mode}]}],documents:{'template/chapter':row.body},trash:[]}))return false;seen.add(id);return true}).map(row=>clone(row));}catch(e){check();return []}
    }, lastChapterKey:prefix+':last-chapter', backupKey:prefix+':plain-before-restore',
    async clearAccountCache(){this.invalidate();await writeQueue.catch(()=>{});for(const key of [draftKey,this.backupKey,this.lastChapterKey])storage.removeItem(key);},
    invalidate(){invalidated=true;vault.lock();},
    savedState(){check();return saved?clone(saved.state):null;},
    async fetchSaved(){await owner();let response;try{response=await client.from('spirit_states').select('state,version,updated_at').eq('user_id',userId).maybeSingle();}catch{throw apiError();}check();if(response.error)throw apiError(response.error);if(!response.data)return {exists:false,version:0,state:emptyState(),legacy:false};const state=toState(await vault.open(response.data.state,'state'));check();if(!state||!Number.isSafeInteger(response.data.version))throw failure('클라우드 저장본 형식이 올바르지 않습니다.');return {exists:true,version:response.data.version,savedAt:response.data.updated_at,state,legacy:false};},
    acceptSaved(snapshot){check();saved={version:snapshot.version||0,savedAt:snapshot.savedAt,state:clone(snapshot.state||emptyState())};},
    async load(){
      await owner();let cached=null;try{cached=await read(draftKey);}catch{throw failure('이 계정의 브라우저 임시 저장본을 읽을 수 없습니다. 저장소를 지우지 말고 백업을 확인해 주세요.');}
      if(cached&&(!toState(cached.state)||!validSnapshot(cached.saved)))throw failure('이 계정의 임시 저장 형식이 올바르지 않습니다.');
      const remote=await this.fetchSaved();
      const dirty=cached&&!same(cached.state,cached.saved.state);
      if(dirty){saved=clone(cached.saved);working=toState(cached.state);loaded=true;return {state:toState(cached.state),legacy:null,notice:remote.version!==saved.version?'다른 기기의 저장본이 있습니다. 현재 임시 대본은 보존했으며, 백업 후 클라우드 저장본을 확인해 주세요.':'이 계정의 임시 대본을 복원했습니다.'};}
      this.acceptSaved(remote);working=clone(remote.state);loaded=true;return {state:clone(remote.state),legacy:null};
    },
    async cache(state){check();if(!loaded)throw failure('저장본을 불러온 뒤 수정해 주세요.');const next=toState(pruneState(state));if(!next)throw failure('대본 형식을 확인해 주세요.');working=next;await flush();},
    async saveCollection(state){return this.cache(state);},
    async listVersions(){const v=await this.fetchSaved();return v.exists?[{version:v.version,savedAt:v.savedAt}]:[];},
    async post(state){
      check();if(!loaded)throw failure('저장본을 먼저 불러와 주세요.');if(busy)throw failure('다른 저장이 진행 중입니다. 잠시 후 다시 눌러주세요.');
      const next=toState(pruneState(state));if(!next)throw failure('대본 형식을 확인해 주세요.');busy=true;
      try{await writeQueue;const encrypted=await vault.seal(next,'state');await owner();check();let r;try{r=await client.rpc('save_spirit_state',{expected_version:saved.version,next_state:encrypted,expected_user_id:userId});}catch{throw apiError();}check();if(r.error)throw apiError(r.error);const row=Array.isArray(r.data)?r.data[0]:r.data;if(!row||!Number.isSafeInteger(row.version)||row.version!==saved.version+1)throw failure('클라우드 저장 결과를 확인하지 못했습니다. 백업 후 다시 불러와 주세요.');saved={version:row.version,savedAt:row.saved_at,state:clone(next)};
        // Preserve unsaved edits (including the opposite language) and advance only their base revision.
        try{if(!working)working=clone(next);await flush();}catch{return {version:saved.version,savedAt:saved.savedAt,warning:'클라우드에는 저장했지만 브라우저 임시 저장 공간이 부족합니다. 백업을 내려받아 주세요.'};}
        return {version:saved.version,savedAt:saved.savedAt};
      }finally{busy=false;}
    },
    async backupBeforeRestore(state){check();await write(this.backupKey,state);},
    async beforeRestore(){check();return read(this.backupKey);},
    async exportBackup(state){check();return vault.seal(pruneState(state),'backup');},
    async importBackup(payload){await owner();return vault.open(payload,'backup');},
    async checkAccess(){return owner();},
    async saveAll(state){await this.cache(state);return this.post(state);},
    async saveDoc(collectionId,chapterId,doc,{language,blockIndex,state}){await this.cache(state);const base=this.savedState()||emptyState(),k=collectionId+'/'+chapterId,mode=state.collections.find(c=>c.id===collectionId)?.mode;const documents=scopedDocuments(base.documents,{[k]:doc},{chapterKey:k,blockIndex,language,mode});return this.post({format:'spirit-v2',collections:clone(state.collections),documents,trash:clone(state.trash||[])});}
  };
  return store;
}
