import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  iniciarBanco,
  listarPerguntas,
  verificarResposta
} from './database';

const app = express();
const PORTA = 3333;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ mensagem: 'Backend do Quiz de Sintaxe funcionando!' });
});

app.get('/api/perguntas/:tipo', (req, res) => {
  const tipoParam = req.params.tipo;

  // Dicionário mapeando o que o Frontend pede -> para o que está no JSON/Banco
  const mapeamentoTipos: Record<string, string> = {
    'quiz': 'quiz',
    'verdadeiro-falso': 'vf',
    'vf': 'vf',
    'an': 'an',
    'ligar-colunas': 'lc',
    'lc': 'lc',
    'encontre-erro': 'an' 
  };


  // Verifica se o parâmetro enviado pela URL existe no nosso mapa
  if (!(tipoParam in mapeamentoTipos)) {
    res.status(400).json({ mensagem: 'Tipo de quiz inválido.' });
    return;
  }

  // Pega o tipo de quiz da questão
  const tipoBanco = mapeamentoTipos[tipoParam];

  res.json(listarPerguntas(tipoBanco));
});

app.post('/api/perguntas/:id/responder', (req, res) => {
  const id = req.params.id;
  const resposta = req.body?.resposta;

  if (resposta === undefined) {
    res.status(400).json({ mensagem: 'Envie uma resposta.' });
    return;
  }

  const resultado = verificarResposta(id, resposta);

  if (!resultado) {
    res.status(404).json({ mensagem: 'Pergunta não encontrada.' });
    return;
  }

  res.json(resultado);
});

async function iniciarServidor() {
  try {
    await iniciarBanco();

    app.listen(PORTA, () => {
      console.log(`Backend rodando em http://localhost:${PORTA}`);
    });
  } catch (erro) {
    console.error('Erro ao iniciar o backend:', erro);
    process.exit(1);
  }
}

iniciarServidor();
