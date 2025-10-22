const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");

exports.abreCaixa = onCall(async (request) => {
  const data = request.data;
  const lojaId = data.lojaId;
  const user = request.auth?.uid;
  const saldo = data.saldo;
  const agora = admin.firestore.Timestamp.now();

  if (!user) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const lojaRef = admin.firestore().collection("lojas").doc(lojaId);
  const lojaSnap = await lojaRef.get();

  if (!lojaSnap.exists) {
    throw new HttpsError("not-found", "Loja não encontrada.");
  }

  const lojaData = lojaSnap.data();
  const assinatura = lojaData?.acesso?.ativoAte;

  if (assinatura && assinatura.toDate() < agora.toDate()) {
    return {
      success: false,
      message: "Acesso expirado, renove seu acesso!",
    };
  }

  const caixaRef = lojaRef.collection("caixas").doc("ativo");
  const caixaSnap = await caixaRef.get();

  if (caixaSnap.exists && caixaSnap.data()?.aberto) {
    return {
      success: false,
      message: "Já existe um caixa aberto!",
    };
  }

  await caixaRef.set({
    aberto: true,
    saldo,
    registros: [],
    criadoEm: agora,
  });

  return {
    success: true,
    message: "Caixa aberto com sucesso!",
  };
});

module.exports ={abreCaixa: exports.abreCaixa};
