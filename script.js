// =============================================
// BNE – Banco Nacional da Escorvânia
// =============================================

const API = "/api/contas";

let usuarioLogado = null;
let todasContas = [];

// ---- Utilitários ----

function fmt(valor) {
  return "Ry$ " + Number(valor).toFixed(2).replace(".", ",");
}

function mostrarErro(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function limparErro(elId) {
  const el = document.getElementById(elId);
  if (el) el.hidden = true;
}

function confirmar(mensagem, callback) {
  document.getElementById("modalMensagem").textContent = mensagem;
  document.getElementById("modalOverlay").classList.add("visivel");
  document.getElementById("modalConfirmar").onclick = () => {
    fecharModal();
    callback();
  };
}

function fecharModal() {
  document.getElementById("modalOverlay").classList.remove("visivel");
}

async function api(acao, dados = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao, ...dados }),
  });
  return res.json();
}

// ---- Login / Logout ----

async function login() {
  limparErro("loginErro");
  const numero = document.getElementById("loginConta").value.trim();
  const senha  = document.getElementById("loginSenha").value;

  if (!numero || !senha) {
    mostrarErro("loginErro", "Preencha o número da conta e a senha.");
    return;
  }

  const resp = await api("login", { numero, senha });

  if (!resp.ok) {
    mostrarErro("loginErro", resp.erro || "Conta ou senha inválida.");
    return;
  }

  usuarioLogado = resp.conta;
  document.getElementById("loginCard").hidden = true;

  if (usuarioLogado.tipo === "admin") {
    document.getElementById("adminPanel").hidden = false;
    carregarAdmin();
  } else {
    document.getElementById("clientePanel").hidden = false;
    document.getElementById("clienteNome").textContent = usuarioLogado.nome;
    atualizarPainelCliente();
  }
}

function logout() {
  location.reload();
}

// ---- Painel cliente ----

function atualizarPainelCliente() {
  document.getElementById("saldoAtual").textContent = fmt(usuarioLogado.saldo);

  const emp = usuarioLogado.emprestimo;
  document.getElementById("emprestimoAtual").textContent =
    emp && emp.ativo ? fmt(emp.valor) : "—";

  renderHistorico(usuarioLogado.historico || []);
}

function renderHistorico(historico) {
  const tbody = document.getElementById("historicoTabela");
  if (!historico.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="vazio">Nenhuma movimentação.</td></tr>';
    return;
  }
  tbody.innerHTML = historico
    .slice()
    .reverse()
    .map(item => {
      const positivo = String(item.valor).startsWith("+");
      const cls = positivo ? "valor-positivo" : "valor-negativo";
      return `<tr>
        <td>${item.data}</td>
        <td>${item.tipo}</td>
        <td class="col-valor ${cls}">${item.valor}</td>
      </tr>`;
    })
    .join("");
}

async function transferir() {
  limparErro("transferenciaErro");
  const destinoNumero = document.getElementById("destino").value.trim();
  const valor = parseFloat(document.getElementById("valorTransferencia").value);

  if (!destinoNumero) {
    mostrarErro("transferenciaErro", "Informe a conta de destino.");
    return;
  }
  if (!valor || valor <= 0) {
    mostrarErro("transferenciaErro", "Informe um valor válido.");
    return;
  }
  if (valor > usuarioLogado.saldo) {
    mostrarErro("transferenciaErro", "Saldo insuficiente.");
    return;
  }

  confirmar(
    `Transferir ${fmt(valor)} para a conta ${destinoNumero}?`,
    async () => {
      const resp = await api("transferir", {
        origemNumero: usuarioLogado.numero,
        destinoNumero,
        valor,
      });
      if (!resp.ok) {
        mostrarErro("transferenciaErro", resp.erro || "Erro na transferência.");
        return;
      }
      usuarioLogado = resp.origem;
      document.getElementById("destino").value = "";
      document.getElementById("valorTransferencia").value = "";
      atualizarPainelCliente();
    }
  );
}

// ---- Painel admin ----

async function carregarAdmin() {
  const resp = await api("listar");
  if (!resp.ok) return;
  todasContas = resp.contas;
  renderDashboard(todasContas);
  renderListaContas(todasContas);
}

function renderDashboard(contas) {
  const totalCirculacao = contas.reduce((s, c) => s + Number(c.saldo), 0);
  const totalEmprestimos = contas.reduce((s, c) => s + (c.emprestimo?.ativo ? Number(c.emprestimo.valor) : 0), 0);
  const nContas = contas.length;

  document.getElementById("dashboardStats").innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Contas ativas</span>
      <span class="stat-value">${nContas}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Ry$ em circulação</span>
      <span class="stat-value">${fmt(totalCirculacao)}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Empréstimos em aberto</span>
      <span class="stat-value stat-secondary">${fmt(totalEmprestimos)}</span>
    </div>
  `;
}

function renderListaContas(contas) {
  const tbody = document.getElementById("listaContas");
  if (!contas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma conta cadastrada.</td></tr>';
    return;
  }
  tbody.innerHTML = contas.map(c => `
    <tr>
      <td><code>${c.numero}</code></td>
      <td>${c.nome}</td>
      <td>${c.tipo}</td>
      <td class="col-valor">${fmt(c.saldo)}</td>
      <td class="col-valor">${c.emprestimo?.ativo ? fmt(c.emprestimo.valor) : "—"}</td>
      <td>
        <button class="btn btn-danger btn-sm"
          onclick="excluirConta('${c.numero}', '${c.nome}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function filtrarContas() {
  const q = document.getElementById("buscaConta").value.toLowerCase();
  const filtradas = todasContas.filter(c =>
    c.nome.toLowerCase().includes(q) || c.numero.toLowerCase().includes(q)
  );
  renderListaContas(filtradas);
}

