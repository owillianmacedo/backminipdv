const {onCall, onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");
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
// Função para Buscar o Status da Assinatura
exports.statusAssinatura = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("Usuário não autenticado");
  } if (!request.data.storeId) {
    throw new Error("Loja Não Informada!");
  }
  const storeId = request.data.storeId;
  const store = await admin.firestore().collection("stores")
      .doc(storeId).get();
  if (!store.exists) {
    throw new Error("Loja não encontrada");
  }
  const storeData = store.data();
  const endAt = storeData.subscription.endAt._seconds;
  const serverTimestamp = Date.now();
  // const subscribe = storeData.subscripion;
  return {
    status: endAt > serverTimestamp ? "active" : "inactive",
    endAt: endAt,
  };
});
// Recebe Notificação do Mercado Pago
exports.mercadoPagoWebhook = onRequest(async (req, res) => {
  try {
    const CLIENT_SECRET = process.env.MP_PAYMENTHOOK_TEST;
    if (!CLIENT_SECRET) {
      console.error("Assinatura Não Definida!");
      return res.status(500).send("Erro interno: Configuração inválida.");
    }

    const notification = req.body;
    // const queryString = req.url.split("?")[1] || "";
    const signature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];

    if (!signature) {
      console.error("Assinatura ausente");
      return res.status(400).send("Assinatura ausente");
    }

    // Separar `ts` e `v1` do `x-signature`
    const parts = signature.split(",");
    let ts;
    let receivedHash;
    parts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        if (key.trim() === "ts") ts = value.trim();
        if (key.trim() === "v1") receivedHash = value.trim();
      }
    });

    if (!ts || !receivedHash) {
      console.error("Formato inválido da assinatura");
      return res.status(400).send("Formato inválido da assinatura");
    }

    // Construir a string do template de validação
    const dataId = (notification &&
      notification.data) ? notification.data.id : null;
    if (!dataId) {
      console.error("Notificação inválida: ID ausente");
      return res.status(400).send("Notificação inválida");
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Gerar a assinatura esperada usando HMAC SHA256
    const hmac = crypto.createHmac("sha256", CLIENT_SECRET);
    hmac.update(manifest);
    const expectedHash = hmac.digest("hex");

    // Comparar assinatura gerada com a recebida
    if (expectedHash !== receivedHash) {
      console.error("Assinatura inválida");
      return res.status(403).send("Assinatura inválida");
    }

    // Se passou na validação, salva no Firestore
    await admin.firestore().collection("pagamentos")
        .doc(dataId.toString()).set({
          recebido_em: admin.firestore.FieldValue.serverTimestamp(),
          dados: notification,
        });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Erro ao processar a notificação:", error);
    return res.status(500).send("Erro interno");
  }
});
