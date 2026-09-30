const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let S={eq:[],loc:[]};
let REV=0,salvando=false,pendente=false,bloqueado=false;
const status=t=>{$("dbStatus").textContent=t};
let logado=false,eAdmin=false,timersOk=false;
async function persistir(){
  if(salvando){pendente=true;return}
  salvando=true;
  do{
    pendente=false;
    try{
      const r=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json","X-Rev":String(REV)},body:JSON.stringify(S)});
      if(r.status===401){sessaoExpirada();break}
      if(r.status===409){pendente=false;await recarregar(true);alert("Outra pessoa salvou uma alteração no mesmo instante. A tela foi atualizada com os dados mais recentes e a sua última alteração NÃO foi gravada. Confira e refaça, se necessário.");break}
      if(!r.ok)throw new Error("HTTP "+r.status);
      REV=(await r.json()).rev;
      if(!pendente)status("Salvo no servidor");
    }catch(e){console.error("Erro ao salvar:",e);if(!logado)break;status("ERRO ao salvar. Verifique o servidor");alert("Não foi possível salvar no banco. Verifique se o servidor (iniciar.bat) continua aberto. As últimas alterações podem não ter sido gravadas.");break}
  }while(pendente);
  salvando=false;
}
function save(){
  if(bloqueado){status("Conflito: recarregue a página");return}
  status("Salvando…");persistir();
}
let offline=false;
function renderTudo(){
  fillSel();$("cfgMd").checked=S.cfg.mesmoDia;
  renderLoc();renderEq();renderMan();renderBk();
  if(edId&&!S.loc.some(x=>x.id===edId))fecharEd();
}
async function recarregar(force){
  const r=await fetch("/api/state",{cache:"no-store"});
  if(r.status===401){sessaoExpirada();return false}
  if(!r.ok)throw new Error("HTTP "+r.status);
  const nr=+(r.headers.get("X-Rev")||0),d=await r.json();
  if(!d)return false;
  if(!force&&(salvando||pendente))return false; // há alteração local em andamento: não sobrescrever
  S=d;S.man=S.man||[];S.cfg=S.cfg||{mesmoDia:true};REV=nr;renderTudo();return true;
}
async function sincronizar(){
  if(salvando||pendente)return;
  try{
    const r=await fetch("/api/rev",{cache:"no-store"});
    if(r.status===401){sessaoExpirada();return}
    if(!r.ok)throw new Error("HTTP "+r.status);
    const {rev}=await r.json();
    if(offline){offline=false;status("Salvo no servidor")}
    if(rev===REV)return;
    const a=document.activeElement;
    if(a&&a.closest&&a.closest("#lTb,#eTb,#mTb"))return; // não atrapalha quem está digitando na tabela
    if(await recarregar(false))status("Atualizado com alterações de outra pessoa");
  }catch(e){offline=true;status("Sem conexão com o servidor")}
}
let diaAtual=hojeLocal();
function virouDia(){
  const h=hojeLocal();if(h===diaAtual)return;
  const ant=diaAtual;diaAtual=h;
  // só move os campos que ainda estão com o valor padrão do dia anterior
  [["dDia",0],["nIni",0],["nFim",7],["mIni",0],["qIni",7],["qFim",14]].forEach(([i,n])=>{if($(i).value===add(ant,n))$(i).value=add(h,n)});
  renderTudo();
}
const tick=()=>{if(!logado)return;virouDia();sincronizar()};
window.addEventListener("beforeunload",e=>{if(salvando||pendente){e.preventDefault();e.returnValue=""}});
async function load(){
  try{
    const r=await fetch("/api/state");
    if(r.status===401){sessaoExpirada();throw new Error("401")}
    if(!r.ok) throw new Error("Falha ao carregar dados");
    REV=+(r.headers.get("X-Rev")||0);
    const data=await r.json();
    if(data){
      S=data;
      S.man=S.man||[];
      S.cfg=S.cfg||{mesmoDia:true};
      return;
    }
  }catch(e){if(e.message!=="401")alert("Não foi possível conectar ao banco local. Verifique se o servidor está funcionando.");throw e}
  S={eq:[],loc:[],man:[],cfg:{mesmoDia:true}};
}
function iso(d){return d.toISOString().slice(0,10)}
function hojeLocal(){const d=new Date(),z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())}
function add(s,n){const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return iso(d)}
function fmt(s){return s.split("-").reverse().join("/")}
function span(a,b){const r=[];for(let d=a;d<=b;d=add(d,1))r.push(d);return r}
const eqName=id=>(S.eq.find(e=>e.id==id)||{nome:"?"}).nome;
function emMan(id,day){
 return (S.man||[]).reduce((t,m)=>{
   const ativa=String(m.eq)===String(id)
     && String(m.ini||"")<=String(day||"")
     && (!m.ret || String(m.ret)>String(day||""));
   return t+(ativa?(Number(m.qtd)||0):0);
 },0);
}
const total=(id,day)=>{const b=(S.eq.find(e=>e.id==id)||{total:0}).total;return b};
function used(id,day,skip,ext){return S.loc.reduce((s,l)=>{if(l.eq!=id||l.id===skip)return s;const fim=ext&&ext(l)||l.fim;return s+(l.ini<=day&&(day<fim||(day===fim&&(!S.cfg.mesmoDia||l.ini===fim)))?l.qtd:0)},0)}
function dias(a,b){return S.cfg.mesmoDia&&b>a?span(a,add(b,-1)):span(a,b)}
function avail(id,a,b,skip){return dias(a,b).map(d=>({d,v:total(id,d)-emMan(id,d)-used(id,d,skip)}))}
function ranges(arr){const out=[];arr.forEach(x=>{const l=out[out.length-1];if(l&&l.v===x.v&&add(l.b,1)===x.d)l.b=x.d;else out.push({a:x.d,b:x.d,v:x.v})});return out}
function fillSel(){const o=S.eq.map(e=>`<option value="${e.id}">${esc(e.nome)}</option>`).join("");["qEq","nEq","edEq","mEq"].forEach(i=>{const v=$(i).value;$(i).innerHTML=o;if(v)$(i).value=v});const hv=$("hEq").value;$("hEq").innerHTML='<option value="">Todos</option>'+o;$("hEq").value=hv}

