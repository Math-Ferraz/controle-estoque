const $=id=>document.getElementById(id);

const esc=v=>String(v??"").replace(
  /[&<>"']/g,
  c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c])
);

// ============================================================
// NORMALIZAÇÃO
// ============================================================

function nrm(x){
  return String(x??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim();
}

// ============================================================
// ESTADO
// ============================================================

let S={
  eq:[],
  loc:[],
  man:[],
  cfg:{
    mesmoDia:true
  },
  categorias:[]
};

let REV=0,salvando=false,pendente=false,bloqueado=false;

const status=t=>{
  const el=$("dbStatus");
  if(el)el.textContent=t;
};

let logado=false,eAdmin=false,timersOk=false;


// ============================================================
// CATEGORIAS
// ============================================================

function garantirCategorias(){

  if(!Array.isArray(S.categorias)){
    S.categorias=[];
  }

  const existe=S.categorias.some(c=>
    nrm(c.nome)==="sem categoria"
  );

  if(!existe){
    S.categorias.unshift({
      id:"sem-categoria",
      nome:"Sem categoria"
    });
  }

  // Compatibilidade com equipamentos antigos
  if(Array.isArray(S.eq)){

    S.eq.forEach(e=>{

      if(!e.categoriaId){

        e.categoriaId="sem-categoria";

      }

    });

  }
}

function categoriaPorId(id){

  return S.categorias.find(c=>
    String(c.id)===String(id)
  )||{
    id:"sem-categoria",
    nome:"Sem categoria"
  };

}

function nomeCategoria(id){

  return categoriaPorId(id).nome;

}

function ordenarCategorias(){

  S.categorias.sort((a,b)=>{

    if(String(a.id)==="sem-categoria")return -1;
    if(String(b.id)==="sem-categoria")return 1;

    return String(a.nome||"").localeCompare(
      String(b.nome||""),
      "pt-BR",
      {
        sensitivity:"base",
        numeric:true
      }
    );

  });

}

function preencherCategorias(){

  garantirCategorias();
  ordenarCategorias();

  const select=$("eCategoria");

  if(select){

    const atual=select.value;

    select.innerHTML=S.categorias.map(c=>
      `<option value="${esc(c.id)}">${esc(c.nome)}</option>`
    ).join("");

    if(
      atual &&
      S.categorias.some(c=>String(c.id)===String(atual))
    ){
      select.value=atual;
    }else{
      select.value="sem-categoria";
    }

  }

  const filtro=$("eCategoriaFiltro");

  if(filtro){

    const atual=filtro.value;

    filtro.innerHTML=
      `<option value="">Todas as categorias</option>`+
      S.categorias.map(c=>
        `<option value="${esc(c.id)}">${esc(c.nome)}</option>`
      ).join("");

    if(
      atual &&
      S.categorias.some(c=>String(c.id)===String(atual))
    ){
      filtro.value=atual;
    }else{
      filtro.value="";
    }

  }

}

function renderCategorias(){

  const tb=$("catTb");

  if(!tb)return;

  garantirCategorias();
  ordenarCategorias();

  tb.innerHTML=S.categorias.map(c=>{

    const qtd=S.eq.filter(e=>
      String(e.categoriaId||"sem-categoria")===String(c.id)
    ).length;

    const protegida=String(c.id)==="sem-categoria";

    return `
      <tr>
        <td><b>${esc(c.nome)}</b></td>
        <td>${qtd}</td>
        <td>
          ${
            protegida
            ?
            `<span class="tag">Categoria padrão</span>`
            :
            `
              <button
                class="g"
                data-cat-edit="${esc(c.id)}">
                Renomear
              </button>

              <button
                class="g d"
                data-cat-del="${esc(c.id)}">
                Excluir
              </button>
            `
          }
        </td>
      </tr>
    `;

  }).join("");

  tb.querySelectorAll("[data-cat-edit]").forEach(b=>{

    b.onclick=()=>{

      const id=b.dataset.catEdit;

      const c=S.categorias.find(x=>
        String(x.id)===String(id)
      );

      if(!c)return;

      const antigo=c.nome;

      const novo=prompt(
        "Novo nome da categoria:",
        antigo
      );

      if(novo===null)return;

      const nome=novo.trim();

      if(!nome){

        const m=$("catMsg");

        if(m)m.textContent=
          "Informe um nome válido.";

        return;

      }

      const duplicada=S.categorias.some(x=>
        String(x.id)!==String(id)&&
        nrm(x.nome)===nrm(nome)
      );

      if(duplicada){

        const m=$("catMsg");

        if(m)m.textContent=
          "Já existe outra categoria com esse nome.";

        return;

      }

      c.nome=nome;

      save();

      preencherCategorias();
      renderCategorias();
      renderEq();

      const m=$("catMsg");

      if(m)m.textContent=
        `Categoria alterada de "${antigo}" para "${nome}".`;

    };

  });


  tb.querySelectorAll("[data-cat-del]").forEach(b=>{

    b.onclick=()=>{

      const id=b.dataset.catDel;

      const c=S.categorias.find(x=>
        String(x.id)===String(id)
      );

      if(!c)return;

      if(String(c.id)==="sem-categoria"){

        const m=$("catMsg");

        if(m)m.textContent=
          'A categoria "Sem categoria" não pode ser excluída.';

        return;

      }

      const equipamentos=S.eq.filter(e=>
        String(e.categoriaId||"sem-categoria")===String(id)
      );

      let mensagem=
        `Excluir a categoria "${c.nome}"?`;

      if(equipamentos.length){

        mensagem+=
          `\n\n${equipamentos.length} equipamento(s) serão movidos para "Sem categoria".`;

      }

      if(!confirm(mensagem))return;

      equipamentos.forEach(e=>{
        e.categoriaId="sem-categoria";
      });

      S.categorias=S.categorias.filter(x=>
        String(x.id)!==String(id)
      );

      garantirCategorias();
      ordenarCategorias();

      save();

      preencherCategorias();
      renderCategorias();
      renderEq();

      const m=$("catMsg");

      if(m)m.textContent=
        `Categoria "${c.nome}" excluída.`;

    };

  });

}

function adicionarCategoria(){

  const input=$("catNome");

  if(!input)return;

  const nome=input.value.trim();

  const m=$("catMsg");

  if(!nome){

    if(m)m.textContent=
      "Informe o nome da categoria.";

    input.focus();

    return;

  }

  garantirCategorias();

  if(S.categorias.some(c=>
    nrm(c.nome)===nrm(nome)
  )){

    if(m)m.textContent=
      "Já existe uma categoria com esse nome.";

    input.focus();

    return;

  }

  S.categorias.push({
    id:Date.now(),
    nome
  });

  ordenarCategorias();

  input.value="";

  save();

  preencherCategorias();
  renderCategorias();
  renderEq();

  if(m)m.textContent=
    `Categoria "${nome}" adicionada.`;

}


// ============================================================
// PERSISTÊNCIA
// ============================================================

async function persistir(){

  if(salvando){
    pendente=true;
    return;
  }

  salvando=true;

  do{

    pendente=false;

    try{

      const r=await fetch(
        "/api/state",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "X-Rev":String(REV)
          },
          body:JSON.stringify(S)
        }
      );

      if(r.status===401){

        sessaoExpirada();

        break;

      }

      if(r.status===409){

        pendente=false;

        await recarregar(true);

        alert(
          "Outra pessoa salvou uma alteração no mesmo instante. " +
          "A tela foi atualizada com os dados mais recentes e a sua " +
          "última alteração NÃO foi gravada. Confira e refaça, se necessário."
        );

        break;

      }

      if(!r.ok){

        throw new Error("HTTP "+r.status);

      }

      REV=(await r.json()).rev;

      if(!pendente){

        status("Salvo no servidor");

      }

    }catch(e){

      console.error("Erro ao salvar:",e);

      if(!logado)break;

      status(
        "ERRO ao salvar. Verifique o servidor"
      );

      alert(
        "Não foi possível salvar no banco. " +
        "Verifique se o servidor (iniciar.bat) continua aberto. " +
        "As últimas alterações podem não ter sido gravadas."
      );

      break;

    }

  }while(pendente);

  salvando=false;

}

function save(){

  if(bloqueado){

    status("Conflito: recarregue a página");

    return;

  }

  status("Salvando…");

  persistir();

}

let offline=false;

function renderTudo(){

  garantirCategorias();

  preencherCategorias();

  fillSel();

  const cfg=$("cfgMd");

  if(cfg)cfg.checked=S.cfg.mesmoDia;

  renderLoc();
  renderEq();
  renderMan();
  renderBk();
  renderCategorias();

  if(
    edId &&
    !S.loc.some(x=>x.id===edId)
  ){
    fecharEd();
  }

}

async function recarregar(force){

  const r=await fetch(
    "/api/state",
    {
      cache:"no-store"
    }
  );

  if(r.status===401){

    sessaoExpirada();

    return false;

  }

  if(!r.ok){

    throw new Error(
      "HTTP "+r.status
    );

  }

  const nr=+(r.headers.get("X-Rev")||0);
  const d=await r.json();

  if(!d)return false;

  if(
    !force &&
    (salvando||pendente)
  ){
    return false;
  }

  S=d;

  S.man=S.man||[];

  S.cfg=S.cfg||{
    mesmoDia:true
  };

  garantirCategorias();

  REV=nr;

  renderTudo();

  return true;

}

async function sincronizar(){

  if(salvando||pendente)return;

  try{

    const r=await fetch(
      "/api/rev",
      {
        cache:"no-store"
      }
    );

    if(r.status===401){

      sessaoExpirada();

      return;

    }

    if(!r.ok){

      throw new Error(
        "HTTP "+r.status
      );

    }

    const {rev}=await r.json();

    if(offline){

      offline=false;

      status("Salvo no servidor");

    }

    if(rev===REV)return;

    const a=document.activeElement;

    if(
      a &&
      a.closest &&
      a.closest("#lTb,#eTb,#mTb")
    ){
      return;
    }

    if(await recarregar(false)){

      status(
        "Atualizado com alterações de outra pessoa"
      );

    }

  }catch(e){

    offline=true;

    status(
      "Sem conexão com o servidor"
    );

  }

}


// ============================================================
// DATAS
// ============================================================

function iso(d){

  return d.toISOString().slice(0,10);

}

function hojeLocal(){

  const d=new Date();

  const z=n=>
    String(n).padStart(2,"0");

  return (
    d.getFullYear()+
    "-"+
    z(d.getMonth()+1)+
    "-"+
    z(d.getDate())
  );

}

function add(s,n){

  const d=new Date(
    s+"T00:00:00Z"
  );

  d.setUTCDate(
    d.getUTCDate()+n
  );

  return iso(d);

}

function fmt(s){

  if(!s)return "";

  return s.split("-").reverse().join("/");

}

function span(a,b){

  const r=[];

  for(
    let d=a;
    d<=b;
    d=add(d,1)
  ){

    r.push(d);

  }

  return r;

}


// ============================================================
// ESTOQUE
// ============================================================

const eqName=id=>
  (
    S.eq.find(e=>e.id==id)||
    {nome:"?"}
  ).nome;

function emMan(id,day){

  return (S.man||[]).reduce(
    (t,m)=>{

      const ativa=
        String(m.eq)===String(id)&&
        String(m.ini||"")<=String(day||"")&&
        (!m.ret||
          String(m.ret)>String(day||"")
        );

      return t+
        (
          ativa?
          (Number(m.qtd)||0):
          0
        );

    },
    0
  );

}

const total=(id,day)=>{

  const b=
    (
      S.eq.find(e=>e.id==id)||
      {total:0}
    ).total;

  return b;

};

