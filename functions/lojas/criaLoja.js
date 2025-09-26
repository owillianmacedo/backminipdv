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
    if (!uid) return {error: "Usuário não autenticado"};
    // Verificar disponibilidade de Trial
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    // trial ainda disponivel
    if (!userData.trial) {
      const seteDias = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );
      loja.plano = {
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
      await admin.firestore().collection("users").doc(uid).update({trial: true}); // marcar que usou trial
    }
    if (userData.trial) {
      loja.plano = {
        ativoAte: admin.firestore.Timestamp.now(),
        compras: [],
      };
    }
    const pessoa = {uid: uid, funcao: "proprietario", permissoes: [{all: true}]};
    loja.pessoas = [pessoa.uid],
    loja.permissoes = [pessoa],
    loja.proprietarios = [uid];
    loja.criadoEm = admin.firestore.FieldValue.serverTimestamp();

    try {
      const docRef = await admin.firestore().collection("lojas").add(loja);
      return {id: docRef.id};
    } catch (error) {
      console.error("Erro ao criar loja:", error);
      return {error: "Erro ao criar loja"};
    }
  }
});
module.exports = {criaLoja: exports.criaLoja};