function consultar(){
 const id=+$("qEq").value,q=+$("qQtd").value,a=$("qIni").value,b=$("qFim").value,o=$("qOut");
 if(!a||!b||b<a||q<1){o.innerHTML='<div class="box warn">Informe o equipamento, a quantidade e um período válido.</div>';return}

 const diasConsulta=dias(a,b);
 const saldo=diasConsulta.map(d=>({
   d,
   total:total(id,d),
   alugado:used(id,d),
   manut:emMan(id,d),
   disponivel:Math.max(0,total(id,d)-used(id,d)-emMan(id,d))
 }));
 const min=Math.min(...saldo.map(x=>x.disponivel));
 const tot=total(id);
 const locMax=Math.max(...saldo.map(x=>x.alugado),0);
 const manMax=Math.max(...saldo.map(x=>x.manut),0);
 const full=span(a,b).map(d=>({
   d,
   v:Math.max(0,total(id,d)-used(id,d)-emMan(id,d))
 }));
 const naJanela=S.loc.filter(l=>l.eq==id&&l.ini<=b&&l.fim>=a)
   .sort((x,y)=>x.ini.localeCompare(y.ini));

 // Cenário conservador: locações ainda não confirmadas que terminam dentro
 // da janela são tratadas como se fossem renovadas até o fim da consulta.
 const h0=hojeLocal();
 const risco=S.loc.filter(l=>l.eq==id&&!l.conf&&l.fim>=h0&&l.fim<b);
 const cons=Math.min(...diasConsulta.map(d=>
   Math.max(0,total(id,d)-used(id,d,null,l=>
     !l.conf&&l.fim>=h0&&l.fim<b?b:l.fim)-emMan(id,d))
 ));
 const cond=min>=q&&cons<q;
 const cls=min<q?"bad":cond?"warn":"ok";

 let h=`<div class="box ${cls}">
   <div class="big">${min<q?"Indisponível":cond?"Disponível, com ressalvas":"Disponível"}</div>`;

 if(min<q){
   h+=`Não atende <b>${q} unidade(s)</b> durante todo o período. O menor saldo disponível é <b>${Math.max(min,0)}</b>.`;
 }else if(cond){
   h+=`Há <b>${q} unidade(s)</b> disponíveis de ${fmt(a)} a ${fmt(b)}, mas parte dessa disponibilidade depende de devoluções no prazo. Se alguma locação for renovada, o saldo poderá cair para <b>${Math.max(cons,0)}</b>.`;
 }else{
   h+=`Dá para atender <b>${q} unidade(s)</b> de ${fmt(a)} a ${fmt(b)}, mesmo considerando as locações existentes e os equipamentos em manutenção.`;
 }
 h+="</div>";

 const st=(n,t,c)=>`<div class="box ${c}" style="margin:0;border:1px solid var(--line)">
   <div class="big">${n}</div>${t}</div>`;

 h+=`<div class="row" style="align-items:stretch;margin-top:12px">
   ${st(tot,"total em estoque","")}
   ${st(Math.max(min,0),"disponíveis durante todo o período","ok")}
   ${st(locMax,"alugados (máximo no período)","warn")}
   ${st(manMax,"em manutenção (máximo no período)","bad")}
 </div>`;

 h+=`<h2 style="margin-top:14px">Locações no período (${naJanela.length})</h2>`+
   (naJanela.length?
    `<div class="scroll"><table><thead><tr><th>Cliente</th><th>Qtd</th><th>Período</th><th>Situação</th></tr></thead><tbody>`+
    naJanela.map(l=>`<tr>
      <td><b>${esc(l.cliente)}</b>${l.tel?`<br><small>${esc(l.tel)}</small>`:""}</td>
      <td>${l.qtd}</td>
      <td>${fmt(l.ini)} a ${fmt(l.fim)}</td>
      <td>${l.conf?l.conf.tipo+" confirmada":l.ini>h0?"Reservada":"Em andamento"}</td>
    </tr>`).join("")+
    `</tbody></table></div>`
    :" <small>Nenhuma locação neste período.</small>");

 h+=`<h2 style="margin-top:14px">Disponibilidade por período</h2>
   <div class="scroll"><table><thead><tr>
   <th>Período</th><th>Disponível</th><th>Alugado</th><th>Manutenção</th>
   </tr></thead><tbody>`;

 // Agrupa somente pela combinação dos três valores, para a leitura ficar objetiva.
 const detalhado=[];
 saldo.forEach(x=>{
   const ultimo=detalhado[detalhado.length-1];
   if(ultimo&&ultimo.disponivel===x.disponivel&&ultimo.alugado===x.alugado&&ultimo.manut===x.manut&&add(ultimo.b,1)===x.d){
     ultimo.b=x.d;
   }else{
     detalhado.push({a:x.d,b:x.d,disponivel:x.disponivel,alugado:x.alugado,manut:x.manut});
   }
 });
 h+=detalhado.map(r=>`<tr>
   <td>${r.a===r.b?fmt(r.a):fmt(r.a)+" a "+fmt(r.b)}</td>
   <td><b>${r.disponivel}</b></td>
   <td>${r.alugado}</td>
   <td>${r.manut}</td>
 </tr>`).join("")+`</tbody></table></div>`;

 if(risco.length){
   h+=`<h2 style="margin-top:14px">${cond?'Devoluções que impactam a disponibilidade':'Devoluções previstas até o fim do período'}</h2>
   <div class="scroll"><table><thead><tr><th>Cliente</th><th>Qtd</th><th>Devolve em</th><th>Ação</th></tr></thead><tbody>`+
   risco.map(l=>`<tr>
     <td><b>${esc(l.cliente)}</b>${l.tel?`<br><small>${esc(l.tel)}</small>`:""}</td>
     <td>${l.qtd}</td>
     <td>${fmt(l.fim)}</td>
     <td>Confirmar com o cliente</td>
   </tr>`).join("")+
   `</tbody></table></div>`;
 }

 if(min>=q){
   h+=`<div class="row" style="margin-top:12px">
     <label>Reservar para o cliente<input id="rCli" placeholder="Nome do cliente"></label>
     <label>Telefone<input id="rTel" type="tel"></label>
     <label>Quantidade<input id="rQtd" type="number" min="1" max="${Math.max(min,1)}" value="${Math.min(q,min)}" style="min-width:90px"></label>
     <button class="b" id="rGo">${cond?'Reservar com ressalva':'Reservar'} <span id="rQtdTxt">${Math.min(q,min)}</span> un.</button>
   </div>
   <div class="msg" id="rMsg"></div>`;
 }

 o.innerHTML=h;

 if($("rQtd")){
   const atualizarQtd=()=>{
     let v=parseInt($("rQtd").value,10)||1;
     v=Math.max(1,Math.min(v,min));
     $("rQtd").value=v;
     $("rQtdTxt").textContent=v;
   };
   $("rQtd").oninput=atualizarQtd;
   $("rQtd").onchange=atualizarQtd;
 }

 if($("rGo"))$("rGo").onclick=()=>{
   const c=$("rCli").value.trim();
   if(!c){$("rMsg").textContent="Informe o nome do cliente.";return}
   const rq=Math.max(1,Math.min(parseInt($("rQtd").value,10)||1,min));
   S.loc.push({
     id:Date.now(),eq:id,cliente:c,tel:$("rTel").value.trim(),
     qtd:rq,ini:a,fim:b
   });
   save();renderLoc();consultar();
   $("rMsg").textContent="Reserva registrada.";
 };
}

