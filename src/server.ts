
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
  const tiposValidos = [
    'quiz',
    'verdadeiro-falso',
    'encontre-erro',
    'ligar-colunas'
  ];

  const tipo = req.params.tipo;

  if (!tiposValidos.includes(tipo)) {
    res.status(400).json({ mensagem: 'Tipo de quiz inválido.' });
    return;
  }

  res.json(listarPerguntas(tipo));
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
