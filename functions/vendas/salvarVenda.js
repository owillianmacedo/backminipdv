const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
/**
 * @params {object} request - objeto contendo Array Cart, Objeto Cliente, objeto pagamento e id da loja
 * @returns {object} - Retorna um objeto com o ID da nova venda ou uma mensagem de erro.
 * @example {cliente: Proxy(Object), carrinho: Proxy(Array), pagamento: {…}, lojaId: 'ln3eJE3cAcLENQfPplbH'}
 *
 *
 */
exports.salvaVenda = onCall(async (request)=> {
  const db = admin.firestore();
  const venda = request.data;
  const lojaId = venda.lojaId;
  const carrinho = venda.carrinho;
  const cliente = venda.cliente;
  const pagamento = venda.pagamento;
  const fiado = pagamento.pagamentos.find((p) => p.meio.geraDebito);
  const agora = new Date();
  const vendaRef = db.collection(`lojas/${lojaId}/vendas`).doc();
  const vendaId = vendaRef.id;
  try {
    await db.runTransaction(async (transaction) => {
      // 1. Atualizar estoque e histórico de vendas por produto
      for (const item of carrinho) {
        if (item.controlaEstoque) {
          const produtoRef = db.doc(`lojas/${lojaId}/produtos/${item.id}`);
          transaction.update(produtoRef, {
            estoque: admin.firestore.FieldValue.increment(-item.quantidade),
            historicoVendas: admin.firestore.FieldValue.arrayUnion({
              quantidade: item.quantidade,
              data: agora,
              vendaId,
              lojaId,
            }),
          });
        }
      }

      // 2. Salvar a venda
      transaction.set(vendaRef, {
        id: vendaId,
        cliente,
        carrinho,
        pagamento,
        lojaId,
        data: agora,
      });

      // 3. Atualizar saldo e registrar movimentação do cliente (se fiado)
      if (fiado && cliente?.id) {
        const clienteRef = db.doc(`lojas/${lojaId}/clientes/${cliente.id}`);
        transaction.update(clienteRef, {
          saldo: admin.firestore.FieldValue.increment(fiado.valor),
        });

        const movimentacaoRef = clienteRef.collection("movimentacoes").doc();
        transaction.set(movimentacaoRef, {
          tipo: "Débito",
          valor: fiado.valor,
          origem: "Venda",
          vendaId,
          lojaId,
          data: agora,
        });
      }
    });

    return {status: "ok", vendaId};
  } catch (error) {
    console.error("Erro ao salvar venda:", error);
    throw new HttpsError("internal", "Erro ao salvar venda: " + error.message);
  }
},
);
module.exports = {salvaVenda: exports.salvaVenda};
