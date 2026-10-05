// An in-page dialog keeps confirmations keyboard accessible in embedded browsers too.
export function confirmAction(message) {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    const title=document.createElement('h2');title.textContent='Confirm action';
    const text=document.createElement('p');text.textContent=message;
    const buttons=document.createElement('div');buttons.className='row wrap';
    const cancel=document.createElement('button');cancel.textContent='Cancel';
    const accept=document.createElement('button');accept.textContent='Continue';accept.className='primary';
    dialog.setAttribute('aria-label','Confirm action');buttons.append(cancel,accept);dialog.append(title,text,buttons);document.body.append(dialog);
    let result=false;cancel.onclick=()=>dialog.close();accept.onclick=()=>{result=true;dialog.close();};
    dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});dialog.showModal();cancel.focus();
  });
}