function deps(l){ // devoluções ainda não confirmadas de que esta reserva depende
 const h0=hojeLocal();if(l.conf||l.ini<h0)return [];
 const ext=x=>!x.conf&&x.fim>=h0&&x.fim<l.fim?l.fim:x.fim;
 if(!dias(l.ini,l.fim).some(d=>total(l.eq,d)-emMan(l.eq,d)-used(l.eq,d,l.id,ext)<l.qtd))return [];
 return S.loc.filter(x=>x.eq==l.eq&&x.id!==l.id&&!x.conf&&x.fim>=h0&&x.fim<l.fim)}
const nomes=(L,r)=>L.map(x=>esc(x.cliente)+" ("+fmt(x.fim)+(r&&x.fim===r.ini?", mesmo dia do início":"")+")").join(", ");
function notaSai(l){const dp=deps(l),m=S.loc.filter(x=>x.eq==l.eq&&x.id!==l.id&&x.fim===l.ini&&!x.conf);
 return dp.length?`<div><span class="tag warn">Depende da devolução de ${nomes(dp,l)}</span></div>`:m.length?`<div><small>Mesmo dia: devolução de ${m.map(x=>esc(x.cliente)).join(", ")}</small></div>`:""}
function notaVol(l){const m=S.loc.filter(x=>x.eq==l.eq&&x.id!==l.id&&x.ini===l.fim);
 return m.length?`<div><small>Mesmo dia: sai para ${m.map(x=>esc(x.cliente)).join(", ")}</small></div>`:""}
function renderDia(){
 const d=$("dDia").value,h0=hojeLocal();if(!d)return;
 const sai=S.loc.filter(l=>l.ini===d),vol=S.loc.filter(l=>l.fim===d),atr=d===h0?S.loc.filter(l=>!l.conf&&l.fim<h0):[];
 const it=(l,x)=>`<div class="it"><b>${l.qtd}× ${esc(eqName(l.eq))}</b><br><small><b>${esc(l.cliente)}</b>${l.tel?" · "+l.tel:""}${x&&x.per?" · até "+fmt(l.fim):""}${x&&x.atr?" · devolução prevista "+fmt(l.fim):""}</small>${x&&x.b||""}</div>`;
 const btn=l=>l.conf?`<div><span class="tag ok">✔ ${l.conf.tipo} confirmada</span></div>`:`<div style="margin-top:4px"><button class="g" data-vc="${l.id}|Devolução">Devolução confirmada</button> <button class="g" data-vc="${l.id}|Retirada">Retirada confirmada</button></div>`;
 const col=(t,c,list,vazio)=>`<div class="col"><h3>${t} (${list.length})</h3>${c.length?c.join(""):"<small>"+vazio+"</small>"}</div>`;
 let h=col("Saem do estoque",sai.map(l=>it(l,{per:1,b:notaSai(l)})),sai,"Nenhuma saída neste dia.");
 h+=col("Voltam ao estoque",vol.map(l=>it(l,{b:notaVol(l)+btn(l)})),vol,"Nenhuma devolução ou retirada neste dia.");
 if(atr.length)h+=`<div class="col bad"><h3>Em atraso (${atr.length})</h3>${atr.map(l=>it(l,{atr:1,b:btn(l)})).join("")}</div>`;
 $("dOut").innerHTML=h;
}
const norm=x=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
let hBuscou=false;
function renderHist(){
 if(!hBuscou){$("hOut").innerHTML="";return}
 const t=$("hTipo").value,e=$("hEq").value,de=$("hDe").value,ate=$("hAte").value,c=norm($("hCli").value.trim());
 const L=S.loc.filter(l=>l.conf&&(!t||l.conf.tipo===t)&&(!e||l.eq==e)&&(!de||l.conf.data>=de)&&(!ate||l.conf.data<=ate)&&(!c||norm(l.cliente+" "+(l.tel||"")).includes(c))).sort((x,y)=>y.conf.data.localeCompare(x.conf.data));
 $("hOut").innerHTML=`<div class="msg">${L.length} registro(s)</div>`+(L.length?`<div class="scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Equipamento</th><th>Qtd</th><th>Cliente</th><th>Telefone</th><th>Período da locação</th></tr></thead><tbody>${L.map(l=>`<tr><td>${fmt(l.conf.data)}</td><td>${l.conf.tipo}</td><td>${esc(eqName(l.eq))}</td><td>${l.qtd}</td><td>${esc(l.cliente)}</td><td>${esc(l.tel||"-")}</td><td>${fmt(l.ini)} a ${fmt(l.fim)}</td></tr>`).join("")}</tbody></table></div>`:"<small>Nenhuma devolução ou retirada confirmada com esses filtros.</small>");
}
let edId=null;
function abrirEd(id){const l=S.loc.find(x=>x.id==id);if(!l)return;edId=l.id;
 $("edEq").value=l.eq;$("edCli").value=l.cliente;$("edTel").value=l.tel||"";$("edQtd").value=l.qtd;$("edIni").value=l.ini;$("edFim").value=l.fim;
 $("edUndo").classList.toggle("hidden",!l.conf);$("edMsg").textContent="";$("edSec").classList.remove("hidden");
 $("edSec").scrollIntoView({behavior:"smooth",block:"start"});$("edCli").focus()}