function used(id,day,skip,ext){

  return S.loc.reduce(
    (s,l)=>{

      if(
        l.eq!=id||
        l.id===skip
      ){
        return s;
      }

      const fim=
        ext&&ext(l)||
        l.fim;

      return s+
        (
          l.ini<=day &&
          (
            day<fim||
            (
              day===fim&&
              (
                !S.cfg.mesmoDia||
                l.ini===fim
              )
            )
          )
          ?
          l.qtd:
          0
        );

    },
    0
  );

}

function dias(a,b){

  return S.cfg.mesmoDia&&b>a
    ?span(a,add(b,-1))
    :span(a,b);

}

function avail(id,a,b,skip){

  return dias(a,b).map(d=>({
    d,
    v:
      total(id,d)-
      emMan(id,d)-
      used(id,d,skip)
  }));

}

function ranges(arr){

  const out=[];

  arr.forEach(x=>{

    const l=out[out.length-1];

    if(
      l&&
      l.v===x.v&&
      add(l.b,1)===x.d
    ){

      l.b=x.d;

    }else{

      out.push({
        a:x.d,
        b:x.d,
        v:x.v
      });

    }

  });

  return out;

}


// ============================================================
// SELECTS
// ============================================================

function fillSel(){

  garantirCategorias();

  const o=S.eq
    .slice()
    .sort((a,b)=>
      String(a.nome||"").localeCompare(
        String(b.nome||""),
        "pt-BR",
        {
          sensitivity:"base",
          numeric:true
        }
      )
    )
    .map(e=>
      `<option value="${e.id}">
        ${esc(e.nome)}
      </option>`
    )
    .join("");

  [
    "qEq",
    "nEq",
    "edEq",
    "mEq"
  ].forEach(i=>{

    const el=$(i);

    if(!el)return;

    const v=el.value;

    el.innerHTML=o;

    if(v)el.value=v;

  });

  const hEq=$("hEq");

  if(hEq){

    const hv=hEq.value;

    hEq.innerHTML=
      '<option value="">Todos</option>'+
      o;

    hEq.value=hv;

  }

  preencherCategorias();

}


// ============================================================
// CONSULTA DE DISPONIBILIDADE
// ============================================================

function consultar(){

  const id=+$("qEq").value;
  const q=+$("qQtd").value;
  const a=$("qIni").value;
  const b=$("qFim").value;
  const o=$("qOut");

  if(!a||!b||b<a||q<1){

    o.innerHTML=
      '<div class="box warn">'+
      'Informe o equipamento, a quantidade e um período válido.'+
      '</div>';

    return;

  }

  const diasConsulta=dias(a,b);

  const saldo=diasConsulta.map(d=>({

    d,

    total:total(id,d),

    alugado:used(id,d),

    manut:emMan(id,d),

    disponivel:
      Math.max(
        0,
        total(id,d)-
        used(id,d)-
        emMan(id,d)
      )

  }));

  const min=Math.min(
    ...saldo.map(x=>x.disponivel)
  );

  const tot=total(id);

  const locMax=Math.max(
    ...saldo.map(x=>x.alugado),
    0
  );

  const manMax=Math.max(
    ...saldo.map(x=>x.manut),
    0
  );

  const naJanela=S.loc
    .filter(
      l=>
        l.eq==id&&
        l.ini<=b&&
        l.fim>=a
    )
    .sort(
      (x,y)=>
        x.ini.localeCompare(y.ini)
    );

  const h0=hojeLocal();

  const risco=S.loc.filter(
    l=>
      l.eq==id&&
      !l.conf&&
      l.fim>=h0&&
      l.fim<b
  );

  const cons=Math.min(
    ...diasConsulta.map(d=>
      Math.max(
        0,
        total(id,d)-
        used(
          id,
          d,
          null,
          l=>
            !l.conf&&
            l.fim>=h0&&
            l.fim<b
            ?b
            :l.fim
        )-
        emMan(id,d)
      )
    )
  );

  const cond=
    min>=q&&
    cons<q;

  const cls=
    min<q
      ?"bad"
      :cond
        ?"warn"
        :"ok";

  let h=`
    <div class="box ${cls}">
      <div class="big">
        ${
          min<q
            ?"Indisponível"
            :cond
              ?"Disponível, com ressalvas"
              :"Disponível"
        }
      </div>
  `;

  if(min<q){

    h+=
      `Não atende <b>${q} unidade(s)</b> durante todo o período. `+
      `O menor saldo disponível é <b>${Math.max(min,0)}</b>.`;

  }else if(cond){

    h+=
      `Há <b>${q} unidade(s)</b> disponíveis de `+
      `${fmt(a)} a ${fmt(b)}, mas parte dessa disponibilidade `+
      `depende de devoluções no prazo. Se alguma locação for `+
      `renovada, o saldo poderá cair para <b>${Math.max(cons,0)}</b>.`;

  }else{

    h+=
      `Dá para atender <b>${q} unidade(s)</b> de `+
      `${fmt(a)} a ${fmt(b)}, mesmo considerando as locações `+
      `existentes e os equipamentos em manutenção.`;

  }

  h+="</div>";

  const st=(n,t,c)=>
    `<div class="box ${c}" style="margin:0;border:1px solid var(--line)">
      <div class="big">${n}</div>
      ${t}
    </div>`;

  h+=`
    <div class="row" style="align-items:stretch;margin-top:12px">
      ${st(tot,"total em estoque","")}
      ${st(Math.max(min,0),"disponíveis durante todo o período","ok")}
      ${st(locMax,"alugados (máximo no período)","warn")}
      ${st(manMax,"em manutenção (máximo no período)","bad")}
    </div>
  `;

  h+=
    `<h2 style="margin-top:14px">
      Locações no período (${naJanela.length})
    </h2>`+
    (
      naJanela.length
      ?
      `<div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Qtd</th>
              <th>Período</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>`+
          naJanela.map(l=>`
            <tr>
              <td>
                <b>${esc(l.cliente)}</b>
                ${
                  l.tel
                  ?`<br><small>${esc(l.tel)}</small>`
                  :""
                }
              </td>
              <td>${l.qtd}</td>
              <td>${fmt(l.ini)} a ${fmt(l.fim)}</td>
              <td>
                ${
                  l.conf
                  ?l.conf.tipo+" confirmada"
                  :l.ini>h0
                    ?"Reservada"
                    :"Em andamento"
                }
              </td>
            </tr>
          `).join("")+
          `</tbody>
        </table>
      </div>`
      :
      " <small>Nenhuma locação neste período.</small>"
    );

  h+=`
    <h2 style="margin-top:14px">
      Disponibilidade por período
    </h2>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Período</th>
            <th>Disponível</th>
            <th>Alugado</th>
            <th>Manutenção</th>
          </tr>
        </thead>
        <tbody>
  `;

  const detalhado=[];

  saldo.forEach(x=>{

    const ultimo=
      detalhado[detalhado.length-1];

    if(
      ultimo&&
      ultimo.disponivel===x.disponivel&&
      ultimo.alugado===x.alugado&&
      ultimo.manut===x.manut&&
      add(ultimo.b,1)===x.d
    ){

      ultimo.b=x.d;

    }else{

      detalhado.push({
        a:x.d,
        b:x.d,
        disponivel:x.disponivel,
        alugado:x.alugado,
        manut:x.manut
      });

    }

  });

  h+=detalhado.map(r=>`
    <tr>
      <td>
        ${
          r.a===r.b
          ?fmt(r.a)
          :fmt(r.a)+" a "+fmt(r.b)
        }
      </td>
      <td><b>${r.disponivel}</b></td>
      <td>${r.alugado}</td>
      <td>${r.manut}</td>
    </tr>
  `).join("");

  h+=`
        </tbody>
      </table>
    </div>
  `;

  if(risco.length){

    h+=`
      <h2 style="margin-top:14px">
        ${
          cond
          ?"Devoluções que impactam a disponibilidade"
          :"Devoluções previstas até o fim do período"
        }
      </h2>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Qtd</th>
              <th>Devolve em</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${
              risco.map(l=>`
                <tr>
                  <td>
                    <b>${esc(l.cliente)}</b>
                    ${
                      l.tel
                      ?`<br><small>${esc(l.tel)}</small>`
                      :""
                    }
                  </td>
                  <td>${l.qtd}</td>
                  <td>${fmt(l.fim)}</td>
                  <td>Confirmar com o cliente</td>
                </tr>
              `).join("")
            }
          </tbody>
        </table>
      </div>
    `;

  }

  if(min>=q){

    h+=`
      <div class="row" style="margin-top:12px">

        <label>
          Reservar para o cliente
          <input
            id="rCli"
            placeholder="Nome do cliente">
        </label>

        <label>
          Telefone
          <input id="rTel" type="tel">
        </label>

        <label>
          Quantidade
          <input
            id="rQtd"
            type="number"
            min="1"
            max="${Math.max(min,1)}"
            value="${Math.min(q,min)}"
            style="min-width:90px">
        </label>

        <button class="b" id="rGo">
          ${cond?"Reservar com ressalva":"Reservar"}
          <span id="rQtdTxt">${Math.min(q,min)}</span> un.
        </button>

      </div>

      <div class="msg" id="rMsg"></div>
    `;

  }

  o.innerHTML=h;

  if($("rQtd")){

    const atualizarQtd=()=>{

      let v=
        parseInt(
          $("rQtd").value,
          10
        )||1;

      v=Math.max(
        1,
        Math.min(v,min)
      );

      $("rQtd").value=v;

      $("rQtdTxt").textContent=v;

    };

    $("rQtd").oninput=atualizarQtd;
    $("rQtd").onchange=atualizarQtd;

  }

  if($("rGo")){

    $("rGo").onclick=()=>{

      const c=$("rCli").value.trim();

      if(!c){

        $("rMsg").textContent=
          "Informe o nome do cliente.";

        return;

      }

      const rq=Math.max(
        1,
        Math.min(
          parseInt(
            $("rQtd").value,
            10
          )||1,
          min
        )
      );

      S.loc.push({
        id:Date.now(),
        eq:id,
        cliente:c,
        tel:$("rTel").value.trim(),
        qtd:rq,
        ini:a,
        fim:b
      });

      save();

      renderLoc();

      consultar();

      $("rMsg").textContent=
        "Reserva registrada.";

    };

  }

}


// ============================================================
// DEPENDÊNCIAS DE LOCAÇÃO
// ============================================================

function deps(l){

  const h0=hojeLocal();

  if(
    l.conf||
    l.ini<h0
  ){
    return [];
  }

  const ext=x=>
    !x.conf&&
    x.fim>=h0&&
    x.fim<l.fim
      ?l.fim
      :x.fim;

  if(
    !dias(l.ini,l.fim).some(
      d=>
        total(l.eq,d)-
        emMan(l.eq,d)-
        used(l.eq,d,l.id,ext)<
        l.qtd
    )
  ){
    return [];
  }

  return S.loc.filter(
    x=>
      x.eq==l.eq&&
      x.id!==l.id&&
      !x.conf&&
      x.fim>=h0&&
      x.fim<l.fim
  );

}

const nomes=(L,r)=>
  L.map(
    x=>
      esc(x.cliente)+
      " ("+
      fmt(x.fim)+
      (
        r&&
        x.fim===r.ini
          ?", mesmo dia do início"
          :""
      )+
      ")"
  ).join(", ");

