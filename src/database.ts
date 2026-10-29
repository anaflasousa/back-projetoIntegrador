
import initSqlJs, { type Database } from 'sql.js';
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
  respostaCorreta: number | null;
  explicacao: string;
}

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
      itens: pergunta.itens
    });

    banco.run(
      `INSERT OR REPLACE INTO perguntas
       (id, tipo, enunciado, dados, resposta_correta, explicacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        pergunta.id,
        pergunta.tipo,
        pergunta.enunciado,
        dados,
        JSON.stringify(pergunta.respostaCorreta),
        pergunta.explicacao
      ]
    );
  }
}


export function listarPerguntas(tipo: string) {
  const resultado = banco.exec(
    `SELECT id, tipo, enunciado, dados
     FROM perguntas WHERE tipo = '${tipo.replace(/'/g, "''")}'`
  );

  if (resultado.length === 0) return [];

  return resultado[0].values.map((linha) => {
    const dados = JSON.parse(String(linha[3]));

    // Não envia as respostas corretas dos termos para o frontend.
    if (linha[1] === 'ligar-colunas' && dados.itens) {
      dados.itens = dados.itens.map(
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

  // Validação das associações do desafio Ligar colunas.
  if (tipo === 'ligar-colunas') {
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

  // Validação dos outros desafios.
  return {
    correta: JSON.stringify(resposta) === String(respostaCorretaTexto),
    explicacao: String(explicacao)
  };
}


export function obterBanco(): Database {
  return banco;
}

export function salvarBanco(): void {
  const dados = banco.export();
  fs.writeFileSync(caminhoBanco, Buffer.from(dados));
}
