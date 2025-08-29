export const config = { runtime: 'edge' };

/**
 * POST { text, config: { units[], dryRun, normalizeChem, rules[] }, debug }
 * rules: [{ id, name, enabled, pattern, replace, regex, flags, phase: 'pre'|'post', scope: 'all'|'rewritableOnly' }]
 */
export default async function handler(req) {
  try{
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const { text = '', config = {}, debug = false } = await req.json();

    const units = Array.isArray(config.units) && config.units.length ? config.units : DEFAULT_UNITS;
    const rules = Array.isArray(config.rules) ? config.rules : [];
    const cfg = { units, dryRun: !!config.dryRun, normalizeChem: !!config.normalizeChem, rules, debug: !!debug };
    const logger = makeLogger(debug);

    const result = pipeline(text, cfg, logger);
    return json({ ...result, debug: logger.out });
  }catch(e){
    return json({ error: e?.message || String(e) }, 500);
  }
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type':'application/json; charset=utf-8' }});
}

const DEFAULT_UNITS = [
  '°C','°F','rpm','V','A','mA','μL','uL','mL','L','mg','g','kg','nm','μm','um','mm','cm',
  'h','hr','min','s','kDa','Da','OD','UV','DNA','RNA','PCR','BHI','TSB','TSA','PDA','YPD','YPG',
  'SDS-PAGE','Log','APS','TEMED','EtBr','Western','Blot'
];

function makeLogger(enabled){ const out=[]; return { out, log(...a){ if(enabled) out.push(a.map(String).join(' ')); } }; }

// ---------------- Pipeline with Rules ----------------
function pipeline(text, config, logger){
  // Pre rules (all)
  text = applyRulesList(text, config.rules, 'pre', 'all', logger, 'PRE-ALL');

  const comments = findCommentRanges(text);
  const math = findMathRanges(text);
  const verbatimLike = findEnvRanges(text, ['verbatim','lstlisting','minted','alltt']);
  const protectedArgs = findProtectedCommandArgRanges(text);
  const existingLR = findExistingLRRanges(text);
  const mergedSkips = mergeRanges([...comments, ...math, ...verbatimLike, ...protectedArgs, ...existingLR]);

  const segments = [];
  let idx = 0;
  for (const [a,b] of mergedSkips){
    if (idx < a){
      const preSeg0 = text.slice(idx, a);
      const preSeg = applyRulesList(preSeg0, config.rules, 'pre', 'rewritableOnly', logger, 'PRE-REW');
      segments.push(buildRewritableSegment(preSeg, idx, config));
    }
    segments.push({ type:'skipped', start:a, end:b, text:text.slice(a,b), tokens:[] });
    idx = b;
  }
  if (idx < text.length){
    const preSeg0 = text.slice(idx);
    const preSeg = applyRulesList(preSeg0, config.rules, 'pre', 'rewritableOnly', logger, 'PRE-REW');
    segments.push(buildRewritableSegment(preSeg, idx, config));
  }

  let output = segments.map(s => s.type==='skipped' ? s.text : s.rewritten).join('');
  output = applyRulesList(output, config.rules, 'post', 'all', logger, 'POST-ALL');

  logger.log(`edge: segs=${segments.length} skips=${mergedSkips.length} outlen=${output.length}`);
  return {
    source: text,
    output,
    config,
    intermediate: { skips: { comments, math, verbatimLike, protectedArgs, existingLR }, mergedSkips, segments }
  };
}

function applyRulesList(text, list, phase, scope, logger, tag){
  const active = (list||[]).filter(r => r.enabled && r.phase===phase && r.scope===scope);
  if (!active.length) return text;
  let out = text; let count=0;
  for (const r of active){
    const before = out;
    try{ out = applyRule(out, r); if (out !== before) count++; }
    catch(e){ logger.log(`[RULE ERROR] ${r.name||r.id}: ${e.message}`); }
  }
  logger.log(`[RULES ${tag}] applied=${count}/${active.length}`);
  return out;
}
function applyRule(s, r){
  if (r.regex){
    const flags = r.flags?.includes('g') ? r.flags : (r.flags||'') + 'g';
    const re = new RegExp(r.pattern, flags);
    return s.replace(re, r.replace);
  } else {
    const pat = r.pattern.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
    return s.replace(new RegExp(pat,'g'), r.replace);
  }
}

// ---------------- Rewriter core ----------------
function buildRewritableSegment(text, baseIndex, config){
  const units = buildUnitRegex(config.units);
  const tokens = tokenize(text);
  const out = [];
  let i=0;
  while (i<tokens.length){
    const tk = tokens[i];
    if (!isCandidateStart(tk, units)){ out.push(tk.t); i++; continue; }
    let j=i, saw=isLatinWord(tokens[j])||isUnit(tokens[j],units);
    while (j+1<tokens.length && isPhraseToken(tokens[j+1], units)){ j++; if (isLatinWord(tokens[j])||isUnit(tokens[j],units)) saw=true; }
    while (j>i && isJoiner(tokens[j])) j--;
    if (!saw){ out.push(tokens[i].t); i++; continue; }
    const phrase = tokens.slice(i, j+1).map(x=>x.t).join('');
    const normalized = config.normalizeChem ? normalizeChem(phrase) : phrase;
    if (config.dryRun) out.push('«', normalized, '»'); else out.push('\\lr{', normalized, '}');
    i = j+1;
  }
  return { type:'rewritable', start:baseIndex, end:baseIndex+text.length, text, tokens, rewritten: out.join('') };
}