function fecharEd(){edId=null;$("edSec").classList.add("hidden")}
function renderMan(){
 const h0=hojeLocal(),st=m=>m.ret&&m.ret<=h0?"Concluída":m.ini>h0?"Agendada":"Em manutenção";
 const L=[...S.man].sort((x,y)=>(st(x)==="Concluída")-(st(y)==="Concluída")||y.ini.localeCompare(x.ini));
 const hoje=S.eq.filter(e=>emMan(e.id,h0)>0).map(e=>`<b>${esc(e.nome)}</b>: ${emMan(e.id,h0)} de ${e.total}`).join(" · ");
 $("mResumo").innerHTML=hoje?"Em manutenção hoje: "+hoje:"Nenhum equipamento em manutenção hoje.";
 $("mTb").innerHTML=L.length?L.map(m=>{const t=st(m);return `<tr><td><b>${esc(eqName(m.eq))}</b></td><td>${m.qtd}</td><td>${fmt(m.ini)} ${m.ret?"· retorna em "+fmt(m.ret):"· sem previsão de retorno"}</td><td>${esc(m.motivo||"-")}</td><td><span class="tag ${t==="Concluída"?"ok":t==="Agendada"?"warn":"bad"}">${t}</span></td><td>${t==="Concluída"?"":`<input type="date" id="mr${m.id}" value="${h0}" style="width:150px"> <button class="g" data-mr="${m.id}">Voltou ao estoque</button> `}<button class="g d" data-mx="${m.id}">Excluir</button></td></tr>`}).join(""):'<tr><td colspan="6">Nenhuma manutenção registrada.</td></tr>';
 $("mTb").querySelectorAll("[data-mr]").forEach(b=>b.onclick=()=>{const m=S.man.find(x=>x.id==b.dataset.mr),d=$("mr"+m.id).value;
  if(!d){$("mLst").textContent="Informe a data de retorno.";return}
  m.ret=d;save();renderMan();renderLoc();$("mLst").textContent=`${m.qtd} un. de ${eqName(m.eq)} voltam ao estoque em ${fmt(d)}.`});
 $("mTb").querySelectorAll("[data-mx]").forEach(b=>b.onclick=()=>{S.man=S.man.filter(x=>x.id!=b.dataset.mx);save();renderMan();renderLoc();$("mLst").textContent="Manutenção excluída. O estoque foi recalculado."});
}
function renderLoc(){
 renderDia();renderHist();
 const rows=[...S.loc].sort((x,y)=>x.ini.localeCompare(y.ini));
 $("lTb").innerHTML=rows.length?rows.map(l=>`<tr><td>${esc(eqName(l.eq))}</td><td><b>${esc(l.cliente)}</b>${l.tel?`<br><small>${esc(l.tel)}</small>`:""}${deps(l).length?` <span class="warn" style="padding:2px 6px;border-radius:4px;font-size:12px">depende da devolução de ${nomes(deps(l),l)}</span>`:''}</td><td>${l.qtd}</td><td>${fmt(l.ini)} a ${fmt(l.fim)}</td>
 <td>${l.conf?`<span class="ok" style="padding:3px 8px;border-radius:4px">✔ ${l.conf.tipo} confirmada em ${fmt(l.conf.data)}</span>`:`<input type="date" id="rn${l.id}" min="${add(l.fim,1)}" style="width:150px"> <button class="g" data-r="${l.id}">Renovar</button>`}</td>
 <td>${l.conf?"":`<input type="date" id="cf${l.id}" value="${l.fim}" style="width:150px"> <button class="g" data-c="${l.id}|Devolução">Devolução confirmada</button> <button class="g" data-c="${l.id}|Retirada">Retirada confirmada</button> `}<button class="g" data-e="${l.id}">Editar</button> <button class="g d" data-x="${l.id}">Excluir</button></td></tr>`).join(""):'<tr><td colspan="6">Nenhuma locação. Registre a primeira na aba Nova locação.</td></tr>';
 $("lTb").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
  const l=S.loc.find(x=>x.id==b.dataset.r),n=$("rn"+l.id).value;
  if(!n||n<=l.fim){$("lMsg").textContent="Escolha uma data posterior ao fim atual.";return}
  const falta=avail(l.eq,l.fim,n,l.id).filter(x=>x.v<l.qtd);
  l.fim=n;save();renderLoc();
  $("lMsg").textContent=falta.length?`Renovado até ${fmt(n)}, mas faltam unidades a partir de ${fmt(falta[0].d)}. Revise as reservas.`:`Renovado até ${fmt(n)}. O estoque futuro foi atualizado.`});
 $("lTb").querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
  const [id,tipo]=b.dataset.c.split("|"),l=S.loc.find(x=>x.id==id),d=$("cf"+id).value;
  if(!d||d<l.ini){$("lMsg").textContent="Informe a data real, a partir do início da locação.";return}
  l.fim=d;l.conf={tipo,data:d};save();renderLoc();
  $("lMsg").textContent=`${tipo} confirmada. ${l.qtd} un. de ${eqName(l.eq)} livres a partir de ${fmt(add(d,1))}.`});
 $("lTb").querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>abrirEd(b.dataset.e));
 $("lTb").querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{S.loc=S.loc.filter(x=>x.id!=b.dataset.x);save();renderLoc();$("lMsg").textContent="Locação excluída."});
}
function estoqueComprometidoMax(id){
 const h0=hojeLocal(),datas=[];
 S.loc.filter(l=>l.eq==id&&l.fim>=h0).forEach(l=>{datas.push(l.ini,l.fim)});
 S.man.filter(m=>m.eq==id&&(!m.ret||m.ret>=h0)).forEach(m=>{datas.push(m.ini);if(m.ret)datas.push(add(m.ret,-1))});
 const fim=datas.length?datas.reduce((a,b)=>a>b?a:b,h0):h0;
 let max=0;
 for(const d of span(h0,fim)){max=Math.max(max,used(id,d)+emMan(id,d))}
 return max;
}
function renderEq(){
 const tb=$("eTb");
 if(!tb)return;
 S.eq=Array.isArray(S.eq)?S.eq:[];
 S.loc=Array.isArray(S.loc)?S.loc:[];
 S.man=Array.isArray(S.man)?S.man:[];
 const h0=hojeLocal();

 tb.innerHTML=S.eq.map(e=>{
   const total=Number(e.total)||0;
   const alug=Number(used(e.id,h0))||0;
   const man=Number(emMan(e.id,h0))||0;
   const disp=Math.max(0,total-alug-man);

   return `<tr>
     <td><b>${esc(e.nome)}</b></td>
     <td><input type="number" min="0" value="${total}" data-t="${e.id}" style="width:80px" title="Não pode ficar abaixo do estoque já comprometido"></td>
     <td><b>${disp}</b></td>
     <td>${alug}</td>
     <td>${man}</td>
     <td><button class="g d" data-d="${e.id}">Remover</button></td>
   </tr>`;
 }).join("");

 tb.querySelectorAll("[data-t]").forEach(i=>i.onchange=()=>{
   const e=S.eq.find(x=>String(x.id)===String(i.dataset.t));
   if(!e)return;

   const novo=Math.max(0,Math.floor(Number(i.value)||0));
   const min=estoqueComprometidoMax(e.id);

   if(novo<min){
     i.value=e.total;
     $("eMsg").textContent=`Não é possível reduzir ${e.nome} para ${novo} unidade(s). O sistema já tem ${min} unidade(s) comprometidas por locações/manutenções.`;
     return;
   }

   e.total=novo;
   save();
   renderEq();
   renderLoc();
   renderMan();
   $("eMsg").textContent=`Estoque de ${e.nome} atualizado para ${novo} unidade(s).`;
 });

 tb.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{
   const id=Number(b.dataset.d);
   const e=S.eq.find(x=>Number(x.id)===id);
   if(!e)return;

   if(S.loc.some(l=>Number(l.eq)===id)||S.man.some(m=>Number(m.eq)===id)){
     $("eMsg").textContent=`Não é possível remover ${e.nome} porque existem locações ou manutenções vinculadas a ele.`;
     return;
   }

   if(!confirm(`Remover o equipamento "${e.nome}" do cadastro?`))return;

   S.eq=S.eq.filter(x=>Number(x.id)!==id);
   save();
   renderEq();
   fillSel();
   $("eMsg").textContent=`${e.nome} removido do cadastro.`;
 });
}
$("nAdd").onclick=()=>{
 const id=+$("nEq").value,c=$("nCli").value.trim(),q=+$("nQtd").value,a=$("nIni").value,b=$("nFim").value,m=$("nMsg");
 if(!c||!a||!b||b<a||q<1){m.textContent="Preencha cliente, quantidade e um período válido.";return}
 const min=Math.min(...avail(id,a,b).map(x=>x.v));
 if(min<q){m.textContent=`Sem estoque: só ${Math.max(min,0)} unidade(s) livres em todo o período.`;return}
 S.loc.push({id:Date.now(),eq:id,cliente:c,tel:$("nTel").value.trim(),qtd:q,ini:a,fim:b});save();renderLoc();m.textContent="Locação registrada.";
};
$("eAdd").onclick=()=>{
 const n=$("eNome").value.trim(),q=Math.max(0,Math.floor(+$("eTot").value||0)),m=$("eMsg");
 if(!n){m.textContent="Informe o nome do equipamento.";return}
 if(!q){m.textContent="Informe uma quantidade total maior que zero.";return}
 if(S.eq.some(e=>nrm(e.nome)===nrm(n))){m.textContent="Já existe um equipamento com esse nome.";return}
 S.eq.push({id:Date.now(),nome:n,total:q});$("eNome").value="";$("eTot").value=1;save();renderEq();fillSel();m.textContent=`${n} adicionado com ${q} unidade(s).`;
};
$("qGo").onclick=consultar;
// ---- backup e importação
async function baixar(filename,data){
  try{
    const blob=new Blob([data],{type:"application/octet-stream;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return "ok";
  }catch(e){console.error(e);return "erro"}
}
async function lerTexto(f){const buf=await f.arrayBuffer();try{return new TextDecoder("utf-8",{fatal:true}).decode(buf)}catch(e){return new TextDecoder("windows-1252").decode(buf)}}
function parseCSV(t){t=t.replace(/^\uFEFF/,"");const f=t.split(/\r?\n/)[0]||"",sep=f.includes(";")?";":f.includes("\t")?"\t":",";
 const rows=[];let r=[],c="",q=false;
 for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
  else if(ch==='"')q=true;else if(ch===sep){r.push(c);c=""}
  else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&t[i+1]==="\n")i++;r.push(c);rows.push(r);r=[];c=""}else c+=ch}
 if(c!==""||r.length){r.push(c);rows.push(r)}
 return rows.filter(x=>x.some(v=>v.trim()!==""))}
