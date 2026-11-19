
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

interface ItemLigar {
  texto: string;
  respostaCorreta: number;
}

interface Pergunta {
  id: string;
  tipo: string;
  enunciado: string;
  opcoes?: string[];
  itens?: ItemLigar[];
  colunaA?: string[];
  colunaB?: string[];
  respostaCorreta: number | null;
  explicacao: string;
}
  

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  ativo: boolean;
  criadoEm: string;
  ultimoLogin: string | null;
}

export type UsuarioPublico = Omit<Usuario, 'senhaHash'>;

const pastaDados = path.resolve(process.cwd(), 'src', 'data');
const caminhoJson = path.join(pastaDados, 'perguntas.json');
const caminhoBanco = path.resolve(process.cwd(), 'data', 'quiz.sqlite');

let banco: Database;

export async function iniciarBanco(): Promise<void> {
  const SQL = await initSqlJs();

  fs.mkdirSync(path.dirname(caminhoBanco), { recursive: true });

  if (fs.existsSync(caminhoBanco)) {
    banco = new SQL.Database(
      new Uint8Array(fs.readFileSync(caminhoBanco))
    );
  } else {
    banco = new SQL.Database();
  }

  banco.run(`
    CREATE TABLE IF NOT EXISTS perguntas (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      enunciado TEXT NOT NULL,
      dados TEXT NOT NULL,
      resposta_correta TEXT NOT NULL,
      explicacao TEXT NOT NULL
    )
  `);
  
  banco.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TEXT
  )
`);
  

  carregarPerguntas();
  salvarBanco();
}

function carregarPerguntas(): void {
  const conteudo = fs.readFileSync(caminhoJson, 'utf-8');
  const perguntas = JSON.parse(conteudo) as Pergunta[];

  banco.run('DELETE FROM perguntas');

  for (const pergunta of perguntas) {
    const dados = JSON.stringify({
      opcoes: pergunta.opcoes,
      itens: pergunta.itens,
      colunaA: pergunta.colunaA,
      colunaB: pergunta.colunaB
    });
    const respostaSalvar = pergunta.respostaCorreta !== undefined
      ? JSON.stringify(pergunta.respostaCorreta)
      : "null";
    banco.run(
      `INSERT OR REPLACE INTO perguntas
       (id, tipo, enunciado, dados, resposta_correta, explicacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        pergunta.id,
        pergunta.tipo,
        pergunta.enunciado,
        dados,
        respostaSalvar,
        pergunta.explicacao
      ]
    );
  }
}



export function listarPerguntas(tipo: string) {
  // Permite que o frontend use "ligar-colunas" mesmo que o JSON utilize "lc".
  const tipos: Record<string, string> = {
    'ligar-colunas': 'lc',
    'verdadeiro-falso': 'vf'
  };

  const tipoBanco = tipos[tipo] ?? tipo;

  const resultado = banco.exec(
    `SELECT id, tipo, enunciado, dados
     FROM perguntas WHERE tipo = '${tipoBanco.replace(/'/g, "''")}'`
  );

  if (resultado.length === 0) return [];

  return resultado[0].values.map((linha) => {
    const dados = JSON.parse(String(linha[3]));

    if (linha[1] === 'lc') {
      dados.opcoes = dados.colunaB ?? [];

      // Não envia as respostas corretas para o frontend.
      dados.itens = (dados.itens ?? []).map(
        (item: { texto: string }) => ({
          texto: item.texto
        })
      );
    }

    return {
      id: linha[0],
      tipo: linha[1],
      enunciado: linha[2],
      ...dados
    };
  });
}



