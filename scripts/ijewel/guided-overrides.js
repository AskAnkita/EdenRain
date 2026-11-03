// These groups contain the template's real iJewel controls, not duplicate inputs.
let guidedStep = 0;
const guidedNames = ['Choose your diamond', 'Choose your setting', 'Choose your metal', 'Review your design'];
function renderGuided(){
  const body = $('#railBody');
  const groups = Array.from(body.children).filter(n => n.classList.contains('sec-body'));
  groups.forEach((group, position) => { const index = Number(group.dataset.guidedGroup ?? position); group.hidden = guidedStep === 3 || (guidedStep < 2 ? index !== guidedStep : index < 2); });
  body.querySelector('.guided-review-wrap')?.remove();
  $('#guidedCount').textContent = `Step ${guidedStep + 1} of 4`;
  $('#guidedTitle').textContent = guidedNames[guidedStep];
  document.querySelectorAll('.guided-progress span').forEach((n,i) => { n.classList.toggle('current', i <= guidedStep); });
  $('#guidedBack').disabled = guidedStep === 0;
  $('#guidedNext').hidden = guidedStep === 3;
  $('#guidedEnquire').hidden = guidedStep !== 3;
  $('#guidedNext').textContent = ['Next: setting', 'Next: metal', 'Review design'][guidedStep] || 'Review design';
  if(guidedStep === 3){
    const wrap = el('div', 'guided-review-wrap');
    const list = el('dl', 'guided-review');
    body.querySelectorAll('.group-label').forEach(label => {
      const row = document.createElement('div');
      const key = document.createElement('dt'); key.textContent = label.querySelector('.k')?.textContent.replace(/:$/, '') || 'Option';
      const value = document.createElement('dd'); value.textContent = label.querySelector('.v')?.textContent || 'Not selected';
      row.append(key,value);list.append(row);
    });
    const note = el('p', 'guided-note');note.textContent = 'Review your choices with our team to confirm your ring size, availability and final quote.';
    wrap.append(list,note);body.append(wrap);
  }
}
function bootGuided(){
  // The builder's own figures are estimates from a demo rate card, so the price
  // line is replaced rather than printed: CONFIG.priceOverride prints a plain
  // string and hides the breakdown with it. The wording is the section's, read
  // straight off the host element - a srcdoc frame shares the page's origin -
  // so the editor stays the one place it is written.
  try {
    const host = (frameElement && frameElement.closest('ijewel-studio')) || parent.document.querySelector('ijewel-studio');
    const note = host && host.dataset.priceNote;
    if (note) { CONFIG.priceOverride = note; if (typeof renderCommerce === 'function') renderCommerce(); }
  } catch (_) { /* a frame that is not ours to read - the estimate stands */ }

  const progress = el('div', 'guided-progress');progress.setAttribute('aria-hidden','true');
  for(let i=0;i<4;i++) progress.append(document.createElement('span'));
  const heading = el('div', 'guided-heading');heading.innerHTML = '<small id="guidedCount"></small><h2 id="guidedTitle" tabindex="-1"></h2>';
  $('#rail').insertBefore(progress, $('#railScroll'));$('#rail').insertBefore(heading, $('#railScroll'));
  const actions = el('div','guided-actions');actions.innerHTML = '<button class="guided-back" id="guidedBack" type="button">Back</button><button class="guided-next" id="guidedNext" type="button">Next: setting</button><a class="guided-next" id="guidedEnquire" target="_top" href="/pages/bespoke-jewellery-request" hidden>Enquire about this design</a>';
  document.querySelector('.rail-foot').append(actions);
  function move(delta){guidedStep = Math.max(0,Math.min(3,guidedStep+delta));renderGuided();$('#railScroll').scrollTop=0;$('#guidedTitle').focus();}
  $('#guidedBack').onclick=()=>move(-1);$('#guidedNext').onclick=()=>move(1);
  $('#guidedEnquire').addEventListener('click',()=>{
    const lines=Array.from($('#railBody').querySelectorAll('.group-label')).map(n=>n.textContent).join('\n');
    // Keep the choices available on return; never report an order as added.
    try{sessionStorage.setItem('eden-ring-design',JSON.stringify({choices:lines,estimate:$('#productPrice').textContent}));}catch(_){}
    $('#guidedEnquire').href='/pages/bespoke-jewellery-request?design='+encodeURIComponent(lines);
  });
  new MutationObserver(records => { if(records.some(record => Array.from(record.addedNodes).some(node => node.classList?.contains('sec-body')))) renderGuided(); }).observe($('#railBody'),{childList:true});
  renderGuided();
}
if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded',bootGuided);else bootGuided();