function pd(v){v=(v||"").trim();let m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/),x=null;
 if(m){let y=+m[3];if(y<100)y+=2000;x=y+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0")}else if(/^\d{4}-\d{2}-\d{2}$/.test(v))x=v;
 return x&&iso(new Date(x+"T00:00:00Z"))===x?x:null}
function renderBk(){const b=S.cfg.bk,d=b?Math.floor((Date.now()-new Date(b))/864e5):null;
 $("bkInfo").innerHTML=b?`Último backup: <b>${new Date(b).toLocaleString("pt-BR")}</b>${d>=7?` <span class="tag warn">há ${d} dias, faça um novo</span>`:""}`:`<span class="tag warn">Nenhum backup feito ainda</span>`}
$("bkExp").onclick=async()=>{const nome=`backup-estoque-${hojeLocal()}.json`,txt=JSON.stringify({versao:1,exportado:new Date().toISOString(),dados:S},null,1),m=$("bkMsg");
 const r=await baixar(nome,txt);
 if(r==="ok"){S.cfg.bk=new Date().toISOString();save();renderBk();m.textContent="Backup exportado. Guarde o arquivo em um local seguro.";$("bkTxt").classList.add("hidden")}
 else if(r==="declined")m.textContent="Download cancelado.";
 else{m.textContent="O download direto não está disponível aqui. Copie o texto abaixo e salve em um arquivo .json.";$("bkTxt").value=txt;$("bkTxt").classList.remove("hidden")}};