function notaSai(l){

  const dp=deps(l);

  const m=S.loc.filter(
    x=>
      x.eq==l.eq&&
      x.id!==l.id&&
      x.fim===l.ini&&
      !x.conf
  );

  return dp.length
    ?
    `<div>
      <span class="tag warn">
        Depende da devolução de ${nomes(dp,l)}
      </span>
    </div>`
    :
    m.length
      ?
      `<div>
        <small>
          Mesmo dia: devolução de ${
            m.map(x=>esc(x.cliente)).join(", ")
          }
        </small>
      </div>`
      :
      "";

}

function notaVol(l){

  const m=S.loc.filter(
    x=>
      x.eq==l.eq&&
      x.id!==l.id&&
      x.ini===l.fim
  );

  return m.length
    ?
    `<div>
      <small>
        Mesmo dia: sai para ${
          m.map(x=>esc(x.cliente)).join(", ")
        }
      </small>
    </div>`
    :
    "";

}


// ============================================================
// MOVIMENTAÇÃO DO DIA
// ============================================================

function renderDia(){

  const d=$("dDia").value;
  const h0=hojeLocal();

  if(!d)return;

  const sai=S.loc.filter(
    l=>l.ini===d
  );

  const vol=S.loc.filter(
    l=>l.fim===d
  );

  const atr=
    d===h0
    ?
    S.loc.filter(
      l=>
        !l.conf&&
        l.fim<h0
    )
    :
    [];

  const it=(l,x)=>
    `<div class="it">
      <b>
        ${l.qtd}× ${esc(eqName(l.eq))}
      </b>
      <br>
      <small>
        <b>${esc(l.cliente)}</b>
        ${
          l.tel
          ?" · "+esc(l.tel)
          :""
        }
        ${
          x&&x.per
          ?" · até "+fmt(l.fim)
          :""
        }
        ${
          x&&x.atr
          ?" · devolução prevista "+fmt(l.fim)
          :""
        }
      </small>
      ${x&&x.b||""}
    </div>`;

  const btn=l=>
    l.conf
    ?
    `<div>
      <span class="tag ok">
        ✔ ${l.conf.tipo} confirmada
      </span>
    </div>`
    :
    `<div style="margin-top:4px">
      <button
        class="g"
        data-vc="${l.id}|Devolução">
        Devolução confirmada
      </button>

      <button
        class="g"
        data-vc="${l.id}|Retirada">
        Retirada confirmada
      </button>
    </div>`;

  const col=(t,c,list,vazio)=>
    `<div class="col">
      <h3>${t} (${list.length})</h3>
      ${
        c.length
        ?c.join("")
        :"<small>"+vazio+"</small>"
      }
    </div>`;

  let h=
    col(
      "Saem do estoque",
      sai.map(
        l=>it(
          l,
          {
            per:1,
            b:notaSai(l)
          }
        )
      ),
      sai,
      "Nenhuma saída neste dia."
    );

  h+=
    col(
      "Voltam ao estoque",
      vol.map(
        l=>it(
          l,
          {
            b:
              notaVol(l)+
              btn(l)
          }
        )
      ),
      vol,
      "Nenhuma devolução ou retirada neste dia."
    );

  if(atr.length){

    h+=`
      <div class="col bad">
        <h3>Em atraso (${atr.length})</h3>
        ${
          atr.map(
            l=>
              it(
                l,
                {
                  atr:1,
                  b:btn(l)
                }
              )
          ).join("")
        }
      </div>
    `;

  }

  $("dOut").innerHTML=h;

}


// ============================================================
// HISTÓRICO
// ============================================================

let hBuscou=false;

const norm=x=>
  String(x??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase();

function renderHist(){

  if(!hBuscou){

    $("hOut").innerHTML="";

    return;

  }

  const t=$("hTipo").value;
  const e=$("hEq").value;
  const de=$("hDe").value;
  const ate=$("hAte").value;
  const c=norm(
    $("hCli").value.trim()
  );

  const L=S.loc
    .filter(
      l=>
        l.conf&&
        (!t||l.conf.tipo===t)&&
        (!e||l.eq==e)&&
        (!de||l.conf.data>=de)&&
        (!ate||l.conf.data<=ate)&&
        (
          !c||
          norm(
            l.cliente+
            " "+
            (l.tel||"")
          ).includes(c)
        )
    )
    .sort(
      (x,y)=>
        y.conf.data.localeCompare(
          x.conf.data
        )
    );

  $("hOut").innerHTML=
    `<div class="msg">
      ${L.length} registro(s)
    </div>`+
    (
      L.length
      ?
      `<div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Equipamento</th>
              <th>Qtd</th>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>Período da locação</th>
            </tr>
          </thead>
          <tbody>
            ${
              L.map(l=>`
                <tr>
                  <td>${fmt(l.conf.data)}</td>
                  <td>${l.conf.tipo}</td>
                  <td>${esc(eqName(l.eq))}</td>
                  <td>${l.qtd}</td>
                  <td>${esc(l.cliente)}</td>
                  <td>${esc(l.tel||"-")}</td>
                  <td>
                    ${fmt(l.ini)} a ${fmt(l.fim)}
                  </td>
                </tr>
              `).join("")
            }
          </tbody>
        </table>
      </div>`
      :
      "<small>Nenhuma devolução ou retirada confirmada com esses filtros.</small>"
    );

}


// ============================================================
// EDIÇÃO DE LOCAÇÃO
// ============================================================

let edId=null;

function abrirEd(id){

  const l=S.loc.find(
    x=>x.id==id
  );

  if(!l)return;

  edId=l.id;

  $("edEq").value=l.eq;
  $("edCli").value=l.cliente;
  $("edTel").value=l.tel||"";
  $("edQtd").value=l.qtd;
  $("edIni").value=l.ini;
  $("edFim").value=l.fim;

  $("edUndo").classList.toggle(
    "hidden",
    !l.conf
  );

  $("edMsg").textContent="";

  $("edSec").classList.remove(
    "hidden"
  );

  $("edSec").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });

  $("edCli").focus();

}

function fecharEd(){

  edId=null;

  $("edSec").classList.add(
    "hidden"
  );

}


// ============================================================
// STATUS DA LOCAÇÃO
// ============================================================

function statusLocacao(l){

  const hoje=hojeLocal();

  if(l.conf){

    return {
      texto:
        `${l.conf.tipo} confirmada em ${fmt(l.conf.data)}`,
      classe:"ok"
    };

  }

  if(l.ini>hoje){

    return {
      texto:"Futura / reservada",
      classe:"warn"
    };

  }

  if(l.fim<hoje){

    return {
      texto:"Em atraso",
      classe:"bad"
    };

  }

  return {
    texto:"Em andamento",
    classe:"ok"
  };

}


// ============================================================
// PESQUISA DE CLIENTE NAS LOCAÇÕES
// ============================================================

function renderPesquisaCliente(){

  const input=$("lBuscaCli");

  const msg=$("lBuscaMsg");

  if(!input)return;

  const busca=nrm(input.value);

  if(!busca){

    if(msg){
      msg.textContent=
        `${S.loc.length} locação(ões) cadastrada(s).`;
    }

    return;

  }

  const qtd=S.loc.filter(
    l=>
      nrm(
        l.cliente+
        " "+
        (l.tel||"")
      ).includes(busca)
  ).length;

  if(msg){

    msg.textContent=
      `${qtd} locação(ões) encontradas para "${input.value.trim()}".`;

  }

}

function limparPesquisaCliente(){

  const input=$("lBuscaCli");

  if(input){

    input.value="";

  }

  renderLoc();

  if(input){

    input.focus();

  }

}


// ============================================================
// MANUTENÇÃO
// ============================================================

function renderMan(){

  const h0=hojeLocal();

  const st=m=>
    m.ret&&m.ret<=h0
      ?"Concluída"
      :m.ini>h0
        ?"Agendada"
        :"Em manutenção";

  const L=[...S.man].sort(
    (x,y)=>
      (st(x)==="Concluída")-
      (st(y)==="Concluída")||
      y.ini.localeCompare(x.ini)
  );

  const hoje=S.eq
    .filter(
      e=>emMan(e.id,h0)>0
    )
    .map(
      e=>
        `<b>${esc(e.nome)}</b>: `+
        `${emMan(e.id,h0)} de ${e.total}`
    )
    .join(" · ");

  $("mResumo").innerHTML=
    hoje
    ?"Em manutenção hoje: "+hoje
    :"Nenhum equipamento em manutenção hoje.";

  $("mTb").innerHTML=
    L.length
    ?
    L.map(m=>{

      const t=st(m);

      return `
        <tr>

          <td>
            <b>${esc(eqName(m.eq))}</b>
          </td>

          <td>${m.qtd}</td>

          <td>
            ${fmt(m.ini)}
            ${
              m.ret
              ?" · retorna em "+fmt(m.ret)
              :" · sem previsão de retorno"
            }
          </td>

          <td>
            ${esc(m.motivo||"-")}
          </td>

          <td>
            <span class="tag ${
              t==="Concluída"
                ?"ok"
                :t==="Agendada"
                  ?"warn"
                  :"bad"
            }">
              ${t}
            </span>
          </td>

          <td>
            ${
              t==="Concluída"
              ?
              ""
              :
              `
                <input
                  type="date"
                  id="mr${m.id}"
                  value="${h0}"
                  style="width:150px">

                <button
                  class="g"
                  data-mr="${m.id}">
                  Voltou ao estoque
                </button>
              `
            }

            <button
              class="g d"
              data-mx="${m.id}">
              Excluir
            </button>

          </td>

        </tr>
      `;

    }).join("")
    :
    `<tr>
      <td colspan="6">
        Nenhuma manutenção registrada.
      </td>
    </tr>`;

  $("mTb")
    .querySelectorAll("[data-mr]")
    .forEach(b=>{

      b.onclick=()=>{

        const m=S.man.find(
          x=>x.id==b.dataset.mr
        );

        const d=$("mr"+m.id).value;

        if(!d){

          $("mLst").textContent=
            "Informe a data de retorno.";

          return;

        }

        m.ret=d;

        save();

        renderMan();
        renderLoc();

        $("mLst").textContent=
          `${m.qtd} un. de ${eqName(m.eq)} `+
          `voltam ao estoque em ${fmt(d)}.`;

      };

    });

  $("mTb")
    .querySelectorAll("[data-mx]")
    .forEach(b=>{

      b.onclick=()=>{

        S.man=S.man.filter(
          x=>x.id!=b.dataset.mx
        );

        save();

        renderMan();
        renderLoc();

        $("mLst").textContent=
          "Manutenção excluída. O estoque foi recalculado.";

      };

    });

}


// ============================================================
// LOCAÇÕES
// ============================================================

