const admin = require("firebase-admin");
const {onCall} = require("firebase-functions/v2/https");

exports.abreCaixa = onCall (async (request)=>{
    const data = request.data
    const lojaId = data.lojaId
    const user = request.auth.uid
    const saldo = data.saldo
    const caixaRef = admin.firestore().collection('lojas')
        .doc(lojaId)
})