let bkPend=null;
$("bkFile").onchange=async()=>{const f=$("bkFile").files[0],m=$("bkMsg");$("bkAct").innerHTML="";bkPend=null;if(!f)return;
 try{const o=JSON.parse(await lerTexto(f)),d=o&&o.dados||o;
  if(!d||!Array.isArray(d.eq)||!Array.isArray(d.loc))throw 0;
  bkPend=d;m.textContent=`Arquivo válido: ${d.eq.length} equipamento(s), ${d.loc.length} locação(ões), ${(d.man||[]).length} manutenção(ões).\nIsso substitui todos os dados atuais.`;
  $("bkAct").innerHTML='<button class="b" id="bkOk">Substituir dados atuais</button><button class="g" id="bkNo">Cancelar</button>';
  $("bkOk").onclick=()=>{S=bkPend;S.man=S.man||[];S.cfg=S.cfg||{mesmoDia:true};bkPend=null;save();fecharEd();fillSel();renderLoc();renderEq();renderMan();renderBk();$("cfgMd").checked=S.cfg.mesmoDia;$("bkAct").innerHTML="";m.textContent="Backup importado. Os dados foram restaurados."};
  $("bkNo").onclick=()=>{bkPend=null;$("bkAct").innerHTML="";m.textContent="Importação cancelada."}
 }catch(e){m.textContent="Não foi possível ler este arquivo. Use um backup .json exportado por esta ferramenta."}
 $("bkFile").value=""};
$("mdEq").onclick=()=>baixar("modelo-equipamentos.csv","\uFEFFnome;quantidade\nFreezer horizontal;4\nForno combinado;2\n").then(r=>{if(r==="indisp")$("csvMsg").textContent="Download indisponível aqui. Crie um CSV com as colunas: nome;quantidade."});
$("mdLoc").onclick=()=>baixar("modelo-locacoes.csv","\uFEFFequipamento;cliente;telefone;quantidade;inicio;fim\nFreezer horizontal;Buffet Aurora;(11) 90000-0000;2;01/10/2026;10/10/2026\n").then(r=>{if(r==="indisp")$("csvMsg").textContent="Download indisponível aqui. Crie um CSV com as colunas: equipamento;cliente;telefone;quantidade;inicio;fim."});
const nrm=x=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
$("csvEq").onchange=async()=>{const f=$("csvEq").files[0],m=$("csvMsg");if(!f)return;
 try{let R=parseCSV(await lerTexto(f));if(R.length&&isNaN(Number(R[0][1])))R.shift();
  let novos=0,atual=0;const err=[];
  R.forEach((r,i)=>{const n=(r[0]||"").trim(),q=Number((r[1]||"").trim());
   if(!n||!Number.isInteger(q)||q<0){err.push(`Linha ${i+1}: nome ou quantidade inválidos`);return}
   const e=S.eq.find(x=>nrm(x.nome)===nrm(n));
   if(e){e.total=q;atual++}else{S.eq.push({id:Date.now()+i,nome:n,total:q});novos++}});
  save();renderEq();fillSel();renderLoc();renderMan();
  m.textContent=`Equipamentos: ${novos} novo(s), ${atual} atualizado(s), ${err.length} com erro.`+(err.length?"\n"+err.slice(0,8).join("\n"):"")
 }catch(e){m.textContent="Não foi possível ler o arquivo."}
 $("csvEq").value=""};
$("csvLoc").onchange=async()=>{const f=$("csvLoc").files[0],m=$("csvMsg");if(!f)return;
 try{let R=parseCSV(await lerTexto(f));if(R.length&&isNaN(Number(R[0][3])))R.shift();
  let ok=0,dup=0;const err=[];
  R.forEach((r,i)=>{const [en,cl,tel,qs,ia,fa]=r.map(v=>(v||"").trim()),q=Number(qs),a=pd(ia),b=pd(fa),e=S.eq.find(x=>nrm(x.nome)===nrm(en));
   if(!e){err.push(`Linha ${i+1}: equipamento "${en}" não cadastrado`);return}
   if(!cl){err.push(`Linha ${i+1}: cliente em branco`);return}
   if(!Number.isInteger(q)||q<1){err.push(`Linha ${i+1}: quantidade inválida`);return}
   if(!a||!b||b<a){err.push(`Linha ${i+1}: datas inválidas (use dd/mm/aaaa)`);return}
   if(S.loc.some(l=>l.eq===e.id&&l.cliente===cl&&l.qtd===q&&l.ini===a&&l.fim===b)){dup++;return}
   S.loc.push({id:Date.now()+i,eq:e.id,cliente:cl,tel,qtd:q,ini:a,fim:b});ok++});
  save();renderLoc();
  m.textContent=`Locações: ${ok} importada(s), ${dup} repetida(s) ignorada(s), ${err.length} com erro.`+(err.length?"\n"+err.slice(0,8).join("\n"):"")
 }catch(e){m.textContent="Não foi possível ler o arquivo."}
 $("csvLoc").value=""};
$("mAdd").onclick=()=>{const id=+$("mEq").value,q=+$("mQtd").value,a=$("mIni").value,b=$("mFim").value,m=$("mMsg");
 if(!id||q<1||!a||(b&&b<=a)){m.textContent="Informe equipamento, quantidade e início. A previsão de retorno deve ser depois do início.";return}
 if(q>total(id)){m.textContent=`Só existem ${total(id)} unidade(s) cadastradas.`;return}
 const lim0=b?add(b,-1):S.man.filter(x=>x.eq==id).reduce((mx,x)=>{let y=mx;if(x.ini>y)y=x.ini;if(x.ret){const z=add(x.ret,-1);if(z>y)y=z}return y},a),
   estouro=span(a,lim0).find(d=>emMan(id,d)+q>total(id));
 if(estouro){m.textContent=`Não é possível: em ${fmt(estouro)} já há ${emMan(id,estouro)} un. em manutenção e o estoque total é ${total(id)}. Reduza a quantidade ou ajuste as datas.`;return}
 S.man.push({id:Date.now(),eq:id,qtd:q,ini:a,ret:b||"",motivo:$("mMot").value.trim()});save();
 const lim=b?add(b,-1):S.loc.filter(l=>l.eq==id).reduce((x,l)=>l.fim>x?l.fim:x,a),falta=span(a,lim).find(d=>total(id,d)-emMan(id,d)-used(id,d)<0);
 renderMan();renderLoc();$("mMot").value="";
 m.textContent=falta?`Registrado. Atenção: a partir de ${fmt(falta)} faltam unidades para locações já registradas. Revise-as na aba Locações.`:"Manutenção registrada. O estoque foi atualizado."};
