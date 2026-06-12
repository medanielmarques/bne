// =============================================
// BNE – API serverless (Vercel)
// Arquivo: api/contas.js
// =============================================

const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "data", "contas.json");

function lerDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

function salvarDB(contas) {
  fs.writeFileSync(DB_PATH, JSON.stringify(contas, null, 2), "utf8");
}

function agora() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function gerarNumero(tipo, contas) {
  const prefixos = { fisica: "FI", empresarial: "EM", governamental: "GO", admin: "AD" };
  const pref = prefixos[tipo] || "CT";
  const ano  = new Date().getFullYear();
  const seq  = contas.length + 1;
  return `${pref}.${ano}.${seq}`;
}

function ok(dados = {}) {
  return { ok: true, ...dados };
}

function erro(msg, status = 400) {
  return { ok: false, erro: msg, _status: status };
}

// ---- Handlers ----

const handlers = {

  login({ numero, senha }, contas) {
    const conta = contas.find(c => c.numero === numero && c.senha === senha);
    if (!conta) return erro("Conta ou senha inválida.");
    const { senha: _, ...contaSemSenha } = conta;
    return ok({ conta: contaSemSenha });
  },

  listar(_body, contas) {
    const semSenhas = contas.map(({ senha, ...c }) => c);
    return ok({ contas: semSenhas });
  },

  criarConta({ tipo, nome, senha, saldo = 0 }, contas) {
    if (!nome || !senha) return erro("Nome e senha são obrigatórios.");
    const numero = gerarNumero(tipo, contas);
    contas.push({
      numero,
      nome,
      senha,
      tipo,
      saldo: Number(saldo),
      historico: [],
      emprestimo: { ativo: false, valor: 0 },
    });
    salvarDB(contas);
    return ok({ numero });
  },

  editarConta({ numero, nome, senha }, contas) {
    const conta = contas.find(c => c.numero === numero);
    if (!conta) return erro("Conta não encontrada.");
    if (nome)  conta.nome  = nome;
    if (senha) conta.senha = senha;
    salvarDB(contas);
    return ok();
  },

  excluirConta({ numero }, contas) {
    const idx = contas.findIndex(c => c.numero === numero);
    if (idx === -1) return erro("Conta não encontrada.");
    contas.splice(idx, 1);
    salvarDB(contas);
    return ok();
  },

  transferir({ origemNumero, destinoNumero, valor }, contas) {
    const origem  = contas.find(c => c.numero === origemNumero);
    const destino = contas.find(c => c.numero === destinoNumero);
    if (!origem)  return erro("Conta de origem não encontrada.");
    if (!destino) return erro("Conta de destino não encontrada.");
    if (origem.saldo < valor) return erro("Saldo insuficiente.");

    origem.saldo  -= valor;
    destino.saldo += valor;

    const data = agora();
    origem.historico.push({ data, tipo: "Transferência Enviada",   valor: `-${valor}` });
    destino.historico.push({ data, tipo: "Transferência Recebida", valor: `+${valor}` });

    salvarDB(contas);
    const { senha: _, ...origemSemSenha } = origem;
    return ok({ origem: origemSemSenha });
  },

  transferenciaAdmin({ origemNumero, destinoNumero, valor }, contas) {
    const origem  = contas.find(c => c.numero === origemNumero);
    const destino = contas.find(c => c.numero === destinoNumero);
    if (!origem)  return erro("Conta de origem não encontrada.");
    if (!destino) return erro("Conta de destino não encontrada.");

    origem.saldo  -= valor;
    destino.saldo += valor;

    const data = agora();
    origem.historico.push({ data, tipo: "Transferência Adm. Enviada",   valor: `-${valor}` });
    destino.historico.push({ data, tipo: "Transferência Adm. Recebida", valor: `+${valor}` });

    salvarDB(contas);
    return ok();
  },

  emitirMoeda({ numero, valor }, contas) {
    const conta = contas.find(c => c.numero === numero);
    if (!conta) return erro("Conta não encontrada.");
    conta.saldo += valor;
    conta.historico.push({ data: agora(), tipo: "Emissão Monetária", valor: `+${valor}` });
    salvarDB(contas);
    return ok();
  },

  queimarMoeda({ numero, valor }, contas) {
    const conta = contas.find(c => c.numero === numero);
    if (!conta) return erro("Conta não encontrada.");
    if (conta.saldo < valor) return erro("Saldo insuficiente para queimar.");
    conta.saldo -= valor;
    conta.historico.push({ data: agora(), tipo: "Queima Monetária", valor: `-${valor}` });
    salvarDB(contas);
    return ok();
  },

  concederEmprestimo({ numero, valor }, contas) {
    const conta = contas.find(c => c.numero === numero);
    if (!conta) return erro("Conta não encontrada.");
    conta.saldo += valor;
    conta.emprestimo.ativo  = true;
    conta.emprestimo.valor += valor;
    conta.historico.push({ data: agora(), tipo: "Empréstimo Concedido", valor: `+${valor}` });
    salvarDB(contas);
    return ok();
  },

  quitarEmprestimo({ numero }, contas) {
    const conta = contas.find(c => c.numero === numero);
    if (!conta) return erro("Conta não encontrada.");
    if (!conta.emprestimo.ativo) return erro("Esta conta não tem empréstimo ativo.");
    const divida = conta.emprestimo.valor;
    if (conta.saldo < divida) return erro("Saldo insuficiente para quitar o empréstimo.");
    conta.saldo -= divida;
    conta.historico.push({ data: agora(), tipo: "Empréstimo Quitado", valor: `-${divida}` });
    conta.emprestimo = { ativo: false, valor: 0 };
    salvarDB(contas);
    return ok();
  },
};

// ---- Handler principal ----

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json(erro("Método não permitido."));
    return;
  }

  const body = req.body || {};
  const { acao, ...params } = body;

  if (!acao || !handlers[acao]) {
    res.status(400).json(erro("Ação inválida."));
    return;
  }

  try {
    const contas = lerDB();
    const resultado = handlers[acao](params, contas);
    const status = resultado._status || 200;
    delete resultado._status;
    res.status(status).json(resultado);
  } catch (e) {
    console.error(e);
    res.status(500).json(erro("Erro interno do servidor."));
  }
};
