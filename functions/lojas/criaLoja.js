const admin = require("firebase-admin");
const {onCall} = require("firebase-functions/v2/https");
/**
 * @params {object} request - Objeto de requisição contendo dados da loja e do usuário.
 * @returns {object} - Retorna um objeto com o ID da nova loja ou uma mensagem de erro.
 * Cria uma nova loja no Firestore.
 * Verifica se o usuário autenticado pode criar uma loja.
 * Se for o primeiro usuário, concede um período de teste (trial) de 7 dias.
 * Adiciona o usuário como proprietário da loja com permissões totais.
 * Retorna o ID da nova loja ou uma mensagem de erro.
 */
exports.criaLoja = onCall(async (request) => {
  const dados = request.data;
  if (!dados) {
    return {error: "Dados não informados"};
  }
  if (!dados.uid) {
    return {error: "Usuário não autenticado"};
  }
  if (!dados.loja) {
    return {error: "Dados da loja não informados"};
  } else {
    const loja = dados.loja;
    const uid = request.auth?.uid;
    // Verifica Existencia de Outra Loja
    const lojasExistentes = await admin.firestore()
        .collection("lojas")
        .where("proprietario", "array-contains", uid)
        .get();

    if (!lojasExistentes.empty) {
      return {error: "Usuário já possui uma loja cadastrada"};
    }
    // trial
    const seteDias = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );
    loja.acesso = {
      ativoAte: seteDias,
      compras: [
        {
          plano: "trial",
          criadoEm: admin.firestore.Timestamp.now(),
          preferencia: "trial",
          payment: "trial",
        },
      ],
    };
    loja.proprietario = [uid];
    loja.criadoEm = admin.firestore.FieldValue.serverTimestamp();
    try {
      const docRef = await admin.firestore().collection("lojas").add(loja);
      // Grava o Campo loja: docRef.id em users/${userId}
      await admin.firestore()
          .collection("users")
          .doc(uid)
          .set({loja: docRef.id}, {merge: true});
      const caixaConfig = {
        meiosDePagamento: [
          {nome: "Dinheiro", ativo: true, geraDebito: false, icon: "mdi-cash", index: 0},
          {nome: "Cartão de Crédito", ativo: true, geraDebito: false, icon: "mdi-credit-card", index: 1},
          {nome: "Cartão de Débito", ativo: true, icon: "mdi-credit-card-outline", index: 2},
          {nome: "Pix", ativo: true, geraDebito: false, icon: "mdi-cursor-move", index: 3},
          {nome: "Cheque", ativo: false, geraDebito: false, icon: "mdi-bank-check", index: 4},
          {nome: "Vale Alimentação", ativo: false, geraDebito: false, icon: "mdi-silverware-fork-knife", index: 5},
          {nome: "Vale Refeição", ativo: false, geraDebito: false, icon: "mdi-silverware-fork-knife", index: 6},
          {nome: "Fiado", ativo: false, geraDebito: true, icon: "mdi-account-cash", index: 7},
          {nome: "Outros", ativo: false, geraDebito: false, icon: "mdi-dots-horizontal", index: 8},
          {nome: "Crédito Loja", ativo: false, geraDebito: true, icon: "mdi-store", index: 9},
          {nome: "Boleto Bancário", ativo: false, geraDebito: false, icon: "mdi-barcode", index: 10},
          {nome: "Cartao Presente", ativo: false, geraDebito: false, icon: "mdi-wallet-giftcard", index: 11},
        ],
        catalogo: false,
        focoEAN: true,
        enviarVendaWhatsapp: false,
      };
      await admin.firestore()
          .collection("lojas")
          .doc(docRef.id)
          .collection("caixas")
          .doc("caixa")
          .set(caixaConfig);
      return {id: docRef.id};
    } catch (error) {
      console.error("Erro ao criar loja:", error);
      return {error: "Erro ao criar loja"};
    }
  }
});
module.exports = {criaLoja: exports.criaLoja};
