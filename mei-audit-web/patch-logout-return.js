const app=document.querySelector('#app');
let logoutPending=false;

document.addEventListener('click',event=>{
  const btn=event.target?.closest?.('#logout');
  if(btn) logoutPending=true;
},true);

if(app){
  const observer=new MutationObserver(()=>{
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