// ---------------- Ranges ----------------
function mergeRanges(r){ if(!r.length) return []; r.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const o=[r[0].slice()]; for(let i=1;i<r.length;i++){const L=o[o.length-1],C=r[i]; if(C[0]<=L[1]) L[1]=Math.max(L[1],C[1]); else o.push(C.slice());} return o; }
function findCommentRanges(s){ const res=[]; for(let i=0;i<s.length;i++){ if (s[i]==='%' && !(i>0 && s[i-1]==='\\')){ const st=i; while(i<s.length && s[i]!=='\n') i++; res.push([st,i]); } } return res; }
function scanPairs(s, openRe, closeRe, out, ignoreEsc=false){ let m; openRe.lastIndex=0; while((m=openRe.exec(s))){ const st=m.index; if(ignoreEsc && st>0 && s[st-1]==='\\') continue; closeRe.lastIndex=openRe.lastIndex; const c=closeRe.exec(s); if(!c) break; out.push([st, c.index+c[0].length]); openRe.lastIndex=c.index+c[0].length; } }
function findMathRanges(s){ const res=[]; scanPairs(s,/\$\$/g,/\$\$/g,res); scanPairs(s,/\$/g,/\$/g,res,true); scanPairs(s,/\\\(/g,/\\\)/g,res); scanPairs(s,/\\\[/g,/\\\]/g,res); return res; }
function findEnvRanges(s, envs){ const res=[]; for(const e of envs){ const re=new RegExp(String.raw`\\begin\{${escapeRx(e)}\}([\s\S]*?)\\end\{${escapeRx(e)}\}`,'g'); let m; while((m=re.exec(s))) res.push([m.index, m.index+m[0].length]); } return res; }
function findProtectedCommandArgRanges(s){
  const one = ['url','path','label','ref','cite','includegraphics','input','include','bibliography','bibliographystyle']; const first=['href']; const res=[];
  function matchBraces(str,pos){ if(str[pos]!=='{') return [pos,false]; let d=0; for(let i=pos;i<str.length;i++){ if(str[i]==='\\'){i++;continue;} if(str[i]==='{') d++; else if(str[i]==='}'){ d--; if(d===0) return [i,true]; } } return [pos,false]; }
  function scan(cmd, all=true){
    const re=new RegExp(String.raw`\\${escapeRx(cmd)}\s*(\[[^\]]*\]\s*)*`,'g'); let m;
    while((m=re.exec(s))){ let p=re.lastIndex, a=0;
      for (let k=0;k<6;k++){ while(p<s.length && /\s/.test(s[p])) p++; if(s[p]!=='{') break;
        const [e,ok]=matchBraces(s,p); if(!ok) break; if(all || a===0) res.push([p,e+1]); a++; p=e+1; if(!all) break; }
    }
  }
  one.forEach(c=>scan(c,true)); first.forEach(c=>scan(c,false)); return res;
}
function findExistingLRRanges(s){
  const res=[]; const re=/\\lr\s*\{/g; let m;
  while((m=re.exec(s))){ const bracePos=m.index+m[0].length-1; const [end,ok]=matchBrace(s,bracePos); if(ok) res.push([m.index, end+1]); }
  return res;
  function matchBrace(str,pos){ if(str[pos]!=='{') return [pos,false]; let d=0; for(let i=pos;i<str.length;i++){ if(str[i]==='\\'){i++;continue;} if(str[i]==='{') d++; else if(str[i]==='}'){ d--; if(d===0) return [i,true]; } } return [pos,false]; }
}
function escapeRx(x){ return x.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }

// ---------------- Tokenization ----------------
function tokenize(s){ const arr=[]; const re=/([\p{Script=Latin}][\p{Script=Latin}\d_\-\/+\.]*|[\p{Nd}]+(?:[.,:][\p{Nd}]+)*|[~\-–\/:+]|[ \t\r\n]+|.)/gu; let m; while((m=re.exec(s))) arr.push({t:m[0]}); return arr; }
function buildUnitRegex(units){ const esc=units.map(u=>u.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')); return new RegExp(`^(?:${esc.join('|')})$`,'iu'); }
function isLatinWord(tok){ return /^[\p{Script=Latin}][\p{Script=Latin}\d_\-\/+\.]*$/u.test(tok.t); }
function isDigit(tok){ return /^[\p{Nd}]+(?:[.,:][\p{Nd}]+)*$/u.test(tok.t); }
function isJoiner(tok){ return /^[~\-–\/:+]$/.test(tok.t) || /^[ \t\r\n]+$/.test(tok.t); }
function isUnit(tok,unitRe){ return unitRe.test(tok.t); }
function isPhraseToken(tok,unitRe){ return isLatinWord(tok)||isDigit(tok)||isUnit(tok,unitRe)||isJoiner(tok); }
function isCandidateStart(tok,unitRe){ return isLatinWord(tok)||isDigit(tok)||isUnit(tok,unitRe); }
function normalizeChem(text){ return text.replace(/\b([A-Z][a-z]?)(\d+)\b/g,(_,e,n)=>`${e}$_${n}$`); }