$("edCancel").onclick=fecharEd;
$("edUndo").onclick=()=>{const l=S.loc.find(x=>x.id===edId);if(!l)return;delete l.conf;save();fecharEd();renderLoc();$("lMsg").textContent="Confirmação desfeita. A locação voltou a ficar em andamento."};
$("edSave").onclick=()=>{const l=S.loc.find(x=>x.id===edId),m=$("edMsg");if(!l){fecharEd();return}
 const eq=+$("edEq").value,c=$("edCli").value.trim(),q=+$("edQtd").value,a=$("edIni").value,b=$("edFim").value;
 if(!c||q<1||!a||!b||b<a){m.textContent="Preencha cliente, quantidade e um período válido.";return}
 if(eq!==l.eq||q!==l.qtd||a!==l.ini||b!==l.fim){const min=Math.min(...avail(eq,a,b,l.id).map(x=>x.v));
  if(min<q){m.textContent=`Sem estoque para essa alteração: só ${Math.max(min,0)} unidade(s) livres em todo o período.`;return}}
 Object.assign(l,{eq,cliente:c,tel:$("edTel").value.trim(),qtd:q,ini:a,fim:b});if(l.conf)l.conf.data=b;
 save();fecharEd();renderLoc();$("lMsg").textContent="Locação atualizada."};
const TEMAS=["auto","claro","escuro"],temaViewer=document.documentElement.getAttribute("data-theme");let tema="auto";
function aplicaTema(){const r=document.documentElement;
 if(tema==="auto"){temaViewer?r.setAttribute("data-theme",temaViewer):r.removeAttribute("data-theme")}else r.setAttribute("data-theme",tema==="claro"?"light":"dark");
 $("tema").textContent="Tema: "+tema.replace("auto","automático")}
try{tema=localStorage.getItem("estoque_tema")||"auto"}catch(e){}
$("tema").onclick=()=>{tema=TEMAS[(TEMAS.indexOf(tema)+1)%3];try{localStorage.setItem("estoque_tema",tema)}catch(e){}aplicaTema()};
aplicaTema();
$("hGo").onclick=()=>{hBuscou=true;renderHist()};
["hDe","hAte","hCli"].forEach(i=>$(i).onkeydown=e=>{if(e.key==="Enter")$("hGo").onclick()});
$("hClr").onclick=()=>{["hTipo","hEq","hDe","hAte","hCli"].forEach(i=>$(i).value="");hBuscou=false;renderHist()};
$("qClr").onclick=()=>{$("qEq").selectedIndex=0;$("qQtd").value=1;$("qIni").value="";$("qFim").value="";$("qOut").innerHTML="";$("qIni").focus()};
$("cfgMd").onchange=()=>{S.cfg.mesmoDia=$("cfgMd").checked;save();renderLoc()};
$("dDia").onchange=renderDia;
$("dPrev").onclick=()=>{if($("dDia").value){$("dDia").value=add($("dDia").value,-1);renderDia()}};
$("dNext").onclick=()=>{if($("dDia").value){$("dDia").value=add($("dDia").value,1);renderDia()}};
$("dHoje").onclick=()=>{$("dDia").value=hojeLocal();renderDia()};
$("dOut").onclick=e=>{const b=e.target.closest("[data-vc]");if(!b)return;
 const [id,tipo]=b.dataset.vc.split("|"),l=S.loc.find(x=>x.id==id),h0=hojeLocal();
 l.fim=l.fim<h0?h0:l.fim;l.conf={tipo,data:l.fim};save();renderLoc();
 $("lMsg").textContent=`${tipo} confirmada. ${l.qtd} un. de ${eqName(l.eq)} livres a partir de ${fmt(add(l.fim,1))}.`};
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
 ["disp","nova","loc","hist","man","eq","dados","usr"].forEach(t=>$(t).classList.toggle("hidden",t!==b.dataset.t));if(b.dataset.t==="usr")renderUsuarios()});

