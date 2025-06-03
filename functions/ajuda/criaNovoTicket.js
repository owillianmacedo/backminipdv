const {onCall} = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
// Função para criar um novo ticket
exports.newTicket = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado",
    );
  }
  if (!request.data) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Sem dados na requisição",
    );
  }
  return {
    status: "success",
    message: "Ticket criado com sucesso",
    data: request.data,
    // ticketId: ticketRef.id, // se usar Firestore
  };
});
