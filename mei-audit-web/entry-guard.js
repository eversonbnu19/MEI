const actionState=new WeakMap();
const ACTION_SELECTOR='[data-start],[data-end],[data-piece],[data-invoice],[data-pay],[data-download]';

function labelFor(el){
  if(el.dataset.start) return 'Registrando entrada...';
  if(el.dataset.end) return 'Registrando saída...';
  if(el.dataset.piece) return 'Registrando produção...';
  if(el.dataset.invoice) return 'Enviando nota...';
  if(el.dataset.pay) return 'Encaminhando...';
  if(el.dataset.download) return 'Abrindo...';
  return 'Processando...';
}

function lockAction(el){
  if(!el || actionState.has(el)) return false;
  actionState.set(el,{disabled:el.disabled,text:el.textContent});
  el.disabled=true;
  el.setAttribute('aria-busy','true');
  el.textContent=labelFor(el);
  return true;
}

function unlockDetachedActions(){
  for(const el of document.querySelectorAll(`${ACTION_SELECTOR}[aria-busy="true"]`)){
    if(!el.isConnected) continue;
    const state=actionState.get(el);
    if(!state) continue;
    // A tela normalmente e renderizada novamente apos sucesso. Se permanecer por erro,
    // reabilita o botao apos um intervalo seguro para permitir nova tentativa manual.
    setTimeout(()=>{
      if(!el.isConnected) return;
      const current=actionState.get(el);
      if(!current) return;
      el.disabled=current.disabled;
      el.textContent=current.text;
      el.removeAttribute('aria-busy');
      actionState.delete(el);
    },5000);
  }
}

document.addEventListener('click',event=>{
  const el=event.target?.closest?.(ACTION_SELECTOR);
  if(!el) return;
  if(actionState.has(el)){
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  lockAction(el);
  unlockDetachedActions();
},true);