// ================= LOGIN, SESSÃO E USUÁRIOS =================
const mostrar=(id,v)=>$(id).classList.toggle("hidden",!v);
async function api(url,method,body){
  const r=await fetch(url,{method:method||"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let d={};try{d=await r.json()}catch(e){}
  if(r.status===401&&logado)sessaoExpirada();
  return {ok:r.ok,status:r.status,d};
}
function mostrarLogin(setup,msg,me){
  me=me||{};
  logado=false;mostrar("appArea",false);mostrar("loginArea",true);
  $("loginTitulo").textContent=setup?"Primeiro acesso: criar administrador":"Acesso ao sistema";
  $("loginAviso").textContent=!setup?"":me.setup_bloqueado?"Este servidor ainda não tem o código de instalação configurado. No Render, confira a variável SETUP_TOKEN em Environment e reinicie.":"Ainda não há usuários. Crie a conta do administrador; depois, ele cadastra os demais usuários na aba Usuários.";
  mostrar("loginAviso",setup);mostrar("loginPass2Box",setup);mostrar("loginTokenBox",setup&&!!me.precisa_token);mostrar("btnSetup",setup&&!me.setup_bloqueado);mostrar("btnLogin",!setup);
  $("loginMsg").textContent=msg||"";$("loginMsg").style.color="var(--bad)";
  $("loginUser").focus();
}
function sessaoExpirada(){if(!logado)return;mostrarLogin(false,"Sua sessão expirou. Entre novamente.")}
async function checarUsuario(){
  try{
    const {d}=await api("/api/me");
    if(d.logged_in){
      eAdmin=!!d.is_admin;
      $("userDisplay").textContent=d.username+(eAdmin?" (administrador)":"");
      mostrar("tabUsr",eAdmin);mostrar("bkDbBox",eAdmin);mostrar("avisoTeste",!!d.teste_temporario);
      mostrar("loginArea",false);mostrar("appArea",true);logado=true;
      await iniciarApp();
    }else mostrarLogin(!!d.precisa_admin,"",d);
  }catch(e){console.error(e);mostrarLogin(false,"Não foi possível conectar ao servidor.")}
}
async function fazerLogin(){
  const u=$("loginUser").value.trim(),p=$("loginPass").value;
  if(!u||!p){$("loginMsg").textContent="Preencha usuário e senha.";return}
  const r=await api("/api/login","POST",{username:u,password:p});
  if(!r.ok){$("loginMsg").textContent=r.d.error||"Não foi possível entrar.";return}
  $("loginPass").value="";await checarUsuario();
}
async function criarAdmin(){
  const u=$("loginUser").value.trim(),p=$("loginPass").value,p2=$("loginPass2").value;
  if(!u||!p){$("loginMsg").textContent="Preencha usuário e senha.";return}
  if(p!==p2){$("loginMsg").textContent="As senhas não conferem.";return}
  const r=await api("/api/setup","POST",{username:u,password:p,token:$("loginToken").value.trim()});
  if(!r.ok){$("loginMsg").textContent=r.d.error||"Não foi possível criar o administrador.";return}
  $("loginPass").value="";$("loginPass2").value="";$("loginToken").value="";await checarUsuario();
}
$("btnLogin").onclick=fazerLogin;
$("btnSetup").onclick=criarAdmin;
["loginUser","loginPass","loginPass2","loginToken"].forEach(i=>$(i).onkeydown=e=>{if(e.key==="Enter")($("btnSetup").classList.contains("hidden")?fazerLogin:criarAdmin)()});
$("bkDb").onclick=()=>{location.href="/api/backup/db"};
$("btnLogout").onclick=async()=>{await api("/api/logout","POST");location.reload()};

$("pwGo").onclick=async()=>{
  const m=$("pwMsg"),a=$("pwAtual").value,n=$("pwNova").value,c=$("pwConf").value;
  if(n!==c){m.textContent="A nova senha e a repetição não conferem.";return}
  const r=await api("/api/me/senha","POST",{atual:a,nova:n});
  m.textContent=r.ok?"Senha alterada com sucesso.":(r.d.error||"Não foi possível alterar a senha.");
  if(r.ok)["pwAtual","pwNova","pwConf"].forEach(i=>$(i).value="");
};

// ---- administração (somente administrador)
const dataLocal=q=>q?new Date(q.replace(" ","T")+"Z").toLocaleString("pt-BR"):"";
async function renderUsuarios(){
  if(!eAdmin)return;
  const r=await api("/api/usuarios");if(!r.ok)return;
  $("uTb").innerHTML=r.d.map(u=>`<tr><td><b>${esc(u.username)}</b></td><td>${u.is_admin?"Administrador":"Usuário"}</td><td><span class="tag ${u.ativo?"ok":"bad"}">${u.ativo?"Ativo":"Inativo"}</span></td><td>${esc(fmt((u.created_at||"").slice(0,10)))}</td><td><input type="password" id="pw${u.id}" placeholder="Nova senha" autocomplete="new-password" style="width:150px"> <button class="g" data-rs="${u.id}">Redefinir senha</button> <button class="g ${u.ativo?"d":""}" data-at="${u.id}" data-v="${u.ativo?0:1}">${u.ativo?"Desativar":"Reativar"}</button></td></tr>`).join("");
  $("uTb").querySelectorAll("[data-rs]").forEach(b=>b.onclick=async()=>{
    const s=$("pw"+b.dataset.rs).value,x=await api(`/api/usuarios/${b.dataset.rs}/senha`,"POST",{senha:s});
    $("uMsg").textContent=x.ok?"Senha redefinida.":(x.d.error||"Erro ao redefinir.");if(x.ok)$("pw"+b.dataset.rs).value="";
  });
  $("uTb").querySelectorAll("[data-at]").forEach(b=>b.onclick=async()=>{
    const x=await api(`/api/usuarios/${b.dataset.at}/ativo`,"POST",{ativo:b.dataset.v==="1"});
    $("uMsg").textContent=x.ok?"Situação atualizada.":(x.d.error||"Erro.");renderUsuarios();
  });
  carregarAuditoria();
}
async function carregarAuditoria(){
  const r=await api("/api/auditoria");if(!r.ok)return;
  $("aTb").innerHTML=r.d.length?r.d.map(a=>`<tr><td>${esc(dataLocal(a.quando))}</td><td><b>${esc(a.usuario)}</b></td><td>${esc(a.acao)}</td></tr>`).join(""):'<tr><td colspan="3">Nenhuma alteração registrada ainda.</td></tr>';
}
$("aAtual").onclick=carregarAuditoria;
$("uAdd").onclick=async()=>{
  const r=await api("/api/usuarios","POST",{username:$("uNome").value.trim(),password:$("uSenha").value,is_admin:$("uPerfil").value==="1"});
  $("uMsg").textContent=r.ok?"Usuário cadastrado.":(r.d.error||"Não foi possível cadastrar.");
  if(r.ok){$("uNome").value="";$("uSenha").value="";renderUsuarios()}
};

// ---- inicialização depois do login
async function iniciarApp(){
  try{
    await load();
    S.man=S.man||[];S.cfg=S.cfg||{mesmoDia:true};
    $("cfgMd").checked=S.cfg.mesmoDia;
    const hoje=hojeLocal(),def=(id,v)=>{if(!$(id).value)$(id).value=v};
    def("mIni",hoje);def("dDia",hoje);def("qIni",add(hoje,7));def("qFim",add(hoje,14));def("nIni",hoje);def("nFim",add(hoje,7));
    status("Conectado");
    fillSel();renderLoc();renderEq();renderMan();renderBk();
    if(!timersOk){
      timersOk=true;
      setInterval(tick,5000);
      document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick()});
      window.addEventListener("focus",tick);
    }
  }catch(e){console.error(e)}
}
checarUsuario();