function renderLoc(){

  renderDia();
  renderHist();

  const busca=nrm(
    ($("lBuscaCli")?.value)||""
  );

  let rows=[...S.loc];

  if(busca){

    rows=rows.filter(
      l=>
        nrm(
          l.cliente+
          " "+
          (l.tel||"")
        ).includes(busca)
    );

  }

  rows.sort((a,b)=>{

    const ca=nrm(a.cliente);
    const cb=nrm(b.cliente);

    const cmpCliente=
      ca.localeCompare(
        cb,
        "pt-BR",
        {
          sensitivity:"base"
        }
      );

    if(cmpCliente!==0){

      return cmpCliente;

    }

    return a.ini.localeCompare(
      b.ini
    );

  });

  $("lTb").innerHTML=
    rows.length
    ?
    rows.map(l=>{

      const st=statusLocacao(l);

      return `
        <tr>

          <td>
            ${esc(eqName(l.eq))}
          </td>

          <td>
            <b>${esc(l.cliente)}</b>
            ${
              l.tel
              ?`<br><small>${esc(l.tel)}</small>`
              :""
            }

            ${
              deps(l).length
              ?
              `
                <br>
                <span
                  class="warn"
                  style="
                    padding:2px 6px;
                    border-radius:4px;
                    font-size:12px">
                  depende da devolução de
                  ${nomes(deps(l),l)}
                </span>
              `
              :
              ""
            }
          </td>

          <td>${l.qtd}</td>

          <td>
            ${fmt(l.ini)} a ${fmt(l.fim)}
          </td>

          <td>
            ${
              l.conf
              ?
              `
                <span
                  class="${st.classe}"
                  style="
                    padding:3px 8px;
                    border-radius:4px">
                  ✔ ${esc(st.texto)}
                </span>
              `
              :
              `
                <span class="tag ${st.classe}">
                  ${st.texto}
                </span>

                <br>

                <input
                  type="date"
                  id="rn${l.id}"
                  min="${add(l.fim,1)}"
                  style="width:150px">

                <button
                  class="g"
                  data-r="${l.id}">
                  Renovar
                </button>
              `
            }
          </td>

          <td>

            ${
              l.conf
              ?
              ""
              :
              `
                <input
                  type="date"
                  id="cf${l.id}"
                  value="${l.fim}"
                  style="width:150px">

                <button
                  class="g"
                  data-c="${l.id}|Devolução">
                  Devolução confirmada
                </button>

                <button
                  class="g"
                  data-c="${l.id}|Retirada">
                  Retirada confirmada
                </button>
              `
            }

            <button
              class="g"
              data-e="${l.id}">
              Editar
            </button>

            <button
              class="g d"
              data-x="${l.id}">
              Excluir
            </button>

          </td>

        </tr>
      `;

    }).join("")
    :
    `
      <tr>
        <td colspan="6">
          ${
            busca
            ?
            "Nenhuma locação encontrada para este cliente."
            :
            "Nenhuma locação. Registre a primeira na aba Nova locação."
          }
        </td>
      </tr>
    `;

  renderPesquisaCliente();

  $("lTb")
    .querySelectorAll("[data-r]")
    .forEach(b=>{

      b.onclick=()=>{

        const l=S.loc.find(
          x=>x.id==b.dataset.r
        );

        const n=$("rn"+l.id).value;

        if(!n||n<=l.fim){

          $("lMsg").textContent=
            "Escolha uma data posterior ao fim atual.";

          return;

        }

        const falta=
          avail(
            l.eq,
            l.fim,
            n,
            l.id
          ).filter(
            x=>x.v<l.qtd
          );

        l.fim=n;

        save();

        renderLoc();

        $("lMsg").textContent=
          falta.length
          ?
          `Renovado até ${fmt(n)}, mas faltam unidades `+
          `a partir de ${fmt(falta[0].d)}. Revise as reservas.`
          :
          `Renovado até ${fmt(n)}. O estoque futuro foi atualizado.`;

      };

    });

  $("lTb")
    .querySelectorAll("[data-c]")
    .forEach(b=>{

      b.onclick=()=>{

        const [id,tipo]=
          b.dataset.c.split("|");

        const l=S.loc.find(
          x=>x.id==id
        );

        const d=$("cf"+id).value;

        if(!d||d<l.ini){

          $("lMsg").textContent=
            "Informe a data real, a partir do início da locação.";

          return;

        }

        l.fim=d;

        l.conf={
          tipo,
          data:d
        };

        save();

        renderLoc();

        $("lMsg").textContent=
          `${tipo} confirmada. ${l.qtd} un. de `+
          `${eqName(l.eq)} livres a partir de ${fmt(add(d,1))}.`;

      };

    });

  $("lTb")
    .querySelectorAll("[data-e]")
    .forEach(b=>
      b.onclick=()=>
        abrirEd(b.dataset.e)
    );

  $("lTb")
    .querySelectorAll("[data-x]")
    .forEach(b=>{

      b.onclick=()=>{

        S.loc=S.loc.filter(
          x=>x.id!=b.dataset.x
        );

        save();

        renderLoc();

        $("lMsg").textContent=
          "Locação excluída.";

      };

    });

}


// ============================================================
// ESTOQUE COMPROMETIDO
// ============================================================

function estoqueComprometidoMax(id){

  const h0=hojeLocal();

  const datas=[];

  S.loc
    .filter(
      l=>
        l.eq==id&&
        l.fim>=h0
    )
    .forEach(l=>{
      datas.push(l.ini,l.fim);
    });

  S.man
    .filter(
      m=>
        m.eq==id&&
        (!m.ret||m.ret>=h0)
    )
    .forEach(m=>{

      datas.push(m.ini);

      if(m.ret){

        datas.push(
          add(m.ret,-1)
        );

      }

    });

  const fim=
    datas.length
    ?
    datas.reduce(
      (a,b)=>a>b?a:b,
      h0
    )
    :
    h0;

  let max=0;

  for(
    const d of span(h0,fim)
  ){

    max=Math.max(
      max,
      used(id,d)+emMan(id,d)
    );

  }

  return max;

}


// ============================================================
// EQUIPAMENTOS
// ============================================================

function renderEq(){

  const tb=$("eTb");

  if(!tb)return;

  S.eq=
    Array.isArray(S.eq)
    ?S.eq
    :[];

  S.loc=
    Array.isArray(S.loc)
    ?S.loc
    :[];

  S.man=
    Array.isArray(S.man)
    ?S.man
    :[];

  // Garante que equipamentos antigos
  // tenham uma categoria válida.
  garantirCategorias();

  preencherCategorias();

  const h0=hojeLocal();

  const busca=nrm(
    ($("eBusca")?.value)||""
  );

  const catFiltro=
    ($("eCategoriaFiltro")?.value)||"";

  const lista=S.eq
    .filter(e=>{

      if(
        busca &&
        !nrm(e.nome||"").includes(busca)
      ){
        return false;
      }

      if(
        catFiltro &&
        String(e.categoriaId||"sem-categoria")!==
        String(catFiltro)
      ){
        return false;
      }

      return true;

    })
    .sort(
      (a,b)=>
        String(a.nome||"").localeCompare(
          String(b.nome||""),
          "pt-BR",
          {
            sensitivity:"base",
            numeric:true
          }
        )
    );

  const resumo=$("eResumo");

  if(resumo){

    if(busca||catFiltro){

      resumo.textContent=
        `Exibindo ${lista.length} de ${S.eq.length} equipamento(s).`;

    }else{

      resumo.textContent=
        `${S.eq.length} equipamento(s) cadastrado(s), em ordem alfabética.`;

    }

  }

  tb.innerHTML=
    lista.length
    ?
    lista.map(e=>{

      const totalEq=
        Number(e.total)||0;

      const alug=
        Number(
          used(e.id,h0)
        )||0;

      const man=
        Number(
          emMan(e.id,h0)
        )||0;

      const disp=
        Math.max(
          0,
          totalEq-alug-man
        );

      /*
       * Categoria atual do equipamento.
       *
       * Equipamentos antigos que ainda não possuem
       * categoriaId serão automaticamente tratados
       * como "sem-categoria".
       */
      const categoriaAtual=
        e.categoriaId||
        "sem-categoria";

      /*
       * Monta o select diretamente na tabela.
       *
       * Dessa forma equipamentos antigos também
       * podem receber uma categoria.
       */
      const categoriaOptions=
        S.categorias
          .map(c=>`
            <option
              value="${esc(c.id)}"
              ${
                String(c.id)===String(categoriaAtual)
                ?"selected"
                :""
              }>
              ${esc(c.nome)}
            </option>
          `)
          .join("");

      return `
        <tr>

          <td>

            <span
              data-nome-view="${e.id}">
              <b>${esc(e.nome)}</b>
            </span>

            <input
              type="text"
              value="${esc(e.nome)}"
              data-nome="${e.id}"
              style="
                display:none;
                width:220px">

          </td>

          <td>

            <select
              data-cat-eq="${e.id}"
              style="
                min-width:170px;
                max-width:240px;">

              ${categoriaOptions}

            </select>

          </td>

          <td>

            <input
              type="number"
              min="0"
              value="${totalEq}"
              data-t="${e.id}"
              style="width:80px"
              title="Não pode ficar abaixo do estoque já comprometido">

          </td>

          <td>
            <b>${disp}</b>
          </td>

          <td>
            ${alug}
          </td>

          <td>
            ${man}
          </td>

          <td>

            <button
              class="g"
              data-edit-nome="${e.id}">
              Editar nome
            </button>

            <button
              class="b hidden"
              data-save-nome="${e.id}">
              Salvar
            </button>

            <button
              class="g hidden"
              data-cancel-nome="${e.id}">
              Cancelar
            </button>

            <button
              class="g d"
              data-d="${e.id}">
              Remover
            </button>

          </td>

        </tr>
      `;

    }).join("")
    :
    `
      <tr>
        <td colspan="7">

          ${
            busca||catFiltro
            ?
            "Nenhum equipamento encontrado com esses filtros."
            :
            "Nenhum equipamento cadastrado."
          }

        </td>
      </tr>
    `;


  // ==========================================================
  // ALTERAR CATEGORIA
  // ==========================================================

  tb
    .querySelectorAll("[data-cat-eq]")
    .forEach(select=>{

      select.onchange=()=>{

        const id=select.dataset.catEq;

        const e=S.eq.find(
          x=>String(x.id)===String(id)
        );

        if(!e)return;

        const novaCategoria=
          select.value||
          "sem-categoria";

        const categoriaAnterior=
          e.categoriaId||
          "sem-categoria";

        if(
          String(categoriaAnterior)===
          String(novaCategoria)
        ){
          return;
        }

        /*
         * Verifica se a categoria realmente existe.
         */
        const categoria=
          S.categorias.find(
            c=>String(c.id)===
            String(novaCategoria)
          );

        if(!categoria){

          select.value=
            categoriaAnterior;

          $("eMsg").textContent=
            "A categoria selecionada não existe.";

          return;

        }

        /*
         * Atualiza o equipamento.
         */
        e.categoriaId=
          novaCategoria;

        save();

        /*
         * Atualiza a quantidade exibida
         * na tela de categorias.
         */
        renderCategorias();

        $("eMsg").textContent=
          `Categoria de ${e.nome} alterada para "${categoria.nome}".`;

      };

    });


  // ==========================================================
  // ALTERAR QUANTIDADE
  // ==========================================================

  tb
    .querySelectorAll("[data-t]")
    .forEach(i=>{

      i.onchange=()=>{

        const e=S.eq.find(
          x=>
            String(x.id)===
            String(i.dataset.t)
        );

        if(!e)return;

        const novo=Math.max(
          0,
          Math.floor(
            Number(i.value)||0
          )
        );

        const min=
          estoqueComprometidoMax(
            e.id
          );

        if(novo<min){

          i.value=e.total;

          $("eMsg").textContent=
            `Não é possível reduzir ${e.nome} para ${novo} unidade(s). `+
            `O sistema já tem ${min} unidade(s) comprometidas por locações/manutenções.`;

          return;

        }

        e.total=novo;

        save();

        renderEq();
        renderLoc();
        renderMan();

        $("eMsg").textContent=
          `Estoque de ${e.nome} atualizado para ${novo} unidade(s).`;

      };

    });


  // ==========================================================
  // EDITAR NOME
  // ==========================================================

  tb
    .querySelectorAll("[data-edit-nome]")
    .forEach(b=>{

      b.onclick=()=>{

        const id=Number(
          b.dataset.editNome
        );

        const e=S.eq.find(
          x=>Number(x.id)===id
        );

        if(!e)return;

        const input=
          tb.querySelector(
            `[data-nome="${id}"]`
          );

        const view=
          tb.querySelector(
            `[data-nome-view="${id}"]`
          );

        const salvar=
          tb.querySelector(
            `[data-save-nome="${id}"]`
          );

        const cancelar=
          tb.querySelector(
            `[data-cancel-nome="${id}"]`
          );

        if(
          !input||
          !view||
          !salvar||
          !cancelar
        )return;

        input.value=e.nome;

        view.style.display="none";

        input.style.display=
          "inline-block";

        b.classList.add("hidden");

        salvar.classList.remove(
          "hidden"
        );

        cancelar.classList.remove(
          "hidden"
        );

        input.focus();
        input.select();

      };

    });


  // ==========================================================
  // CANCELAR EDIÇÃO DO NOME
  // ==========================================================

  tb
    .querySelectorAll("[data-cancel-nome]")
    .forEach(b=>{

      b.onclick=()=>{

        const id=Number(
          b.dataset.cancelNome
        );

        const e=S.eq.find(
          x=>Number(x.id)===id
        );

        if(!e)return;

        const input=
          tb.querySelector(
            `[data-nome="${id}"]`
          );

        const view=
          tb.querySelector(
            `[data-nome-view="${id}"]`
          );

        const editar=
          tb.querySelector(
            `[data-edit-nome="${id}"]`
          );

        const salvar=
          tb.querySelector(
            `[data-save-nome="${id}"]`
          );

        const cancelar=
          tb.querySelector(
            `[data-cancel-nome="${id}"]`
          );

        if(
          !input||
          !view||
          !editar||
          !salvar||
          !cancelar
        )return;

        input.value=e.nome;

        view.style.display="inline";

        input.style.display="none";

        editar.classList.remove(
          "hidden"
        );

        salvar.classList.add(
          "hidden"
        );

        cancelar.classList.add(
          "hidden"
        );

      };

    });


  // ==========================================================
  // SALVAR NOME
  // ==========================================================

  tb
    .querySelectorAll("[data-save-nome]")
    .forEach(b=>{

      b.onclick=()=>{

        const id=Number(
          b.dataset.saveNome
        );

        const e=S.eq.find(
          x=>Number(x.id)===id
        );

        if(!e)return;

        const input=
          tb.querySelector(
            `[data-nome="${id}"]`
          );

        if(!input)return;

        const novo=
          input.value.trim();

        if(!novo){

          $("eMsg").textContent=
            "Informe um nome para o equipamento.";

          input.focus();

          return;

        }

        const duplicado=
          S.eq.some(
            x=>
              Number(x.id)!==id&&
              nrm(x.nome)===nrm(novo)
          );

        if(duplicado){

          $("eMsg").textContent=
            "Já existe outro equipamento com esse nome.";

          input.focus();

          return;

        }

        const antigo=e.nome;

        e.nome=novo;

        save();

        renderEq();
        fillSel();
        renderLoc();
        renderMan();

        $("eMsg").textContent=
          `Nome do equipamento alterado de "${antigo}" para "${novo}".`;

      };

    });


  // ==========================================================
  // REMOVER EQUIPAMENTO
  // ==========================================================

  tb
    .querySelectorAll("[data-d]")
    .forEach(b=>{

      b.onclick=()=>{

        const id=Number(
          b.dataset.d
        );

        const e=S.eq.find(
          x=>Number(x.id)===id
        );

        if(!e)return;

        if(
          S.loc.some(
            l=>Number(l.eq)===id
          )||
          S.man.some(
            m=>Number(m.eq)===id
          )
        ){

          $("eMsg").textContent=
            `Não é possível remover ${e.nome} porque existem locações ou manutenções vinculadas a ele.`;

          return;

        }

        if(
          !confirm(
            `Remover o equipamento "${e.nome}" do cadastro?`
          )
        )return;

        S.eq=S.eq.filter(
          x=>Number(x.id)!==id
        );

        save();

        renderEq();
        fillSel();
        renderCategorias();

        $("eMsg").textContent=
          `${e.nome} removido do cadastro.`;

      };

    });

}


