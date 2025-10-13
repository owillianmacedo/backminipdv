const admin = require("firebase-admin");
const {onCall} = require("firebase-functions/v2/https");

/**
 * Exclui uma categoria e todos os produtos associados, mesmo em grandes volumes.
 * Valida se o usuário é proprietário da loja.
 * Usa paginação segura com margem de 400.
 * Registra log de auditoria.
 */
exports.deletaCat = onCall(async (request) => {
  const {lojaId, categoriaId} = request.data;
  const uid = request.auth?.uid;

  if (!uid) return {error: "Usuário não autenticado"};
  if (!lojaId || !categoriaId) return {error: "Dados incompletos"};

  const db = admin.firestore();

  try {
    // Verifica se o usuário é proprietário da loja
    const lojaDoc = await db.doc(`lojas/${lojaId}`).get();
    const lojaData = lojaDoc.data();

    if (!lojaData?.proprietario?.includes(uid)) {
      return {error: "Usuário não autorizado para excluir esta categoria"};
    }

    const produtosRef = db.collection(`lojas/${lojaId}/produtos`);
    let lastDoc = null;
    let totalExcluidos = 0;

    // Paginação em blocos de 400
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = produtosRef
          .where("categoria", "==", categoriaId)
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(400);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalExcluidos += snapshot.size;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    // Exclui a categoria
    const categoriaRef = db.doc(`lojas/${lojaId}/categorias/${categoriaId}`);
    await categoriaRef.delete();

    // Log de auditoria
    await db.collection("logs").add({
      tipo: "exclusao_categoria",
      lojaId,
      categoriaId,
      uid,
      totalExcluidos,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Categoria e ${totalExcluidos} produtos excluídos com sucesso.`,
    };
  } catch (error) {
    console.error("Erro ao excluir categoria e produtos:", error);
    return {error: "Erro ao excluir categoria e produtos"};
  }
});

module.exports = {deletaCat: exports.deletaCat};
