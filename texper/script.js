/* XePersian \lr{} Auto-Wrapper — Pro Workbench + Rules */
(() => {
  // ---------- DOM ----------
  const $ = (q) => document.querySelector(q);
  const $in = $('#input'), $out = $('#output'), $log = $('#log');
  const $runClient = $('#runClient'), $runEdge = $('#runEdge'), $applyEdits = $('#applyEdits');
  const $copyInput = $('#copyInput'), $copyOutput = $('#copyOutput');
  const $units = $('#units'), $debug = $('#debug'), $dry = $('#dryrun'), $chem = $('#chem'), $live = $('#live');

  const $skipList = $('#skipList'), $segmentsPanel = $('#segmentsPanel'), $segSelect = $('#segSelect'), $tokensView = $('#tokensView'), $copyTokens = $('#copyTokens');

  // Rules modal
  const $openRules = $('#openRules'), $rulesModal = $('#rulesModal'), $closeRules = $('#closeRules');
  const $rulesTable = $('#rulesTable tbody');
  const $exportRules = $('#exportRules'), $importRules = $('#importRules');

  const $rName = $('#rName'), $rEnabled = $('#rEnabled'), $rPattern = $('#rPattern'), $rReplace = $('#rReplace'),
        $rRegex = $('#rRegex'), $rFlags = $('#rFlags'), $rPhase = $('#rPhase'), $rScope = $('#rScope');
  const $addRule = $('#addRule'), $updateRule = $('#updateRule'), $clearForm = $('#clearForm');

  // ---------- Logger ----------
  const logger = {
    buf: [],
    clear(){ this.buf = []; $log.textContent = ''; },
    log(...a){ const line = a.map(x => String(x)).join(' '); this.buf.push(line); if ($debug.checked) $log.textContent = this.buf.join('\n'); },
    flush(){ $log.textContent = this.buf.join('\n'); }
  };

  // ---------- Rules Store (localStorage) ----------
  const LS_KEY = 'lr_rules_v1';
  let rules = loadRules();

  function loadRules(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }
  function saveRules(){ localStorage.setItem(LS_KEY, JSON.stringify(rules)); }
  function newRuleId(){ return 'r_' + Math.random().toString(36).slice(2, 9); }

  function renderRules(){
    $rulesTable.innerHTML = '';
    rules.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td><input type="checkbox" ${r.enabled ? 'checked' : ''} data-act="toggle"></td>
        <td class="mono">${esc(r.name || '')}</td>
        <td><code>${esc(r.pattern || '')}</code></td>
        <td><code>${esc(r.replace || '')}</code></td>
        <td>${r.regex ? 'regex' : 'literal'} <span class="pill">${esc(r.flags||'')}</span></td>
        <td><span class="pill">${r.phase}</span></td>
        <td><span class="pill">${r.scope}</span></td>
        <td class="rowbtns">
          <button data-act="up" class="btn small">↑</button>
          <button data-act="down" class="btn small">↓</button>
        </td>
        <td class="rowbtns">
          <button data-act="edit" class="btn small">Edit</button>
          <button data-act="del" class="btn small">Delete</button>
        </td>
      `;
      $rulesTable.appendChild(tr);
    });
  }

  function openRules(){ renderRules(); $rulesModal.style.display = 'flex'; $rulesModal.setAttribute('aria-hidden','false'); }
  function closeRules(){ $rulesModal.style.display = 'none'; $rulesModal.setAttribute('aria-hidden','true'); }
  function esc(s){ return String(s).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

  // Table actions
  $rulesTable.addEventListener('click', (e) => {
    const btn = e.target.closest('button,[data-act="toggle"]');
    if (!btn) return;
    const tr = e.target.closest('tr');
    const id = tr?.dataset.id;
    const rule = rules.find(x => x.id === id);
    if (!rule) return;

    const act = btn.dataset.act;
    if (act === 'toggle'){
      rule.enabled = tr.querySelector('input[type="checkbox"]').checked;
      saveRules(); if ($live.checked) runClient();
    } else if (act === 'up'){
      const i = rules.indexOf(rule);
      if (i > 0){ [rules[i-1], rules[i]] = [rules[i], rules[i-1]]; saveRules(); renderRules(); }
    } else if (act === 'down'){
      const i = rules.indexOf(rule);
      if (i < rules.length-1){ [rules[i+1], rules[i]] = [rules[i], rules[i+1]]; saveRules(); renderRules(); }
    } else if (act === 'edit'){
      // load form
      $rName.value = rule.name || '';
      $rEnabled.value = String(!!rule.enabled);
      $rPattern.value = rule.pattern || '';
      $rReplace.value = rule.replace || '';
      $rRegex.value = String(!!rule.regex);
      $rFlags.value = rule.flags || '';
      $rPhase.value = rule.phase || 'pre';
      $rScope.value = rule.scope || 'all';
      $updateRule.dataset.id = id;
    } else if (act === 'del'){
      rules = rules.filter(x => x.id !== id);
      saveRules(); renderRules();
    }
  });

  $addRule.addEventListener('click', () => {
    const r = readRuleForm();
    r.id = newRuleId();
    rules.push(r); saveRules(); renderRules();
  });
  $updateRule.addEventListener('click', () => {
    const id = $updateRule.dataset.id;
    if (!id) return;
    const idx = rules.findIndex(x => x.id === id);
    if (idx < 0) return;
    rules[idx] = { ...rules[idx], ...readRuleForm(), id };
    saveRules(); renderRules();
  });
  $clearForm.addEventListener('click', () => { clearRuleForm(); });

  function readRuleForm(){
    return {
      name: $rName.value.trim(),
      enabled: $rEnabled.value === 'true',
      pattern: $rPattern.value,
      replace: $rReplace.value,
      regex: $rRegex.value === 'true',
      flags: $rFlags.value.trim(),
      phase: $rPhase.value,
      scope: $rScope.value
    };
  }
  function clearRuleForm(){
    $rName.value=''; $rEnabled.value='true'; $rPattern.value=''; $rReplace.value='';
    $rRegex.value='false'; $rFlags.value=''; $rPhase.value='pre'; $rScope.value='all'; delete $updateRule.dataset.id;
  }

  $exportRules.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rules.json'; a.click();
    URL.revokeObjectURL(a.href);
  });
  $importRules.addEventListener('click', async () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      const text = await file.text();
      try{
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) { rules = arr; saveRules(); renderRules(); }
        else alert('Invalid JSON');
      }catch{ alert('Invalid JSON'); }
    };
    inp.click();
  });

  $('#openRules').addEventListener('click', openRules);
  $('#closeRules').addEventListener('click', closeRules);
  $rulesModal.addEventListener('click', (e) => { if (e.target === $rulesModal) closeRules(); });

  // ---------- App Actions ----------
  $('#copyInput').addEventListener('click', () => copyText($in.value));
  $('#copyOutput').addEventListener('click', () => copyText($out.textContent));
  $('#copyTokens').addEventListener('click', () => {
    if (!state.last) return;
    const i = +$segSelect.value;
    copyText(JSON.stringify(state.last.intermediate.segments[i]?.tokens || [], null, 2));
  });

  $('#runClient').addEventListener('click', runClient);
  $('#runEdge').addEventListener('click', runEdge);
  $('#applyEdits').addEventListener('click', applyEditsBackToInput);

  $segSelect.addEventListener('change', () => showTokens(+$segSelect.value));
  $live.addEventListener('change', () => { if ($live.checked) runClient(); });
  $in.addEventListener('input', debounce(() => { if ($live.checked) runClient(); }, 300));
  $units.addEventListener('input', debounce(() => { if ($live.checked) runClient(); }, 300));
  [$debug,$dry,$chem].forEach(c => c.addEventListener('change', () => { if ($live.checked) runClient(); }));

  function copyText(t){ navigator.clipboard.writeText(t).catch(()=>{}); }
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

  function buildConfig(){
    const unitList = $units.value.split(',').map(s => s.trim()).filter(Boolean);
    return {
      units: unitList,
      debug: !!$debug.checked,
      dryRun: !!$dry.checked,
      normalizeChem: !!$chem.checked,
      rules // pass cached rules
    };
  }

  // ---------- State ----------
  const state = { last: null };

  // ---------- Client Run ----------
  function runClient(){
    logger.clear();
    const cfg = buildConfig();
    const start = performance.now();
    const res = pipeline($in.value, cfg, logger);
    const ms = Math.round(performance.now() - start);
    logger.log(`Client parse OK in ${ms} ms | len=${$in.value.length}`);
    renderAll(res);
    logger.flush();
  }

  // ---------- Edge Run ----------
  async function runEdge(){
    logger.clear();
    const cfg = buildConfig();
    try{
      const res = await fetch('/api/parse', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ text: $in.value, config: cfg, debug: cfg.debug })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edge error');
      renderAll(data);
      if (Array.isArray(data.debug)) data.debug.forEach(line => logger.log(line));
      logger.flush();
    }catch(e){
      logger.log('EDGE ERROR:', e.message || e);
      logger.flush();
    }
  }

  // ---------- Render ----------
  function renderAll(result){
    state.last = result;
    $out.textContent = result.output || '';
    renderSkips(result.intermediate);
    renderSegments(result.intermediate);
    buildSegSelect(result.intermediate.segments);
    showTokens(0);
  }

  function renderSkips(intm){
    const types = [
      ['comments', intm.skips.comments],
      ['math', intm.skips.math],
      ['verbatimLike', intm.skips.verbatimLike],
      ['protectedArgs', intm.skips.protectedArgs],
      ['existingLR', intm.skips.existingLR],
      ['merged', intm.mergedSkips]
    ];
    const frag = document.createDocumentFragment();
    types.forEach(([label, arr]) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="flex">
          <strong>${label}</strong>
          <span class="pill">${arr.length} ranges</span>
          <button class="btn small copybtn">Copy</button>
        </div>
        <pre class="mono small">${short(JSON.stringify(arr))}</pre>
      `;
      div.querySelector('.copybtn').addEventListener('click', () => copyText(JSON.stringify(arr)));
      frag.appendChild(div);
    });
    $skipList.innerHTML = ''; $skipList.appendChild(frag);
  }

  function renderSegments(intm){
    const { segments } = intm;
    $segmentsPanel.innerHTML = '';
    segments.forEach((seg, i) => {
      const det = document.createElement('details'); det.open = i < 3;
      const sum = document.createElement('summary');
      sum.innerHTML = `<strong>#${i}</strong>
        <span class="pill">${seg.type}</span>
        <span class="pill">[${seg.start}, ${seg.end})</span>
        ${seg.type === 'rewritable' ? '<span class="pill ok">editable</span>' : '<span class="pill">skipped</span>'}`;
      det.appendChild(sum);

      const box = document.createElement('div'); box.className = 'item';
      box.innerHTML = `
        <div class="grid2">
          <div>
            <div class="row"><strong>Original</strong><button class="btn small copy-orig">Copy</button></div>
            <textarea class="mono t-orig" spellcheck="false" style="height:120px">${seg.text}</textarea>
          </div>
          <div>
            <div class="row"><strong>Rewritten</strong>
              <div class="flex"><button class="btn small copy-rew">Copy</button>
              ${seg.type==='rewritable' ? '<button class="btn small apply-rew">Apply</button>' : ''}</div>
            </div>
            <textarea class="mono t-rew" spellcheck="false" style="height:120px">${seg.rewritten||''}</textarea>
          </div>
        </div>`;
      det.appendChild(box);

      box.querySelector('.copy-orig').addEventListener('click', () => copyText(seg.text));
      box.querySelector('.copy-rew').addEventListener('click', () => copyText(seg.rewritten || ''));
      if (seg.type==='rewritable'){
        box.querySelector('.apply-rew').addEventListener('click', () => {
          seg.rewritten = box.querySelector('.t-rew').value;
          $out.textContent = stitchFromSegments(intm);
        });
      }
      sum.addEventListener('click', () => { $segSelect.value = String(i); showTokens(i); });
      $segmentsPanel.appendChild(det);
    });
  }

  function stitchFromSegments(intm){
    return intm.segments.map(s => s.type==='skipped' ? s.text : (s.rewritten ?? s.text)).join('');
  }

  function buildSegSelect(segs){
    $segSelect.innerHTML = '';
    segs.forEach((s,i)=> {
      const opt = document.createElement('option'); opt.value=String(i);
      opt.textContent = `#${i} — ${s.type} — [${s.start},${s.end})`; $segSelect.appendChild(opt);
    });
    if (segs.length) $segSelect.value='0';
  }
  function showTokens(idx){
    const seg = state.last?.intermediate?.segments?.[idx];
    if (!seg) { $tokensView.textContent = ''; return; }
    $tokensView.textContent = JSON.stringify({ index: idx, ...seg, text: undefined, rewritten: undefined }, null, 2);
  }
  function short(s){ return s.length>1000 ? s.slice(0,1000)+' …' : s; }

  // ---------- Pipeline with Rules ----------
  function pipeline(text, config, logger){
    const t0 = performance.now();
    // Pre rules: phase=pre, scope=all → whole text first
    text = applyRulesList(text, rules, 'pre', 'all', logger, 'PRE-ALL');

    // 1) find skips
    const comments = findCommentRanges(text);
    const math = findMathRanges(text);
    const verbatimLike = findEnvRanges(text, ['verbatim','lstlisting','minted','alltt']);
    const protectedArgs = findProtectedCommandArgRanges(text);
    const existingLR = findExistingLRRanges(text);
    const commandRanges = findCommandRanges(text);
    const mergedSkips = mergeRanges([...comments, ...math, ...verbatimLike, ...protectedArgs, ...existingLR, ...commandRanges ]);

    // 2) split + rewrite segments (with pre rules rewritableOnly)
    const segments = [];
    let idx = 0;
    for (const [a,b] of mergedSkips){
      if (idx < a){
        const segText0 = text.slice(idx, a);
        const segText = applyRulesList(segText0, rules, 'pre', 'rewritableOnly', logger, 'PRE-REW');
        segments.push(buildRewritableSegment(segText, idx, config));
      }
      segments.push({ type:'skipped', start:a, end:b, text:text.slice(a,b), tokens:[] });
      idx = b;
    }
    if (idx < text.length){
      const segText0 = text.slice(idx);
      const segText = applyRulesList(segText0, rules, 'pre', 'rewritableOnly', logger, 'PRE-REW');
      segments.push(buildRewritableSegment(segText, idx, config));
    }

    // 3) assemble
    let output = segments.map(s => s.type==='skipped' ? s.text : s.rewritten).join('');

    // Post rules: rewritableOnly (operate on rewritten-only via segment-local), then all
    // (We do a simple global pass now for post/rewritableOnly too, which is acceptable for global replacements)
    output = applyRulesList(output, rules, 'post', 'all', logger, 'POST-ALL');

    const ms = Math.round(performance.now()-t0);
    logger.log(`segments=${segments.length} skips=${mergedSkips.length} parse=${ms}ms`);
    return {
      source: text,
      output,
      config,
      intermediate: {
        skips: { comments, math, verbatimLike, protectedArgs, existingLR },
        mergedSkips,
        segments
      }
    };
  }

  function applyRulesList(text, list, phase, scope, logger, tag){
    const active = (list||[]).filter(r => r.enabled && r.phase===phase && r.scope===scope);
    if (!active.length) return text;
    let out = text;
    let count = 0;
    for (const r of active){
      const before = out;
      try{
        out = applyRule(out, r);
        if (out !== before) count++;
      }catch(e){
        logger.log(`[RULE ERROR] ${r.name||r.id}:`, e.message);
      }
    }
    logger.log(`[RULES ${tag}] applied=${count}/${active.length}`);
    return out;
  }

  function applyRule(s, r){
    if (r.regex){
      // Build global regex if no 'g' provided; we need global replace
      const flags = r.flags?.includes('g') ? r.flags : (r.flags||'') + 'g';
      const re = new RegExp(r.pattern, flags);
      return s.replace(re, r.replace);
    } else {
      // Literal global replace; escape pattern to regex
      const pat = r.pattern.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
      return s.replace(new RegExp(pat,'g'), r.replace);
    }
  }

  // ---------- Segment builder ----------
  function buildRewritableSegment(text, baseIndex, config){
    const units = buildUnitRegex(config.units);
    const tokens = tokenize(text);
    const out = [];
    let i = 0;
    while (i < tokens.length){
      const tk = tokens[i];
      if (!isCandidateStart(tk, units)){ out.push(tk.t); i++; continue; }
      let j = i, saw = isLatinWord(tokens[j]) || isUnit(tokens[j], units);
      while (j+1 < tokens.length && isPhraseToken(tokens[j+1], units)){
        j++; if (isLatinWord(tokens[j]) || isUnit(tokens[j], units)) saw = true;
      }
      while (j > i && isJoiner(tokens[j])) j--;
      if (!saw){ out.push(tokens[i].t); i++; continue; }
      const phrase = tokens.slice(i, j+1).map(x=>x.t).join('');
      const normalized = config.normalizeChem ? normalizeChem(phrase) : phrase;
      if (config.dryRun) out.push('«', normalized, '»'); else out.push('\\lr{', normalized, '}');
      i = j+1;
    }
    return { type:'rewritable', start:baseIndex, end:baseIndex+text.length, text, tokens, rewritten: out.join('') };
  }

  // ---------- Range finders (same as before) ----------
  function mergeRanges(r){ if(!r.length) return []; r.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const o=[r[0].slice()]; for(let i=1;i<r.length;i++){const L=o[o.length-1],C=r[i]; if(C[0]<=L[1]) L[1]=Math.max(L[1],C[1]); else o.push(C.slice());} return o; }
  function findCommentRanges(s){ const res=[]; for(let i=0;i<s.length;i++){ if (s[i]==='%' && !(i>0 && s[i-1]==='\\')){ const st=i; while(i<s.length && s[i]!=='\n') i++; res.push([st,i]); } } return res; }
  function scanPairs(s, openRe, closeRe, out, ignoreEsc=false){ let m; openRe.lastIndex=0; while((m=openRe.exec(s))){ const st=m.index; if(ignoreEsc && st>0 && s[st-1]==='\\') continue; closeRe.lastIndex=openRe.lastIndex; const c=closeRe.exec(s); if(!c) break; out.push([st, c.index+c[0].length]); openRe.lastIndex=c.index+c[0].length; } }
  function findMathRanges(s){ const res=[]; scanPairs(s,/\$\$/g,/\$\$/g,res); scanPairs(s,/\$/g,/\$/g,res,true); scanPairs(s,/\\\(/g,/\\\)/g,res); scanPairs(s,/\\\[/g,/\\\]/g,res); return res; }
  function findEnvRanges(s, envs){ const res=[]; for(const e of envs){ const re=new RegExp(String.raw`\\begin\{${escapeRx(e)}\}([\s\S]*?)\\end\{${escapeRx(e)}\}`,'g'); let m; while((m=re.exec(s))) res.push([m.index, m.index+m[0].length]); } return res; }
  function findProtectedCommandArgRanges(s){
    const one = ['url','path','label','ref','cite','includegraphics','input','include','bibliography','bibliographystyle'];
    const first = ['href']; const res=[];
    function matchBraces(str,pos){ if(str[pos]!=='{') return [pos,false]; let d=0; for(let i=pos;i<str.length;i++){ if(str[i]==='\\'){i++;continue;} if(str[i]==='{') d++; else if(str[i]==='}'){ d--; if(d===0) return [i,true]; } } return [pos,false]; }
    function scan(cmd, all=true){ const re=new RegExp(String.raw`\\${escapeRx(cmd)}\s*(\[[^\]]*\]\s*)*`,'g'); let m; while((m=re.exec(s))){ let p=re.lastIndex,a=0; for(let k=0;k<6;k++){ while(p<s.length && /\s/.test(s[p])) p++; if(s[p]!=='{') break; const [e,ok]=matchBraces(s,p); if(!ok) break; if(all || a===0) res.push([p,e+1]); a++; p=e+1; if(!all) break; } } }
    one.forEach(c=>scan(c,true)); first.forEach(c=>scan(c,false)); return res;
  }
  function findCommandRanges(s) {
  const res = [];
  const re = /\\[a-zA-Z@]+(\s*\[[^\]]*\])?(\s*\{[^}]*\})?/g;
  let m;
  while ((m = re.exec(s))) {
    res.push([m.index, m.index + m[0].length]);
  }
  return res;
}

  function findExistingLRRanges(s){
    const res=[]; const re=/\\lr\s*\{/g; let m;
    while((m=re.exec(s))){ const bracePos=m.index+m[0].length-1; const [end,ok]=matchBrace(s,bracePos); if(ok) res.push([m.index, end+1]); }
    return res;
    function matchBrace(str,pos){ if(str[pos]!=='{') return [pos,false]; let d=0; for(let i=pos;i<str.length;i++){ if(str[i]==='\\'){i++;continue;} if(str[i]==='{') d++; else if(str[i]==='}'){ d--; if(d===0) return [i,true]; } } return [pos,false]; }
  }
  function escapeRx(x){ return x.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }

  // ---------- Tokenizer ----------
  function tokenize(s){ const arr=[]; const re=/([\p{Script=Latin}][\p{Script=Latin}\d_\-\/+\.]*|[\p{Nd}]+(?:[.,:][\p{Nd}]+)*|[~\-–\/:+]|[ \t\r\n]+|.)/gu; let m; while((m=re.exec(s))) arr.push({t:m[0]}); return arr; }
//   function buildUnitRegex(units){ const esc=units.map(u=>u.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')); return new RegExp(`^(?:${esc.join('|')})$`,'iu'); }
function buildUnitRegex() {
  const units = [
    "°C","°F","rpm","V","A","mA","μL","uL","mL","L","mg","g","kg",
    "nm","μm","um","mm","cm","h","hr","min","s","kDa","Da",
    "OD","UV","DNA","RNA","PCR","BHI","TSB","TSA","PDA","YPD","YPG",
    "SDS-PAGE","Log","APS","TEMED","EtBr","Western","Blot"
  ];
  return new RegExp(`^(?:${units.join("|")})$`, "iu");
}
  
function isLatinWord(tok){ return /^[\p{Script=Latin}][\p{Script=Latin}\d_\-\/+\.]*$/u.test(tok.t); }
  function isDigit(tok){ return /^[\p{Nd}]+(?:[.,:][\p{Nd}]+)*$/u.test(tok.t); }
  function isJoiner(tok){ return /^[~\-–\/:+]$/.test(tok.t) || /^[ \t\r\n]+$/.test(tok.t); }
  function isUnit(tok,unitRe){ return unitRe.test(tok.t); }
  function isPhraseToken(tok,unitRe){ return isLatinWord(tok)||isDigit(tok)||isUnit(tok,unitRe)||isJoiner(tok); }
  function isCandidateStart(tok,unitRe){ 
    if (tok.t.startsWith('\\')) return false;
    return isLatinWord(tok)||isDigit(tok)||isUnit(tok,unitRe); }
  function normalizeChem(text){ return text.replace(/\b([A-Z][a-z]?)(\d+)\b/g,(_,e,n)=>`${e}$_${n}$`); }
})();




function applyEditsBackToInput(edits) {
  const input = document.getElementById('input');
  if (!input) return;
  // Just put the edited text back
  input.value = edits;
  console.log("[applyEditsBackToInput] updated input:", edits);
}
