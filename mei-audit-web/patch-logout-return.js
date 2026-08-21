const app=document.querySelector('#app');
let logoutPending=false;

function showV27(){
  document.title='Gestão de Contratos v27';
  document.querySelectorAll('b').forEach(el=>{
    if(el.textContent?.trim()==='Versão v26') el.textContent='Versão v27';
  });
  const role=document.querySelector('.top > div:first-child small');
  if(role?.textContent?.includes('Versão v26')) role.textContent=role.textContent.replace('Versão v26','Versão v27');
}

document.addEventListener('click',event=>{
  const btn=event.target?.closest?.('#logout');
  if(btn) logoutPending=true;
},true);

if(app){
  const observer=new MutationObserver(()=>{
    showV27();
    if(!logoutPending) return;
    const oldLogin=document.querySelector('#app .login #signup');
    const panelLogout=document.querySelector('#logout');
    if(oldLogin && !panelLogout){
      logoutPending=false;
      location.replace('./');
    }
  });
  observer.observe(app,{subtree:true,childList:true});
}
showV27();