// ============================================================
// NOVA LOCAÇÃO
// ============================================================

const nAdd=$("nAdd");

if(nAdd){

  nAdd.onclick=()=>{

    const id=+$("nEq").value;
    const c=$("nCli").value.trim();
    const q=+$("nQtd").value;
    const a=$("nIni").value;
    const b=$("nFim").value;
    const m=$("nMsg");

    if(
      !c||
      !a||
      !b||
      b<a||
      q<1
    ){

      m.textContent=
        "Preencha cliente, quantidade e um período válido.";

      return;

    }

    const min=Math.min(
      ...avail(id,a,b).map(
        x=>x.v
      )
    );

    if(min<q){

      m.textContent=
        `Sem estoque: só ${Math.max(min,0)} unidade(s) livres em todo o período.`;

      return;

    }

    S.loc.push({

      id:Date.now(),
      eq:id,
      cliente:c,
      tel:$("nTel").value.trim(),
      qtd:q,
      ini:a,
      fim:b

    });

    save();

    renderLoc();

    m.textContent=
      "Locação registrada.";

  };

}


// ============================================================
// NOVO EQUIPAMENTO
// ============================================================

const eAdd=$("eAdd");

if(eAdd){

  eAdd.onclick=()=>{

    const n=$("eNome").value.trim();

    const q=Math.max(
      0,
      Math.floor(
        +$("eTot").value||0
      )
    );

    const categoriaId=
      $("eCategoria")
      ?
      $("eCategoria").value
      :
      "sem-categoria";

    const m=$("eMsg");

    if(!n){

      m.textContent=
        "Informe o nome do equipamento.";

      return;

    }

    if(!q){

      m.textContent=
        "Informe uma quantidade total maior que zero.";

      return;

    }

    if(
      S.eq.some(
        e=>nrm(e.nome)===nrm(n)
      )
    ){

      m.textContent=
        "Já existe um equipamento com esse nome.";

      return;

    }

    S.eq.push({

      id:Date.now(),
      nome:n,
      total:q,
      categoriaId:
        categoriaId||
        "sem-categoria"

    });

    $("eNome").value="";
    $("eTot").value=1;

    save();

    renderEq();
    fillSel();
    renderCategorias();

    m.textContent=
      `${n} adicionado com ${q} unidade(s).`;

  };

}


// ============================================================
// PESQUISA DE EQUIPAMENTOS
// ============================================================

const eBusca=$("eBusca");

if(eBusca){

  eBusca.addEventListener(
    "input",
    ()=>{
      renderEq();
    }
  );

}

const eBuscaLimpar=$("eBuscaLimpar");

if(eBuscaLimpar){

  eBuscaLimpar.onclick=()=>{

    if(eBusca){
      eBusca.value="";
    }

    const filtro=$("eCategoriaFiltro");

    if(filtro){
      filtro.value="";
    }

    renderEq();

    if(eBusca){
      eBusca.focus();
    }

  };

}

const eCategoriaFiltro=$("eCategoriaFiltro");

if(eCategoriaFiltro){

  eCategoriaFiltro.addEventListener(
    "change",
    ()=>{
      renderEq();
    }
  );

}


// ============================================================
// CATEGORIAS
// ============================================================

const catAdd=$("catAdd");

if(catAdd){

  catAdd.onclick=
    adicionarCategoria;

}

const catNome=$("catNome");

if(catNome){

  catNome.onkeydown=e=>{

    if(e.key==="Enter"){

      e.preventDefault();

      adicionarCategoria();

    }

  };

}


// ============================================================
// CONSULTA
// ============================================================

const qGo=$("qGo");

if(qGo){

  qGo.onclick=consultar;

}


// ============================================================
// BACKUP E IMPORTAÇÃO
// ============================================================

async function baixar(filename,data){

  try{

    const blob=new Blob(
      [data],
      {
        type:
          "application/octet-stream;charset=utf-8"
      }
    );

    const url=
      URL.createObjectURL(blob);

    const a=
      document.createElement("a");

    a.href=url;
    a.download=filename;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      ()=>URL.revokeObjectURL(url),
      1000
    );

    return "ok";

  }catch(e){

    console.error(e);

    return "erro";

  }

}

async function lerTexto(f){

  const buf=
    await f.arrayBuffer();

  try{

    return new TextDecoder(
      "utf-8",
      {
        fatal:true
      }
    ).decode(buf);

  }catch(e){

    return new TextDecoder(
      "windows-1252"
    ).decode(buf);

  }

}

function parseCSV(t){

  t=t.replace(
    /^\uFEFF/,
    ""
  );

  const f=
    t.split(/\r?\n/)[0]||"";

  const sep=
    f.includes(";")
    ?
    ";"
    :
    f.includes("\t")
      ?
      "\t"
      :
      ",";

  const rows=[];

  let r=[];
  let c="";
  let q=false;

  for(
    let i=0;
    i<t.length;
    i++
  ){

    const ch=t[i];

    if(q){

      if(ch==='"'){

        if(t[i+1]==='"'){

          c+='"';
          i++;

        }else{

          q=false;

        }

      }else{

        c+=ch;

      }

    }else if(ch==='"'){

      q=true;

    }else if(ch===sep){

      r.push(c);
      c="";

    }else if(
      ch==="\n"||
      ch==="\r"
    ){

      if(
        ch==="\r"&&
        t[i+1]==="\n"
      ){

        i++;

      }

      r.push(c);

      rows.push(r);

      r=[];
      c="";

    }else{

      c+=ch;

    }

  }

  if(
    c!==""||
    r.length
  ){

    r.push(c);
    rows.push(r);

  }

  return rows.filter(
    x=>
      x.some(
        v=>v.trim()!==""
      )
  );

}

function pd(v){

  v=(v||"").trim();

  let m=
    v.match(
      /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/
    );

  let x=null;

  if(m){

    let y=+m[3];

    if(y<100)y+=2000;

    x=
      y+
      "-"+
      m[2].padStart(2,"0")+
      "-"+
      m[1].padStart(2,"0");

  }else if(
    /^\d{4}-\d{2}-\d{2}$/.test(v)
  ){

    x=v;

  }

  return x&&
    iso(
      new Date(
        x+"T00:00:00Z"
      )
    )===x
      ?x
      :null;

}

function renderBk(){

  const b=S.cfg.bk;

  const d=
    b
    ?
    Math.floor(
      (
        Date.now()-
        new Date(b)
      )/
      864e5
    )
    :
    null;

  $("bkInfo").innerHTML=
    b
    ?
    `Último backup: <b>${
      new Date(b).toLocaleString("pt-BR")
    }</b>${
      d>=7
      ?
      ` <span class="tag warn">
          há ${d} dias, faça um novo
        </span>`
      :
      ""
    }`
    :
    `<span class="tag warn">
      Nenhum backup feito ainda
    </span>`;

}

const bkExp=$("bkExp");

if(bkExp){

  bkExp.onclick=async()=>{

    const nome=
      `backup-estoque-${hojeLocal()}.json`;

    const txt=
      JSON.stringify(
        {
          versao:1,
          exportado:
            new Date().toISOString(),
          dados:S
        },
        null,
        1
      );

    const m=$("bkMsg");

    const r=
      await baixar(
        nome,
        txt
      );

    if(r==="ok"){

      S.cfg.bk=
        new Date().toISOString();

      save();

      renderBk();

      m.textContent=
        "Backup exportado. Guarde o arquivo em um local seguro.";

      $("bkTxt")
        .classList
        .add("hidden");

    }else{

      m.textContent=
        "O download direto não está disponível aqui. Copie o texto abaixo e salve em um arquivo .json.";

      $("bkTxt").value=txt;

      $("bkTxt")
        .classList
        .remove("hidden");

    }

  };

}

