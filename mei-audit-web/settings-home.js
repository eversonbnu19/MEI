import {mountEmailSettings} from './email-settings.js?v=38';
import {mountClosureReminders} from './closure-reminders.js?v=38';
export async function mountSettings(options){
 async function show(section){
  const wrapped={...options,shell(content,tabs){
   options.shell('<nav class="tabs settings-tabs" aria-label="Configurações"><button data-settings-section="reminders" class="'+(section==='reminders'?'active':'')+'">Lembretes de fechamento</button><button data-settings-section="emails" class="'+(section==='emails'?'active':'')+'">E-mails automáticos</button></nav>'+content,tabs);
   document.querySelectorAll('[data-settings-section]').forEach(button=>button.onclick=async()=>{
    if(document.querySelector('.email-model[data-dirty="true"],.reminder-model[data-dirty="true"]')&&!confirm('Há alterações não salvas. Sair sem salvar?'))return;
    try{await show(button.dataset.settingsSection);}catch(e){alert(e.message||String(e));}
   });
  }};
  if(section==='emails')return mountEmailSettings(wrapped);
  return mountClosureReminders(wrapped);
 }
 return show('reminders');
}
