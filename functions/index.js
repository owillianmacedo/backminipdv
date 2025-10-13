const admin = require("firebase-admin");
admin.initializeApp();
const {criaLoja} = require("./lojas/criaLoja");
exports.criaLoja = criaLoja;
const {deletaCat} = require("./produtos/deletaCat");
exports.deletaCat = deletaCat;