// ============================================================
// BACKUP E IMPORTAÇÃO
// ============================================================

let bkPend=null;


/*
 * Normaliza as categorias vindas de um backup.
 */
function normalizarCategoriasBackup(d){

  const PADRAO_ID="sem-categoria";
  const PADRAO_NOME="Sem categoria";

  if(!d.cfg) d.cfg={};
  if(!Array.isArray(d.eq)) d.eq=[];

  let categorias=
    Array.isArray(d.categorias)
    ? d.categorias
    : (
        Array.isArray(d.cfg.categorias)
        ? d.cfg.categorias
        : []
      );

  const categoriasNormalizadas=[];

  // 1. Processa e normaliza as categorias do backup preservando os IDs originais
  categorias.forEach((c,i)=>{

    if(!c) return;

    let nome="", id="";

    if(typeof c === "object"){
      nome = String(c.nome || c.name || "").trim();
      id = String(c.id || "").trim();
    }else{
      nome = String(c).trim();
    }

    if(!nome) return;

    // Se não houver ID explícito, gera um ID slug seguro baseado no nome
    if(!id){
      id = nrm(nome).replace(/\s+/g, "-");
    }

    const existente = categoriasNormalizadas.find(
      x => String(x.id) === String(id) || nrm(x.nome) === nrm(nome)
    );

    if(!existente){
      categoriasNormalizadas.push({ id, nome });
    }

  });

  // 2. Garante a existência da categoria padrão "Sem categoria"
  let semCategoria = categoriasNormalizadas.find(
    c => String(c.id) === PADRAO_ID || nrm(c.nome) === nrm(PADRAO_NOME)
  );

  if(!semCategoria){
    semCategoria = { id: PADRAO_ID, nome: PADRAO_NOME };
    categoriasNormalizadas.unshift(semCategoria);
  }else{
    semCategoria.id = PADRAO_ID;
  }

  // 3. Mapeia as categorias dos equipamentos (suporta ID, Nome ou Propriedades legadas)
  d.eq.forEach(e=>{

    if(!e) return;

    let catId = e.categoriaId ? String(e.categoriaId).trim() : "";
    let catNome = e.categoria ? String(e.categoria).trim() : "";

    // Procura por ID ou por Nome
    let encontrada = categoriasNormalizadas.find(c =>
      (catId && String(c.id) === catId) ||
      (catId && nrm(c.id) === nrm(catId)) ||
      (catNome && nrm(c.nome) === nrm(catNome)) ||
      (catNome && nrm(c.id) === nrm(catNome))
    );

    // Se o equipamento possui um nome de categoria que ainda não existe no cadastro, cria-a automaticamente
    if(!encontrada && catNome){
      const novoId = nrm(catNome).replace(/\s+/g, "-") || `cat-${Date.now()}`;
      encontrada = { id: novoId, nome: catNome };
      categoriasNormalizadas.push(encontrada);
    }

    // Associa o categoriaId definitivo
    e.categoriaId = encontrada ? encontrada.id : PADRAO_ID;

    // Limpa a propriedade antiga para evitar conflitos
    delete e.categoria;

  });

  d.categorias = categoriasNormalizadas;
  if(d.cfg) delete d.cfg.categorias;

  return d;

}


$("bkFile").onchange=async()=>{

  const f=
    $("bkFile").files[0];

  const m=
    $("bkMsg");

  $("bkAct").innerHTML="";

  bkPend=null;

  if(!f)return;


  try{

    /*
     * --------------------------------------------------------
     * Lê o arquivo
     * --------------------------------------------------------
     */

    const o=
      JSON.parse(
        await lerTexto(f)
      );

    const d=
      o&&o.dados
      ?o.dados
      :o;


    /*
     * --------------------------------------------------------
     * Validação básica
     * --------------------------------------------------------
     */

    if(
      !d||
      !Array.isArray(d.eq)||
      !Array.isArray(d.loc)
    ){

      throw new Error(
        "Estrutura de backup inválida."
      );

    }


    /*
     * --------------------------------------------------------
     * Compatibilidade com backups antigos
     * --------------------------------------------------------
     */

    if(!Array.isArray(d.man)){
      d.man=[];
    }


    if(!d.cfg){
      d.cfg={
        mesmoDia:true
      };
    }


    /*
     * --------------------------------------------------------
     * Normaliza categorias
     * --------------------------------------------------------
     */

    normalizarCategoriasBackup(d);


    /*
     * --------------------------------------------------------
     * Guarda o backup preparado temporariamente.
     *
     * Ainda NÃO substitui os dados atuais.
     * --------------------------------------------------------
     */

    bkPend=d;


    /*
     * --------------------------------------------------------
     * Mostra resumo para o usuário
     * --------------------------------------------------------
     */

    const qtdCategorias=
      Array.isArray(d.categorias)
      ?d.categorias.length
      :0;


    m.textContent=
      `Arquivo válido: `+
      `${d.eq.length} equipamento(s), `+
      `${d.loc.length} locação(ões), `+
      `${d.man.length} manutenção(ões), `+
      `${qtdCategorias} categoria(s).`+
      `\n\n`+
      `Isso substituirá todos os dados atuais.`;


    /*
     * --------------------------------------------------------
     * Botões de confirmação
     * --------------------------------------------------------
     */

    $("bkAct").innerHTML=
      '<button class="b" id="bkOk">Substituir dados atuais</button>'+
      '<button class="g" id="bkNo">Cancelar</button>';


    /*
     * --------------------------------------------------------
     * CONFIRMAR IMPORTAÇÃO
     * --------------------------------------------------------
     */

    $("bkOk").onclick=()=>{

      if(!bkPend)return;


      /*
       * Substitui os dados atuais pelos dados
       * já normalizados.
       */

      S=bkPend;


      /*
       * Garantias finais.
       */

      S.eq=
        Array.isArray(S.eq)
        ?S.eq
        :[];


      S.loc=
        Array.isArray(S.loc)
        ?S.loc
        :[];


      S.man=
        Array.isArray(S.man)
        ?S.man
        :[];


      S.cfg=
        S.cfg||
        {mesmoDia:true};


      /*
       * Garante novamente a estrutura de categorias.
       *
       * Isso protege contra qualquer situação inesperada.
       */

      normalizarCategoriasBackup(S);


      /*
       * Backup já foi efetivamente importado.
       */

      bkPend=null;


      save();


      /*
       * Atualiza toda a interface.
       */

      fecharEd();

      fillSel();

      renderLoc();

      renderEq();

      renderMan();

      renderBk();


      /*
       * Atualiza configuração de mesmo dia.
       */

      $("cfgMd").checked=
        !!S.cfg.mesmoDia;


      $("bkAct").innerHTML="";


      m.textContent=
        "Backup importado com sucesso. "+
        "Os dados e as categorias foram restaurados.";


    };


    /*
     * --------------------------------------------------------
     * CANCELAR
     * --------------------------------------------------------
     */

    $("bkNo").onclick=()=>{

      bkPend=null;

      $("bkAct").innerHTML="";

      m.textContent=
        "Importação cancelada.";

    };


  }catch(e){

    console.error(
      "Erro ao importar backup:",
      e
    );

    bkPend=null;

    m.textContent=
      "Não foi possível ler este arquivo. "+
      "Use um backup .json exportado por esta ferramenta.";

  }


  /*
   * Permite selecionar novamente o mesmo arquivo depois.
   */

  $("bkFile").value="";

};

const mdEq=$("mdEq");

if(mdEq){

  mdEq.onclick=()=>
    baixar(
      "modelo-equipamentos.csv",
      "\uFEFFnome;quantidade\n"+
      "Freezer horizontal;4\n"+
      "Forno combinado;2\n"
    );

}

const mdLoc=$("mdLoc");

if(mdLoc){

  mdLoc.onclick=()=>
    baixar(
      "modelo-locacoes.csv",
      "\uFEFFequipamento;cliente;telefone;quantidade;inicio;fim\n"+
      "Freezer horizontal;Buffet Aurora;(11) 90000-0000;2;01/10/2026;10/10/2026\n"
    );

}

const csvEq=$("csvEq");

if(csvEq){

  csvEq.onchange=async()=>{

    const f=
      $("csvEq").files[0];

    const m=$("csvMsg");

    if(!f)return;

    try{

      let R=
        parseCSV(
          await lerTexto(f)
        );

      if(
        R.length&&
        isNaN(
          Number(R[0][1])
        )
      ){

        R.shift();

      }

      let novos=0;
      let atual=0;

      const err=[];

      R.forEach((r,i)=>{

        const n=
          (r[0]||"").trim();

        const q=
          Number(
            (r[1]||"").trim()
          );

        if(
          !n||
          !Number.isInteger(q)||
          q<0
        ){

          err.push(
            `Linha ${i+1}: nome ou quantidade inválidos`
          );

          return;

        }

        const e=
          S.eq.find(
            x=>
              nrm(x.nome)===
              nrm(n)
          );

        if(e){

          e.total=q;

          atual++;

        }else{

          S.eq.push({
            id:Date.now()+i,
            nome:n,
            total:q,
            categoriaId:"sem-categoria"
          });

          novos++;

        }

      });

      garantirCategorias();

      save();

      renderEq();
      fillSel();
      renderLoc();
      renderMan();

      m.textContent=
        `Equipamentos: ${novos} novo(s), `+
        `${atual} atualizado(s), `+
        `${err.length} com erro.`+
        (
          err.length
          ?
          "\n"+
          err.slice(0,8).join("\n")
          :
          ""
        );

    }catch(e){

      m.textContent=
        "Não foi possível ler o arquivo.";

    }

    $("csvEq").value="";

  };

}

const csvLoc=$("csvLoc");

if(csvLoc){

  csvLoc.onchange=async()=>{

    const f=
      $("csvLoc").files[0];

    const m=$("csvMsg");

    if(!f)return;

    try{

      let R=
        parseCSV(
          await lerTexto(f)
        );

      if(
        R.length&&
        isNaN(
          Number(R[0][3])
        )
      ){

        R.shift();

      }

      let ok=0;
      let dup=0;

      const err=[];

      R.forEach((r,i)=>{

        const [
          en,
          cl,
          tel,
          qs,
          ia,
          fa
        ]=
          r.map(
            v=>(v||"").trim()
          );

        const q=Number(qs);
        const a=pd(ia);
        const b=pd(fa);

        const e=
          S.eq.find(
            x=>
              nrm(x.nome)===
              nrm(en)
          );

        if(!e){

          err.push(
            `Linha ${i+1}: equipamento "${en}" não cadastrado`
          );

          return;

        }

        if(!cl){

          err.push(
            `Linha ${i+1}: cliente em branco`
          );

          return;

        }

        if(
          !Number.isInteger(q)||
          q<1
        ){

          err.push(
            `Linha ${i+1}: quantidade inválida`
          );

          return;

        }

        if(
          !a||
          !b||
          b<a
        ){

          err.push(
            `Linha ${i+1}: datas inválidas (use dd/mm/aaaa)`
          );

          return;

        }

        if(
          S.loc.some(
            l=>
              l.eq===e.id&&
              l.cliente===cl&&
              l.qtd===q&&
              l.ini===a&&
              l.fim===b
          )
        ){

          dup++;

          return;

        }

        S.loc.push({
          id:Date.now()+i,
          eq:e.id,
          cliente:cl,
          tel,
          qtd:q,
          ini:a,
          fim:b
        });

        ok++;

      });

      save();

      renderLoc();

      m.textContent=
        `Locações: ${ok} importada(s), `+
        `${dup} repetida(s) ignorada(s), `+
        `${err.length} com erro.`+
        (
          err.length
          ?
          "\n"+
          err.slice(0,8).join("\n")
          :
          ""
        );

    }catch(e){

      m.textContent=
        "Não foi possível ler o arquivo.";

    }

    $("csvLoc").value="";

  };

}