export function verificarResposta(
  id: string,
  resposta: unknown
): {
  correta: boolean;
  explicacao: string;
  resultados?: Record<string, boolean>;
} | null {
  const resultado = banco.exec(
    `SELECT tipo, dados, resposta_correta, explicacao
     FROM perguntas WHERE id = '${id.replace(/'/g, "''")}'`
  );

  if (resultado.length === 0) return null;

  const [tipo, dadosTexto, respostaCorretaTexto, explicacao] =
    resultado[0].values[0];

  // Validação das associações do desafio Ligar colunas
  if (tipo === 'lc' || tipo === 'ligar-colunas') {
    const dados = JSON.parse(String(dadosTexto));
    const itens = dados.itens as ItemLigar[];

    if (
      typeof resposta !== 'object' ||
      resposta === null ||
      Array.isArray(resposta)
    ) {
      return {
        correta: false,
        explicacao: String(explicacao)
      };
    }

    const associacoes = resposta as Record<string, unknown>;
    const resultados: Record<string, boolean> = {};

    for (let i = 0; i < itens.length; i++) {
      resultados[String(i)] =
        associacoes[String(i)] === itens[i].respostaCorreta;
    }

    return {
      correta: itens.every((_, i) => resultados[String(i)] === true),
      explicacao: String(explicacao),
      resultados
    };
  }

  // Validação dos outros desafios
  return {
    correta: JSON.stringify(resposta) === String(respostaCorretaTexto),
    explicacao: String(explicacao)
  };
}
const colunasUsuario =
  'id, nome, email, senha_hash, ativo, criado_em, ultimo_login';

function linhaParaUsuario(linha: SqlValue[]): Usuario {
  return {
    id: Number(linha[0]),
    nome: String(linha[1]),
    email: String(linha[2]),
    senhaHash: String(linha[3]),
    ativo: Number(linha[4]) === 1,
    criadoEm: String(linha[5]),
    ultimoLogin: linha[6] === null ? null : String(linha[6])
  };
}

function paraPublico(usuario: Usuario): UsuarioPublico {
  const { senhaHash: _hash, ...publico } = usuario;
  return publico;
}

function buscarUsuarioPorEmail(email: string): Usuario | null {
  const resultado = banco.exec(
    `SELECT ${colunasUsuario} FROM usuarios WHERE email = ?`,
    [email]
  );

  if (resultado.length === 0) return null;
  return linhaParaUsuario(resultado[0].values[0]);
}

export function buscarUsuarioPorId(id: number): UsuarioPublico | null {
  const resultado = banco.exec(
    `SELECT ${colunasUsuario} FROM usuarios WHERE id = ? AND ativo = 1`,
    [id]
  );

  if (resultado.length === 0) return null;
  return paraPublico(linhaParaUsuario(resultado[0].values[0]));
}
export async function cadastrarUsuario(
  nome: string,
  email: string,
  senha: string
): Promise<{ ok: true; usuario: UsuarioPublico } | { ok: false; erro: string }> {
  const nomeLimpo = nome.trim();
  const emailNorm = email.trim().toLowerCase();

  // Validações básicas
  if (!nomeLimpo || !emailNorm || !senha) {
    return { ok: false, erro: 'Preencha todos os campos' };
  }
  if (senha.length < 8) {
    return { ok: false, erro: 'A senha precisa ter pelo menos 8 caracteres' };
  }
  if (buscarUsuarioPorEmail(emailNorm)) {
    return { ok: false, erro: 'E-mail já cadastrado' };
  }

  // Embaralha a senha (12 é o "custo": quanto maior, mais seguro e mais lento)
  const senhaHash = await bcrypt.hash(senha, 12);

  banco.run(
    'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
    [nomeLimpo, emailNorm, senhaHash]
  );

  const id = banco.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  salvarBanco();

  const usuario = buscarUsuarioPorId(id);
  if (!usuario) return { ok: false, erro: 'Não foi possível criar o usuário' };

  return { ok: true, usuario };
}

export async function autenticarUsuario(
  email: string,
  senha: string
): Promise<UsuarioPublico | null> {
  const usuario = buscarUsuarioPorEmail(email.trim().toLowerCase());
  if (!usuario || !usuario.ativo) return null;

  // Compara a senha digitada com o hash guardado
  const confere = await bcrypt.compare(senha, usuario.senhaHash);
  if (!confere) return null;

  banco.run(
    'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?',
    [usuario.id]
  );
  salvarBanco();

  return paraPublico(usuario);
}

export function obterBanco(): Database {
  return banco;
}

export function salvarBanco(): void {
  const dados = banco.export();
  fs.writeFileSync(caminhoBanco, Buffer.from(dados));
}
