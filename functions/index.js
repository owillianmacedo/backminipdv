
const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
admin.initializeApp();

exports.teste = onCall((request) => {
  logger.info("Hello logs!", {structuredData: true});
  return {text: "Hello from Function!", data:
    {...request.data,
      context: request.auth,
    },
  };
});

exports.gerarCobranca = onCall( async ( request)=> {
  try {
    // token mercadopag
    const MP_SECRET = process.env.MP_SECRET_TEST;
    // Recebe o id da loja
    const storeId = request.data.storeId;
    if ( !storeId) {
      throw new Error("Loja não informada");
    }
    // Procura Loja No Firestore
    const store = await admin.firestore().collection("stores")
        .doc(storeId).get();
    if ( !store.exists) {
      throw new Error("Loja não encontrada");
    }
    // Recebe Id do Plano
    const planId = request.data.planId;
    if ( !planId) {
      throw new Error("Plano não informado");
    }
    // Procura Plano No Firestore
    const plan = await admin.firestore().collection("planos").doc(planId).get();
    if ( !plan.exists) {
      throw new Error("Plano não encontrado");
    }
    // Mercado Pago
    // Item
    const item = {
      id: planId+"-"+storeId,
      title: "Mensal miniPDV",
      description: `Assinatura Mensal (30 Dias) - 
          ${store.data().tradeName} - ${request.auth.token.email}`,
      quantity: 1,
      unit_price: plan.data().valor,
      currency_id: "BRL",
    };
    // Preferencia
    const preference = {
      items: [item],
      auto_return: "all",
      // notification_url: "https://www.mercadopago.com.br/",
      payer: {
        email: request.auth.token.email},
      back_urls: {
        success: "https://www.mercadopago.com.br/",
        failure: "https://www.mercadopago.com.br/",
        pending: "https://www.mercadopago.com.br/",
      },
      auto_return: "approved",
    };
    // Endpoint Mercado Pago
    const responseMP = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_SECRET}`,
      },
      body: JSON.stringify(preference),
    });
    if ( !responseMP.ok) {
      const errorDetails = await responseMP.json();
      throw new Error(`Erro Mercado Pago 
        ${errorDetails.message || "Desconhecido"}`);
    }
    if (!responseMP.ok) {
      const errorDetails = await responseMP.json();
      throw new Error(`Erro Mercado Pago: 
        ${errorDetails.message || "Desconhecido"}`);
    }
    const dataMP = await responseMP.json();
    return {
      store: store.data(),
      plan: plan.data(),
      context: request.auth,
      preference: dataMP.id,
    };
  } catch (error) {
    logger.error("Error generating invoice", error);
    return {
      error: error.message,
    };
  }
});