// ============================================================
// MANUTENÇÃO - ADICIONAR
// ============================================================

const mAdd=$("mAdd");

if(mAdd){

  mAdd.onclick=()=>{

    const id=+$("mEq").value;
    const q=+$("mQtd").value;
    const a=$("mIni").value;
    const b=$("mFim").value;
    const m=$("mMsg");

    if(
      !id||
      q<1||
      !a||
      (b&&b<=a)
    ){

      m.textContent=
        "Informe equipamento, quantidade e início. A previsão de retorno deve ser depois do início.";

      return;

    }

    if(q>total(id)){

      m.textContent=
        `Só existem ${total(id)} unidade(s) cadastradas.`;

      return;

    }

    const lim0=
      b
      ?
      add(b,-1)
      :
      S.man
        .filter(
          x=>x.eq==id
        )
        .reduce(
          (mx,x)=>{

            let y=mx;

            if(x.ini>y)y=x.ini;

            if(x.ret){

              const z=
                add(x.ret,-1);

              if(z>y)y=z;

            }

            return y;

          },
          a
        );

    const estouro=
      span(a,lim0).find(
        d=>
          emMan(id,d)+q>
          total(id)
      );

    if(estouro){

      m.textContent=
        `Não é possível: em ${fmt(estouro)} já há ${emMan(id,estouro)} un. em manutenção e o estoque total é ${total(id)}. Reduza a quantidade ou ajuste as datas.`;

      return;

    }

    S.man.push({

      id:Date.now(),
      eq:id,
      qtd:q,
      ini:a,
      ret:b||"",
      motivo:
        $("mMot").value.trim()

    });

    save();

    const lim=
      b
      ?
      add(b,-1)
      :
      S.loc
        .filter(l=>l.eq==id)
        .reduce(
          (x,l)=>
            l.fim>x
              ?l.fim
              :x,
          a
        );

    const falta=
      span(a,lim).find(
        d=>
          total(id,d)-
          emMan(id,d)-
          used(id,d)<0
      );

    renderMan();
    renderLoc();

    $("mMot").value="";

    m.textContent=
      falta
      ?
      `Registrado. Atenção: a partir de ${fmt(falta)} faltam unidades para locações já registradas. Revise-as na aba Locações.`
      :
      "Manutenção registrada. O estoque foi atualizado.";

  };

}


// ============================================================
// EDIÇÃO DE LOCAÇÃO
// ============================================================

const edCancel=$("edCancel");

if(edCancel){

  edCancel.onclick=fecharEd;

}

const edUndo=$("edUndo");

if(edUndo){

  edUndo.onclick=()=>{

    const l=S.loc.find(
      x=>x.id===edId
    );

    if(!l)return;

    delete l.conf;

    save();

    fecharEd();

    renderLoc();

    $("lMsg").textContent=
      "Confirmação desfeita. A locação voltou a ficar em andamento.";

  };

}

const edSave=$("edSave");

if(edSave){

  edSave.onclick=()=>{

    const l=
      S.loc.find(
        x=>x.id===edId
      );

    const m=$("edMsg");

    if(!l){

      fecharEd();

      return;

    }

    const eq=+$("edEq").value;
    const c=$("edCli").value.trim();
    const q=+$("edQtd").value;
    const a=$("edIni").value;
    const b=$("edFim").value;

    if(
      !c||
      q<1||
      !a||
      !b||
      b<a
    ){

      m.textContent=
        "Preencha cliente, quantidade e um período válido.";

      return;

    }

    if(
      eq!==l.eq||
      q!==l.qtd||
      a!==l.ini||
      b!==l.fim
    ){

      const min=Math.min(
        ...avail(
          eq,
          a,
          b,
          l.id
        ).map(
          x=>x.v
        )
      );

      if(min<q){

        m.textContent=
          `Sem estoque para essa alteração: só ${Math.max(min,0)} unidade(s) livres em todo o período.`;

        return;

      }

    }

    Object.assign(
      l,
      {
        eq,
        cliente:c,
        tel:
          $("edTel").value.trim(),
        qtd:q,
        ini:a,
        fim:b
      }
    );

    if(l.conf){

      l.conf.data=b;

    }

    save();

    fecharEd();

    renderLoc();

    $("lMsg").textContent=
      "Locação atualizada.";

  };

}


// ============================================================
// TEMA
// ============================================================

const TEMAS=[
  "auto",
  "claro",
  "escuro"
];

const temaViewer=
  document.documentElement
    .getAttribute("data-theme");

let tema="auto";

function aplicaTema(){

  const r=
    document.documentElement;

  if(tema==="auto"){

    temaViewer
      ?
      r.setAttribute(
        "data-theme",
        temaViewer
      )
      :
      r.removeAttribute(
        "data-theme"
      );

  }else{

    r.setAttribute(
      "data-theme",
      tema==="claro"
        ?"light"
        :"dark"
    );

  }

  $("tema").textContent=
    "Tema: "+
    tema.replace(
      "auto",
      "automático"
    );

}

try{

  tema=
    localStorage.getItem(
      "estoque_tema"
    )||
    "auto";

}catch(e){}

const temaBtn=$("tema");

if(temaBtn){

  temaBtn.onclick=()=>{

    tema=
      TEMAS[
        (
          TEMAS.indexOf(tema)+1
        )%3
      ];

    try{

      localStorage.setItem(
        "estoque_tema",
        tema
      );

    }catch(e){}

    aplicaTema();

  };

}

aplicaTema();


// ============================================================
// HISTÓRICO
// ============================================================

const hGo=$("hGo");

if(hGo){

  hGo.onclick=()=>{

    hBuscou=true;

    renderHist();

  };

}

[
  "hDe",
  "hAte",
  "hCli"
].forEach(i=>{

  const el=$(i);

  if(el){

    el.onkeydown=e=>{

      if(e.key==="Enter"){

        if(hGo)hGo.onclick();

      }

    };

  }

});

const hClr=$("hClr");

if(hClr){

  hClr.onclick=()=>{

    [
      "hTipo",
      "hEq",
      "hDe",
      "hAte",
      "hCli"
    ].forEach(i=>{

      const el=$(i);

      if(el)el.value="";

    });

    hBuscou=false;

    renderHist();

  };

}


// ============================================================
// LIMPAR CONSULTA
// ============================================================

const qClr=$("qClr");

if(qClr){

  qClr.onclick=()=>{

    $("qEq").selectedIndex=0;
    $("qQtd").value=1;
    $("qIni").value="";
    $("qFim").value="";
    $("qOut").innerHTML="";
    $("qIni").focus();

  };

}


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const cfgMd=$("cfgMd");

if(cfgMd){

  cfgMd.onchange=()=>{

    S.cfg.mesmoDia=
      cfgMd.checked;

    save();

    renderLoc();

  };

}


// ============================================================
// MOVIMENTAÇÃO DO DIA
// ============================================================

const dDia=$("dDia");

if(dDia){

  dDia.onchange=renderDia;

}

const dPrev=$("dPrev");

if(dPrev){

  dPrev.onclick=()=>{

    if($("dDia").value){

      $("dDia").value=
        add(
          $("dDia").value,
          -1
        );

      renderDia();

    }

  };

}

const dNext=$("dNext");

if(dNext){

  dNext.onclick=()=>{

    if($("dDia").value){

      $("dDia").value=
        add(
          $("dDia").value,
          1
        );

      renderDia();

    }

  };

}

const dHoje=$("dHoje");

if(dHoje){

  dHoje.onclick=()=>{

    $("dDia").value=
      hojeLocal();

    renderDia();

  };

}

const dOut=$("dOut");

if(dOut){

  dOut.onclick=e=>{

    const b=
      e.target.closest(
        "[data-vc]"
      );

    if(!b)return;

    const [id,tipo]=
      b.dataset.vc.split("|");

    const l=
      S.loc.find(
        x=>x.id==id
      );

    if(!l)return;

    const h0=hojeLocal();

    l.fim=
      l.fim<h0
        ?h0
        :l.fim;

    l.conf={
      tipo,
      data:l.fim
    };

    save();

    renderLoc();

    $("lMsg").textContent=
      `${tipo} confirmada. ${l.qtd} un. de ${eqName(l.eq)} livres a partir de ${fmt(add(l.fim,1))}.`;

  };

}


// ============================================================
// PESQUISA DE CLIENTE NA ABA LOCAÇÕES
// ============================================================

const lBuscaCli=$("lBuscaCli");

if(lBuscaCli){

  lBuscaCli.addEventListener(
    "input",
    ()=>{
      renderLoc();
    }
  );

  lBuscaCli.addEventListener(
    "keydown",
    e=>{

      if(e.key==="Enter"){

        renderLoc();

      }

    }
  );

}

const lBuscaLimpar=$("lBuscaLimpar");

if(lBuscaLimpar){

  lBuscaLimpar.onclick=
    limparPesquisaCliente;

}


// ============================================================
// NAVEGAÇÃO
// ============================================================

document
  .querySelectorAll("nav button")
  .forEach(b=>{

    b.onclick=()=>{

      document
        .querySelectorAll(
          "nav button"
        )
        .forEach(x=>
          x.setAttribute(
            "aria-selected",
            x===b
          )
        );

      [
        "disp",
        "nova",
        "loc",
        "hist",
        "man",
        "eq",
        "dados",
        "usr"
      ].forEach(t=>{

        const el=$(t);

        if(el){

          el.classList.toggle(
            "hidden",
            t!==b.dataset.t
          );

        }

      });

      if(
        b.dataset.t==="usr"
      ){

        renderUsuarios();

      }

    };

  });


// ============================================================
// LOGIN, SESSÃO E USUÁRIOS
// ============================================================

const mostrar=(id,v)=>{

  const el=$(id);

  if(el){

    el.classList.toggle(
      "hidden",
      !v
    );

  }

};

async function api(
  url,
  method,
  body
){

  const r=
    await fetch(
      url,
      {
        method:method||"GET",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:
          body
          ?
          JSON.stringify(body)
          :
          undefined,
        cache:"no-store"
      }
    );

  let d={};

  try{

    d=await r.json();

  }catch(e){}

  if(
    r.status===401&&
    logado
  ){

    sessaoExpirada();

  }

  return {
    ok:r.ok,
    status:r.status,
    d
  };

}

function mostrarLogin(
  setup,
  msg,
  me
){

  me=me||{};

  logado=false;

  mostrar(
    "appArea",
    false
  );

  mostrar(
    "loginArea",
    true
  );

  $("loginTitulo").textContent=
    setup
      ?
      "Primeiro acesso: criar administrador"
      :
      "Acesso ao sistema";

  $("loginAviso").textContent=
    !setup
      ?
      ""
      :
      me.setup_bloqueado
        ?
        "Este servidor ainda não tem o código de instalação configurado. No Render, confira a variável SETUP_TOKEN em Environment e reinicie."
        :
        "Ainda não há usuários. Crie a conta do administrador; depois, ele cadastra os demais usuários na aba Usuários.";

  mostrar(
    "loginAviso",
    setup
  );

  mostrar(
    "loginPass2Box",
    setup
  );

  mostrar(
    "loginTokenBox",
    setup&&!!me.precisa_token
  );

  mostrar(
    "btnSetup",
    setup&&!me.setup_bloqueado
  );

  mostrar(
    "btnLogin",
    !setup
  );

  $("loginMsg").textContent=
    msg||"";

  $("loginMsg").style.color=
    "var(--bad)";

  $("loginUser").focus();

}