async function criarConta() {
  const tipo  = document.getElementById("tipoConta").value;
  const nome  = document.getElementById("nomeConta").value.trim();
  const senha = document.getElementById("senhaConta").value;
  const saldo = parseFloat(document.getElementById("saldoConta").value) || 0;

  if (!nome || !senha) {
    alert("Preencha o nome e a senha.");
    return;
  }

  const resp = await api("criarConta", { tipo, nome, senha, saldo });
  if (!resp.ok) { alert(resp.erro || "Erro ao criar conta."); return; }

  document.getElementById("nomeConta").value  = "";
  document.getElementById("senhaConta").value = "";
  document.getElementById("saldoConta").value = "";
  carregarAdmin();
  alert(`Conta criada: ${resp.numero}`);
}

async function editarConta() {
  const numero = document.getElementById("editarNumero").value.trim();
  const nome   = document.getElementById("novoNome").value.trim();
  const senha  = document.getElementById("novaSenha").value;

  if (!numero) { alert("Informe o número da conta."); return; }
  if (!nome && !senha) { alert("Informe ao menos um campo para alterar."); return; }

  const resp = await api("editarConta", { numero, nome, senha });
  if (!resp.ok) { alert(resp.erro || "Erro ao editar conta."); return; }

  document.getElementById("editarNumero").value = "";
  document.getElementById("novoNome").value     = "";
  document.getElementById("novaSenha").value    = "";
  carregarAdmin();
  alert("Conta atualizada.");
}

function excluirConta(numero, nome) {
  confirmar(
    `Excluir a conta de ${nome} (${numero})? Esta ação não pode ser desfeita.`,
    async () => {
      const resp = await api("excluirConta", { numero });
      if (!resp.ok) { alert(resp.erro || "Erro ao excluir."); return; }
      carregarAdmin();
    }
  );
}

async function transferenciaAdmin() {
  const origemNumero  = document.getElementById("origemAdmin").value.trim();
  const destinoNumero = document.getElementById("destinoAdmin").value.trim();
  const valor = parseFloat(document.getElementById("valorAdmin").value);

  if (!origemNumero || !destinoNumero || !valor || valor <= 0) {
    alert("Preencha todos os campos com valores válidos.");
    return;
  }

  confirmar(
    `Transferência administrativa: ${fmt(valor)} de ${origemNumero} → ${destinoNumero}?`,
    async () => {
      const resp = await api("transferenciaAdmin", { origemNumero, destinoNumero, valor });
      if (!resp.ok) { alert(resp.erro || "Erro na transferência."); return; }
      document.getElementById("origemAdmin").value  = "";
      document.getElementById("destinoAdmin").value = "";
      document.getElementById("valorAdmin").value   = "";
      carregarAdmin();
      alert("Transferência realizada.");
    }
  );
}

async function emitirMoeda() {
  const numero = document.getElementById("contaEmissao").value.trim();
  const valor  = parseFloat(document.getElementById("valorEmissao").value);
  const tipo   = document.getElementById("tipoEmissao").value;

  if (!numero || !valor || valor <= 0) {
    alert("Preencha a conta e um valor válido.");
    return;
  }

  const acao = tipo === "queimar" ? "queimarMoeda" : "emitirMoeda";
  const msg  = tipo === "queimar"
    ? `Queimar ${fmt(valor)} da conta ${numero}?`
    : `Emitir ${fmt(valor)} para a conta ${numero}?`;

  confirmar(msg, async () => {
    const resp = await api(acao, { numero, valor });
    if (!resp.ok) { alert(resp.erro || "Erro na operação."); return; }
    document.getElementById("contaEmissao").value = "";
    document.getElementById("valorEmissao").value = "";
    carregarAdmin();
    alert("Operação realizada.");
  });
}

async function concederEmprestimo() {
  const numero = document.getElementById("contaEmprestimo").value.trim();
  const valor  = parseFloat(document.getElementById("valorEmprestimo").value);

  if (!numero || !valor || valor <= 0) {
    alert("Preencha a conta e um valor válido.");
    return;
  }

  confirmar(
    `Conceder empréstimo de ${fmt(valor)} para a conta ${numero}?`,
    async () => {
      const resp = await api("concederEmprestimo", { numero, valor });
      if (!resp.ok) { alert(resp.erro || "Erro ao conceder empréstimo."); return; }
      document.getElementById("contaEmprestimo").value = "";
      document.getElementById("valorEmprestimo").value = "";
      carregarAdmin();
      alert("Empréstimo concedido.");
    }
  );
}

async function quitarEmprestimo() {
  const numero = document.getElementById("contaQuitar").value.trim();
  if (!numero) { alert("Informe o número da conta."); return; }

  confirmar(
    `Quitar o empréstimo da conta ${numero}? O saldo será debitado pelo valor da dívida.`,
    async () => {
      const resp = await api("quitarEmprestimo", { numero });
      if (!resp.ok) { alert(resp.erro || "Erro ao quitar empréstimo."); return; }
      document.getElementById("contaQuitar").value = "";
      carregarAdmin();
      alert("Empréstimo quitado.");
    }
  );
}
