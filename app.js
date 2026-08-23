(() => {
  const T = window.FR13_TEMPLATE;
  const criteria = T.data;
  const STORAGE_KEY = 'fr13_audit_app_v1';
  const state = { audits: [], activeAuditId: null, firebase: null, user: null, offlineMode: false, expanded: new Set() };

  const $ = (id) => document.getElementById(id);
  const els = {
    loginOverlay:$('loginOverlay'), loginEmail:$('loginEmail'), loginPass:$('loginPass'), loginBtn:$('loginBtn'), offlineBtn:$('offlineBtn'), loginError:$('loginError'), firebaseConfigHint:$('firebaseConfigHint'),
    appHeader:$('appHeader'), appShell:$('appShell'), storageBadge:$('storageBadge'), saveStatusBadge:$('saveStatusBadge'), currentUserLabel:$('currentUserLabel'), signOutBtn:$('signOutBtn'),
    auditList:$('auditList'), auditSearch:$('auditSearch'), newAuditBtn:$('newAuditBtn'),
    emptyState:$('emptyState'), workspace:$('auditWorkspace'), auditNoLabel:$('auditNoLabel'), auditTitle:$('auditTitle'), auditMeta:$('auditMeta'),
    editAuditBtn:$('editAuditBtn'), exportBtn:$('exportBtn'), printBtn:$('printBtn'),
    kpiProgress:$('kpiProgress'), kpiFindings:$('kpiFindings'), kpiObservations:$('kpiObservations'), kpiRemote:$('kpiRemote'), kpiOnsite:$('kpiOnsite'),
    kpiPending:$('kpiPending'), kpiOverdue:$('kpiOverdue'), followUpPanel:$('followUpPanel'), followUpList:$('followUpList'), showAllPendingBtn:$('showAllPendingBtn'),
    criterionSearch:$('criterionSearch'), typeFilter:$('typeFilter'), resultFilter:$('resultFilter'), followUpFilter:$('followUpFilter'), nextUnassessedBtn:$('nextUnassessedBtn'), expandAllBtn:$('expandAllBtn'), questions:$('questions'),
    auditDialog:$('auditDialog'), auditForm:$('auditForm'), auditDialogTitle:$('auditDialogTitle'), auditId:$('auditId'), organizationName:$('organizationName'), auditNo:$('auditNo'),
    auditStatus:$('auditStatus'), auditStartDate:$('auditStartDate'), auditEndDate:$('auditEndDate'), leadAuditor:$('leadAuditor'), auditors:$('auditors'), auditGeneralNote:$('auditGeneralNote'),
    toast:$('toast')
  };

  function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : 'a'+Date.now()+Math.random().toString(16).slice(2)); }
  function esc(s=''){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function nowIso(){ return new Date().toISOString(); }
  function localDateString(d=new Date()){
    const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function formatDate(value){
    if(!value) return '—';
    const [y,m,d]=value.split('-'); return (y&&m&&d) ? `${d}.${m}.${y}` : value;
  }
  function toast(msg){ els.toast.textContent=msg; els.toast.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.add('hidden'),1800); }
  function setSaveStatus(mode='saved', message=''){
    if(!els.saveStatusBadge) return;
    const labels={saving:'… Kaydediliyor',saved:'✓ Kaydedildi',error:'! Kayıt hatası',local:'✓ Yerel kayıt'};
    els.saveStatusBadge.className=`badge save-status ${mode}`;
    els.saveStatusBadge.textContent=message || labels[mode] || labels.saved;
    els.saveStatusBadge.title=mode==='error' ? "Son değişiklik Firebase'e kaydedilemedi." : 'Son değişikliklerin kayıt durumu';
  }
  function currentAudit(){ return state.audits.find(a=>a.id===state.activeAuditId); }
  function blankResponse(){
    return {result:'', evidenceRefs:'', auditorNote:'', followUpText:'', followUpStatus:'', reminderDate:'', followUpCreatedAt:null, completedAt:null, updatedAt:null};
  }
  function normalizeResponse(r={}){
    return {
      ...blankResponse(), ...r,
      followUpText: r.followUpText || r.followUp?.text || '',
      followUpStatus: r.followUpStatus || r.followUp?.status || '',
      reminderDate: r.reminderDate || r.followUp?.reminderDate || '',
      followUpCreatedAt: r.followUpCreatedAt || r.followUp?.createdAt || null,
      completedAt: r.completedAt || r.followUp?.completedAt || null
    };
  }
  function normalizeAudit(a){
    a.responses ||= {};
    Object.keys(a.responses).forEach(k => { a.responses[k] = normalizeResponse(a.responses[k]); });
    return a;
  }

  function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({audits:state.audits, activeAuditId:state.activeAuditId})); }
  function loadLocal(){
    try{
      const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      state.audits=(d.audits||[]).map(normalizeAudit);
      state.activeAuditId=d.activeAuditId||state.audits[0]?.id||null;
    }catch{ state.audits=[]; }
  }

  function setLoginError(message=''){
    els.loginError.textContent=message;
    els.loginError.classList.toggle('hidden',!message);
  }
  function showLogin(){
    els.loginOverlay.classList.remove('hidden');
    els.loginOverlay.style.display='flex';
    els.appHeader.classList.add('hidden');
    els.appShell.classList.add('hidden');
  }
  function showApp(mode){
    els.loginOverlay.style.display='none';
    els.appHeader.classList.remove('hidden');
    els.appShell.classList.remove('hidden');
    if(mode==='cloud'){
      els.storageBadge.textContent='Firebase'; els.storageBadge.className='badge cloud';
      setSaveStatus('saved');
      els.currentUserLabel.textContent=state.user?.email||'';
    } else {
      els.storageBadge.textContent='Çevrimdışı / Yerel'; els.storageBadge.className='badge local';
      setSaveStatus('local');
      els.currentUserLabel.textContent='';
    }
  }

  async function initFirebase(){
    const cfg=window.FIREBASE_CONFIG;
    if(!cfg || !cfg.apiKey || !cfg.databaseURL){
      state.firebase=null;
      els.firebaseConfigHint.classList.remove('hidden');
      showLogin();
      return;
    }
    try{
      if(!firebase.apps.length) firebase.initializeApp(cfg);
      const auth=firebase.auth();
      const db=firebase.database();
      state.firebase={auth,db};
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      auth.onAuthStateChanged(async user=>{
        if(user){
          state.user=user; state.offlineMode=false; setLoginError(''); showApp('cloud'); await loadCloud();
        } else if(!state.offlineMode){
          state.user=null; state.audits=[]; state.activeAuditId=null; showLogin();
        }
      });
    }catch(err){
      console.error(err); state.firebase=null; els.firebaseConfigHint.classList.remove('hidden'); showLogin(); setLoginError('Firebase başlatılamadı. Çevrimdışı mod kullanılabilir.');
    }
  }

  async function loginWithEmailPassword(){
    if(!state.firebase){ setLoginError('Firebase yapılandırması henüz tanımlanmadı.'); return; }
    const email=els.loginEmail.value.trim(), pass=els.loginPass.value;
    if(!email || !pass){ setLoginError('Lütfen e-posta ve şifrenizi giriniz.'); return; }
    setLoginError(''); els.loginBtn.disabled=true; els.loginBtn.textContent='Giriş yapılıyor…';
    try{ await state.firebase.auth.signInWithEmailAndPassword(email,pass); }
    catch(err){ console.error(err); setLoginError('Giriş başarısız. E-posta/şifre veya Firebase Authentication ayarını kontrol ediniz.'); }
    finally{ els.loginBtn.disabled=false; els.loginBtn.textContent='Giriş Yap'; }
  }
  function enterOfflineMode(){
    state.offlineMode=true; state.user=null; loadLocal(); showApp('local'); renderAll();
  }

  async function loadCloud(){
    if(!state.firebase || !state.user) return;
    const snap=await state.firebase.db.ref('fr13_audits').once('value');
    const raw=snap.val()||{};
    state.audits=Object.entries(raw).map(([id,data])=>normalizeAudit({id,...(data||{})})).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    const local=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    const preferred=local.activeAuditId;
    state.activeAuditId=state.audits.some(a=>a.id===preferred)?preferred:(state.audits[0]?.id||null);
    saveLocal(); renderAll();
  }
  async function persistAudit(a){
    a.updatedAt=nowIso();
    if(state.firebase && state.user && !state.offlineMode){
      const payload={...a}; delete payload.id;
      await state.firebase.db.ref('fr13_audits/'+a.id).set(payload);
      saveLocal();
    } else saveLocal();
  }

  function getResponse(a,key){
    if(!a.responses[key]) a.responses[key]=blankResponse();
    return a.responses[key];
  }
  function hasFollowUp(r){ return !!String(r.followUpText||'').trim(); }
  function effectiveFollowUpStatus(r){ return hasFollowUp(r) ? (r.followUpStatus || 'Bekleniyor') : ''; }
  function followUpTiming(r){
    if(!hasFollowUp(r)) return 'none';
    const status=effectiveFollowUpStatus(r);
    if(status==='Tamamlandı') return 'completed';
    if(status==='İptal') return 'cancelled';
    if(!r.reminderDate) return 'pending';
    const today=localDateString();
    if(r.reminderDate < today) return 'overdue';
    if(r.reminderDate === today) return 'today';
    return 'pending';
  }
  function followUpLabel(r){
    const timing=followUpTiming(r);
    return ({overdue:'Gecikmiş',today:'Bugün kontrol et',pending:'Bekleniyor',completed:'Tamamlandı',cancelled:'İptal'})[timing] || '';
  }
  function followUpClass(r){ return followUpTiming(r); }

  function renderAll(){ renderAuditList(); renderWorkspace(); }
  function auditFollowUpCounts(a){
    let pending=0, overdue=0;
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey); const timing=followUpTiming(r);
      if(['pending','overdue','today'].includes(timing)) pending++;
      if(timing==='overdue') overdue++;
    });
    return {pending,overdue};
  }
  function renderAuditList(){
    const q=els.auditSearch.value.trim().toLocaleLowerCase('tr-TR');
    const list=state.audits.filter(a=>!q || [a.organizationName,a.auditNo,a.leadAuditor].join(' ').toLocaleLowerCase('tr-TR').includes(q));
    els.auditList.innerHTML=list.map(a=>{
      const counts=auditFollowUpCounts(a);
      return `<div class="audit-item ${a.id===state.activeAuditId?'active':''}" data-id="${a.id}">
        <div class="audit-item-title"><strong>${esc(a.organizationName||'İsimsiz denetim')}</strong>${counts.pending?`<span class="mini-alert ${counts.overdue?'danger':''}">${counts.pending} takip</span>`:''}</div>
        <small>${esc(a.auditNo||'Denetim no yok')} • ${esc(a.status||'Taslak')}</small>
        <small>${esc(a.startDate||'Tarih yok')} ${a.leadAuditor?'• '+esc(a.leadAuditor):''}</small>
      </div>`;
    }).join('') || '<div class="no-results">Denetim bulunamadı.</div>';
    els.auditList.querySelectorAll('.audit-item').forEach(x=>x.onclick=()=>{state.activeAuditId=x.dataset.id; saveLocal(); renderAll();});
  }

  function renderWorkspace(){
    const a=currentAudit(); els.emptyState.classList.toggle('hidden',!!a); els.workspace.classList.toggle('hidden',!a); if(!a)return;
    els.auditNoLabel.textContent=a.auditNo||'DENETİM'; els.auditTitle.textContent=a.organizationName||'-';
    els.auditMeta.textContent=[a.startDate&&('Başlangıç: '+formatDate(a.startDate)),a.endDate&&('Bitiş: '+formatDate(a.endDate)),a.leadAuditor&&('Baş denetçi: '+a.leadAuditor),a.status].filter(Boolean).join(' • ');
    renderFollowUpPanel(); renderQuestions(); updateKpis();
  }

  function matchesFilters(item,r){
    const q=els.criterionSearch.value.trim().toLocaleLowerCase('tr-TR');
    if(els.typeFilter.value!=='all' && item.auditType!==els.typeFilter.value)return false;
    const rf=els.resultFilter.value;
    if(rf==='unassessed' && r.result)return false;
    if(rf!=='all' && rf!=='unassessed' && r.result!==rf)return false;
    const ff=els.followUpFilter.value; const timing=followUpTiming(r);
    if(ff==='pending' && !['pending','overdue','today'].includes(timing)) return false;
    if(ff==='overdue' && timing!=='overdue') return false;
    if(ff==='today' && timing!=='today') return false;
    if(ff==='completed' && timing!=='completed') return false;
    if(q){
      const hay=[item.shortCode,item.aadCode,item.question,item.atomicCriterion,item.reference,item.auditorGuidance,r.evidenceRefs,r.auditorNote,r.followUpText].join(' ').toLocaleLowerCase('tr-TR');
      if(!hay.includes(q)) return false;
    }
    return true;
  }
  function renderQuestions(){
    const a=currentAudit(); if(!a)return;
    const groups=new Map(); criteria.forEach(c=>{const k=c.questionCode;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);});
    let html='';
    for(const [code,items] of groups){
      const shown=items.filter(i=>matchesFilters(i,getResponse(a,i.htmlKey))); if(!shown.length)continue;
      const first=items[0]; const open=state.expanded.has(code) || els.criterionSearch.value || els.typeFilter.value!=='all' || els.resultFilter.value!=='all' || els.followUpFilter.value!=='all';
      const assessedCount=items.filter(i=>getResponse(a,i.htmlKey).result).length;
      const findingCount=items.filter(i=>getResponse(a,i.htmlKey).result==='Bulgu').length;
      const followCount=items.filter(i=>['pending','overdue','today'].includes(followUpTiming(getResponse(a,i.htmlKey)))).length;
      html+=`<section class="question-block" data-code="${esc(code)}"><div class="question-head"><div class="question-code">${esc(first.shortCode)}</div><div><div class="question-text">${esc(first.question)}</div><div class="question-ref">${esc(first.reference)}</div></div><div class="question-stats"><strong>${assessedCount}/${items.length}</strong><span>değerlendirildi</span>${findingCount?`<span class="qstat danger">${findingCount} bulgu</span>`:''}${followCount?`<span class="qstat warn">${followCount} takip</span>`:''}${shown.length!==items.length?`<span class="qstat muted">${shown.length} gösteriliyor</span>`:''}</div></div><div class="question-body ${open?'':'hidden'}">${shown.map(i=>renderAad(i,getResponse(a,i.htmlKey))).join('')}</div></section>`;
    }
    els.questions.innerHTML=html || '<div class="panel no-results">Filtreye uyan kriter bulunamadı.</div>';
    els.questions.querySelectorAll('.question-head').forEach(h=>h.onclick=()=>{
      const block=h.closest('.question-block');const body=block.querySelector('.question-body');body.classList.toggle('hidden');
      if(body.classList.contains('hidden'))state.expanded.delete(block.dataset.code);else state.expanded.add(block.dataset.code);
    });
    bindResponseInputs();
  }
  function renderAad(i,r){
    const result=r.result||''; const hasTask=hasFollowUp(r); const taskClass=followUpClass(r); const taskLabel=followUpLabel(r);
    const status=effectiveFollowUpStatus(r);
    return `<article class="aad-card ${taskClass==='overdue'?'has-overdue':hasTask?'has-followup':''}" data-key="${esc(i.htmlKey)}">
      <div class="aad-top"><div><div class="aad-title"><strong>${esc(i.shortCode)} / ${esc(i.aadCode)}</strong><span class="chip ${i.auditType==='Uzaktan'?'remote':'onsite'}">${esc(i.auditType)}</span>${hasTask?`<span class="followup-badge ${taskClass}">${esc(taskLabel)}</span>`:''}</div><div class="criterion">${esc(i.atomicCriterion)}</div></div></div>
      <details><summary>Denetçi açıklaması / kabul edilebilir kanıtlar</summary><div class="guidance">${esc(i.auditorGuidance||'')}</div></details>
      <div class="aad-grid">
        <label>İşletme kanıt referansları<textarea class="input response-input" data-field="evidenceRefs" placeholder="Örn. OM-A 11.3.2; SMSM 6.4; QDMS DOC-123">${esc(r.evidenceRefs||'')}</textarea></label>
        <label>Denetçi notu<textarea class="input response-input" data-field="auditorNote" placeholder="Denetimde yapılan tespit / doğrulama notu">${esc(r.auditorNote||'')}</textarea></label>
        <label>Değerlendirme sonucu
          <input type="hidden" class="response-input result-select" data-field="result" data-value="${esc(result)}" value="${esc(result)}" />
          <div class="result-buttons" role="group" aria-label="Değerlendirme sonucu">
            <button type="button" class="result-btn good ${result==='Uygun'?'active':''}" data-result="Uygun">Uygun</button>
            <button type="button" class="result-btn danger ${result==='Bulgu'?'active':''}" data-result="Bulgu">Bulgu</button>
            <button type="button" class="result-btn warn ${result==='Gözlem'?'active':''}" data-result="Gözlem">Gözlem</button>
            <button type="button" class="result-btn neutral ${result==='Uygulanamaz'?'active':''}" data-result="Uygulanamaz">Uygulanamaz</button>
            <button type="button" class="result-clear ${!result?'active':''}" data-result="" title="Değerlendirmeyi temizle">×</button>
          </div>
        </label>
      </div>
      <div class="followup-box ${hasTask?'active':''}">
        <div class="followup-box-title"><span>Takip / Beklenen Husus</span><small>Buraya yazılan husus otomatik olarak takip bekleyen iş kabul edilir.</small></div>
        <div class="followup-grid">
          <label class="followup-text-field">Talep edilen / beklenen husus<textarea class="input response-input followup-text" data-field="followUpText" placeholder="Örn. İşletmeden güncel olay kayıt listesi talep edildi.">${esc(r.followUpText||'')}</textarea></label>
          <label>Hatırlatma tarihi<input type="date" class="input response-input" data-field="reminderDate" value="${esc(r.reminderDate||'')}" ${hasTask?'':'disabled'} /></label>
          <label>Takip durumu<select class="input response-input followup-status" data-field="followUpStatus" ${hasTask?'':'disabled'}><option value="Bekleniyor" ${status==='Bekleniyor'?'selected':''}>Bekleniyor</option><option value="Tamamlandı" ${status==='Tamamlandı'?'selected':''}>Tamamlandı</option><option value="İptal" ${status==='İptal'?'selected':''}>İptal</option></select></label>
        </div>
        <div class="followup-info ${hasTask?taskClass+'':'hidden'}">${hasTask?`${taskLabel}${r.reminderDate?` • Hatırlatma: ${formatDate(r.reminderDate)}`:''}${r.completedAt?` • Tamamlandı: ${new Date(r.completedAt).toLocaleString('tr-TR')}`:''}`:''}</div>
      </div>
      <div class="save-state">${r.updatedAt?'Son kayıt: '+new Date(r.updatedAt).toLocaleString('tr-TR'):'Henüz kayıt yok'}</div>
    </article>`;
  }

  function bindResponseInputs(){
    document.querySelectorAll('.aad-card').forEach(card=>{
      card.querySelectorAll('.response-input').forEach(inp=>{
        inp.addEventListener('input',()=>scheduleResponseSave(card,inp));
        inp.addEventListener('change',()=>scheduleResponseSave(card,inp,true));
      });
      card.querySelectorAll('.result-btn,.result-clear').forEach(btn=>btn.addEventListener('click',()=>{
        const inp=card.querySelector('[data-field="result"]');
        inp.value=btn.dataset.result||'';
        inp.dataset.value=inp.value;
        refreshResultButtons(card,inp.value);
        scheduleResponseSave(card,inp,true);
      }));
    });
  }
  function refreshResultButtons(card,result){
    card.querySelectorAll('.result-btn,.result-clear').forEach(btn=>btn.classList.toggle('active',(btn.dataset.result||'')===result));
  }
  const saveTimers={};
  function scheduleResponseSave(card,inp,immediate=false){
    const key=card.dataset.key; const a=currentAudit(); const r=getResponse(a,key); const field=inp.dataset.field; const previousText=r.followUpText||'';
    r[field]=inp.value; r.updatedAt=nowIso();

    if(field==='result') inp.dataset.value=inp.value;
    if(field==='followUpText'){
      const text=inp.value.trim();
      if(text && !previousText.trim()){
        r.followUpStatus='Bekleniyor'; r.followUpCreatedAt=nowIso(); r.completedAt=null;
      } else if(!text){
        r.followUpStatus=''; r.reminderDate=''; r.followUpCreatedAt=null; r.completedAt=null;
      }
    }
    if(field==='followUpStatus'){
      if(inp.value==='Tamamlandı'){ r.completedAt=r.completedAt||nowIso(); }
      else { r.completedAt=null; }
    }

    refreshCardFollowUp(card,r);
    refreshQuestionStats(card.closest('.question-block'));
    card.querySelector('.save-state').textContent='Kaydediliyor…';
    setSaveStatus('saving');
    updateKpis(); renderFollowUpPanel();
    clearTimeout(saveTimers[key]);
    saveTimers[key]=setTimeout(async()=>{
      try{
        await persistAudit(a);
        renderAuditList();
        card.querySelector('.save-state').textContent='Kaydedildi: '+new Date().toLocaleString('tr-TR');
        setSaveStatus(state.offlineMode?'local':'saved');
      }catch(err){
        console.error(err);
        card.querySelector('.save-state').textContent='Kayıt hatası — tekrar deneyin';
        setSaveStatus('error');
        toast('Kayıt sırasında hata oluştu. İnternet/Firebase bağlantısını kontrol edin.');
      }
    }, immediate?50:500);
  }

  function refreshQuestionStats(block){
    if(!block) return;
    const code=block.dataset.code;
    const items=criteria.filter(i=>i.questionCode===code);
    const a=currentAudit(); if(!a || !items.length) return;
    const assessedCount=items.filter(i=>getResponse(a,i.htmlKey).result).length;
    const findingCount=items.filter(i=>getResponse(a,i.htmlKey).result==='Bulgu').length;
    const followCount=items.filter(i=>['pending','overdue','today'].includes(followUpTiming(getResponse(a,i.htmlKey)))).length;
    const stats=block.querySelector('.question-stats'); if(!stats) return;
    stats.innerHTML=`<strong>${assessedCount}/${items.length}</strong><span>değerlendirildi</span>${findingCount?`<span class="qstat danger">${findingCount} bulgu</span>`:''}${followCount?`<span class="qstat warn">${followCount} takip</span>`:''}`;
  }

  function refreshCardFollowUp(card,r){
    const active=hasFollowUp(r); const timing=followUpTiming(r); const label=followUpLabel(r);
    const box=card.querySelector('.followup-box'); const dateInput=card.querySelector('[data-field="reminderDate"]'); const statusSelect=card.querySelector('[data-field="followUpStatus"]');
    box.classList.toggle('active',active);
    dateInput.disabled=!active; statusSelect.disabled=!active;
    if(active){ statusSelect.value=effectiveFollowUpStatus(r); }
    else { dateInput.value=''; statusSelect.value='Bekleniyor'; }
    card.classList.toggle('has-followup',active && timing!=='overdue');
    card.classList.toggle('has-overdue',timing==='overdue');
    const title=card.querySelector('.aad-title'); const oldBadge=title.querySelector('.followup-badge'); if(oldBadge)oldBadge.remove();
    if(active){
      const badge=document.createElement('span'); badge.className=`followup-badge ${timing}`; badge.textContent=label; title.appendChild(badge);
    }
    const info=card.querySelector('.followup-info');
    info.className=`followup-info ${active?timing:'hidden'}`;
    info.textContent=active ? `${label}${r.reminderDate?' • Hatırlatma: '+formatDate(r.reminderDate):''}${r.completedAt?' • Tamamlandı: '+new Date(r.completedAt).toLocaleString('tr-TR'):''}` : '';
  }

  function updateKpis(){
    const a=currentAudit(); let assessed=0, findings=0, obs=0, remote=0, onsite=0, pending=0, overdue=0;
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey);
      if(r.result){assessed++; if(i.auditType==='Uzaktan')remote++; else onsite++;}
      if(r.result==='Bulgu')findings++; if(r.result==='Gözlem')obs++;
      const timing=followUpTiming(r);
      if(['pending','overdue','today'].includes(timing))pending++;
      if(timing==='overdue')overdue++;
    });
    els.kpiProgress.textContent=`${assessed}/${criteria.length}`; els.kpiFindings.textContent=findings; els.kpiObservations.textContent=obs;
    els.kpiRemote.textContent=`${remote}/23`; els.kpiOnsite.textContent=`${onsite}/35`; els.kpiPending.textContent=pending; els.kpiOverdue.textContent=overdue;
    els.kpiOverdue.closest('.kpi').classList.toggle('has-value',overdue>0);
    els.kpiPending.closest('.kpi').classList.toggle('has-value',pending>0);
  }

  function renderFollowUpPanel(){
    const a=currentAudit(); if(!a)return;
    const rows=[];
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey); const timing=followUpTiming(r);
      if(['pending','overdue','today'].includes(timing)) rows.push({i,r,timing});
    });
    rows.sort((x,y)=>{
      const xd=x.r.reminderDate||'9999-12-31', yd=y.r.reminderDate||'9999-12-31';
      return xd.localeCompare(yd) || x.i.shortCode.localeCompare(y.i.shortCode,'tr');
    });
    els.followUpPanel.classList.toggle('hidden',rows.length===0);
    els.followUpList.innerHTML=rows.map(({i,r,timing})=>`<tr class="followup-row" data-key="${esc(i.htmlKey)}">
      <td><strong>${esc(i.shortCode)} / ${esc(i.aadCode)}</strong></td>
      <td>${esc(r.followUpText)}</td>
      <td>${formatDate(r.reminderDate)}</td>
      <td><span class="followup-badge ${timing}">${esc(followUpLabel(r))}</span></td>
    </tr>`).join('');
    els.followUpList.querySelectorAll('.followup-row').forEach(row=>row.onclick=()=>goToAad(row.dataset.key));
  }

  function goToNextUnassessed(){
    const a=currentAudit(); if(!a)return;
    const type=els.typeFilter.value;
    const candidates=criteria.filter(i=>(type==='all'||i.auditType===type) && !getResponse(a,i.htmlKey).result);
    if(!candidates.length){ toast(type==='all'?'Tüm AAD değerlendirmeleri tamamlandı.':`${type} AAD değerlendirmeleri tamamlandı.`); return; }
    goToAad(candidates[0].htmlKey,{preserveType:true});
  }

  function goToAad(key,options={}){
    const item=criteria.find(i=>i.htmlKey===key); if(!item)return;
    const currentType=els.typeFilter.value;
    els.criterionSearch.value=''; els.typeFilter.value=options.preserveType?currentType:'all'; els.resultFilter.value='all'; els.followUpFilter.value='all';
    state.expanded.add(item.questionCode); renderQuestions();
    requestAnimationFrame(()=>{
      const card=els.questions.querySelector(`.aad-card[data-key="${CSS.escape(key)}"]`);
      if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.classList.add('flash'); setTimeout(()=>card.classList.remove('flash'),1600); }
    });
  }

  function openAuditDialog(a=null){
    els.auditDialogTitle.textContent=a?'Denetim bilgilerini düzenle':'Yeni denetim'; els.auditId.value=a?.id||''; els.organizationName.value=a?.organizationName||'';
    els.auditNo.value=a?.auditNo||''; els.auditStatus.value=a?.status||'Taslak'; els.auditStartDate.value=a?.startDate||''; els.auditEndDate.value=a?.endDate||'';
    els.leadAuditor.value=a?.leadAuditor||''; els.auditors.value=a?.auditors||''; els.auditGeneralNote.value=a?.generalNote||''; els.auditDialog.showModal();
  }
  async function saveAuditFromDialog(e){
    e.preventDefault(); if(!els.organizationName.value.trim()){els.organizationName.focus();return;}
    let a=currentAudit(); const editing=!!els.auditId.value;
    if(!editing){a={id:uid(),templateId:T.templateId,formVersion:T.formatVersion,createdAt:nowIso(),createdBy:state.user?.email||'local',responses:{}};state.audits.unshift(a);state.activeAuditId=a.id;}
    Object.assign(a,{organizationName:els.organizationName.value.trim(),auditNo:els.auditNo.value.trim(),status:els.auditStatus.value,startDate:els.auditStartDate.value,endDate:els.auditEndDate.value,leadAuditor:els.leadAuditor.value.trim(),auditors:els.auditors.value.trim(),generalNote:els.auditGeneralNote.value.trim()});
    await persistAudit(a); els.auditDialog.close(); renderAll(); toast('Denetim kaydedildi.');
  }

  function exportAudit(){
    const a=currentAudit(); if(!a)return;
    const payload={...a,template:{id:T.templateId,version:T.formatVersion},criteriaSnapshot:criteria};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}); const url=URL.createObjectURL(blob); const x=document.createElement('a');
    x.href=url; x.download=`FR13_${(a.auditNo||a.organizationName||'denetim').replace(/[^a-z0-9çğıöşü_-]+/gi,'_')}.json`; x.click(); setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  els.newAuditBtn.onclick=()=>openAuditDialog(); els.editAuditBtn.onclick=()=>openAuditDialog(currentAudit()); els.auditForm.addEventListener('submit',saveAuditFromDialog);
  document.querySelectorAll('.cancel-dialog').forEach(b=>b.onclick=()=>els.auditDialog.close());
  els.auditSearch.addEventListener('input',renderAuditList);
  [els.criterionSearch,els.typeFilter,els.resultFilter,els.followUpFilter].forEach(x=>x.addEventListener('input',renderQuestions));
  els.expandAllBtn.onclick=()=>{const codes=[...new Set(criteria.map(x=>x.questionCode))]; const allOpen=codes.every(c=>state.expanded.has(c)); state.expanded=new Set(allOpen?[]:codes); renderQuestions();};
  els.showAllPendingBtn.onclick=()=>{els.criterionSearch.value='';els.typeFilter.value='all';els.resultFilter.value='all';els.followUpFilter.value='pending';renderQuestions();els.questions.scrollIntoView({behavior:'smooth',block:'start'});};
  els.nextUnassessedBtn.onclick=goToNextUnassessed;
  els.exportBtn.onclick=exportAudit; els.printBtn.onclick=()=>window.print();
  els.loginBtn.onclick=loginWithEmailPassword;
  els.loginPass.addEventListener('keydown',e=>{if(e.key==='Enter') loginWithEmailPassword();});
  els.offlineBtn.onclick=enterOfflineMode;
  els.signOutBtn.onclick=async()=>{
    if(state.offlineMode){ state.offlineMode=false; state.audits=[]; state.activeAuditId=null; showLogin(); return; }
    if(state.firebase) await state.firebase.auth.signOut();
  };
  initFirebase();
})();
