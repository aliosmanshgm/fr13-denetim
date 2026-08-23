(() => {
  const T = window.FR13_TEMPLATE;
  const criteria = T.data;
  const STORAGE_KEY = 'fr13_audit_app_v1';
  const PENDING_SYNC_KEY = 'fr13_audit_pending_sync_v1';
  const state = { audits: [], activeAuditId: null, firebase: null, firebaseConnected: false, user: null, offlineMode: false, expanded: new Set(), expandedAads: new Set() };

  const $ = (id) => document.getElementById(id);
  const els = {
    loginOverlay:$('loginOverlay'), loginEmail:$('loginEmail'), loginPass:$('loginPass'), loginBtn:$('loginBtn'), offlineBtn:$('offlineBtn'), loginError:$('loginError'), firebaseConfigHint:$('firebaseConfigHint'),
    appHeader:$('appHeader'), appShell:$('appShell'), storageBadge:$('storageBadge'), saveStatusBadge:$('saveStatusBadge'), saveStatusDetail:$('saveStatusDetail'), currentUserLabel:$('currentUserLabel'), signOutBtn:$('signOutBtn'),
    auditList:$('auditList'), auditSearch:$('auditSearch'), newAuditBtn:$('newAuditBtn'),
    emptyState:$('emptyState'), workspace:$('auditWorkspace'), auditNoLabel:$('auditNoLabel'), auditTitle:$('auditTitle'), auditMeta:$('auditMeta'),
    editAuditBtn:$('editAuditBtn'), excelExportBtn:$('excelExportBtn'), pdfExportBtn:$('pdfExportBtn'), exportBtn:$('exportBtn'), printBtn:$('printBtn'),
    kpiProgress:$('kpiProgress'), kpiCompliant:$('kpiCompliant'), kpiNoncompliant:$('kpiNoncompliant'), kpiNA:$('kpiNA'), kpiNotAsked:$('kpiNotAsked'), kpiRemote:$('kpiRemote'), kpiOnsite:$('kpiOnsite'),
    kpiPending:$('kpiPending'), kpiOverdue:$('kpiOverdue'), kpiUndated:$('kpiUndated'), auditProgressBar:$('auditProgressBar'), auditProgressPercent:$('auditProgressPercent'), findingSummaryPanel:$('findingSummaryPanel'), findingSummaryList:$('findingSummaryList'), findingSummaryAttention:$('findingSummaryAttention'), findingLevel1Count:$('findingLevel1Count'), findingLevel2Count:$('findingLevel2Count'), findingObservationCount:$('findingObservationCount'), showNoncompliantBtn:$('showNoncompliantBtn'), followUpPanel:$('followUpPanel'), followUpList:$('followUpList'), followUpAttention:$('followUpAttention'), showAllPendingBtn:$('showAllPendingBtn'),
    criterionSearch:$('criterionSearch'), typeFilter:$('typeFilter'), resultFilter:$('resultFilter'), followUpFilter:$('followUpFilter'), nextUnassessedBtn:$('nextUnassessedBtn'), expandAllBtn:$('expandAllBtn'), questions:$('questions'),
    auditDialog:$('auditDialog'), auditForm:$('auditForm'), auditDialogTitle:$('auditDialogTitle'), auditId:$('auditId'), organizationName:$('organizationName'), auditNo:$('auditNo'),
    auditStatus:$('auditStatus'), auditStartDate:$('auditStartDate'), auditEndDate:$('auditEndDate'), leadAuditor:$('leadAuditor'), auditors:$('auditors'), auditGeneralNote:$('auditGeneralNote'), deleteAuditBtn:$('deleteAuditBtn'),
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
    if(els.saveStatusDetail){
      if(mode==='saving') els.saveStatusDetail.textContent='Son değişiklik Firebase’e aktarılıyor…';
      else if(mode==='error') els.saveStatusDetail.textContent='Kayıt başarısız — bağlantıyı kontrol edin';
      else if(mode==='local') els.saveStatusDetail.textContent='Değişiklikler bu cihazda yerel olarak saklanıyor';
      else els.saveStatusDetail.textContent='Son kayıt: '+new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
  }
  function currentAudit(){ return state.audits.find(a=>a.id===state.activeAuditId); }
  function blankResponse(){
    return {result:'', evidenceRefs:'', auditorNote:'', findingLevel:'', predefinedFinding:'', findingDescription:'', followUpText:'', followUpStatus:'', reminderDate:'', followUpCreatedAt:null, completedAt:null, updatedAt:null};
  }
  function normalizeResponse(r={}){
    const legacyResultMap={Bulgu:'Uygun Değil',Gözlem:'Sorulmadı',Uygulanamaz:'N/A'};
    const normalizedResult=legacyResultMap[r.result] || r.result || '';
    return {
      ...blankResponse(), ...r, result:normalizedResult,
      findingLevel: r.findingLevel || r.finding?.level || '',
      predefinedFinding: r.predefinedFinding || r.finding?.predefinedFinding || '',
      findingDescription: r.findingDescription || r.finding?.description || '',
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
  function pendingSyncIds(){ try{return new Set(JSON.parse(localStorage.getItem(PENDING_SYNC_KEY)||'[]'));}catch{return new Set();} }
  function setPendingSyncIds(set){ localStorage.setItem(PENDING_SYNC_KEY,JSON.stringify([...set])); }
  function markPendingSync(id){ if(!id)return; const set=pendingSyncIds(); set.add(id); setPendingSyncIds(set); }
  function clearPendingSync(id){ const set=pendingSyncIds(); set.delete(id); setPendingSyncIds(set); }
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
      els.storageBadge.textContent=state.firebaseConnected?'● Firebase bağlı':'○ Firebase bağlanıyor'; els.storageBadge.className='badge cloud '+(state.firebaseConnected?'connected':'');
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
      db.ref('.info/connected').on('value',snap=>{
        state.firebaseConnected=snap.val()===true;
        if(!state.offlineMode && els.storageBadge){
          els.storageBadge.textContent=state.firebaseConnected?'● Firebase bağlı':'○ Firebase bağlantısı yok';
          els.storageBadge.className='badge cloud '+(state.firebaseConnected?'connected':'disconnected');
        }
      });
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
    const local=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    const localAudits=(local.audits||[]).map(normalizeAudit);
    const snap=await state.firebase.db.ref('fr13_audits').once('value');
    const raw=snap.val()||{};
    const pending=pendingSyncIds();
    if(pending.size){
      setSaveStatus('saving','… Bekleyen kayıtlar eşitleniyor');
      for(const id of [...pending]){
        const la=localAudits.find(a=>a.id===id); if(!la){clearPendingSync(id);continue;}
        const cloudUpdated=raw[id]?.updatedAt||'';
        if(!raw[id] || (la.updatedAt||'')>cloudUpdated){
          try{ const payload={...la}; delete payload.id; await state.firebase.db.ref('fr13_audits/'+id).set(payload); raw[id]=payload; clearPendingSync(id); }
          catch(err){ console.error('Bekleyen kayıt eşitlenemedi',id,err); }
        } else clearPendingSync(id);
      }
    }
    state.audits=Object.entries(raw).map(([id,data])=>normalizeAudit({id,...(data||{})})).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    const preferred=local.activeAuditId;
    state.activeAuditId=state.audits.some(a=>a.id===preferred)?preferred:(state.audits[0]?.id||null);
    saveLocal(); setSaveStatus('saved'); renderAll();
  }
  async function persistAudit(a){
    a.updatedAt=nowIso();
    saveLocal();
    if(state.firebase && state.user && !state.offlineMode){
      markPendingSync(a.id);
      const payload={...a}; delete payload.id;
      await state.firebase.db.ref('fr13_audits/'+a.id).set(payload);
      clearPendingSync(a.id);
    }
  }

  function getResponse(a,key){
    if(!a.responses[key]) a.responses[key]=blankResponse();
    return a.responses[key];
  }
  function isNoncompliant(r){ return r.result==='Uygun Değil'; }
  function isFindingComplete(r){ return isNoncompliant(r) && !!String(r.findingLevel||'').trim() && !!String(r.predefinedFinding||'').trim() && !!String(r.findingDescription||'').trim(); }
  function isAssessmentComplete(r){ return !!r.result && (!isNoncompliant(r) || isFindingComplete(r)); }
  function findingMissingFields(r){
    if(!isNoncompliant(r)) return [];
    const missing=[];
    if(!String(r.findingLevel||'').trim()) missing.push('bulgu seviyesi');
    if(!String(r.predefinedFinding||'').trim()) missing.push('ön tanımlı bulgu');
    if(!String(r.findingDescription||'').trim()) missing.push('bulgu açıklaması');
    return missing;
  }
  function resultIcon(result){ return ({'Uygun':'✓','Uygun Değil':'!','N/A':'—','Sorulmadı':'?'})[result]||'○'; }
  function hasFollowUp(r){ return !!String(r.followUpText||'').trim(); }
  function effectiveFollowUpStatus(r){ return hasFollowUp(r) ? (r.followUpStatus || 'Bekleniyor') : ''; }
  function followUpTiming(r){
    if(!hasFollowUp(r)) return 'none';
    const status=effectiveFollowUpStatus(r);
    if(status==='Tamamlandı') return 'completed';
    if(status==='İptal') return 'cancelled';
    if(!r.reminderDate) return 'undated';
    const today=localDateString();
    if(r.reminderDate < today) return 'overdue';
    if(r.reminderDate === today) return 'today';
    return 'pending';
  }
  function followUpLabel(r){
    const timing=followUpTiming(r);
    return ({overdue:'Gecikmiş',today:'Bugün kontrol et',pending:'Bekleniyor',undated:'Tarih belirlenmedi',completed:'Tamamlandı',cancelled:'İptal'})[timing] || '';
  }
  function followUpClass(r){ return followUpTiming(r); }
  function isOpenFollowUpTiming(timing){ return ['pending','undated','overdue','today'].includes(timing); }
  function addDaysDateString(days){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return localDateString(d); }

  function renderAll(){ renderAuditList(); renderWorkspace(); }
  function auditFollowUpCounts(a){
    let pending=0, overdue=0;
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey); const timing=followUpTiming(r);
      if(isOpenFollowUpTiming(timing)) pending++;
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
    els.auditList.querySelectorAll('.audit-item').forEach(x=>x.onclick=()=>{state.activeAuditId=x.dataset.id; state.expandedAads.clear(); saveLocal(); renderAll();});
  }

  function renderWorkspace(){
    const a=currentAudit(); els.emptyState.classList.toggle('hidden',!!a); els.workspace.classList.toggle('hidden',!a); if(!a)return;
    els.auditNoLabel.textContent=a.auditNo||'DENETİM'; els.auditTitle.textContent=a.organizationName||'-';
    els.auditMeta.textContent=[a.startDate&&('Başlangıç: '+formatDate(a.startDate)),a.endDate&&('Bitiş: '+formatDate(a.endDate)),a.leadAuditor&&('Baş denetçi: '+a.leadAuditor),a.status].filter(Boolean).join(' • ');
    renderFindingSummaryPanel(); renderFollowUpPanel(); renderQuestions(); updateKpis();
  }

  function matchesFilters(item,r){
    const q=els.criterionSearch.value.trim().toLocaleLowerCase('tr-TR');
    if(els.typeFilter.value!=='all' && item.auditType!==els.typeFilter.value)return false;
    const rf=els.resultFilter.value;
    if(rf==='unassessed' && isAssessmentComplete(r))return false;
    if(rf==='incomplete-finding' && !(isNoncompliant(r) && !isFindingComplete(r)))return false;
    if(rf!=='all' && rf!=='unassessed' && rf!=='incomplete-finding' && r.result!==rf)return false;
    const ff=els.followUpFilter.value; const timing=followUpTiming(r);
    if(ff==='pending' && !isOpenFollowUpTiming(timing)) return false;
    if(ff==='overdue' && timing!=='overdue') return false;
    if(ff==='today' && timing!=='today') return false;
    if(ff==='undated' && timing!=='undated') return false;
    if(ff==='completed' && timing!=='completed') return false;
    if(q){
      const hay=[item.shortCode,item.aadCode,item.question,item.atomicCriterion,item.reference,item.auditorGuidance,r.evidenceRefs,r.auditorNote,r.findingLevel,r.predefinedFinding,r.findingDescription,r.followUpText].join(' ').toLocaleLowerCase('tr-TR');
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
      const assessedCount=items.filter(i=>isAssessmentComplete(getResponse(a,i.htmlKey))).length;
      const findingCount=items.filter(i=>getResponse(a,i.htmlKey).result==='Uygun Değil').length;
      const followCount=items.filter(i=>isOpenFollowUpTiming(followUpTiming(getResponse(a,i.htmlKey)))).length;
      const questionPct=Math.round((assessedCount/items.length)*100);
      html+=`<section class="question-block" data-code="${esc(code)}"><div class="question-head"><div class="question-code">${esc(first.shortCode)}</div><div class="question-main"><div class="question-text">${esc(first.question)}</div><div class="question-ref">${esc(first.reference)}</div><div class="question-progress-track"><span style="width:${questionPct}%"></span></div></div><div class="question-stats"><strong>${assessedCount}/${items.length}</strong><span>değerlendirildi</span>${findingCount?`<span class="qstat danger">${findingCount} uygun değil</span>`:''}${followCount?`<span class="qstat warn">${followCount} takip</span>`:''}${shown.length!==items.length?`<span class="qstat muted">${shown.length} gösteriliyor</span>`:''}<span class="question-chevron">${open?'⌃':'⌄'}</span></div></div><div class="question-body ${open?'':'hidden'}">${shown.map(i=>renderAad(i,getResponse(a,i.htmlKey))).join('')}</div></section>`;
    }
    els.questions.innerHTML=html || '<div class="panel no-results">Filtreye uyan kriter bulunamadı.</div>';
    els.questions.querySelectorAll('.question-head').forEach(h=>h.onclick=()=>{
      const block=h.closest('.question-block');const body=block.querySelector('.question-body');body.classList.toggle('hidden');
      if(body.classList.contains('hidden'))state.expanded.delete(block.dataset.code);else state.expanded.add(block.dataset.code);
      const chevron=block.querySelector('.question-chevron'); if(chevron) chevron.textContent=body.classList.contains('hidden')?'⌄':'⌃';
    });
    bindResponseInputs();
  }
  function renderAad(i,r){
    const result=r.result||''; const hasTask=hasFollowUp(r); const taskClass=followUpClass(r); const taskLabel=followUpLabel(r);
    const status=effectiveFollowUpStatus(r);
    const resultClass=result ? 'result-'+result.replace(/[^a-zA-Z0-9ÇĞİÖŞÜçğıöşü]/g,'-') : 'result-unassessed';
    const resultLabel=result||'Değerlendirilmedi';
    const resultIconValue=resultIcon(result);
    const expanded=state.expandedAads.has(i.htmlKey);
    const hasEvidence=!!String(r.evidenceRefs||'').trim();
    const hasNote=!!String(r.auditorNote||'').trim();
    const saveLabel=r.updatedAt?'✓ Kayıtlı':'— Veri yok';
    return `<article class="aad-card aad-accordion ${resultClass} ${taskClass==='overdue'?'has-overdue':hasTask?'has-followup':''} ${expanded?'expanded':''}" data-key="${esc(i.htmlKey)}">
      <button type="button" class="aad-accordion-head" aria-expanded="${expanded?'true':'false'}" aria-controls="aad-body-${esc(i.htmlKey)}">
        <div class="aad-accordion-main">
          <div class="aad-title"><strong>${esc(i.shortCode)} / ${esc(i.aadCode)}</strong><span class="chip ${i.auditType==='Uzaktan'?'remote':'onsite'}">${esc(i.auditType)}</span></div>
          <div class="aad-summary-criterion">${esc(i.atomicCriterion)}</div>
          <div class="aad-summary-flags">${hasEvidence?'<span>📎 Kanıt ref.</span>':''}${hasNote?'<span>📝 Denetçi notu</span>':''}${!hasEvidence&&!hasNote?'<span class="muted">Henüz çalışma notu yok</span>':''}</div>
        </div>
        <div class="aad-accordion-status">
          ${hasTask?`<span class="followup-badge ${taskClass}">${esc(taskLabel)}</span>`:''}
          <span class="aad-result-pill ${resultClass}"><b>${resultIconValue}</b>${esc(resultLabel)}</span>${isNoncompliant(r)&&r.findingLevel?`<span class="finding-level-badge level-${esc(r.findingLevel.replace(/\s+/g,'-'))}">${esc(r.findingLevel)}</span>`:''}
          <span class="aad-save-summary ${r.updatedAt?'saved':'empty'}">${saveLabel}</span>
          <span class="aad-chevron" aria-hidden="true">${expanded?'⌃':'⌄'}</span>
        </div>
      </button>
      <div id="aad-body-${esc(i.htmlKey)}" class="aad-accordion-body ${expanded?'':'hidden'}">
        <div class="aad-detail-context"><span class="aad-detail-label">Atomik kriter</span><div class="criterion">${esc(i.atomicCriterion)}</div></div>
        <details><summary>Denetçi açıklaması / kabul edilebilir kanıtlar</summary><div class="guidance">${esc(i.auditorGuidance||'')}</div></details>
        <div class="aad-grid">
          <label>İşletme kanıt referansları<textarea class="input response-input" data-field="evidenceRefs" placeholder="Örn. OM-A 11.3.2; SMSM 6.4; QDMS DOC-123">${esc(r.evidenceRefs||'')}</textarea></label>
          <label>Denetçi notu<textarea class="input response-input" data-field="auditorNote" placeholder="Denetimde yapılan tespit / doğrulama notu">${esc(r.auditorNote||'')}</textarea></label>
          <label>Değerlendirme sonucu
            <input type="hidden" class="response-input result-select" data-field="result" data-value="${esc(result)}" value="${esc(result)}" />
            <div class="result-buttons" role="group" aria-label="Değerlendirme sonucu">
              <button type="button" class="result-btn good ${result==='Uygun'?'active':''}" data-result="Uygun">Uygun</button>
              <button type="button" class="result-btn danger ${result==='Uygun Değil'?'active':''}" data-result="Uygun Değil">Uygun Değil</button>
              <button type="button" class="result-btn neutral ${result==='N/A'?'active':''}" data-result="N/A">N/A</button>
              <button type="button" class="result-btn notasked ${result==='Sorulmadı'?'active':''}" data-result="Sorulmadı">Sorulmadı</button>
              <button type="button" class="result-clear ${!result?'active':''}" data-result="" title="Değerlendirmeyi temizle">×</button>
            </div>
          </label>
        </div>
        <div class="finding-detail-box ${isNoncompliant(r)?'active':'hidden'} ${isNoncompliant(r)&&!isFindingComplete(r)?'incomplete':''}">
          <div class="finding-detail-title"><div><span>Uygun Değil / Bulgu Bilgileri</span><small>Uygun Değil değerlendirmesinin tamamlanması için seviye, ön tanımlı bulgu ve bulgu açıklaması zorunludur.</small></div><span class="required-badge">ZORUNLU</span></div>
          <div class="finding-level-field">
            <label>Bulgu seviyesi *</label>
            <input type="hidden" class="response-input finding-level-input" data-field="findingLevel" value="${esc(r.findingLevel||'')}" />
            <div class="finding-level-buttons" role="group" aria-label="Bulgu seviyesi">
              <button type="button" class="finding-level-btn level1 ${r.findingLevel==='Seviye 1'?'active':''}" data-level="Seviye 1">Seviye 1</button>
              <button type="button" class="finding-level-btn level2 ${r.findingLevel==='Seviye 2'?'active':''}" data-level="Seviye 2">Seviye 2</button>
              <button type="button" class="finding-level-btn observation ${r.findingLevel==='Gözlem'?'active':''}" data-level="Gözlem">Gözlem</button>
            </div>
          </div>
          <div class="finding-text-grid">
            <label>Ön Tanımlı Bulgu *<textarea class="input response-input finding-required" data-field="predefinedFinding" required placeholder="Genel, benzersiz ve işletmeden bağımsız ön tanımlı bulgu metni">${esc(r.predefinedFinding||'')}</textarea></label>
            <label>Bulgu Açıklaması *<textarea class="input response-input finding-required" data-field="findingDescription" required placeholder="Denetimde doğrulanan somut uygunsuzluğu açıklayın">${esc(r.findingDescription||'')}</textarea></label>
          </div>
          <div class="finding-validation ${isFindingComplete(r)?'complete':'incomplete'}">${isFindingComplete(r)?'✓ Zorunlu bulgu bilgileri tamamlandı.':'! Eksik: '+esc(findingMissingFields(r).join(', '))}</div>
        </div>
        <div class="followup-box ${hasTask?'active':''}">
          <div class="followup-box-title"><span>Takip / Beklenen Husus</span><small>Buraya yazılan husus otomatik olarak açık takip kabul edilir. Hatırlatma tarihi boş bırakılırsa ayrıca uyarılır.</small></div>
          <div class="followup-grid">
            <label class="followup-text-field">Talep edilen / beklenen husus<textarea class="input response-input followup-text" data-field="followUpText" placeholder="Örn. İşletmeden güncel olay kayıt listesi talep edildi.">${esc(r.followUpText||'')}</textarea></label>
            <div class="followup-date-field">
              <label>Hatırlatma tarihi<input type="date" class="input response-input" data-field="reminderDate" value="${esc(r.reminderDate||'')}" ${hasTask?'':'disabled'} /></label>
              <div class="followup-date-presets">
                <button type="button" class="followup-date-btn" data-days="0" ${hasTask?'':'disabled'}>Bugün</button>
                <button type="button" class="followup-date-btn" data-days="1" ${hasTask?'':'disabled'}>Yarın</button>
                <button type="button" class="followup-date-btn" data-days="3" ${hasTask?'':'disabled'}>+3 gün</button>
                <button type="button" class="followup-date-btn" data-days="7" ${hasTask?'':'disabled'}>+7 gün</button>
                <button type="button" class="followup-date-btn clear" data-days="clear" ${hasTask?'':'disabled'}>Temizle</button>
              </div>
            </div>
            <div class="followup-status-field">
              <label>Takip durumu<select class="input response-input followup-status" data-field="followUpStatus" ${hasTask?'':'disabled'}><option value="Bekleniyor" ${status==='Bekleniyor'?'selected':''}>Bekleniyor</option><option value="Tamamlandı" ${status==='Tamamlandı'?'selected':''}>Tamamlandı</option><option value="İptal" ${status==='İptal'?'selected':''}>İptal</option></select></label>
              ${hasTask?`<button type="button" class="followup-action-btn ${status==='Tamamlandı'?'reopen':'complete'}" data-status="${status==='Tamamlandı'?'Bekleniyor':'Tamamlandı'}">${status==='Tamamlandı'?'↻ Yeniden aç':'✓ Tamamla'}</button>`:''}
            </div>
          </div>
          <div class="followup-info ${hasTask?taskClass+'':'hidden'}">${hasTask?`${taskLabel}${r.reminderDate?` • Hatırlatma: ${formatDate(r.reminderDate)}`:' • Hatırlatma tarihi girilmedi'}${r.followUpCreatedAt?` • Açılış: ${new Date(r.followUpCreatedAt).toLocaleDateString('tr-TR')}`:''}${r.completedAt?` • Tamamlandı: ${new Date(r.completedAt).toLocaleString('tr-TR')}`:''}`:''}</div>
        </div>
        <div class="save-state"><span class="save-dot"></span>${r.updatedAt?'Otomatik kayıt • '+new Date(r.updatedAt).toLocaleString('tr-TR'):'Otomatik kayıt açık • Henüz veri girilmedi'}</div>
      </div>
    </article>`;
  }

  function bindResponseInputs(){
    document.querySelectorAll('.aad-card').forEach(card=>{
      const accordionHead=card.querySelector('.aad-accordion-head');
      if(accordionHead) accordionHead.addEventListener('click',()=>{
        const key=card.dataset.key; const body=card.querySelector('.aad-accordion-body'); const opening=body.classList.contains('hidden');
        body.classList.toggle('hidden',!opening); card.classList.toggle('expanded',opening);
        accordionHead.setAttribute('aria-expanded',opening?'true':'false');
        const chevron=card.querySelector('.aad-chevron'); if(chevron) chevron.textContent=opening?'⌃':'⌄';
        if(opening) state.expandedAads.add(key); else state.expandedAads.delete(key);
      });
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
      card.querySelectorAll('.finding-level-btn').forEach(btn=>btn.addEventListener('click',()=>{
        const inp=card.querySelector('[data-field="findingLevel"]');
        inp.value=btn.dataset.level||'';
        card.querySelectorAll('.finding-level-btn').forEach(x=>x.classList.toggle('active',x.dataset.level===inp.value));
        scheduleResponseSave(card,inp,true);
      }));
      card.querySelectorAll('.followup-date-btn').forEach(btn=>btn.addEventListener('click',()=>{
        const inp=card.querySelector('[data-field="reminderDate"]');
        if(inp.disabled) return;
        inp.value=btn.dataset.days==='clear' ? '' : addDaysDateString(Number(btn.dataset.days||0));
        scheduleResponseSave(card,inp,true);
      }));
      card.querySelectorAll('.followup-action-btn').forEach(btn=>btn.addEventListener('click',()=>{
        const inp=card.querySelector('[data-field="followUpStatus"]');
        if(inp.disabled) return;
        inp.value=btn.dataset.status||'Bekleniyor';
        scheduleResponseSave(card,inp,true);
      }));
    });
  }
  function refreshResultButtons(card,result){
    card.querySelectorAll('.result-btn,.result-clear').forEach(btn=>btn.classList.toggle('active',(btn.dataset.result||'')===result));
    [...card.classList].filter(c=>c.startsWith('result-')).forEach(c=>card.classList.remove(c));
    const cls=result ? 'result-'+result.replace(/[^a-zA-Z0-9ÇĞİÖŞÜçğıöşü]/g,'-') : 'result-unassessed';
    card.classList.add(cls);
    const pill=card.querySelector('.aad-result-pill');
    if(pill){
      pill.className='aad-result-pill '+cls;
      const icon=resultIcon(result);
      pill.innerHTML=`<b>${icon}</b>${esc(result||'Değerlendirilmedi')}`;
    }
  }
  const saveTimers={};
  function scheduleResponseSave(card,inp,immediate=false){
    const key=card.dataset.key; const a=currentAudit(); const r=getResponse(a,key); const field=inp.dataset.field; const previousText=r.followUpText||'';
    r[field]=inp.value; r.updatedAt=nowIso();
    // İnsan faktörleri / veri güvenliği: her veri girişi önce aynı anda yerel yedeğe alınır.
    // Firebase yazımı kısa debounce sonrasında yapılır; sekme aniden kapansa dahi son giriş localStorage'da kalır.
    saveLocal();
    if(state.firebase && state.user && !state.offlineMode) markPendingSync(a.id);

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

    refreshFindingPanel(card,r);
    refreshCardFollowUp(card,r);
    refreshQuestionStats(card.closest('.question-block'));
    card.querySelector('.save-state').innerHTML='<span class="save-dot saving"></span>Yerel yedek alındı • Firebase’e kaydediliyor…';
    const compactSave=card.querySelector('.aad-save-summary'); if(compactSave){compactSave.className='aad-save-summary saving';compactSave.textContent='… Kaydediliyor';}
    refreshAadSummaryFlags(card,r);
    setSaveStatus('saving');
    updateKpis(); renderFindingSummaryPanel(); renderFollowUpPanel();
    clearTimeout(saveTimers[key]);
    saveTimers[key]=setTimeout(async()=>{
      try{
        await persistAudit(a);
        renderAuditList();
        card.querySelector('.save-state').innerHTML='<span class="save-dot saved"></span>Firebase’e kaydedildi • '+new Date().toLocaleString('tr-TR');
        if(compactSave){compactSave.className='aad-save-summary saved';compactSave.textContent='✓ Kaydedildi';}
        setSaveStatus(state.offlineMode?'local':'saved');
      }catch(err){
        console.error(err);
        card.querySelector('.save-state').innerHTML='<span class="save-dot error"></span>Firebase kayıt hatası • Yerel yedek korunuyor';
        if(compactSave){compactSave.className='aad-save-summary error';compactSave.textContent='! Yerel yedek';}
        setSaveStatus('error');
        toast('Kayıt sırasında hata oluştu. İnternet/Firebase bağlantısını kontrol edin.');
      }
    }, immediate?60:400);
  }

  function refreshAadSummaryFlags(card,r){
    const wrap=card.querySelector('.aad-summary-flags'); if(!wrap) return;
    const bits=[];
    if(String(r.evidenceRefs||'').trim()) bits.push('<span>📎 Kanıt ref.</span>');
    if(String(r.auditorNote||'').trim()) bits.push('<span>📝 Denetçi notu</span>');
    if(isNoncompliant(r) && r.findingLevel) bits.push(`<span class="finding-flag">⚑ ${esc(r.findingLevel)}</span>`);
    if(isNoncompliant(r) && !isFindingComplete(r)) bits.push('<span class="finding-incomplete-flag">! Bulgu bilgisi eksik</span>');
    wrap.innerHTML=bits.length?bits.join(''):'<span class="muted">Henüz çalışma notu yok</span>';
  }

  function refreshQuestionStats(block){
    if(!block) return;
    const code=block.dataset.code;
    const items=criteria.filter(i=>i.questionCode===code);
    const a=currentAudit(); if(!a || !items.length) return;
    const assessedCount=items.filter(i=>isAssessmentComplete(getResponse(a,i.htmlKey))).length;
    const findingCount=items.filter(i=>getResponse(a,i.htmlKey).result==='Uygun Değil').length;
    const followCount=items.filter(i=>isOpenFollowUpTiming(followUpTiming(getResponse(a,i.htmlKey)))).length;
    const stats=block.querySelector('.question-stats'); if(!stats) return;
    const body=block.querySelector('.question-body');
    stats.innerHTML=`<strong>${assessedCount}/${items.length}</strong><span>değerlendirildi</span>${findingCount?`<span class="qstat danger">${findingCount} uygun değil</span>`:''}${followCount?`<span class="qstat warn">${followCount} takip</span>`:''}<span class="question-chevron">${body && !body.classList.contains('hidden')?'⌃':'⌄'}</span>`;
    const progress=block.querySelector('.question-progress-track span'); if(progress) progress.style.width=Math.round((assessedCount/items.length)*100)+'%';
  }

  function refreshFindingPanel(card,r){
    const box=card.querySelector('.finding-detail-box'); if(!box) return;
    const active=isNoncompliant(r);
    box.classList.toggle('hidden',!active); box.classList.toggle('active',active);
    box.classList.toggle('incomplete',active && !isFindingComplete(r));
    const validation=box.querySelector('.finding-validation');
    if(validation){
      validation.className='finding-validation '+(isFindingComplete(r)?'complete':'incomplete');
      validation.textContent=isFindingComplete(r)?'✓ Zorunlu bulgu bilgileri tamamlandı.':'! Eksik: '+findingMissingFields(r).join(', ');
    }
    box.querySelectorAll('.finding-level-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.level===(r.findingLevel||'')));
    card.classList.toggle('finding-incomplete',active && !isFindingComplete(r));
    const statusWrap=card.querySelector('.aad-accordion-status');
    const old=statusWrap?.querySelector('.finding-level-badge'); if(old) old.remove();
    if(active && r.findingLevel && statusWrap){
      const badge=document.createElement('span'); badge.className='finding-level-badge level-'+r.findingLevel.replace(/\s+/g,'-'); badge.textContent=r.findingLevel;
      const resultPill=statusWrap.querySelector('.aad-result-pill'); statusWrap.insertBefore(badge,resultPill||statusWrap.firstChild);
    }
  }

  function refreshCardFollowUp(card,r){
    const active=hasFollowUp(r); const timing=followUpTiming(r); const label=followUpLabel(r);
    const box=card.querySelector('.followup-box'); const dateInput=card.querySelector('[data-field="reminderDate"]'); const statusSelect=card.querySelector('[data-field="followUpStatus"]');
    box.classList.toggle('active',active);
    dateInput.disabled=!active; statusSelect.disabled=!active;
    card.querySelectorAll('.followup-date-btn').forEach(btn=>btn.disabled=!active);
    if(active){ statusSelect.value=effectiveFollowUpStatus(r); }
    else { dateInput.value=''; statusSelect.value='Bekleniyor'; }
    card.classList.toggle('has-followup',active && timing!=='overdue');
    card.classList.toggle('has-overdue',timing==='overdue');
    const statusWrap=card.querySelector('.aad-accordion-status'); const oldBadge=statusWrap?.querySelector('.followup-badge'); if(oldBadge)oldBadge.remove();
    if(active && statusWrap){
      const badge=document.createElement('span'); badge.className=`followup-badge ${timing}`; badge.textContent=label; statusWrap.insertBefore(badge,statusWrap.firstChild);
    }
    const info=card.querySelector('.followup-info');
    info.className=`followup-info ${active?timing:'hidden'}`;
    info.textContent=active ? `${label}${r.reminderDate?' • Hatırlatma: '+formatDate(r.reminderDate):' • Hatırlatma tarihi girilmedi'}${r.followUpCreatedAt?' • Açılış: '+new Date(r.followUpCreatedAt).toLocaleDateString('tr-TR'):''}${r.completedAt?' • Tamamlandı: '+new Date(r.completedAt).toLocaleString('tr-TR'):''}` : '';
    const statusField=card.querySelector('.followup-status-field');
    if(statusField){
      const oldAction=statusField.querySelector('.followup-action-btn'); if(oldAction) oldAction.remove();
      if(active){ const btn=document.createElement('button'); btn.type='button'; btn.className=`followup-action-btn ${effectiveFollowUpStatus(r)==='Tamamlandı'?'reopen':'complete'}`; btn.dataset.status=effectiveFollowUpStatus(r)==='Tamamlandı'?'Bekleniyor':'Tamamlandı'; btn.textContent=effectiveFollowUpStatus(r)==='Tamamlandı'?'↻ Yeniden aç':'✓ Tamamla'; btn.addEventListener('click',()=>{ statusSelect.value=btn.dataset.status; scheduleResponseSave(card,statusSelect,true); }); statusField.appendChild(btn); }
    }
  }

  function updateKpis(){
    const a=currentAudit(); let assessed=0, compliant=0, noncompliant=0, na=0, notAsked=0, remote=0, onsite=0, pending=0, overdue=0, undated=0;
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey);
      if(isAssessmentComplete(r)){assessed++; if(i.auditType==='Uzaktan')remote++; else onsite++;}
      if(r.result==='Uygun')compliant++;
      if(r.result==='Uygun Değil')noncompliant++;
      if(r.result==='N/A')na++;
      if(r.result==='Sorulmadı')notAsked++;
      const timing=followUpTiming(r);
      if(isOpenFollowUpTiming(timing))pending++;
      if(timing==='overdue')overdue++;
      if(timing==='undated')undated++;
    });
    els.kpiProgress.textContent=`${assessed}/${criteria.length}`;
    els.kpiCompliant.textContent=compliant; els.kpiNoncompliant.textContent=noncompliant; els.kpiNA.textContent=na; els.kpiNotAsked.textContent=notAsked;
    els.kpiRemote.textContent=`${remote}/23`; els.kpiOnsite.textContent=`${onsite}/35`; els.kpiPending.textContent=pending; els.kpiOverdue.textContent=overdue; els.kpiUndated.textContent=undated;
    const pct=Math.round((assessed/criteria.length)*100);
    if(els.auditProgressBar) els.auditProgressBar.style.width=pct+'%';
    if(els.auditProgressPercent) els.auditProgressPercent.textContent='%'+pct;
    els.kpiNoncompliant.closest('.overview-metric')?.classList.toggle('has-value',noncompliant>0);
    els.kpiOverdue.closest('.overview-metric')?.classList.toggle('has-value',overdue>0);
    els.kpiPending.closest('.overview-metric')?.classList.toggle('has-value',pending>0);
    els.kpiUndated.closest('.overview-metric')?.classList.toggle('has-value',undated>0);
  }

  function renderFindingSummaryPanel(){
    const a=currentAudit(); if(!a || !els.findingSummaryPanel) return;
    const rows=[];
    criteria.forEach(i=>{ const r=getResponse(a,i.htmlKey); if(isNoncompliant(r)) rows.push({i,r,complete:isFindingComplete(r)}); });
    const order={'Seviye 1':0,'Seviye 2':1,'Gözlem':2,'':3};
    rows.sort((x,y)=>(order[x.r.findingLevel||'']??9)-(order[y.r.findingLevel||'']??9) || x.i.shortCode.localeCompare(y.i.shortCode,'tr'));
    const level1=rows.filter(x=>x.r.findingLevel==='Seviye 1'&&x.complete).length;
    const level2=rows.filter(x=>x.r.findingLevel==='Seviye 2'&&x.complete).length;
    const observations=rows.filter(x=>x.r.findingLevel==='Gözlem'&&x.complete).length;
    const incomplete=rows.filter(x=>!x.complete).length;
    els.findingSummaryPanel.classList.toggle('hidden',rows.length===0);
    if(els.findingLevel1Count) els.findingLevel1Count.textContent=level1;
    if(els.findingLevel2Count) els.findingLevel2Count.textContent=level2;
    if(els.findingObservationCount) els.findingObservationCount.textContent=observations;
    if(els.findingSummaryAttention){ els.findingSummaryAttention.textContent=incomplete?`• ${incomplete} bulgu kaydında zorunlu bilgi eksik`:''; els.findingSummaryAttention.className='finding-summary-attention'+(incomplete?' danger':''); }
    els.findingSummaryList.innerHTML=rows.map(({i,r,complete})=>`<tr class="finding-summary-row ${complete?'':'incomplete'}" data-key="${esc(i.htmlKey)}">
      <td><strong>${esc(i.shortCode)} / ${esc(i.aadCode)}</strong></td>
      <td>${r.findingLevel?`<span class="finding-level-badge level-${esc(r.findingLevel.replace(/\s+/g,'-'))}">${esc(r.findingLevel)}</span>`:'<span class="finding-missing">Seviye seçilmedi</span>'}</td>
      <td>${r.predefinedFinding?esc(r.predefinedFinding):'<span class="finding-missing">Eksik</span>'}</td>
      <td>${r.findingDescription?esc(r.findingDescription):'<span class="finding-missing">Eksik</span>'}</td>
    </tr>`).join('');
    els.findingSummaryList.querySelectorAll('.finding-summary-row').forEach(row=>row.onclick=()=>goToAad(row.dataset.key));
  }

  function renderFollowUpPanel(){
    const a=currentAudit(); if(!a)return;
    const rows=[];
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey); const timing=followUpTiming(r);
      if(isOpenFollowUpTiming(timing)) rows.push({i,r,timing});
    });
    const order={overdue:0,today:1,pending:2,undated:3};
    rows.sort((x,y)=>{
      const priority=(order[x.timing]??9)-(order[y.timing]??9); if(priority) return priority;
      const xd=x.r.reminderDate||'9999-12-31', yd=y.r.reminderDate||'9999-12-31';
      return xd.localeCompare(yd) || x.i.shortCode.localeCompare(y.i.shortCode,'tr');
    });
    const overdueCount=rows.filter(x=>x.timing==='overdue').length;
    const todayCount=rows.filter(x=>x.timing==='today').length;
    const undatedCount=rows.filter(x=>x.timing==='undated').length;
    els.followUpPanel.classList.toggle('hidden',rows.length===0);
    if(els.followUpAttention){
      const bits=[];
      if(overdueCount) bits.push(`${overdueCount} gecikmiş`);
      if(todayCount) bits.push(`${todayCount} bugün`);
      if(undatedCount) bits.push(`${undatedCount} tarihi yok`);
      els.followUpAttention.textContent=bits.length ? '• '+bits.join(' • ') : '';
      els.followUpAttention.className='followup-attention'+(overdueCount?' danger':undatedCount?' warn':'');
    }
    els.followUpList.innerHTML=rows.map(({i,r,timing})=>`<tr class="followup-row ${timing}" data-key="${esc(i.htmlKey)}">
      <td><strong>${esc(i.shortCode)} / ${esc(i.aadCode)}</strong></td>
      <td><div class="followup-task-text">${esc(r.followUpText)}</div>${r.followUpCreatedAt?`<small class="followup-created">Açılış: ${new Date(r.followUpCreatedAt).toLocaleDateString('tr-TR')}</small>`:''}</td>
      <td>${r.reminderDate?formatDate(r.reminderDate):'<span class="followup-no-date">Tarih yok</span>'}</td>
      <td><span class="followup-badge ${timing}">${esc(followUpLabel(r))}</span></td>
      <td><button type="button" class="followup-table-action" data-key="${esc(i.htmlKey)}">✓ Tamamla</button></td>
    </tr>`).join('');
    els.followUpList.querySelectorAll('.followup-row').forEach(row=>row.onclick=()=>goToAad(row.dataset.key));
    els.followUpList.querySelectorAll('.followup-table-action').forEach(btn=>btn.onclick=async(e)=>{
      e.stopPropagation();
      const key=btn.dataset.key; const r=getResponse(a,key);
      r.followUpStatus='Tamamlandı'; r.completedAt=r.completedAt||nowIso(); r.updatedAt=nowIso();
      btn.disabled=true; btn.textContent='Kaydediliyor…'; setSaveStatus('saving');
      try{ await persistAudit(a); setSaveStatus(state.offlineMode?'local':'saved'); renderAuditList(); renderFindingSummaryPanel(); renderFollowUpPanel(); renderQuestions(); updateKpis(); toast('Takip tamamlandı.'); }
      catch(err){ console.error(err); setSaveStatus('error'); btn.disabled=false; btn.textContent='✓ Tamamla'; toast('Takip kaydedilemedi.'); }
    });
  }

  function goToNextUnassessed(){
    const a=currentAudit(); if(!a)return;
    const type=els.typeFilter.value;
    const candidates=criteria.filter(i=>(type==='all'||i.auditType===type) && !isAssessmentComplete(getResponse(a,i.htmlKey)));
    if(!candidates.length){ toast(type==='all'?'Tüm AAD değerlendirmeleri tamamlandı.':`${type} AAD değerlendirmeleri tamamlandı.`); return; }
    goToAad(candidates[0].htmlKey,{preserveType:true});
  }

  function goToAad(key,options={}){
    const item=criteria.find(i=>i.htmlKey===key); if(!item)return;
    const currentType=els.typeFilter.value;
    els.criterionSearch.value=''; els.typeFilter.value=options.preserveType?currentType:'all'; els.resultFilter.value='all'; els.followUpFilter.value='all';
    state.expanded.add(item.questionCode); state.expandedAads.add(item.htmlKey); renderQuestions();
    requestAnimationFrame(()=>{
      const card=els.questions.querySelector(`.aad-card[data-key="${CSS.escape(key)}"]`);
      if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.classList.add('flash'); setTimeout(()=>card.classList.remove('flash'),1600); }
    });
  }

  function openAuditDialog(a=null){
    els.auditDialogTitle.textContent=a?'Denetim bilgilerini düzenle':'Yeni denetim'; els.auditId.value=a?.id||''; els.organizationName.value=a?.organizationName||'';
    els.auditNo.value=a?.auditNo||''; els.auditStatus.value=a?.status||'Taslak'; els.auditStartDate.value=a?.startDate||''; els.auditEndDate.value=a?.endDate||'';
    els.leadAuditor.value=a?.leadAuditor||''; els.auditors.value=a?.auditors||''; els.auditGeneralNote.value=a?.generalNote||'';
    if(els.deleteAuditBtn) els.deleteAuditBtn.classList.toggle('hidden',!a);
    els.auditDialog.showModal();
  }
  async function saveAuditFromDialog(e){
    e.preventDefault(); if(!els.organizationName.value.trim()){els.organizationName.focus();return;}
    let a=currentAudit(); const editing=!!els.auditId.value;
    if(!editing){a={id:uid(),templateId:T.templateId,formVersion:T.formatVersion,createdAt:nowIso(),createdBy:state.user?.email||'local',responses:{}};state.audits.unshift(a);state.activeAuditId=a.id;state.expandedAads.clear();}
    Object.assign(a,{organizationName:els.organizationName.value.trim(),auditNo:els.auditNo.value.trim(),status:els.auditStatus.value,startDate:els.auditStartDate.value,endDate:els.auditEndDate.value,leadAuditor:els.leadAuditor.value.trim(),auditors:els.auditors.value.trim(),generalNote:els.auditGeneralNote.value.trim()});
    await persistAudit(a); els.auditDialog.close(); renderAll(); toast('Denetim kaydedildi.');
  }

  async function deleteCurrentAudit(){
    const a=currentAudit();
    if(!a || !els.auditId.value) return;
    const label=[a.auditNo,a.organizationName].filter(Boolean).join(' — ') || 'Bu denetim';
    const cloudDelete=!!(state.firebase && state.user && !state.offlineMode);
    const message=cloudDelete
      ? `“${label}” kaydını kalıcı olarak silmek istediğinize emin misiniz?\n\nDenetim üst bilgileri, 58 AAD'ye ait değerlendirmeler, notlar ve takip kayıtları Firebase Realtime Database'den ve bu cihazdaki yerel yedekten silinecektir. Bu işlem geri alınamaz.`
      : `“${label}” kaydını bu cihazdaki yerel kayıtlardan silmek istediğinize emin misiniz?\n\nÇevrimdışı modda Firebase üzerindeki bir kayıt silinmez.`;
    if(!window.confirm(message)) return;
    const id=a.id;
    if(els.deleteAuditBtn){ els.deleteAuditBtn.disabled=true; els.deleteAuditBtn.textContent='Siliniyor…'; }
    try{
      setSaveStatus('saving','… Siliniyor');
      if(cloudDelete) await state.firebase.db.ref('fr13_audits/'+id).remove();
      state.audits=state.audits.filter(x=>x.id!==id);
      clearPendingSync(id);
      state.activeAuditId=state.audits[0]?.id||null;
      state.expanded.clear(); state.expandedAads.clear();
      saveLocal();
      els.auditDialog.close();
      setSaveStatus(state.offlineMode?'local':'saved');
      renderAll();
      toast(cloudDelete?'Denetim Firebase’den silindi.':'Yerel denetim kaydı silindi.');
    }catch(err){
      console.error('Denetim silinemedi',err);
      setSaveStatus('error','! Silme başarısız');
      window.alert('Denetim silinemedi: '+(err?.message||err));
    }finally{
      if(els.deleteAuditBtn){ els.deleteAuditBtn.disabled=false; els.deleteAuditBtn.textContent='🗑️ Denetimi Sil'; }
    }
  }

  function exportFileBase(a){
    const raw=(a.auditNo||a.organizationName||'denetim').trim() || 'denetim';
    return `FR13_${raw.replace(/[^a-z0-9çğıöşü_-]+/gi,'_').replace(/^_+|_+$/g,'')}`;
  }

  function exportStats(a){
    const out={assessed:0,compliant:0,noncompliant:0,na:0,notAsked:0,remote:0,onsite:0,level1:0,level2:0,observation:0,incompleteFindings:0,pending:0,overdue:0,undated:0};
    criteria.forEach(i=>{
      const r=getResponse(a,i.htmlKey);
      if(isAssessmentComplete(r)){ out.assessed++; if(i.auditType==='Uzaktan')out.remote++; else out.onsite++; }
      if(r.result==='Uygun') out.compliant++;
      if(r.result==='Uygun Değil'){
        out.noncompliant++;
        if(!isFindingComplete(r)) out.incompleteFindings++;
        if(r.findingLevel==='Seviye 1' && isFindingComplete(r)) out.level1++;
        if(r.findingLevel==='Seviye 2' && isFindingComplete(r)) out.level2++;
        if(r.findingLevel==='Gözlem' && isFindingComplete(r)) out.observation++;
      }
      if(r.result==='N/A') out.na++;
      if(r.result==='Sorulmadı') out.notAsked++;
      const timing=followUpTiming(r);
      if(isOpenFollowUpTiming(timing)) out.pending++;
      if(timing==='overdue') out.overdue++;
      if(timing==='undated') out.undated++;
    });
    out.percent=Math.round((out.assessed/criteria.length)*100);
    return out;
  }

  function exportAuditRows(a){
    return criteria.map((i,idx)=>{
      const r=getResponse(a,i.htmlKey);
      return {
        'No':idx+1,
        'Soru Kodu':i.shortCode,
        'AAD':i.aadCode,
        'Denetim Türü':i.auditType,
        'Mevzuat / Referans':i.reference||'',
        'Soru':i.question||'',
        'Atomik Kriter':i.atomicCriterion||'',
        'Denetçi Açıklaması / Kabul Edilebilir Kanıtlar':i.auditorGuidance||'',
        'İşletme Kanıt Referansları':r.evidenceRefs||'',
        'Denetçi Notu':r.auditorNote||'',
        'Değerlendirme Sonucu':r.result||'Değerlendirilmedi',
        'Bulgu Seviyesi':r.findingLevel||'',
        'Ön Tanımlı Bulgu':r.predefinedFinding||'',
        'Bulgu Açıklaması':r.findingDescription||'',
        'Takip / Beklenen Husus':r.followUpText||'',
        'Hatırlatma Tarihi':r.reminderDate?formatDate(r.reminderDate):'',
        'Takip Durumu':hasFollowUp(r)?followUpLabel(r):'',
        'Takip Açılış Tarihi':r.followUpCreatedAt?new Date(r.followUpCreatedAt).toLocaleString('tr-TR'):'',
        'Takip Tamamlanma Tarihi':r.completedAt?new Date(r.completedAt).toLocaleString('tr-TR'):'',
        'Son Güncelleme':r.updatedAt?new Date(r.updatedAt).toLocaleString('tr-TR'):''
      };
    });
  }

  function exportFindingRows(a){
    return criteria.map(i=>({i,r:getResponse(a,i.htmlKey)})).filter(x=>isNoncompliant(x.r)).map(({i,r})=>({
      'Soru Kodu':i.shortCode,'AAD':i.aadCode,'Denetim Türü':i.auditType,'Bulgu Seviyesi':r.findingLevel||'',
      'Ön Tanımlı Bulgu':r.predefinedFinding||'','Bulgu Açıklaması':r.findingDescription||'',
      'Mevzuat / Referans':i.reference||'','İşletme Kanıt Referansları':r.evidenceRefs||'','Denetçi Notu':r.auditorNote||'',
      'Kayıt Durumu':isFindingComplete(r)?'Tam':'Zorunlu bilgi eksik'
    }));
  }

  function exportFollowUpRows(a,openOnly=false){
    return criteria.map(i=>({i,r:getResponse(a,i.htmlKey)})).filter(({r})=>hasFollowUp(r) && (!openOnly || isOpenFollowUpTiming(followUpTiming(r)))).map(({i,r})=>({
      'Soru Kodu':i.shortCode,'AAD':i.aadCode,'Denetim Türü':i.auditType,'Beklenen Husus':r.followUpText||'',
      'Hatırlatma Tarihi':r.reminderDate?formatDate(r.reminderDate):'','Durum':followUpLabel(r),
      'Açılış':r.followUpCreatedAt?new Date(r.followUpCreatedAt).toLocaleString('tr-TR'):'',
      'Tamamlanma':r.completedAt?new Date(r.completedAt).toLocaleString('tr-TR'):'','Denetçi Notu':r.auditorNote||''
    }));
  }

  function setSheetWidths(ws,widths){ ws['!cols']=widths.map(w=>({wch:w})); }

  function exportExcel(){
    const a=currentAudit(); if(!a)return;
    if(typeof XLSX==='undefined'){ toast('Excel dışa aktarma kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edin.'); return; }
    try{
      const st=exportStats(a);
      const wb=XLSX.utils.book_new();
      const summary=[
        ['FR.13 Emniyet Olayları Denetimi'],
        ['İşletme / Kuruluş',a.organizationName||''],['Denetim No',a.auditNo||''],['Durum',a.status||''],
        ['Başlangıç Tarihi',a.startDate?formatDate(a.startDate):''],['Bitiş Tarihi',a.endDate?formatDate(a.endDate):''],
        ['Baş Denetçi',a.leadAuditor||''],['Denetim Ekibi',a.auditors||''],['Genel Denetim Notu',a.generalNote||''],
        ['Form',`${T.templateId} / ${T.formatVersion}`],['Dışa Aktarım Zamanı',new Date().toLocaleString('tr-TR')],[],
        ['DEĞERLENDİRME ÖZETİ','ADET / DURUM'],
        ['Değerlendirilen AAD',`${st.assessed}/${criteria.length} (%${st.percent})`],['Uygun',st.compliant],['Uygun Değil',st.noncompliant],['N/A',st.na],['Sorulmadı',st.notAsked],
        ['Uzaktan tamamlanan',`${st.remote}/23`],['Yerinde tamamlanan',`${st.onsite}/35`],[],
        ['TESPİT ÖZETİ','ADET'],['Seviye 1',st.level1],['Seviye 2',st.level2],['Gözlem',st.observation],['Eksik bulgu bilgisi',st.incompleteFindings],[],
        ['TAKİP ÖZETİ','ADET'],['Açık / Bekleyen',st.pending],['Gecikmiş',st.overdue],['Tarihsiz',st.undated]
      ];
      const wsSummary=XLSX.utils.aoa_to_sheet(summary); setSheetWidths(wsSummary,[32,100]); wsSummary['!merges']=[XLSX.utils.decode_range('A1:B1')];
      XLSX.utils.book_append_sheet(wb,wsSummary,'Denetim Özeti');

      const allRows=exportAuditRows(a); const wsAad=XLSX.utils.json_to_sheet(allRows); setSheetWidths(wsAad,[6,13,9,13,34,42,58,58,34,46,20,16,52,60,52,18,20,22,22,22]); if(wsAad['!ref'])wsAad['!autofilter']={ref:wsAad['!ref']};
      XLSX.utils.book_append_sheet(wb,wsAad,'AAD Değerlendirmeleri');

      const findings=exportFindingRows(a); const wsFindings=XLSX.utils.json_to_sheet(findings.length?findings:[{'Bilgi':'Uygun Değil / bulgu kaydı bulunmuyor.'}]); setSheetWidths(wsFindings,[13,9,13,16,55,65,36,36,46,20]); if(findings.length&&wsFindings['!ref'])wsFindings['!autofilter']={ref:wsFindings['!ref']};
      XLSX.utils.book_append_sheet(wb,wsFindings,'Tespitler');

      const followups=exportFollowUpRows(a,false); const wsFollow=XLSX.utils.json_to_sheet(followups.length?followups:[{'Bilgi':'Takip / beklenen husus kaydı bulunmuyor.'}]); setSheetWidths(wsFollow,[13,9,13,60,18,20,22,22,46]); if(followups.length&&wsFollow['!ref'])wsFollow['!autofilter']={ref:wsFollow['!ref']};
      XLSX.utils.book_append_sheet(wb,wsFollow,'Takipler');

      XLSX.writeFile(wb,exportFileBase(a)+'.xlsx',{compression:true});
      toast('Excel dosyası hazırlandı.');
    }catch(err){ console.error('Excel dışa aktarma hatası',err); toast('Excel oluşturulamadı.'); }
  }

  function pdfSafe(value,empty='—'){ const x=String(value??'').trim(); return x||empty; }
  function pdfMetaTable(a){
    return {table:{widths:[92,'*',92,'*'],body:[
      [{text:'İşletme / Kuruluş',style:'metaLabel'},{text:pdfSafe(a.organizationName),colSpan:3,style:'metaValue'},{},{}],
      [{text:'Denetim No',style:'metaLabel'},{text:pdfSafe(a.auditNo),style:'metaValue'},{text:'Durum',style:'metaLabel'},{text:pdfSafe(a.status),style:'metaValue'}],
      [{text:'Başlangıç',style:'metaLabel'},{text:a.startDate?formatDate(a.startDate):'—',style:'metaValue'},{text:'Bitiş',style:'metaLabel'},{text:a.endDate?formatDate(a.endDate):'—',style:'metaValue'}],
      [{text:'Baş Denetçi',style:'metaLabel'},{text:pdfSafe(a.leadAuditor),style:'metaValue'},{text:'Denetim Ekibi',style:'metaLabel'},{text:pdfSafe(a.auditors),style:'metaValue'}],
      [{text:'Genel Not',style:'metaLabel'},{text:pdfSafe(a.generalNote),colSpan:3,style:'metaValue'},{},{}]
    ]},layout:'lightHorizontalLines',margin:[0,0,0,14]};
  }

  function exportPDF(){
    const a=currentAudit(); if(!a)return;
    if(typeof pdfMake==='undefined'){ toast('PDF dışa aktarma kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edin.'); return; }
    try{
      const st=exportStats(a);
      const findings=criteria.map(i=>({i,r:getResponse(a,i.htmlKey)})).filter(x=>isNoncompliant(x.r));
      const openFollowups=criteria.map(i=>({i,r:getResponse(a,i.htmlKey)})).filter(x=>isOpenFollowUpTiming(followUpTiming(x.r)));
      const content=[
        {text:'FR.13 EMNİYET OLAYLARI DENETİMİ',style:'title'},
        {text:'Denetim değerlendirme ve kayıt çıktısı',style:'subtitle'},
        pdfMetaTable(a),
        {text:'Denetim Özeti',style:'sectionTitle'},
        {table:{widths:['*','*','*','*'],body:[
          [{text:'İlerleme',style:'summaryLabel'},{text:'Uygun',style:'summaryLabel'},{text:'Uygun Değil',style:'summaryLabel'},{text:'Takip / Bekleyen',style:'summaryLabel'}],
          [{text:`${st.assessed}/${criteria.length}  (%${st.percent})`,style:'summaryValue'},{text:String(st.compliant),style:'summaryValueGood'},{text:String(st.noncompliant),style:'summaryValueBad'},{text:String(st.pending),style:'summaryValueWarn'}],
          [{text:`Uzaktan ${st.remote}/23 • Yerinde ${st.onsite}/35`,colSpan:2,style:'summarySub'},{},{text:`N/A ${st.na} • Sorulmadı ${st.notAsked}`,style:'summarySub'},{text:`Gecikmiş ${st.overdue} • Tarihsiz ${st.undated}`,style:'summarySub'}]
        ]},layout:'lightHorizontalLines',margin:[0,0,0,12]},
        {text:'Tespit Özeti',style:'sectionTitle'},
        {table:{widths:['*','*','*'],body:[
          [{text:'Seviye 1',style:'summaryLabel'},{text:'Seviye 2',style:'summaryLabel'},{text:'Gözlem',style:'summaryLabel'}],
          [{text:String(st.level1),style:'summaryValueBad'},{text:String(st.level2),style:'summaryValueWarn'},{text:String(st.observation),style:'summaryValue'}]
        ]},layout:'lightHorizontalLines',margin:[0,0,0,12]}
      ];

      if(findings.length){
        content.push({text:`Uygun Değil / Bulgular (${findings.length})`,style:'sectionTitle'});
        content.push({table:{headerRows:1,widths:[52,58,80,'*','*'],body:[
          [{text:'Soru',style:'tableHead'},{text:'AAD',style:'tableHead'},{text:'Seviye',style:'tableHead'},{text:'Ön Tanımlı Bulgu',style:'tableHead'},{text:'Bulgu Açıklaması',style:'tableHead'}],
          ...findings.map(({i,r})=>[i.shortCode,i.aadCode,r.findingLevel||'Eksik',r.predefinedFinding||'Eksik',r.findingDescription||'Eksik'])
        ]},layout:'lightHorizontalLines',fontSize:7.5,margin:[0,0,0,14]});
      }

      if(openFollowups.length){
        content.push({text:`Bekleyen İşler (${openFollowups.length})`,style:'sectionTitle'});
        content.push({table:{headerRows:1,widths:[52,52,'*',70,78],body:[
          [{text:'Soru',style:'tableHead'},{text:'AAD',style:'tableHead'},{text:'Beklenen Husus',style:'tableHead'},{text:'Hatırlatma',style:'tableHead'},{text:'Durum',style:'tableHead'}],
          ...openFollowups.map(({i,r})=>[i.shortCode,i.aadCode,r.followUpText||'',r.reminderDate?formatDate(r.reminderDate):'Tarih yok',followUpLabel(r)])
        ]},layout:'lightHorizontalLines',fontSize:7.5,margin:[0,0,0,14]});
      }

      content.push({text:'AAD Değerlendirmeleri',style:'sectionTitle',pageBreak:'before'});
      let lastQuestion='';
      criteria.forEach(i=>{
        const r=getResponse(a,i.htmlKey);
        if(i.questionCode!==lastQuestion){
          lastQuestion=i.questionCode;
          content.push({text:`${i.shortCode} — ${i.question}`,style:'questionTitle',margin:[0,10,0,5]});
          if(i.reference) content.push({text:i.reference,style:'reference',margin:[0,0,0,5]});
        }
        const body=[
          [{text:`${i.aadCode} • ${i.auditType}`,style:'aadTitle'},{text:pdfSafe(r.result,'Değerlendirilmedi'),style:r.result==='Uygun'?'resultGood':r.result==='Uygun Değil'?'resultBad':'resultNeutral'}],
          [{text:'Atomik Kriter',style:'fieldLabel'},{text:pdfSafe(i.atomicCriterion),style:'fieldValue'}],
          [{text:'Denetçi Açıklaması / Kabul Edilebilir Kanıtlar',style:'fieldLabel'},{text:pdfSafe(i.auditorGuidance),style:'fieldValue'}],
          [{text:'İşletme Kanıt Referansları',style:'fieldLabel'},{text:pdfSafe(r.evidenceRefs),style:'fieldValue'}],
          [{text:'Denetçi Notu',style:'fieldLabel'},{text:pdfSafe(r.auditorNote),style:'fieldValue'}]
        ];
        if(isNoncompliant(r)){
          body.push([{text:'Bulgu Seviyesi',style:'fieldLabel'},{text:pdfSafe(r.findingLevel,'Eksik'),style:'fieldValue'}]);
          body.push([{text:'Ön Tanımlı Bulgu',style:'fieldLabel'},{text:pdfSafe(r.predefinedFinding,'Eksik'),style:'fieldValue'}]);
          body.push([{text:'Bulgu Açıklaması',style:'fieldLabel'},{text:pdfSafe(r.findingDescription,'Eksik'),style:'fieldValue'}]);
        }
        if(hasFollowUp(r)){
          body.push([{text:'Takip / Beklenen Husus',style:'fieldLabel'},{text:pdfSafe(r.followUpText),style:'fieldValue'}]);
          body.push([{text:'Takip Durumu',style:'fieldLabel'},{text:`${followUpLabel(r)}${r.reminderDate?' • '+formatDate(r.reminderDate):''}`,style:'fieldValue'}]);
        }
        content.push({table:{widths:[145,'*'],body},layout:{hLineColor:()=> '#d9e1e8',vLineColor:()=> '#d9e1e8',paddingLeft:()=>6,paddingRight:()=>6,paddingTop:()=>5,paddingBottom:()=>5},margin:[0,0,0,8],fontSize:7.8});
      });

      const doc={
        pageSize:'A4',pageMargins:[34,54,34,38],
        header:(currentPage)=>({text:`FR.13 • ${pdfSafe(a.auditNo,'Denetim')} • ${pdfSafe(a.organizationName)}`,fontSize:7,color:'#64748b',margin:[34,20,34,0],alignment:'right'}),
        footer:(currentPage,pageCount)=>({columns:[{text:`Oluşturma: ${new Date().toLocaleString('tr-TR')}`,alignment:'left'},{text:`Sayfa ${currentPage} / ${pageCount}`,alignment:'right'}],fontSize:7,color:'#64748b',margin:[34,0,34,14]}),
        content,
        defaultStyle:{font:'Roboto',fontSize:8.5,color:'#17212b',lineHeight:1.18},
        styles:{
          title:{fontSize:17,bold:true,color:'#123b61',margin:[0,0,0,2]}, subtitle:{fontSize:9,color:'#64748b',margin:[0,0,0,14]},
          sectionTitle:{fontSize:12,bold:true,color:'#123b61',margin:[0,7,0,6]}, metaLabel:{bold:true,color:'#536577',fillColor:'#f5f8fa',fontSize:7.5},metaValue:{fontSize:8},
          summaryLabel:{bold:true,color:'#536577',fillColor:'#f5f8fa',alignment:'center',fontSize:7.5},summaryValue:{bold:true,fontSize:14,alignment:'center',color:'#123b61'},summaryValueGood:{bold:true,fontSize:14,alignment:'center',color:'#176b3a'},summaryValueBad:{bold:true,fontSize:14,alignment:'center',color:'#a61b1b'},summaryValueWarn:{bold:true,fontSize:14,alignment:'center',color:'#9a650c'},summarySub:{fontSize:7.5,alignment:'center',color:'#64748b'},
          tableHead:{bold:true,color:'#fff',fillColor:'#123b61',fontSize:7.2},questionTitle:{fontSize:10,bold:true,color:'#123b61'},reference:{fontSize:7,color:'#64748b',italics:true},
          aadTitle:{bold:true,color:'#123b61',fillColor:'#eef5fb'},resultGood:{bold:true,color:'#176b3a',alignment:'right',fillColor:'#edf9f2'},resultBad:{bold:true,color:'#a61b1b',alignment:'right',fillColor:'#fff0f0'},resultNeutral:{bold:true,color:'#536577',alignment:'right',fillColor:'#f5f8fa'},fieldLabel:{bold:true,color:'#536577',fillColor:'#f7f9fb',fontSize:7.2},fieldValue:{fontSize:7.8}
        }
      };
      pdfMake.createPdf(doc).download(exportFileBase(a)+'.pdf');
      toast('PDF raporu hazırlanıyor.');
    }catch(err){ console.error('PDF dışa aktarma hatası',err); toast('PDF oluşturulamadı.'); }
  }

  function exportAudit(){
    const a=currentAudit(); if(!a)return;
    const payload={...a,template:{id:T.templateId,version:T.formatVersion},criteriaSnapshot:criteria};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}); const url=URL.createObjectURL(blob); const x=document.createElement('a');
    x.href=url; x.download=exportFileBase(a)+'.json'; x.click(); setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  els.newAuditBtn.onclick=()=>openAuditDialog(); els.editAuditBtn.onclick=()=>openAuditDialog(currentAudit()); els.auditForm.addEventListener('submit',saveAuditFromDialog); if(els.deleteAuditBtn) els.deleteAuditBtn.onclick=deleteCurrentAudit;
  document.querySelectorAll('.cancel-dialog').forEach(b=>b.onclick=()=>els.auditDialog.close());
  els.auditSearch.addEventListener('input',renderAuditList);
  [els.criterionSearch,els.typeFilter,els.resultFilter,els.followUpFilter].forEach(x=>x.addEventListener('input',renderQuestions));
  els.expandAllBtn.onclick=()=>{const codes=[...new Set(criteria.map(x=>x.questionCode))]; const allOpen=codes.every(c=>state.expanded.has(c)); state.expanded=new Set(allOpen?[]:codes); renderQuestions();};
  if(els.showNoncompliantBtn) els.showNoncompliantBtn.onclick=()=>{els.criterionSearch.value='';els.typeFilter.value='all';els.resultFilter.value='Uygun Değil';els.followUpFilter.value='all';renderQuestions();els.questions.scrollIntoView({behavior:'smooth',block:'start'});};
  els.showAllPendingBtn.onclick=()=>{els.criterionSearch.value='';els.typeFilter.value='all';els.resultFilter.value='all';els.followUpFilter.value='pending';renderQuestions();els.questions.scrollIntoView({behavior:'smooth',block:'start'});};
  els.nextUnassessedBtn.onclick=goToNextUnassessed;
  if(els.excelExportBtn) els.excelExportBtn.onclick=exportExcel; if(els.pdfExportBtn) els.pdfExportBtn.onclick=exportPDF; els.exportBtn.onclick=exportAudit; els.printBtn.onclick=()=>window.print();
  els.loginBtn.onclick=loginWithEmailPassword;
  els.loginPass.addEventListener('keydown',e=>{if(e.key==='Enter') loginWithEmailPassword();});
  els.offlineBtn.onclick=enterOfflineMode;
  els.signOutBtn.onclick=async()=>{
    if(state.offlineMode){ state.offlineMode=false; state.audits=[]; state.activeAuditId=null; showLogin(); return; }
    if(state.firebase) await state.firebase.auth.signOut();
  };
  initFirebase();

  // Tarayıcı/sekmeyi kapatma anında son bellek durumunu senkron olarak yerel yedeğe yaz.
  window.addEventListener('beforeunload',()=>{ try{ saveLocal(); }catch{} });
})();
