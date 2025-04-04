const {onCall, onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");
admin.initializeApp();
const db = admin.firestore();
// Criar Preferencia MP
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
    // Criar um doc em planos para referenciar a Cobrança
    const cobrancaRef = await db.collection("cobrancas").add({
      storeId: storeId,
      userId: request.auth.uid,
      userEmail: request.auth.token.email,
      status: "pending preference",
    });
    const cobrancaId = cobrancaRef.id;
    // Cria a Preferência e referencia o doc correspondente
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
      title: plan.data().nome,
      description: `${plan.data.descricao} - 
          ${store.data().tradeName} - ${request.auth.token.email}`,
      quantity: 1,
      unit_price: plan.data().valor,
      currency_id: "BRL",
    };
    // Preferencia
    const preference = {
      items: [item],
      auto_return: "all",
      payer: {
        email: request.auth.token.email},
      back_urls: {
        success: "https://www.mercadopago.com.br/",
        failure: "https://www.mercadopago.com.br/",
        pending: "https://www.mercadopago.com.br/",
      },
      expires: true,
      expiration_date_to: new Date(
          Date.now()+ 24 * 60 * 60 * 1000).toISOString(), // 1 dia
      external_reference: cobrancaId,
      metadata: {
        storeId: storeId,
        planId: planId,
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        cobrancaId: cobrancaId,
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
      throw new Error(`Erro Mercado Pago:
         ${JSON.stringify(errorDetails)}`);
    }
    const dataMP = await responseMP.json();
    // Salva os Dados da Preferencia no Firestore
    await db.collection("cobrancas").doc(cobrancaId).update({
      preferenceId: dataMP.id,
      status: "pending payment",
    });
    // Envia a id da preferencia para o frontend
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
  // Manipulação da credencial
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
    // Se passou na validação, buscar o pagamento
    const paymentId = notification.data.id;
    const payment = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.MP_SECRET_TEST}`,
        "Content-Type": "application/json",
      },
    });
    if (!payment.ok) {
      const errorDetails = await payment.json();
      console.error("Erro ao buscar pagamento:", errorDetails);
      return res.status(500).send("Erro ao buscar pagamento");
    }
    const paymentData = await payment.json();
    // Verifica se o pagamento foi aprovado
    if (paymentData.status !== "approved") {
      console.error("Pagamento não aprovado");
      return res.status(200).send("Pagamento não aprovado");
    }
    // Atualiza o status da cobrança no Firestore
    const cobrancaId = paymentData.external_reference;
    const cobrancaRef = await db.collection("cobrancas").doc(cobrancaId).get();
    if (!cobrancaRef.exists) {
      console.error("Cobrança não encontrada");
      return res.status(404).send("Cobrança não encontrada");
    }
    await cobrancaRef.ref.update({
      status: "approved",
      paymentId: paymentId,
      dados: paymentData,
    });
    // Atualiza o status da loja no Firestore
    if (!paymentData.metadata || !paymentData.metadata.store_id) {
      console.error("storeId ausente nos metadados do pagamento");
      return res.status(400).send("storeId ausente");
    }
    const storeId = paymentData.metadata.store_id;
    const storeRef = await db.collection("stores").doc(storeId).get();
    if (!storeRef.exists) {
      console.error("Loja não encontrada");
      return res.status(404).send("Loja não encontrada");
    }
    const storeData = storeRef.data();
    const today = new Date();
    const expirationDate = today > storeData.subscription.endAt ?
       today : storeData.subscription.endAt;
    // Atualiza a data de expiração MEROLHAR
    const newExpirationDate = new Date(
        expirationDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    await storeRef.ref.update({
      "subscription.endAt": newExpirationDate,
      "subscription.payments":
      admin.firestore.FieldValue.arrayUnion(cobrancaId),
    });
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Erro ao processar o Pagamento:", error);
    return res.status(500).send("Erro interno");
  }
});