function sessaoExpirada(){

  if(!logado)return;

  mostrarLogin(
    false,
    "Sua sessão expirou. Entre novamente."
  );

}

async function checarUsuario(){

  try{

    const {d}=
      await api(
        "/api/me"
      );

    if(d.logged_in){

      eAdmin=!!d.is_admin;

      $("userDisplay").textContent=
        d.username+
        (
          eAdmin
          ?" (administrador)"
          :""
        );

      mostrar(
        "tabUsr",
        eAdmin
      );

      mostrar(
        "bkDbBox",
        eAdmin
      );

      mostrar(
        "avisoTeste",
        !!d.teste_temporario
      );

      mostrar(
        "loginArea",
        false
      );

      mostrar(
        "appArea",
        true
      );

      logado=true;

      await iniciarApp();

    }else{

      mostrarLogin(
        !!d.precisa_admin,
        "",
        d
      );

    }

  }catch(e){

    console.error(e);

    mostrarLogin(
      false,
      "Não foi possível conectar ao servidor."
    );

  }

}

async function fazerLogin(){

  const u=
    $("loginUser")
      .value
      .trim();

  const p=
    $("loginPass")
      .value;

  if(!u||!p){

    $("loginMsg").textContent=
      "Preencha usuário e senha.";

    return;

  }

  const r=
    await api(
      "/api/login",
      "POST",
      {
        username:u,
        password:p
      }
    );

  if(!r.ok){

    $("loginMsg").textContent=
      r.d.error||
      "Não foi possível entrar.";

    return;

  }

  $("loginPass").value="";

  await checarUsuario();

}

async function criarAdmin(){

  const u=
    $("loginUser")
      .value
      .trim();

  const p=
    $("loginPass")
      .value;

  const p2=
    $("loginPass2")
      .value;

  if(!u||!p){

    $("loginMsg").textContent=
      "Preencha usuário e senha.";

    return;

  }

  if(p!==p2){

    $("loginMsg").textContent=
      "As senhas não conferem.";

    return;

  }

  const r=
    await api(
      "/api/setup",
      "POST",
      {
        username:u,
        password:p,
        token:
          $("loginToken")
            .value
            .trim()
      }
    );

  if(!r.ok){

    $("loginMsg").textContent=
      r.d.error||
      "Não foi possível criar o administrador.";

    return;

  }

  $("loginPass").value="";
  $("loginPass2").value="";
  $("loginToken").value="";

  await checarUsuario();

}

const btnLogin=$("btnLogin");

if(btnLogin){

  btnLogin.onclick=
    fazerLogin;

}

const btnSetup=$("btnSetup");

if(btnSetup){

  btnSetup.onclick=
    criarAdmin;

}

[
  "loginUser",
  "loginPass",
  "loginPass2",
  "loginToken"
].forEach(i=>{

  const el=$(i);

  if(el){

    el.onkeydown=e=>{

      if(e.key==="Enter"){

        (
          $("btnSetup").classList.contains("hidden")
          ?
          fazerLogin
          :
          criarAdmin
        )();

      }

    };

  }

});

const bkDb=$("bkDb");

if(bkDb){

  bkDb.onclick=()=>
    location.href=
      "/api/backup/db";

}

const btnLogout=$("btnLogout");

if(btnLogout){

  btnLogout.onclick=async()=>{

    await api(
      "/api/logout",
      "POST"
    );

    location.reload();

  };

}


// ============================================================
// ALTERAR SENHA
// ============================================================

const pwGo=$("pwGo");

if(pwGo){

  pwGo.onclick=async()=>{

    const m=$("pwMsg");

    const a=
      $("pwAtual").value;

    const n=
      $("pwNova").value;

    const c=
      $("pwConf").value;

    if(n!==c){

      m.textContent=
        "A nova senha e a repetição não conferem.";

      return;

    }

    const r=
      await api(
        "/api/me/senha",
        "POST",
        {
          atual:a,
          nova:n
        }
      );

    m.textContent=
      r.ok
      ?
      "Senha alterada com sucesso."
      :
      (
        r.d.error||
        "Não foi possível alterar a senha."
      );

    if(r.ok){

      [
        "pwAtual",
        "pwNova",
        "pwConf"
      ].forEach(i=>
        $(i).value=""
      );

    }

  };

}


// ============================================================
// ADMINISTRAÇÃO
// ============================================================

const dataLocal=q=>
  q
  ?
  new Date(
    q.replace(" ","T")+"Z"
  ).toLocaleString("pt-BR")
  :
  "";

async function renderUsuarios(){

  if(!eAdmin)return;

  const r=
    await api(
      "/api/usuarios"
    );

  if(!r.ok)return;

  $("uTb").innerHTML=
    r.d.map(
      u=>`
        <tr>
          <td>
            <b>${esc(u.username)}</b>
          </td>

          <td>
            ${
              u.is_admin
              ?"Administrador"
              :"Usuário"
            }
          </td>

          <td>
            <span class="tag ${
              u.ativo
              ?"ok"
              :"bad"
            }">
              ${
                u.ativo
                ?"Ativo"
                :"Inativo"
              }
            </span>
          </td>

          <td>
            ${esc(
              fmt(
                (u.created_at||"")
                  .slice(0,10)
              )
            )}
          </td>

          <td>

            <input
              type="password"
              id="pw${u.id}"
              placeholder="Nova senha"
              autocomplete="new-password"
              style="width:150px">

            <button
              class="g"
              data-rs="${u.id}">
              Redefinir senha
            </button>

            <button
              class="g ${u.ativo?"d":""}"
              data-at="${u.id}"
              data-v="${u.ativo?0:1}">
              ${
                u.ativo
                ?"Desativar"
                :"Reativar"
              }
            </button>

          </td>

        </tr>
      `
    ).join("");

  $("uTb")
    .querySelectorAll("[data-rs]")
    .forEach(b=>{

      b.onclick=async()=>{

        const s=
          $("pw"+b.dataset.rs)
            .value;

        const x=
          await api(
            `/api/usuarios/${b.dataset.rs}/senha`,
            "POST",
            {
              senha:s
            }
          );

        $("uMsg").textContent=
          x.ok
          ?
          "Senha redefinida."
          :
          (
            x.d.error||
            "Erro ao redefinir."
          );

        if(x.ok){

          $("pw"+b.dataset.rs)
            .value="";

        }

      };

    });

  $("uTb")
    .querySelectorAll("[data-at]")
    .forEach(b=>{

      b.onclick=async()=>{

        const x=
          await api(
            `/api/usuarios/${b.dataset.at}/ativo`,
            "POST",
            {
              ativo:
                b.dataset.v==="1"
            }
          );

        $("uMsg").textContent=
          x.ok
          ?
          "Situação atualizada."
          :
          (
            x.d.error||
            "Erro."
          );

        renderUsuarios();

      };

    });

  carregarAuditoria();

}

async function carregarAuditoria(){

  const r=
    await api(
      "/api/auditoria"
    );

  if(!r.ok)return;

  $("aTb").innerHTML=
    r.d.length
    ?
    r.d.map(
      a=>`
        <tr>
          <td>
            ${esc(dataLocal(a.quando))}
          </td>
          <td>
            <b>${esc(a.usuario)}</b>
          </td>
          <td>
            ${esc(a.acao)}
          </td>
        </tr>
      `
    ).join("")
    :
    `
      <tr>
        <td colspan="3">
          Nenhuma alteração registrada ainda.
        </td>
      </tr>
    `;

}

const aAtual=$("aAtual");

if(aAtual){

  aAtual.onclick=
    carregarAuditoria;

}

const uAdd=$("uAdd");

if(uAdd){

  uAdd.onclick=async()=>{

    const r=
      await api(
        "/api/usuarios",
        "POST",
        {
          username:
            $("uNome")
              .value
              .trim(),

          password:
            $("uSenha").value,

          is_admin:
            $("uPerfil").value==="1"
        }
      );

    $("uMsg").textContent=
      r.ok
      ?
      "Usuário cadastrado."
      :
      (
        r.d.error||
        "Não foi possível cadastrar."
      );

    if(r.ok){

      $("uNome").value="";
      $("uSenha").value="";

      renderUsuarios();

    }

  };

}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function iniciarApp(){

  try{

    await load();

    S.man=S.man||[];

    S.cfg=
      S.cfg||
      {
        mesmoDia:true
      };

    garantirCategorias();

    preencherCategorias();

    $("cfgMd").checked=
      S.cfg.mesmoDia;

    const hoje=
      hojeLocal();

    const def=(id,v)=>{

      const el=$(id);

      if(
        el&&
        !el.value
      ){

        el.value=v;

      }

    };

    def(
      "mIni",
      hoje
    );

    def(
      "dDia",
      hoje
    );

    def(
      "qIni",
      add(hoje,7)
    );

    def(
      "qFim",
      add(hoje,14)
    );

    def(
      "nIni",
      hoje
    );

    def(
      "nFim",
      add(hoje,7)
    );

    status(
      "Conectado"
    );

    fillSel();

    renderCategorias();

    renderLoc();
    renderEq();
    renderMan();
    renderBk();

    if(!timersOk){

      timersOk=true;

      setInterval(
        ()=>{
          if(!logado)return;

          sincronizar();

        },
        5000
      );

      document.addEventListener(
        "visibilitychange",
        ()=>{
          if(!document.hidden){
            sincronizar();
          }
        }
      );

      window.addEventListener(
        "focus",
        ()=>{
          sincronizar();
        }
      );

      window.addEventListener(
        "beforeunload",
        e=>{

          if(
            salvando||
            pendente
          ){

            e.preventDefault();

            e.returnValue="";

          }

        }
      );

    }

  }catch(e){

    console.error(e);

  }

}


// ============================================================
// CARREGAMENTO
// ============================================================

async function load(){

  try{

    const r=
      await fetch(
        "/api/state"
      );

    if(r.status===401){

      sessaoExpirada();

      throw new Error("401");

    }

    if(!r.ok){

      throw new Error(
        "Falha ao carregar dados"
      );

    }

    REV=
      +(
        r.headers.get("X-Rev")||
        0
      );

    const data=
      await r.json();

    if(data){

      S=data;

      S.man=S.man||[];

      S.cfg=
        S.cfg||
        {
          mesmoDia:true
        };

      garantirCategorias();

      return;

    }

  }catch(e){

    if(e.message!=="401"){

      alert(
        "Não foi possível conectar ao banco local. " +
        "Verifique se o servidor está funcionando."
      );

    }

    throw e;

  }

  S={
    eq:[],
    loc:[],
    man:[],
    cfg:{
      mesmoDia:true
    },
    categorias:[
      {
        id:"sem-categoria",
        nome:"Sem categoria"
      }
    ]
  };

}


// ============================================================
// MUDANÇA DE DIA
// ============================================================

let diaAtual=hojeLocal();

function virouDia(){

  const h=hojeLocal();

  if(h===diaAtual)return;

  const ant=diaAtual;

  diaAtual=h;

  [
    ["dDia",0],
    ["nIni",0],
    ["nFim",7],
    ["mIni",0],
    ["qIni",7],
    ["qFim",14]
  ].forEach(
    ([i,n])=>{

      const el=$(i);

      if(
        el&&
        el.value===add(ant,n)
      ){

        el.value=
          add(h,n);

      }

    }
  );

  renderTudo();

}


// ============================================================
// START
// ============================================================

checarUsuario();